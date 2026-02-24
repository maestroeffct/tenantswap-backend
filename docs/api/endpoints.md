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

## Security + Runtime Notes

- Global validation: whitelist + reject unknown payload keys.
- Global rate limit enabled via `ThrottlerGuard`.
- Admin routes require `role=ADMIN` in JWT user payload.
- Global error format is normalized by `GlobalExceptionFilter`.

Error envelope:

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Invalid credentials",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "path": "/auth/login",
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
5. Owner confirms one renter: `POST /matching/interests/:interestId/confirm-renter`
6. System marks selected as `CONFIRMED_RENTER`, releases others, notifies, reruns matching.

## Endpoints Summary

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | No | Health route |
| POST | `/auth/register` | No | Register and issue email verification token (non-prod) |
| POST | `/auth/verify-email` | No | Verify email token and issue JWT |
| POST | `/auth/resend-verification` | No | Resend email verification token |
| POST | `/auth/login` | No | Login with phone + password |
| GET | `/users/me` | Yes | Current authenticated user |
| POST | `/listings` | Yes | Create listing |
| GET | `/listings/me` | Yes | Get my listings |
| POST | `/matching/run` | Yes | Run matching for latest active listing |
| POST | `/matching/run/:listingId` | Yes | Run matching for specific listing |
| POST | `/matching/interests/:targetListingId/request` | Yes | Request interest on a target listing |
| GET | `/matching/interests/incoming` | Yes | Owner view of incoming interests |
| GET | `/matching/interests/outgoing` | Yes | Requester view of sent interests |
| POST | `/matching/interests/:interestId/approve` | Yes | Owner approves contact for interest |
| POST | `/matching/interests/:interestId/decline` | Yes | Owner declines interest |
| POST | `/matching/interests/:interestId/confirm-renter` | Yes | Owner confirms renter and releases others |
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

## Key Response Shapes

### POST `/matching/run`

Possible payload now includes `stats`:

```json
{
  "found": false,
  "matchScenario": "ONE_TO_MANY",
  "message": "No one-to-one chain found yet. Showing top one-way matches for this listing.",
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
        "reciprocityBonus": 0
      }
    }
  ]
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
  "success": true,
  "message": "Interest request sent",
  "interest": {
    "id": "uuid",
    "status": "REQUESTED",
    "listingId": "uuid",
    "requesterListingId": "uuid",
    "expiresAt": "2026-02-26T12:00:00.000Z"
  }
}
```

### GET `/matching/interests/incoming`

```json
{
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
```

### POST `/matching/interests/:interestId/confirm-renter`

```json
{
  "success": true,
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
