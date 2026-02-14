# TenantSwap Backend API Documentation

Base URL: `http://localhost:3000`

Auth type: `Bearer <accessToken>` (JWT)

## Quick Workflow

1. `POST /auth/register` or `POST /auth/login`
2. `POST /listings`
3. `POST /matching/run` (or `/matching/run/:listingId`)
4. `GET /matching/chains/me` and `GET /matching/chains/:chainId`
5. `POST /matching/chains/:chainId/accept` (or decline)
6. `POST /matching/chains/:chainId/connect`
7. `POST /matching/connect/:unlockId/approve` (by all members)

## Endpoints Summary

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | No | Health/basic hello route |
| POST | `/auth/register` | No | Register new user |
| POST | `/auth/login` | No | Login existing user |
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
  "phone": "+2348012345678",
  "password": "password123"
}
```

Response (201/200):
```json
{
  "message": "User registered successfully",
  "accessToken": "<jwt>",
  "user": {
    "id": "uuid",
    "fullName": "Ada Lovelace",
    "phone": "+2348012345678"
  }
}
```

Errors:
- `400`: `Phone number already registered`

### 3) POST `/auth/login`

Body:
```json
{
  "phone": "+2348012345678",
  "password": "password123"
}
```

Response:
```json
{
  "message": "Login successful",
  "accessToken": "<jwt>",
  "user": {
    "id": "uuid",
    "fullName": "Ada Lovelace",
    "phone": "+2348012345678"
  }
}
```

Errors:
- `401`: `Invalid credentials`

### 4) GET `/users/me`

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

### 5) POST `/listings`

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

### 6) GET `/listings/me`

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

### 7) POST `/matching/run`

Header:
- `Authorization: Bearer <accessToken>`

Response when found:
```json
{
  "found": true,
  "message": "Direct match found! Awaiting confirmations.",
  "chain": {
    "id": "uuid",
    "status": "PENDING",
    "type": "DIRECT",
    "cycleHash": "...",
    "cycleSize": 2,
    "avgScore": 87,
    "members": []
  },
  "badge": "DIRECT"
}
```

Response when none:
```json
{
  "found": false,
  "message": "No chain found yet.",
  "aiSuggestions": [
    "Increase your budget range by 10-20% to unlock more matches."
  ]
}
```

### 8) POST `/matching/run/:listingId`

Header:
- `Authorization: Bearer <accessToken>`

Path params:
- `listingId`: target listing ID (must belong to authenticated user)

Response shape is same as `/matching/run`.

### 9) GET `/matching/chains/me`

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

### 10) GET `/matching/chains/:chainId`

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

Notes:
- `phone` stays `null` until all chain members approve contact unlock.

### 11) POST `/matching/chains/:chainId/accept`

Header:
- `Authorization: Bearer <accessToken>`

Response:
```json
{
  "success": true,
  "allAccepted": false
}
```

### 12) POST `/matching/chains/:chainId/decline`

Header:
- `Authorization: Bearer <accessToken>`

Response:
```json
{
  "success": true
}
```

### 13) POST `/matching/chains/:chainId/connect`

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

### 14) POST `/matching/connect/:unlockId/approve`

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
4. Run `Auth -> Register` or `Auth -> Login` (token auto-saved)
5. Continue with other endpoints
