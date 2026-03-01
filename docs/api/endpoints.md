# TenantSwap Backend API Documentation

Base URL: `http://localhost:3000`
Auth type: `Bearer <accessToken>`

## Environment Variables

Required/runtime variables currently used by the backend:

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `FRONTEND_VERIFY_EMAIL_URL`
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
4. `POST /listings`
5. `POST /matching/run`
6. Chain accept/decline/connect endpoints as needed

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

## Endpoints Summary

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | No | Health route |
| POST | `/auth/register` | No | Register and issue email verification token (non-prod) |
| POST | `/auth/verify-email` | No | Verify email token and issue JWT |
| POST | `/auth/resend-verification` | No | Resend email verification token |
| POST | `/auth/login` | No | Login with phone + password |
| GET | `/users/me` | Yes | Current authenticated user |
| GET | `/users/me/reliability` | Yes | Current user reliability status |
| GET | `/billing/me` | Yes | Subscription status + tester bypass/access state |
| POST | `/billing/checkout` | Yes | Create checkout/payment intent metadata |
| POST | `/billing/webhook` | No | Payment provider webhook callback |
| POST | `/listings` | Yes | Create listing |
| POST | `/listings/:listingId/renew` | Yes | Renew/reactivate listing expiry window |
| GET | `/listings/me` | Yes | Get my listings |
| POST | `/matching/run` | Yes | Run matching for latest active listing |
| POST | `/matching/run/:listingId` | Yes | Run matching for specific listing |
| POST | `/matching/interests/:targetListingId/request` | Yes | Request interest on a target listing |
| GET | `/matching/interests/incoming` | Yes | Owner view of incoming interests |
| GET | `/matching/interests/outgoing` | Yes | Requester view of sent interests |
| POST | `/matching/interests/:interestId/approve` | Yes | Owner approves contact for interest |
| POST | `/matching/interests/:interestId/decline` | Yes | Owner declines interest |
| POST | `/matching/interests/:interestId/confirm-renter` | Yes | Owner confirms renter and releases others |
| POST | `/matching/interests/:interestId/confirm-taken` | Yes | Requester confirms apartment taken after contact approval |
| GET | `/matching/chains/me` | Yes | Get my chains |
| GET | `/matching/chains/:chainId` | Yes | Get chain detail |
| POST | `/matching/chains/:chainId/accept` | Yes | Accept chain |
| POST | `/matching/chains/:chainId/decline` | Yes | Decline chain |
| POST | `/matching/chains/:chainId/connect` | Yes | Request contact unlock |
| POST | `/matching/connect/:unlockId/approve` | Yes | Approve contact unlock |
| POST | `/admin/chains/expire-overdue` | Admin | Force-sweep overdue chains |
| POST | `/admin/chains/:chainId/break` | Admin | Force break chain |
| POST | `/admin/chains/:chainId/expire` | Admin | Force expire chain |
| POST | `/admin/chains/:chainId/rerun` | Admin | Rerun matching for chain members |
| GET | `/admin/users/:userId/reliability` | Admin | Get user reliability details |
| POST | `/admin/users/:userId/penalty` | Admin | Apply manual reliability penalty |
| POST | `/admin/users/:userId/unblock` | Admin | Clear cooldown/block restrictions |

## Key Response Shapes

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
