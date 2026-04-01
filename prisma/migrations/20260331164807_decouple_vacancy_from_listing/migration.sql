/*
  Warnings:

  - You are about to drop the column `listingId` on the `VacancyAlert` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "VacancyAlert" DROP CONSTRAINT "VacancyAlert_listingId_fkey";

-- DropIndex
DROP INDEX "VacancyAlert_listingId_key";

-- AlterTable
ALTER TABLE "VacancyAlert" DROP COLUMN "listingId";
