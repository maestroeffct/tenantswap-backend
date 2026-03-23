# Admin Dashboard Backend Handoff

Audience: backend engineers

## Goal
Provide backend capabilities required to operate TenantSwap at large scale.

## Core Requirements
- strong RBAC
- searchable operational data
- paginated list endpoints
- safe mutation endpoints
- audit logging for every admin action
- metrics endpoints
- system health endpoints
- bulk action support

## Must-Have Models
### 1. AdminAuditLog
Fields:
- id
- adminUserId
- action
- entityType
- entityId
- reason
- beforeJson
- afterJson
- metaJson
- createdAt
- ipAddress

### 2. SupportTicket (if not yet present)
- id
- userId
- category
- subject
- description
- status
- priority
- assignedAdminId
- resolutionNotes
- createdAt
- updatedAt

### 3. ModerationCase
- id
- targetType
- targetId
- reporterUserId
- reason
- status
- assignedAdminId
- decision
- createdAt
- resolvedAt

### 4. SystemIncident (recommended)
- id
- type
- severity
- status
- message
- context
- createdAt
- resolvedAt

## Must-Have Admin Endpoints
### Overview / Metrics
- GET /admin/overview/metrics
- GET /admin/overview/trends
- GET /admin/overview/alerts

### Users
- GET /admin/users
- GET /admin/users/:userId
- POST /admin/users/:userId/block
- POST /admin/users/:userId/unblock
- POST /admin/users/:userId/suspend
- POST /admin/users/:userId/verify-email
- POST /admin/users/:userId/verify-phone
- POST /admin/users/:userId/subscription/grant

### Listings
- GET /admin/listings
- GET /admin/listings/:listingId
- PATCH /admin/listings/:listingId
- POST /admin/listings/:listingId/close
- POST /admin/listings/:listingId/renew
- POST /admin/listings/:listingId/mark-taken

### Matching / Interests / Chains
- GET /admin/matching/runs
- POST /admin/matching/rerun
- GET /admin/interests
- GET /admin/chains
- GET /admin/chains/:chainId
- POST /admin/chains/:chainId/break
- POST /admin/chains/:chainId/expire
- POST /admin/chains/:chainId/rerun

### Notifications / Delivery
- GET /admin/notifications
- GET /admin/notifications/failures
- POST /admin/notifications/:id/resend
- GET /admin/notifications/retention-stats

### Billing
- GET /admin/billing/transactions
- GET /admin/billing/webhooks
- POST /admin/billing/users/:userId/grant-access
- POST /admin/billing/users/:userId/revoke-access

### Trust & Safety
- GET /admin/reports
- GET /admin/moderation/cases
- POST /admin/moderation/cases/:id/resolve
- POST /admin/users/:userId/penalty

### Audit
- GET /admin/audit-logs
- GET /admin/audit-logs/:id

### System / Ops
- GET /admin/system/health
- GET /admin/system/queues
- GET /admin/system/jobs/failed
- POST /admin/system/jobs/:jobId/retry

## Endpoint Standards
- server-side pagination
- filtering by status/date/location
- sortable by createdAt/updatedAt/severity
- standardized response envelope
- action reason required for dangerous endpoints

## Backend Concerns
- use indexes on high-cardinality search fields
- never return unbounded datasets
- support export jobs asynchronously
- write every mutation to AdminAuditLog
- split admin permissions by role

## Suggested RBAC Roles
- ADMIN_SUPPORT
- ADMIN_MODERATION
- ADMIN_BILLING
- ADMIN_OPERATIONS
- ADMIN_SUPER

## Build Order
### Phase 1
- RBAC hardening
- admin metrics
- user search/detail
- listing search/detail
- AdminAuditLog

### Phase 2
- interests/chains operations
- billing operations
- notification failure inspection
- trust/safety queues

### Phase 3
- support system
- moderation workflows
- incident management
- anomaly dashboards
- export/report pipeline
