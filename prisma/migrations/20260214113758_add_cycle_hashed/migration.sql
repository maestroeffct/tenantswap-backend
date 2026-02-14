/*
  Warnings:

  - The values [COMPLETED] on the enum `ChainStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "ChainType" AS ENUM ('DIRECT', 'CIRCULAR');

-- AlterEnum
BEGIN;
CREATE TYPE "ChainStatus_new" AS ENUM ('PENDING', 'LOCKED', 'BROKEN');
ALTER TABLE "SwapChain" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "SwapChain" ALTER COLUMN "status" TYPE "ChainStatus_new" USING ("status"::text::"ChainStatus_new");
ALTER TYPE "ChainStatus" RENAME TO "ChainStatus_old";
ALTER TYPE "ChainStatus_new" RENAME TO "ChainStatus";
DROP TYPE "ChainStatus_old";
ALTER TABLE "SwapChain" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "SwapChain" ADD COLUMN     "type" "ChainType" NOT NULL DEFAULT 'CIRCULAR',
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "SwapChainMember" ADD COLUMN     "hasAccepted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ContactUnlock" (
    "id" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactUnlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactUnlockApproval" (
    "id" TEXT NOT NULL,
    "contactUnlockId" TEXT NOT NULL,
    "approverUserId" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactUnlockApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactUnlock_chainId_idx" ON "ContactUnlock"("chainId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactUnlockApproval_contactUnlockId_approverUserId_key" ON "ContactUnlockApproval"("contactUnlockId", "approverUserId");

-- AddForeignKey
ALTER TABLE "ContactUnlock" ADD CONSTRAINT "ContactUnlock_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "SwapChain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactUnlockApproval" ADD CONSTRAINT "ContactUnlockApproval_contactUnlockId_fkey" FOREIGN KEY ("contactUnlockId") REFERENCES "ContactUnlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
