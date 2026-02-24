-- CreateEnum
CREATE TYPE "ListingInterestStatus" AS ENUM (
  'REQUESTED',
  'CONTACT_APPROVED',
  'DECLINED',
  'RELEASED',
  'EXPIRED',
  'CONFIRMED_RENTER'
);

-- AlterTable
ALTER TABLE "SwapListing"
ADD COLUMN "matchedAt" TIMESTAMP(3),
ADD COLUMN "matchedInterestId" TEXT;

-- CreateTable
CREATE TABLE "ListingInterest" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "requesterListingId" TEXT NOT NULL,
  "requesterUserId" TEXT NOT NULL,
  "status" "ListingInterestStatus" NOT NULL DEFAULT 'REQUESTED',
  "expiresAt" TIMESTAMP(3),
  "respondedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ListingInterest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SwapListing_matchedInterestId_idx" ON "SwapListing"("matchedInterestId");

-- CreateIndex
CREATE UNIQUE INDEX "ListingInterest_listingId_requesterListingId_key" ON "ListingInterest"("listingId", "requesterListingId");

-- CreateIndex
CREATE INDEX "ListingInterest_listingId_status_createdAt_idx" ON "ListingInterest"("listingId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ListingInterest_requesterUserId_status_createdAt_idx" ON "ListingInterest"("requesterUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ListingInterest_status_expiresAt_idx" ON "ListingInterest"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "ListingInterest"
ADD CONSTRAINT "ListingInterest_listingId_fkey"
FOREIGN KEY ("listingId") REFERENCES "SwapListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingInterest"
ADD CONSTRAINT "ListingInterest_requesterListingId_fkey"
FOREIGN KEY ("requesterListingId") REFERENCES "SwapListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingInterest"
ADD CONSTRAINT "ListingInterest_requesterUserId_fkey"
FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
