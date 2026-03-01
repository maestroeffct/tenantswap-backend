# Frontend Integration Guide

Base URL: `http://localhost:3000`
Auth: `Authorization: Bearer <accessToken>`

## Response Envelope

All API responses (success and errors) use the same envelope:

```json
{
  "statusCode": 200,
  "message": "Request successful",
  "data": {}
}
```

For frontend parsing, always read payload from `response.data`.

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
5. Owner confirms one renter or requester confirms after approval
6. Others are auto-released and rerun matching

### 3) Subscription-gated access

1. App checks `GET /billing/me` after login
2. If `hasAccess=false`, route user to payment screen
3. Call `POST /billing/checkout`
4. Wait for provider webhook to activate subscription
5. Retry protected actions (listings/matching)

### 4) Reliability controls

1. Read `GET /users/me/reliability`
2. If user is restricted, backend blocks protected actions with `429` (cooldown) or `403` (blocked)
3. Admin can inspect and override via admin reliability endpoints

## Important Contracts

### POST `/matching/run`

Response `data` includes:

- `recommendations[]`
- `stats.totalCandidates`
- `stats.oneToOneCandidates`
- `stats.oneWayCandidates`
- `matchScenario` (`ONE_TO_ONE`, `ONE_TO_MANY`, `INDEPENDENT`)

### POST `/listings/:listingId/renew`

Refreshes `expiresAt` and reactivates listing if it was expired/closed (except `MATCHED`).

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

Owner finalizes one requester.

### POST `/matching/interests/:interestId/confirm-taken`

Requester finalizes an approved request from their side. Backend then:

- marks selected request `CONFIRMED_RENTER`
- marks listing/requester listing as `MATCHED`
- marks other open requests `RELEASED`
- reruns matching for released users
- notifies affected users

## UI Rules

- Show request actions only to listing owner.
- Show owner phone to requester only when status is `CONTACT_APPROVED` or `CONFIRMED_RENTER`.
- Disable request button if listing status is not `ACTIVE`.
- Handle `429` on request-interest endpoint (open-request cap / daily cap reached).
- Handle `402` on protected endpoints when subscription is required.
- Handle `403` on protected endpoints when account is blocked by reliability policy.
- Handle `429` on protected endpoints for reliability cooldown windows.
- Show countdown for request expiry (`expiresAt`).
- Refresh incoming/outgoing screens after approve/decline/confirm actions.

## Files

- `docs/api/endpoints.md`
- `docs/postman/TenantSwap-Backend.postman_collection.json`
- `docs/postman/TenantSwap-Local.postman_environment.json`

## Billing Contracts

### GET `/billing/me`

Use `response.data.hasAccess` to determine whether user can access listing/matching flows.

### POST `/billing/checkout`

Returns checkout metadata in `response.data.checkout` (`reference`, `amountMinor`, `planCode`).

### POST `/billing/webhook`

Backend-only endpoint used by payment gateway to activate/renew/cancel subscriptions.

### GET `/users/me/reliability`

Returns reliability score and restriction timestamps in `response.data`.
