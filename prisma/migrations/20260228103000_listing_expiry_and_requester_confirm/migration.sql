-- CreateEnum
CREATE TYPE "ListingCloseReason" AS ENUM (
  'MATCH_CONFIRMED',
  'REQUESTER_CONFIRMED',
  'OWNER_CLOSED',
  'EXPIRED',
  'ADMIN_CLOSED'
);

-- CreateEnum
CREATE TYPE "InterestConfirmedBy" AS ENUM ('LISTER', 'WANTER', 'ADMIN');

-- AlterTable
ALTER TABLE "SwapListing"
ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "closedAt" TIMESTAMP(3),
ADD COLUMN "closeReason" "ListingCloseReason",
ADD COLUMN "closedByUserId" TEXT;

-- AlterTable
ALTER TABLE "ListingInterest"
ADD COLUMN "confirmedByUserId" TEXT,
ADD COLUMN "confirmedByRole" "InterestConfirmedBy";

-- Backfill existing active listings with a default expiration window.
UPDATE "SwapListing"
SET "expiresAt" = NOW() + INTERVAL '14 day'
WHERE "status" = 'ACTIVE' AND "expiresAt" IS NULL;

-- CreateIndex
CREATE INDEX "SwapListing_status_expiresAt_idx" ON "SwapListing"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ListingInterest_status_confirmedAt_idx" ON "ListingInterest"("status", "confirmedAt");
