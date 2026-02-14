/*
  Warnings:

  - You are about to drop the column `leavingBedrooms` on the `SwapListing` table. All the data in the column will be lost.
  - You are about to drop the column `leavingCity` on the `SwapListing` table. All the data in the column will be lost.
  - You are about to drop the column `leavingRent` on the `SwapListing` table. All the data in the column will be lost.
  - You are about to drop the column `minBudget` on the `SwapListing` table. All the data in the column will be lost.
  - You are about to drop the column `moveEarliest` on the `SwapListing` table. All the data in the column will be lost.
  - You are about to drop the column `moveLatest` on the `SwapListing` table. All the data in the column will be lost.
  - You are about to drop the column `targetBedrooms` on the `SwapListing` table. All the data in the column will be lost.
  - You are about to drop the column `targetCity` on the `SwapListing` table. All the data in the column will be lost.
  - Added the required column `availableOn` to the `SwapListing` table without a default value. This is not possible if the table is not empty.
  - Added the required column `currentCity` to the `SwapListing` table without a default value. This is not possible if the table is not empty.
  - Added the required column `currentRent` to the `SwapListing` table without a default value. This is not possible if the table is not empty.
  - Added the required column `currentType` to the `SwapListing` table without a default value. This is not possible if the table is not empty.
  - Added the required column `desiredCity` to the `SwapListing` table without a default value. This is not possible if the table is not empty.
  - Added the required column `desiredType` to the `SwapListing` table without a default value. This is not possible if the table is not empty.
  - Added the required column `timeline` to the `SwapListing` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SwapListing" DROP COLUMN "leavingBedrooms",
DROP COLUMN "leavingCity",
DROP COLUMN "leavingRent",
DROP COLUMN "minBudget",
DROP COLUMN "moveEarliest",
DROP COLUMN "moveLatest",
DROP COLUMN "targetBedrooms",
DROP COLUMN "targetCity",
ADD COLUMN     "availableOn" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "currentCity" TEXT NOT NULL,
ADD COLUMN     "currentRent" INTEGER NOT NULL,
ADD COLUMN     "currentType" TEXT NOT NULL,
ADD COLUMN     "desiredCity" TEXT NOT NULL,
ADD COLUMN     "desiredType" TEXT NOT NULL,
ADD COLUMN     "features" TEXT[],
ADD COLUMN     "timeline" TEXT NOT NULL;
