# Testing Guide

## 1. Create a test database

Create a dedicated PostgreSQL database for tests, for example:

```bash
createdb tenantswap_test_db
```

## 2. Copy the test environment file

```bash
cp .env.test.example .env.test
```

Adjust `DATABASE_URL` if your local PostgreSQL credentials differ.

## 3. Apply Prisma migrations to the test database

```bash
DATABASE_URL="postgresql://tenantswap:tenantswap@localhost:5432/tenantswap_test_db" npx prisma migrate deploy
```

## 4. Run unit tests

```bash
npm test
```

## 5. Run end-to-end tests

```bash
npm run test:e2e
```

## What the E2E suite currently covers

- `GET /` returns the standard response envelope
- authenticated listing creation succeeds
- invalid listing payload returns structured validation errors
- requester -> owner interest request flow
- owner approval unlocks owner contact for requester

## Test support files

- `test/support/load-test-env.ts` - loads `.env.test` defaults
- `test/support/test-app.ts` - bootstraps Nest with the same global setup as `main.ts`
- `test/support/reset-db.ts` - truncates all application tables between tests
- `test/support/auth.ts` - creates test users and JWTs quickly
