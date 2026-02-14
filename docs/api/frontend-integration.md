# Frontend Integration Guide

Base URL: `http://localhost:3000`

Auth: JWT Bearer token in `Authorization: Bearer <accessToken>`

## 1) Core Flow For Frontend

1. Register/Login and store `accessToken`
2. Create listing
3. Run matching
4. Show chains list
5. Open chain detail
6. Accept or decline chain
7. If chain becomes `LOCKED`, request contact unlock
8. Each member approves unlock
9. Refetch chain detail until `contactUnlocked = true`

## 2) Auth Contract

### POST `/auth/register`
Request:
```json
{
  "fullName": "Ada Lovelace",
  "phone": "+2348012345678",
  "password": "password123"
}
```

Response:
```json
{
  "message": "User registered successfully",
  "accessToken": "jwt",
  "user": {
    "id": "uuid",
    "fullName": "Ada Lovelace",
    "phone": "+2348012345678"
  }
}
```

### POST `/auth/login`
Request:
```json
{
  "phone": "+2348012345678",
  "password": "password123"
}
```

Response shape is same as register.

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

Success (match found):
```json
{
  "found": true,
  "message": "Direct match found! Awaiting confirmations.",
  "badge": "DIRECT",
  "chain": {
    "id": "uuid",
    "status": "PENDING",
    "type": "DIRECT",
    "cycleHash": "...",
    "cycleSize": 2,
    "avgScore": 87,
    "members": []
  }
}
```

No match:
```json
{
  "found": false,
  "message": "No chain found yet.",
  "aiSuggestions": [
    "Increase your budget range by 10-20% to unlock more matches."
  ]
}
```

### GET `/matching/chains/me`
Use this for chain list page.

### GET `/matching/chains/:chainId`
Use this for chain detail page.

Response:
```json
{
  "id": "uuid",
  "cycleSize": 2,
  "avgScore": 87,
  "status": "LOCKED",
  "type": "DIRECT",
  "cycleHash": "...",
  "contactUnlocked": false,
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
  ]
}
```

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

## 5) Recommended UI State Rules

- Chain card status color mapping:
  - `PENDING`: warning/amber
  - `LOCKED`: success/green
  - `BROKEN`: error/red
- Show `Accept` and `Decline` buttons only if user is chain member and status is `PENDING`.
- Show `Connect` button only when status is `LOCKED`.
- Poll/refetch chain detail after accept/decline/connect/approve.

## 6) Error Shape (Nest default)

Most failures come as:
```json
{
  "statusCode": 400,
  "message": "You are not a member of this chain",
  "error": "Bad Request"
}
```

Handle at least:
- `400` invalid flow/business rule
- `401` missing or invalid token

## 7) Suggested Frontend Types (TypeScript)

```ts
export type ChainStatus = 'PENDING' | 'LOCKED' | 'BROKEN';
export type ChainType = 'DIRECT' | 'CIRCULAR';

export interface ChainMemberDetail {
  listingId: string;
  position: number;
  hasAccepted: boolean;
  fullName: string | null;
  phone: string | null;
  currentCity: string | null;
  currentType: string | null;
  currentRent: number | null;
  desiredCity: string | null;
}

export interface ChainDetail {
  id: string;
  cycleSize: number;
  avgScore: number;
  status: ChainStatus;
  type: ChainType;
  cycleHash: string;
  contactUnlocked: boolean;
  members: ChainMemberDetail[];
}
```

## 8) Hand-off Files

- Full API reference: `docs/api/endpoints.md`
- Postman collection: `docs/postman/TenantSwap-Backend.postman_collection.json`
- Postman env: `docs/postman/TenantSwap-Local.postman_environment.json`
