# Admin Dashboard UI/UX Brief

Audience: UI/UX designer

## Product Context
This is not a simple CRUD dashboard. It is a business operations console for a rental-matching platform. It must support monitoring, triage, intervention, and auditability at scale.

## Design Goals
- fast scanning of system health
- low-friction triage for operational issues
- safe handling of destructive admin actions
- clear separation between overview, queues, detail pages, and action panels
- usable at large data scale

## Information Architecture
### Primary Navigation
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

### Secondary Navigation Pattern
Each section should have:
- summary page
- list/table view
- filters/search
- detail page / drawer
- actions panel
- audit history panel

## Core Screens
### 1. Overview Dashboard
Must include:
- KPI cards
- trend graphs
- alert banners
- pending-issue queues
- failed integrations/jobs panel
- regional summary map or cards

### 2. Queue Screens
Examples:
- pending support tickets
- failed webhooks
- blocked users
- suspicious listings
- stale match requests
These should be list-first, filterable, and actionable.

### 3. Table Screens
Need:
- sticky filters
- saved views
- bulk actions
- row-level quick actions
- status chips
- column customization

### 4. Detail Screens
For user, listing, chain, ticket, transaction, etc.
Should contain:
- summary header
- tabs for related entities
- audit log sidebar or tab
- admin action panel separated from passive data

## Interaction Principles
- destructive actions require confirmation and reason input
- sensitive actions must surface consequences clearly
- bulk actions must have preview and count summary
- audit information should be visible, not hidden
- errors must be actionable, not generic

## Visual Guidance
- dense but readable layout
- strong status color system
- clear severity hierarchy for alerts
- avoid overly consumer-style UI; this is an operations product
- optimize for desktop first

## Required Components
- KPI cards
- advanced data tables
- global search command bar
- filter drawer/panel
- detail drawer or split view
- status timeline component
- audit log component
- confirmation modal with typed-reason input
- activity feed component
- empty-state component for queues

## Key Data States
- loading
- partial failure
- stale data warning
- no access / insufficient permission
- empty queue
- destructive action pending confirmation

## Permission-Aware UX
Must visually separate roles such as:
- support admin
- moderation admin
- billing admin
- super admin
Only show actions users are allowed to perform.

## High-Priority Flows to Design First
1. Overview
2. User detail + actions
3. Listing detail + actions
4. Request/interest operations
5. Billing exceptions
6. Trust & safety queue
7. Audit logs

## Mobile
Not a priority for primary admin usage. Tablet fallback is optional. Primary target is desktop/laptop.
