# TenantSwap Backend API Documentation

Base URL: `http://localhost:3000`

Auth type: `Bearer <accessToken>` (JWT)

## Security + Runtime Notes

- Global validation: strips unknown fields and rejects non-whitelisted payload keys.
- Global rate limit: `100 requests / 60 seconds` (default guard).
- Auth endpoint throttles:
  - `POST /auth/register`: `5 / 60s`
  - `POST /auth/login`: `5 / 60s`
  - `POST /auth/verify-email`: `10 / 60s`
  - `POST /auth/resend-verification`: `5 / 60s`
- Matching run throttles:
  - `POST /matching/run`: `8 / 60s`
  - `POST /matching/run/:listingId`: `8 / 60s`

## Error Response Format

All errors use the global exception envelope:

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Invalid credentials",
  "timestamp": "2026-02-23T12:00:00.000Z",
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

Notes:
- `meta` is included when available (for example login attempts/lockout).
- Validation failures include an `errors` array.

## Quick Workflow

1. `POST /auth/register`
2. `POST /auth/verify-email` (or `POST /auth/resend-verification` then verify)
3. `POST /auth/login`
4. `POST /listings`
5. `POST /matching/run` (or `/matching/run/:listingId`)
6. `GET /matching/chains/me` and `GET /matching/chains/:chainId`
7. `POST /matching/chains/:chainId/accept` (or decline)
8. `POST /matching/chains/:chainId/connect`
9. `POST /matching/connect/:unlockId/approve` (by all members)

## Endpoints Summary

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | No | Health/basic hello route |
| POST | `/auth/register` | No | Register user and trigger email verification |
| POST | `/auth/verify-email` | No | Verify token and issue JWT |
| POST | `/auth/resend-verification` | No | Resend verification for unverified email |
| POST | `/auth/login` | No | Login with phone/password (email must be verified) |
| GET | `/users/me` | Yes | Get current authenticated user |
| POST | `/listings` | Yes | Create listing |
| GET | `/listings/me` | Yes | Get all my listings |
| POST | `/matching/run` | Yes | Run matching for latest ACTIVE listing |
| POST | `/matching/run/:listingId` | Yes | Run matching for a specific listing |
| GET | `/matching/chains/me` | Yes | Get all chains where user is a member |
| GET | `/matching/chains/:chainId` | Yes | Get chain detail (contacts hidden until unlock approvals complete) |
| POST | `/matching/chains/:chainId/accept` | Yes | Accept chain membership |
| POST | `/matching/chains/:chainId/decline` | Yes | Decline chain membership |
| POST | `/matching/chains/:chainId/connect` | Yes | Request contact unlock |
| POST | `/matching/connect/:unlockId/approve` | Yes | Approve contact unlock |

## Detailed Reference

### 1) GET `/`

Response (200):
```json
"Hello World!"
```

### 2) POST `/auth/register`

Body:
```json
{
  "fullName": "Ada Lovelace",
  "email": "ada@example.com",
  "phone": "+2348012345678",
  "password": "Password123!"
}
```

Response:
```json
{
  "message": "If your details are valid, a verification email has been sent.",
  "verificationToken": "<dev-only-token>"
}
```

Notes:
- `verificationToken` is returned only outside production.
- Response message is generic to avoid user enumeration.

### 3) POST `/auth/verify-email`

Body:
```json
{
  "token": "<64-char-token>"
}
```

Response:
```json
{
  "message": "Email verified successfully",
  "accessToken": "<jwt>",
  "user": {
    "id": "uuid",
    "fullName": "Ada Lovelace",
    "phone": "+2348012345678",
    "email": "ada@example.com"
  }
}
```

Common errors:
- `400`: `Invalid or expired verification token`

### 4) POST `/auth/resend-verification`

Body:
```json
{
  "email": "ada@example.com"
}
```

Response:
```json
{
  "message": "If the email exists, a verification email has been sent.",
  "verificationToken": "<dev-only-token>"
}
```

Notes:
- Generic response is intentional.
- `verificationToken` is dev-only.

### 5) POST `/auth/login`

Body:
```json
{
  "phone": "+2348012345678",
  "password": "Password123!"
}
```

Success response:
```json
{
  "message": "Login successful",
  "accessToken": "<jwt>",
  "user": {
    "id": "uuid",
    "fullName": "Ada Lovelace",
    "phone": "+2348012345678",
    "email": "ada@example.com"
  }
}
```

Common errors:
- `401`: `Invalid credentials` + lockout metadata in `meta`
- `401`: `Please verify your email before logging in`
- `429`: `Too many attempts. Please try again later.`

### 6) GET `/users/me`

Header:
- `Authorization: Bearer <accessToken>`

Response:
```json
{
  "message": "User profile fetched successfully",
  "user": {
    "id": "uuid",
    "fullName": "Ada Lovelace",
    "phone": "+2348012345678"
  }
}
```

### 7) POST `/listings`

Header:
- `Authorization: Bearer <accessToken>`

Body:
```json
{
  "desiredType": "2-Bedroom Apartment",
  "desiredCity": "Lagos",
  "maxBudget": 2500000,
  "timeline": "Within 2 months",
  "currentType": "1-Bedroom Apartment",
  "currentCity": "Abuja",
  "currentRent": 1800000,
  "availableOn": "2026-03-15",
  "features": ["parking", "balcony", "security"]
}
```

Response:
```json
{
  "message": "Listing created successfully",
  "listing": {
    "id": "uuid",
    "userId": "uuid",
    "status": "ACTIVE",
    "desiredType": "2-Bedroom Apartment",
    "desiredCity": "Lagos",
    "maxBudget": 2500000,
    "timeline": "Within 2 months",
    "currentType": "1-Bedroom Apartment",
    "currentCity": "Abuja",
    "currentRent": 1800000,
    "availableOn": "2026-03-15T00:00:00.000Z",
    "features": ["parking", "balcony", "security"],
    "createdAt": "2026-02-14T00:00:00.000Z"
  }
}
```

### 8) GET `/listings/me`

Header:
- `Authorization: Bearer <accessToken>`

Response:
```json
[
  {
    "id": "uuid",
    "userId": "uuid",
    "status": "ACTIVE",
    "desiredType": "2-Bedroom Apartment"
  }
]
```

### 9) POST `/matching/run`

Header:
- `Authorization: Bearer <accessToken>`

Possible responses:

Direct one-to-one found:
```json
{
  "found": true,
  "message": "Direct one-to-one match found! Awaiting confirmations.",
  "chain": {
    "id": "uuid",
    "status": "PENDING",
    "type": "DIRECT",
    "cycleHash": "...",
    "cycleSize": 2,
    "avgScore": 87,
    "members": []
  },
  "badge": "DIRECT",
  "matchScenario": "ONE_TO_ONE",
  "recommendations": [
    {
      "listingId": "uuid",
      "relationship": "ONE_TO_ONE",
      "score": 72,
      "rankScore": 87,
      "breakdown": {
        "location": 30,
        "apartmentType": 30,
        "budget": 20,
        "timeline": 5,
        "features": 2,
        "reciprocityBonus": 15
      }
    }
  ]
}
```

One-to-many recommendations (no chain yet):
```json
{
  "found": false,
  "message": "No one-to-one chain found yet. Showing top one-way matches for this listing.",
  "matchScenario": "ONE_TO_MANY",
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

Independent (no compatible candidates):
```json
{
  "found": false,
  "message": "No compatible recommendation yet. This listing is currently independent.",
  "matchScenario": "INDEPENDENT",
  "recommendations": [],
  "aiSuggestions": [
    "Increase your budget range by 10–20% to unlock more matches."
  ]
}
```

### 10) POST `/matching/run/:listingId`

Header:
- `Authorization: Bearer <accessToken>`

Path params:
- `listingId`: target listing ID (must belong to authenticated user)

Response shape is the same as `/matching/run`.

### 11) GET `/matching/chains/me`

Header:
- `Authorization: Bearer <accessToken>`

Response:
```json
[
  {
    "id": "uuid",
    "status": "PENDING",
    "type": "DIRECT",
    "cycleHash": "...",
    "cycleSize": 2,
    "avgScore": 87,
    "members": []
  }
]
```

### 12) GET `/matching/chains/:chainId`

Header:
- `Authorization: Bearer <accessToken>`

Path params:
- `chainId`: chain ID

Response:
```json
{
  "id": "uuid",
  "cycleSize": 2,
  "avgScore": 87,
  "status": "LOCKED",
  "type": "DIRECT",
  "cycleHash": "...",
  "members": [
    {
      "listingId": "uuid",
      "position": 0,
      "hasAccepted": true,
      "fullName": "Ada Lovelace",
      "phone": null,
      "currentCity": "Abuja",
      "currentType": "1-Bedroom Apartment",
      "currentRent": 1800000,
      "desiredCity": "Lagos"
    }
  ],
  "contactUnlocked": false
}
```

Note:
- `phone` stays `null` until all chain members approve contact unlock.

### 13) POST `/matching/chains/:chainId/accept`

Header:
- `Authorization: Bearer <accessToken>`

Response:
```json
{
  "success": true,
  "allAccepted": false
}
```

### 14) POST `/matching/chains/:chainId/decline`

Header:
- `Authorization: Bearer <accessToken>`

Response:
```json
{
  "success": true
}
```

### 15) POST `/matching/chains/:chainId/connect`

Header:
- `Authorization: Bearer <accessToken>`

Rules:
- Chain must be `LOCKED`
- Caller must be a member of the chain

Response:
```json
{
  "success": true,
  "unlockId": "uuid"
}
```

### 16) POST `/matching/connect/:unlockId/approve`

Header:
- `Authorization: Bearer <accessToken>`

Response:
```json
{
  "success": true
}
```

## Postman Files

- Collection: `docs/postman/TenantSwap-Backend.postman_collection.json`
- Environment: `docs/postman/TenantSwap-Local.postman_environment.json`

## Import Steps (Postman)

1. Import `docs/postman/TenantSwap-Backend.postman_collection.json`
2. Import `docs/postman/TenantSwap-Local.postman_environment.json`
3. Select environment `TenantSwap Local`
4. Run `Auth -> POST /auth/register`
5. Run `Auth -> POST /auth/verify-email` (or resend + verify)
6. Run `Auth -> POST /auth/login`
7. Continue with listing/matching endpoints
