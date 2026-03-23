# Admin Dashboard Frontend Handoff

Audience: frontend engineers

## Frontend Requirements
The admin dashboard frontend should be built as an operations app, not a consumer app.

## Core Technical Requirements
- role-based route and action guards
- global search
- filterable data tables
- server-driven pagination
- debounced search
- status chips and timelines
- audit log panels
- bulk action workflows
- live refresh for operational queues where useful

## App Structure
Recommended top-level routes:
- /admin
- /admin/overview
- /admin/users
- /admin/users/:userId
- /admin/listings
- /admin/listings/:listingId
- /admin/matching
- /admin/interests
- /admin/chains
- /admin/notifications
- /admin/billing
- /admin/trust-safety
- /admin/support
- /admin/system
- /admin/audit-logs
- /admin/settings

## Frontend Architecture
- app shell with permanent desktop sidebar
- route-level code splitting
- API hooks with cache invalidation strategy
- table state synced to query params
- reusable filters/search components
- reusable admin action modal pattern

## Data Handling Rules
- use server pagination, not client pagination, for large tables
- use explicit refetch on mutation completion
- optimistic updates only where safe
- all destructive actions should refetch target detail and list views

## Required UI Modules
### Overview
- KPI grid
- charts
- incident banners
- queue cards

### Tables
- reusable data table abstraction
- query param sync for filters/sort/page
- bulk checkbox selection
- bulk action toolbar

### Detail Views
- header summary block
- metadata section
- related records tabs
- action panel
- audit log tab

### Global Search
Must search across:
- users
- listings
- chains
- interests
- transactions
- notifications

## Recommended State Management
Use one of:
- TanStack Query + local UI state
- RTK Query if already in use
Do not store large table data in global manual state unless necessary.

## Real-Time / Refresh
Good candidates for live refresh:
- overview cards
- support queues
- failed jobs
- notification failures
- pending approvals
Polling is acceptable for admin operations. SSE/WebSocket can be layered later if needed.

## Security Rules
- never trust hidden buttons alone; backend must enforce permissions
- log visible admin action reasons in UI before submit
- display backend error detail where safe and useful

## MVP Frontend Build Order
1. Overview
2. Users list + user detail
3. Listings list + listing detail
4. Interests/chains operations
5. Billing exceptions
6. Audit logs
7. System health panels

## Later Additions
- saved table views
- bulk exports
- advanced analytics
- anomaly dashboards
- live incident center
