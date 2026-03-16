/*
  Adjust SwapListing availability fields without losing current rent.
*/

-- AlterTable
ALTER TABLE "SwapListing"
RENAME COLUMN "availableOn" TO "currentAvailableOn";

ALTER TABLE "SwapListing"
ADD COLUMN "currentAvailable" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "relationship_status" TEXT;
