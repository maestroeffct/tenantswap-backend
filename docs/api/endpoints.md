# TenantSwap Backend API Documentation

Base URL: `http://localhost:3000`
Auth type: `Bearer <accessToken>`

## Environment Variables

Required/runtime variables currently used by the backend:

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `FRONTEND_VERIFY_EMAIL_URL`
- `GOOGLE_OAUTH_CLIENT_ID`
- `PORT`
- `THROTTLE_GLOBAL_TTL_MS`
- `THROTTLE_GLOBAL_LIMIT`
- `THROTTLE_AUTH_TTL_MS`
- `THROTTLE_AUTH_LIMIT`
- `THROTTLE_MATCH_RUN_TTL_MS`
- `THROTTLE_MATCH_RUN_LIMIT`
- `AUTH_LOGIN_MAX_ATTEMPTS`
- `AUTH_LOGIN_WINDOW_MS`
- `AUTH_LOGIN_LOCK_MS`
- `EMAIL_VERIFICATION_TOKEN_TTL_MS`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_FROM`
- `EMAIL_SEND_RETRY_MAX_ATTEMPTS`
- `EMAIL_SEND_RETRY_DELAY_MS`
- `TERMII_API_KEY`
- `TERMII_BASE_URL`
- `TERMII_SENDER_ID`
- `TERMII_CHANNEL`
- `TERMII_NOTIFICATION_CHANNEL`
- `TERMII_PIN_ATTEMPTS`
- `TERMII_PIN_TTL_MINUTES`
- `TERMII_PIN_LENGTH`
- `TERMII_PIN_TYPE`
- `TERMII_REQUEST_TIMEOUT_MS`
- `PHONE_OTP_RESEND_COOLDOWN_SECONDS`
- `NOTIFICATION_EMAIL_ENABLED`
- `NOTIFICATION_SMS_ENABLED`
- `AUTO_SEARCH_SWEEP_ENABLED`
- `AUTO_SEARCH_SWEEP_LIMIT`
- `CHAIN_ACCEPT_TTL_HOURS`
- `CHAIN_EXPIRE_SWEEP_LIMIT`
- `INTEREST_REQUEST_TTL_HOURS`
- `INTEREST_EXPIRE_SWEEP_LIMIT`
- `LISTING_ACTIVE_TTL_HOURS`
- `LISTING_EXPIRE_SWEEP_LIMIT`
- `INTEREST_MAX_OPEN_PER_REQUESTER`
- `INTEREST_MAX_DAILY_REQUESTS`
- `SUBSCRIPTION_ENFORCEMENT`
- `TESTER_ALLOWLIST`
- `PAYMENT_PROVIDER`
- `PAYMENT_WEBHOOK_SECRET`
- `SUBSCRIPTION_DEFAULT_PLAN`
- `SUBSCRIPTION_DEFAULT_AMOUNT_MINOR`
- `SUBSCRIPTION_DEFAULT_DURATION_DAYS`
- `RELIABILITY_CANCEL_SCORE_PENALTY`
- `RELIABILITY_NOSHOW_SCORE_PENALTY`
- `RELIABILITY_MANUAL_SCORE_PENALTY`
- `RELIABILITY_COOLDOWN_AFTER_CANCELLATIONS`
- `RELIABILITY_COOLDOWN_HOURS`
- `RELIABILITY_BLOCK_AFTER_NOSHOWS`
- `RELIABILITY_BLOCK_HOURS`
- `RELIABILITY_RANK_PENALTY_WEIGHT`

## Security + Runtime Notes

- Global validation: whitelist + reject unknown payload keys.
- Global rate limit enabled via `ThrottlerGuard`.
- Admin routes require `role=ADMIN` in JWT user payload.
- Global error format is normalized by `GlobalExceptionFilter`.
- Subscription enforcement guard protects listing/matching endpoints when `SUBSCRIPTION_ENFORCEMENT=true`.
- Allowlisted testers in `TESTER_ALLOWLIST` bypass payment checks.
- Reliability guard blocks users in cooldown (`429`) or temporary block (`403`) windows.
- Register duplicate checks now return explicit `409` conflict errors (`Email already exists`, `Phone is already used`).
- Verification emails are sent via SMTP (HTML + text); if SMTP is unavailable, backend logs a fallback verification link.
- Phone verification OTP uses Termii (`/auth/phone/send-otp`, `/auth/phone/resend-otp`, `/auth/phone/verify-otp`).
- Matching notifications can now fan out to in-app + email + SMS for request/approval/decline and auto-search match discovery.

Global response envelope (success and errors):

```json
{
  "statusCode": 200,
  "message": "Request successful",
  "data": {}
}
```

Error example:

```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "data": {
    "meta": {
      "attemptsAllowed": 5,
      "attemptsUsed": 2,
      "attemptsRemaining": 3,
      "locked": false,
      "lockRemainingMs": 0,
      "lockUntil": null,
      "windowMs": 900000
    }
  }
}
```

## Main Flows

### A) Auth + Listing + Chain Flow

1. `POST /auth/register`
2. `POST /auth/verify-email` (or resend + verify)
3. `POST /auth/login`
4. `POST /auth/phone/send-otp` + `POST /auth/phone/verify-otp` (optional but recommended)
5. `POST /listings`
6. `POST /matching/run`

Creating the first listing (`POST /listings`) marks `onboardingComplete=true` and immediately auto-runs matching. 6. Chain accept/decline/connect endpoints as needed

### B) One-to-Many Interest Flow (new)

1. User runs matching and gets recommendations + stats.
2. User requests a listing: `POST /matching/interests/:targetListingId/request`
3. Listing owner checks requests: `GET /matching/interests/incoming`
4. Owner approves or declines.
5. Confirmation can happen by owner (`POST /matching/interests/:interestId/confirm-renter`) or by requester after approval (`POST /matching/interests/:interestId/confirm-taken`).
6. System marks selected as `CONFIRMED_RENTER`, releases others, notifies, reruns matching.

### C) Subscription + Billing Flow

1. User checks status: `GET /billing/me`
2. User initializes payment intent: `POST /billing/checkout`
3. Provider posts webhook: `POST /billing/webhook`
4. Backend updates `User.subscriptionStatus` and payment history.

### D) Auto-Search Recovery Flow

1. User runs matching and gets no recommendations (`INDEPENDENT`).
2. Backend marks the listing for background auto-search.
3. Scheduled sweep re-checks watchlisted listings.
4. When recommendations become available, backend sends in-app + email + SMS alert and disables auto-search for that listing.


## Background Matching

- `MATCHING_LIFECYCLE_SWEEP_MS` controls how often the lifecycle sweep runs. Default is `60000` ms.
- Immediate listing create/update/renew still refreshes matches in-request.
- When `QUEUE_ENABLED=true`, periodic lifecycle sweeps and auto-search are pushed through BullMQ on Redis.
- When `QUEUE_ENABLED=false`, the app falls back to the in-process Nest scheduler.

## Endpoints Summary

| Method | Path                                             | Auth  | Description                                               |
| ------ | ------------------------------------------------ | ----- | --------------------------------------------------------- |
| GET    | `/`                                              | No    | Health route                                              |
| POST   | `/auth/register`                                 | No    | Register and issue email verification token (non-prod)    |
| POST   | `/auth/verify-email`                             | No    | Verify email token and issue JWT                          |
| POST   | `/auth/resend-verification`                      | No    | Resend email verification token                           |
| POST   | `/auth/login`                                    | No    | Login with phone + password                               |
| POST   | `/auth/logout`                                   | Yes   | Revoke current access tokens for the authenticated user   |
| POST   | `/auth/phone/send-otp`                           | Yes   | Send phone verification OTP via Termii                    |
| POST   | `/auth/phone/resend-otp`                         | Yes   | Resend phone verification OTP                             |
| POST   | `/auth/phone/verify-otp`                         | Yes   | Verify phone OTP and mark phone as verified               |
| GET    | `/users/me`                                      | Yes   | Current authenticated user with listings and matches      |
| PATCH  | `/users/me`                                      | Yes   | Update profile (fullName/email/phone)                     |
| PATCH  | `/users/me/password`                             | Yes   | Change account password                                   |
| GET    | `/users/me/reliability`                          | Yes   | Current user reliability status                           |
| GET    | `/billing/me`                                    | Yes   | Subscription status + tester bypass/access state          |
| GET    | `/notifications/unread-count`                      | Yes   | Get unread in-app notification count                      |
| POST   | `/billing/checkout`                              | Yes   | Create checkout/payment intent metadata                   |
| POST   | `/billing/webhook`                               | No    | Payment provider webhook callback                         |
| POST   | `/listings`                                      | Yes   | Create listing and auto-run matching                      |
| PATCH  | `/listings/:listingId`                           | Yes   | Edit listing details and auto-refresh matches             |
| POST   | `/listings/:listingId/renew`                     | Yes   | Renew/reactivate listing and auto-refresh matches         |
| GET    | `/listings/me`                                   | Yes   | Get my listings with attached match summaries             |
| POST   | `/matching/run`                                  | Yes   | Run matching for latest active listing                    |
| POST   | `/matching/run/:listingId`                       | Yes   | Run matching for specific listing                         |
| POST   | `/matching/interests/:targetListingId/request`   | Yes   | Request interest on a target listing                      |
| GET    | `/matching/interests/incoming`                   | Yes   | Owner view of incoming interests                          |
| GET    | `/matching/interests/outgoing`                   | Yes   | Requester view of sent interests                          |
| POST   | `/matching/interests/:interestId/approve`        | Yes   | Owner approves contact for interest                       |
| POST   | `/matching/interests/:interestId/decline`        | Yes   | Owner declines interest                                   |
| POST   | `/matching/interests/:interestId/confirm-renter` | Yes   | Owner confirms renter and releases others                 |
| POST   | `/matching/interests/:interestId/confirm-taken`  | Yes   | Requester confirms apartment taken after contact approval |
| GET    | `/matching/chains/me`                            | Yes   | Get my chains                                             |
| GET    | `/matching/chains/:chainId`                      | Yes   | Get chain detail                                          |
| POST   | `/matching/chains/:chainId/accept`               | Yes   | Accept chain                                              |
| POST   | `/matching/chains/:chainId/decline`              | Yes   | Decline chain                                             |
| POST   | `/matching/chains/:chainId/connect`              | Yes   | Request contact unlock                                    |
| POST   | `/matching/connect/:unlockId/approve`            | Yes   | Approve contact unlock                                    |
| POST   | `/admin/chains/expire-overdue`                   | Admin | Force-sweep overdue chains                                |
| POST   | `/admin/chains/:chainId/break`                   | Admin | Force break chain                                         |
| POST   | `/admin/chains/:chainId/expire`                  | Admin | Force expire chain                                        |
| POST   | `/admin/chains/:chainId/rerun`                   | Admin | Rerun matching for chain members                          |
| GET    | `/admin/users/:userId/reliability`               | Admin | Get user reliability details                              |
| POST   | `/admin/users/:userId/penalty`                   | Admin | Apply manual reliability penalty                          |
| POST   | `/admin/users/:userId/unblock`                   | Admin | Clear cooldown/block restrictions                         |

## Key Response Shapes

### POST `/auth/register`

Password auth request body:

```json
{
  "authType": "password",
  "fullName": "Ada Lovelace",
  "email": "ada@example.com",
  "phone": "+2348012345678",
  "password": "Password123!",
  "allowIncomingCalls": true,
  "hasLandlordContact": true,
  "canConnectLandlord": true
}
```

OAuth request body (same endpoint):

```json
{
  "authType": "oauth",
  "oauthProvider": "google",
  "oauthIdToken": "<google-id-token>",
  "phone": "+2348012345678",
  "allowIncomingCalls": true,
  "hasLandlordContact": true,
  "canConnectLandlord": true
}
```

`onboardingComplete` is backend-controlled and remains `false` until required profile/setup steps are completed.

### POST `/auth/logout`

Response:

```json
{
  "statusCode": 200,
  "message": "Logout successful",
  "data": {
    "message": "Logout successful"
  }
}
```

### GET `/notifications/unread-count`

```json
{
  "statusCode": 200,
  "message": "Unread notification count fetched successfully",
  "data": {
    "unreadCount": 5
  }
}
```

### POST `/auth/phone/send-otp`

Response:

```json
{
  "statusCode": 200,
  "message": "OTP sent successfully",
  "data": {
    "expiresAt": "2026-03-05T13:00:00.000Z"
  }
}
```

### POST `/auth/phone/verify-otp`

Request body:

```json
{
  "pin": "123456"
}
```

Response:

```json
{
  "statusCode": 200,
  "message": "Phone verified successfully",
  "data": {
    "phoneVerifiedAt": "2026-03-05T12:55:00.000Z"
  }
}
```

### POST `/matching/run`

Possible payload now includes `stats`:

```json
{
  "statusCode": 200,
  "message": "No one-to-one chain found yet. Showing top one-way matches for this listing.",
  "data": {
    "found": false,
    "matchScenario": "ONE_TO_MANY",
    "stats": {
      "totalCandidates": 25,
      "oneToOneCandidates": 5,
      "oneWayCandidates": 20
    },
    "recommendations": [
      {
        "listingId": "uuid",
        "relationship": "ONE_WAY",
        "score": 61,
        "rankScore": 61,
        "breakdown": {
          "location": 15,
          "apartmentType": 30,
          "budget": 12,
          "timeline": 2,
          "features": 2,
          "reciprocityBonus": 0,
          "reliabilityPenalty": 0
        }
      }
    ]
  }
}
```

### POST `/matching/interests/:targetListingId/request`

Request body (optional listing override):

```json
{
  "requesterListingId": "uuid"
}
```

Response:

```json
{
  "statusCode": 201,
  "message": "Interest request sent",
  "data": {
    "interest": {
      "id": "uuid",
      "status": "REQUESTED",
      "listingId": "uuid",
      "requesterListingId": "uuid",
      "expiresAt": "2026-02-26T12:00:00.000Z"
    }
  }
}
```

If open/daily request caps are exceeded, API returns `429`.

### GET `/matching/interests/incoming`

```json
{
  "statusCode": 200,
  "message": "Request successful",
  "data": {
    "totalRequests": 12,
    "openRequests": 4,
    "listings": [
      {
        "listingId": "uuid",
        "listingStatus": "ACTIVE",
        "openRequests": 4,
        "requests": [
          {
            "interestId": "uuid",
            "status": "REQUESTED",
            "createdAt": "2026-02-24T10:00:00.000Z",
            "expiresAt": "2026-02-26T10:00:00.000Z",
            "requester": {
              "userId": "uuid",
              "fullName": "Ada Lovelace",
              "phone": "+2348012345678",
              "listingId": "uuid"
            }
          }
        ]
      }
    ]
  }
}
```

### POST `/matching/interests/:interestId/confirm-renter`

```json
{
  "statusCode": 200,
  "message": "Request successful",
  "data": {
    "status": "CONFIRMED_RENTER",
    "releasedCount": 8,
    "rerun": {
      "triggered": 8,
      "succeeded": 7,
      "failed": 1
    },
    "chainConflict": {
      "affectedChains": 2,
      "brokenChains": 2
    }
  }
}
```

## Postman Files

- Collection: `docs/postman/TenantSwap-Backend.postman_collection.json`
- Environment: `docs/postman/TenantSwap-Local.postman_environment.json`

## Import Steps

1. Import collection and environment.
2. Register -> verify email -> login.
3. Create listing(s).
4. Run matching and request interests.
5. Use incoming/outgoing endpoints to manage requests.
6. Confirm renter when finalized.
7. Use admin endpoints with an admin token when needed.

### POST `/listings`

Request body:

```json
{
  "desiredType": "2-Bedroom Apartment",
  "desiredState": "Lagos",
  "desiredCity": "Ikeja",
  "desiredArea": "Maryland",
  "maxBudget": 2500000,
  "timeline": "Within 2 months",
  "currentType": "1-Bedroom Apartment",
  "currentState": "FCT",
  "currentCity": "Abuja",
  "currentArea": "Wuse 2",
  "currentRent": 1800000,
  "currentAvailable": true,
  "currentAvailableOn": "2026-03-15T00:00:00.000Z",
  "features": ["parking", "balcony", "security"]
}
```

`currentAvailableOn` may be `null` when `currentAvailable` is `false`.

### PATCH `/listings/:listingId`

Request body (all fields optional):

```json
{
  "desiredType": "3-Bedroom Apartment",
  "desiredState": "Oyo",
  "desiredCity": "Ibadan",
  "desiredArea": "Bodija",
  "maxBudget": 3200000,
  "timeline": "Within 1 month",
  "currentType": "2-Bedroom Apartment",
  "currentState": "FCT",
  "currentCity": "Abuja",
  "currentArea": null,
  "currentRent": 2100000,
  "currentAvailable": false,
  "currentAvailableOn": null,
  "features": ["parking", "security"]
}
```

Response:

```json
{
  "statusCode": 200,
  "message": "Listing updated successfully",
  "data": {
    "listing": {
      "id": "uuid"
    }
  }
}
```

### POST `/listings/:listingId/renew`

```json
{
  "statusCode": 200,
  "message": "Listing renewed successfully",
  "data": {
    "listing": {
      "id": "uuid",
      "status": "ACTIVE",
      "expiresAt": "2026-03-10T12:00:00.000Z"
    }
  }
}
```

### GET `/listings/me`

Response shape now includes `matchCount` and `matches` on each listing object.

```json
{
  "statusCode": 200,
  "message": "Listings fetched successfully",
  "data": [
    {
      "id": "listing-1",
      "desiredType": "2 Bedroom",
      "desiredState": "Lagos",
      "desiredCity": "Ikeja",
      "desiredArea": "Maryland",
      "currentType": "1 Bedroom",
      "currentState": "FCT",
      "currentCity": "Abuja",
      "currentArea": "Wuse 2",
      "currentAvailable": true,
      "matchCount": 1,
      "matches": [
        {
          "id": "match-1",
          "totalScore": 85,
          "cityScore": 25,
          "typeScore": 25,
          "budgetScore": 20,
          "timelineScore": 15,
          "targetListing": {
            "id": "listing-2",
            "desiredType": "1 Bedroom",
            "desiredState": "FCT",
            "desiredCity": "Abuja",
            "desiredArea": "Wuse 2",
            "currentType": "2 Bedroom",
            "currentState": "Lagos",
            "currentCity": "Ikeja",
            "currentArea": "Maryland"
          }
        }
      ]
    }
  ]
}
```

### POST `/matching/interests/:interestId/confirm-taken`

```json
{
  "statusCode": 200,
  "message": "Request successful",
  "data": {
    "status": "CONFIRMED_RENTER",
    "releasedCount": 8,
    "confirmedByRole": "WANTER",
    "rerun": {
      "triggered": 8,
      "succeeded": 8,
      "failed": 0
    },
    "chainConflict": {
      "affectedChains": 1,
      "brokenChains": 1
    }
  }
}
```

### GET `/billing/me`

```json
{
  "statusCode": 200,
  "message": "Request successful",
  "data": {
    "enforcementEnabled": true,
    "testerBypass": false,
    "hasAccess": true,
    "subscription": {
      "status": "ACTIVE",
      "plan": "basic_monthly",
      "provider": "manual",
      "reference": "TS-1700000000-AB12CD",
      "startedAt": "2026-03-01T12:00:00.000Z",
      "expiresAt": "2026-03-31T12:00:00.000Z"
    }
  }
}
```

### POST `/billing/webhook`

Request header: `x-payment-webhook-secret: <PAYMENT_WEBHOOK_SECRET>`

```json
{
  "provider": "manual",
  "eventId": "evt_123",
  "type": "payment.succeeded",
  "data": {
    "userId": "uuid",
    "reference": "TS-1700000000-AB12CD",
    "amountMinor": 5000,
    "currency": "NGN",
    "planCode": "basic_monthly",
    "durationDays": 30
  }
}
```

A successful webhook marks the user subscription as `ACTIVE`.
When subscription enforcement blocks protected endpoints, API returns `402`.

### GET `/users/me`

Response shape now includes the user profile plus the user's listings, and each listing includes `matchCount` and `matches`.

```json
{
  "statusCode": 200,
  "message": "User profile fetched successfully",
  "data": {
    "user": {
      "id": "u1",
      "fullName": "Ada Lovelace",
      "email": "ada@example.com",
      "listings": [
        {
          "id": "listing-1",
          "matchCount": 1,
          "matches": [
            {
              "id": "match-1",
              "totalScore": 85,
              "targetListing": {
                "id": "listing-2",
                "desiredType": "1 Bedroom",
                "desiredState": "FCT",
                "desiredCity": "Abuja",
                "desiredArea": "Wuse 2"
              }
            }
          ]
        }
      ]
    }
  }
}
```

### PATCH `/users/me`

Update request body (all fields optional):

```json
{
  "fullName": "Ada Lovelace",
  "email": "ada@example.com",
  "phone": "+2348012345678",
  "canConnectLandlord": true,
  "hasLandlordContact": true,
  "currentPassword": "OldPassword1!"
}
```

`currentPassword` is required when changing `email` or `phone`.
You can also update `canConnectLandlord` and `hasLandlordContact` via this endpoint.

### PATCH `/users/me/password`

```json
{
  "currentPassword": "OldPassword1!",
  "newPassword": "NewPassword1!"
}
```

### GET `/users/me/reliability`

```json
{
  "statusCode": 200,
  "message": "Request successful",
  "data": {
    "userId": "uuid",
    "reliabilityScore": 85,
    "cancellationCount": 2,
    "noShowCount": 1,
    "cooldownUntil": null,
    "blockedUntil": null
  }
}
```

### POST `/admin/users/:userId/penalty`

```json
{
  "reason": "Repeated failed commitments",
  "scorePenalty": 20,
  "cooldownHours": 24,
  "blockHours": 0
}
```

`/admin/chains/:chainId/break` now accepts optional `offenderUserId`; when `reason=NO_SHOW`, that user gets no-show penalty automatically.
