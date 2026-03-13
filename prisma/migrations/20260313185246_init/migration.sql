/*
  Warnings:

  - You are about to drop the column `availableOn` on the `SwapListing` table. All the data in the column will be lost.
  - You are about to drop the column `currentRent` on the `SwapListing` table. All the data in the column will be lost.
  - Added the required column `currentAvailableOn` to the `SwapListing` table without a default value. This is not possible if the table is not empty.
  - Added the required column `currentAvailiable` to the `SwapListing` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SwapListing" DROP COLUMN "availableOn",
DROP COLUMN "currentRent",
ADD COLUMN     "currentAvailableOn" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "currentAvailiable" BOOLEAN NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "relationship_status" TEXT;
