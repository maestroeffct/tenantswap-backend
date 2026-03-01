-- CreateEnum
CREATE TYPE "ReliabilityEventType" AS ENUM (
  'CANCELLATION',
  'NO_SHOW',
  'MANUAL_PENALTY',
  'MANUAL_UNBLOCK'
);

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "reliabilityScore" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN "cancellationCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "noShowCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "cooldownUntil" TIMESTAMP(3),
ADD COLUMN "blockedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ReliabilityEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "eventType" "ReliabilityEventType" NOT NULL,
  "scoreDelta" INTEGER NOT NULL DEFAULT 0,
  "reason" TEXT,
  "metadata" JSONB,
  "cooldownUntil" TIMESTAMP(3),
  "blockedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReliabilityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_blockedUntil_cooldownUntil_idx" ON "User"("blockedUntil", "cooldownUntil");

-- CreateIndex
CREATE INDEX "ReliabilityEvent_userId_createdAt_idx" ON "ReliabilityEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ReliabilityEvent_eventType_createdAt_idx" ON "ReliabilityEvent"("eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "ReliabilityEvent"
ADD CONSTRAINT "ReliabilityEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
