-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ChainBreakReason" AS ENUM (
  'DECLINED',
  'EXPIRED',
  'ADMIN_FORCE',
  'NO_SHOW',
  'CONFLICT',
  'UNKNOWN'
);

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';

-- AlterTable
ALTER TABLE "SwapChain"
ADD COLUMN "acceptBy" TIMESTAMP(3),
ADD COLUMN "brokenAt" TIMESTAMP(3),
ADD COLUMN "brokenByUserId" TEXT,
ADD COLUMN "brokenReason" "ChainBreakReason",
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill updatedAt for existing rows.
UPDATE "SwapChain"
SET "updatedAt" = "createdAt"
WHERE "updatedAt" IS NULL;

-- CreateTable
CREATE TABLE "UserNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "chainId" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "payload" JSONB,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SwapChain_status_acceptBy_idx" ON "SwapChain"("status", "acceptBy");

-- CreateIndex
CREATE INDEX "UserNotification_userId_createdAt_idx" ON "UserNotification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserNotification_chainId_idx" ON "UserNotification"("chainId");

-- AddForeignKey
ALTER TABLE "UserNotification"
ADD CONSTRAINT "UserNotification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
