-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('SWAP', 'SEEKING');

-- CreateEnum
CREATE TYPE "SeekerCategory" AS ENUM ('NYSC', 'WORK', 'SCHOOL', 'FAMILY_HOME', 'OTHER');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "SwapListing" ADD COLUMN     "listingType" "ListingType" NOT NULL DEFAULT 'SWAP',
ADD COLUMN     "seekerCategory" "SeekerCategory",
ADD COLUMN     "verificationDocumentUrl" TEXT,
ADD COLUMN     "verificationNote" TEXT,
ADD COLUMN     "verificationStatus" "VerificationStatus",
ALTER COLUMN "currentCity" SET DEFAULT '',
ALTER COLUMN "currentRent" SET DEFAULT 0,
ALTER COLUMN "currentType" SET DEFAULT '',
ALTER COLUMN "features" SET DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "currentAvailable" SET DEFAULT false,
ALTER COLUMN "currentState" SET DEFAULT '';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "nin" TEXT,
ADD COLUMN     "ninVerifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SwapListing_listingType_verificationStatus_createdAt_idx" ON "SwapListing"("listingType", "verificationStatus", "createdAt");
