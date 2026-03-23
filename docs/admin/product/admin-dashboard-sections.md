# Admin Dashboard Sections

Audience: founder, product, operations

## Goal
The admin dashboard is the operational control system for TenantSwap. It must cover business visibility, support, trust, payments, automation, and emergency controls.

## Top-Level Navigation
- Overview
- Operations
- Users
- Listings
- Matching
- Notifications
- Billing
- Trust & Safety
- Analytics
- System
- Admin Control

## Full Sections

### 1. Overview
- KPIs: DAU, WAU, MAU, new users, active listings, active requests, approvals, confirmations
- today / 7d / 30d trends
- alert summary
- failed jobs / failed webhooks / failed notifications
- business health summary

### 2. Admin Users & Roles
- admin accounts
- role management
- permissions matrix
- session control
- access review
- invite / disable admin
- super-admin access controls

### 3. Customer Support Queue
- tickets
- complaints
- escalations
- assignee
- status
- SLA tracking
- resolution notes

### 4. Users Management
- search user by id / email / phone
- profile details
- verification status
- subscription status
- reliability state
- onboarding status
- allowlist/tester status
- suspend / unblock / deactivate
- manual edits and override tools

### 5. Listings Management
- all listings
- active / matched / closed / expired filters
- listing detail page
- listing owner detail
- suspicious / stale listing queue
- force close / renew / edit / restore
- bulk actions

### 6. Matching Engine Operations
- match runs
- one-to-one / one-to-many / no-match trends
- auto-search watchlist
- rerun matching tools
- failed match runs
- matching quality analytics
- weight/rule visibility

### 7. Interest / Request Management
- incoming requests across platform
- outgoing requests across platform
- pending approvals
- approved / declined / released / expired requests
- manual approve / decline / confirm tools
- request volume and conversion

### 8. Chains Management
- all chains
- pending / locked / broken / expired chains
- chain detail and member states
- break / expire / rerun controls
- intervention notes

### 9. Vacancy Alerts / Saved Demand
- active alerts
- demand hotspots
- matched vs unmatched alerts
- invalid alerts
- alert delivery tracking

### 10. Notifications Center
- in-app notifications
- read / unread distribution
- failed deliveries
- resend tools
- channel-level visibility
- retention cleanup visibility

### 11. Email Operations
- send success/failure
- queue health
- SMTP health
- retries
- template health
- resend verification/transactional emails

### 12. SMS Operations
- OTP sends
- notification SMS sends
- provider failures
- resend tools
- spend / usage visibility

### 13. Billing & Subscription
- payment records
- active / inactive / past-due / canceled users
- webhook events
- manual subscription override
- tester bypass management
- plan metrics

### 14. Finance / Revenue Analytics
- MRR / ARR
- payment conversion
- churn
- failed collections
- revenue by geography / plan

### 15. Reliability / Trust & Safety
- reliability scores
- repeat cancellations
- no-shows
- cooldown / block windows
- manual penalties
- trust flags

### 16. Moderation
- reports against users/listings
- scam / abuse / impersonation cases
- evidence review
- sanctions history

### 17. Search & Global Lookup
- universal search
- user id / email / phone / listing id / chain id / transaction ref / notification id
- quick-jump results

### 18. Analytics & BI
- growth trends
- funnel metrics
- matching conversion
- city/state/area demand and supply
- cohort analysis
- exports

### 19. Geography / Market Operations
- state/city/area health
- high-demand zones
- low-supply zones
- launch readiness by market
- market-level controls

### 20. Feature Flags & Configuration
- feature toggles
- matching weights
- retention windows
- queue settings
- throttling settings
- subscription enforcement

### 21. Queue & Job Operations
- BullMQ queues
- failed jobs
- retries
- stuck jobs
- worker health
- queue lag

### 22. System Health / DevOps
- API uptime
- latency
- DB health
- Redis health
- SMTP health
- SMS provider health
- webhook health
- SSE health

### 23. Audit Logs
- every admin action
- automation actions
- before/after state where relevant
- actor, timestamp, reason

### 24. Compliance / Privacy
- consent logs
- deletion requests
- export requests
- privacy workflow history

### 25. Content / CMS Controls
- FAQ
- policy pages
- onboarding text
- banners
- announcements

### 26. Referral / Growth / Campaigns
- referral performance
- promo cohorts
- marketing campaigns
- invitation performance

### 27. Integrations
- Mailgun
- Termii
- payment provider
- Google OAuth
- webhook status
- config health

### 28. Data Export / Reports
- CSV/Excel exports
- scheduled reports
- filtered operational reports

### 29. Settings / Business Controls
- support email
- company identity
- sender settings
- environment-aware config visibility

### 30. Incident / Emergency Controls
- maintenance mode
- pause matching
- pause listings
- pause contact unlock
- pause payments
- emergency notices

### 31. Experiment / Rollout Controls
- beta feature rollout
- A/B test visibility
- cohort rollout controls

### 32. Super Admin Console
- dangerous system overrides
- repair tools
- one-off operator actions
- heavily audited root controls

## Core Principle
Admins should not browse raw data manually at scale. The system should prioritize:
- queues
- alerts
- search
- safe actions
- audit trails
- automation-first operations
