# Frontend Integration Guide

Base URL: `http://localhost:3000`

Auth: JWT Bearer token in `Authorization: Bearer <accessToken>`

## 1) Core Flow For Frontend

1. Register
2. Verify email (or resend verification then verify)
3. Login and store `accessToken`
4. Create listing
5. Run matching
6. Show chains list
7. Open chain detail
8. Accept or decline chain
9. If chain becomes `LOCKED`, request contact unlock
10. Each member approves unlock
11. Refetch chain detail until `contactUnlocked = true`

## 2) Auth Contract

### POST `/auth/register`
Request:
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

### POST `/auth/verify-email`
Request:
```json
{
  "token": "<64-char-token>"
}
```

Response:
```json
{
  "message": "Email verified successfully",
  "accessToken": "jwt",
  "user": {
    "id": "uuid",
    "fullName": "Ada Lovelace",
    "phone": "+2348012345678",
    "email": "ada@example.com"
  }
}
```

### POST `/auth/resend-verification`
Request:
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

### POST `/auth/login`
Request:
```json
{
  "phone": "+2348012345678",
  "password": "Password123!"
}
```

Response:
```json
{
  "message": "Login successful",
  "accessToken": "jwt",
  "user": {
    "id": "uuid",
    "fullName": "Ada Lovelace",
    "phone": "+2348012345678",
    "email": "ada@example.com"
  }
}
```

## 3) Listing Contract

### POST `/listings`
Request:
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
    "status": "ACTIVE"
  }
}
```

### GET `/listings/me`
Response:
```json
[
  {
    "id": "uuid",
    "status": "ACTIVE",
    "desiredType": "2-Bedroom Apartment"
  }
]
```

## 4) Matching Contract

### POST `/matching/run` or `/matching/run/:listingId`

One-to-one found:
```json
{
  "found": true,
  "message": "Direct one-to-one match found! Awaiting confirmations.",
  "badge": "DIRECT",
  "matchScenario": "ONE_TO_ONE",
  "chain": {
    "id": "uuid",
    "status": "PENDING",
    "type": "DIRECT",
    "cycleHash": "...",
    "cycleSize": 2,
    "avgScore": 87,
    "members": []
  },
  "recommendations": []
}
```

No chain yet (ranked one-way candidates):
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

No compatible recommendation:
```json
{
  "found": false,
  "message": "No compatible recommendation yet. This listing is currently independent.",
  "matchScenario": "INDEPENDENT",
  "recommendations": [],
  "aiSuggestions": ["..."]
}
```

### GET `/matching/chains/me`
Use this for chain list page.

### GET `/matching/chains/:chainId`
Use this for chain detail page.

Important:
- `phone` is `null` until contact unlock approvals are complete.
- check `contactUnlocked` to decide when to reveal call/chat UI.

### POST `/matching/chains/:chainId/accept`
Response:
```json
{
  "success": true,
  "allAccepted": false
}
```

### POST `/matching/chains/:chainId/decline`
Response:
```json
{
  "success": true
}
```

### POST `/matching/chains/:chainId/connect`
Creates unlock request.

Response:
```json
{
  "success": true,
  "unlockId": "uuid"
}
```

### POST `/matching/connect/:unlockId/approve`
Response:
```json
{
  "success": true
}
```

## 5) Error Shape

All errors are normalized:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Request failed",
  "timestamp": "2026-02-23T12:00:00.000Z",
  "path": "/some-path"
}
```

Login failures/lockouts may include a `meta` object with attempts and lock info.

## 6) Suggested Frontend Types (TypeScript)

```ts
export type ChainStatus = 'PENDING' | 'LOCKED' | 'BROKEN';
export type ChainType = 'DIRECT' | 'CIRCULAR';
export type MatchScenario = 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'INDEPENDENT';

export interface RecommendationBreakdown {
  location: number;
  apartmentType: number;
  budget: number;
  timeline: number;
  features: number;
  reciprocityBonus: number;
}

export interface MatchRecommendation {
  listingId: string;
  relationship: 'ONE_TO_ONE' | 'ONE_WAY';
  score: number;
  rankScore: number;
  breakdown: RecommendationBreakdown;
}
```

## 7) Hand-off Files

- Full API reference: `docs/api/endpoints.md`
- Postman collection: `docs/postman/TenantSwap-Backend.postman_collection.json`
- Postman env: `docs/postman/TenantSwap-Local.postman_environment.json`
