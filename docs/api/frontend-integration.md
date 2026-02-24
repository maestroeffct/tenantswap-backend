# Frontend Integration Guide

Base URL: `http://localhost:3000`
Auth: `Authorization: Bearer <accessToken>`

## Core User Journeys

### 1) Chain-based matching

1. Register -> verify email -> login
2. Create listing
3. Run matching
4. Review chains and accept/decline
5. If locked, unlock contacts

### 2) One-to-many interest flow

1. Run matching and display recommendations + `stats`
2. User sends request to listing owner
3. Owner reviews incoming requests
4. Owner approves/declines per request
5. Owner confirms one renter
6. Others are auto-released and rerun matching

## Important Contracts

### POST `/matching/run`

Response includes:

- `recommendations[]`
- `stats.totalCandidates`
- `stats.oneToOneCandidates`
- `stats.oneWayCandidates`
- `matchScenario` (`ONE_TO_ONE`, `ONE_TO_MANY`, `INDEPENDENT`)

### POST `/matching/interests/:targetListingId/request`

Body:

```json
{
  "requesterListingId": "optional-uuid"
}
```

### GET `/matching/interests/incoming`

Used by listing owner dashboard to show how many people are attached to each listing.

### GET `/matching/interests/outgoing`

Used by requester dashboard to show status timeline.

### POST `/matching/interests/:interestId/approve`

Owner approves contact sharing for one requester.

### POST `/matching/interests/:interestId/decline`

Owner declines one requester.

### POST `/matching/interests/:interestId/confirm-renter`

Owner finalizes one requester. Backend then:

- marks selected request `CONFIRMED_RENTER`
- marks listing/requester listing as `MATCHED`
- marks other open requests `RELEASED`
- reruns matching for released users
- notifies affected users

## UI Rules

- Show request actions only to listing owner.
- Show owner phone to requester only when status is `CONTACT_APPROVED` or `CONFIRMED_RENTER`.
- Disable request button if listing status is not `ACTIVE`.
- Show countdown for request expiry (`expiresAt`).
- Refresh incoming/outgoing screens after approve/decline/confirm actions.

## Files

- `docs/api/endpoints.md`
- `docs/postman/TenantSwap-Backend.postman_collection.json`
- `docs/postman/TenantSwap-Local.postman_environment.json`
