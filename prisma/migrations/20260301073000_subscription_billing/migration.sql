-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM (
  'INACTIVE',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'EXPIRED'
);

-- CreateEnum
CREATE TYPE "PaymentTransactionStatus" AS ENUM (
  'PENDING',
  'SUCCESS',
  'FAILED',
  'CANCELED'
);

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'INACTIVE',
ADD COLUMN "subscriptionPlan" TEXT,
ADD COLUMN "subscriptionProvider" TEXT,
ADD COLUMN "subscriptionReference" TEXT,
ADD COLUMN "subscriptionStartedAt" TIMESTAMP(3),
ADD COLUMN "subscriptionExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerEventId" TEXT,
  "providerReference" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "planCode" TEXT,
  "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'PENDING',
  "paidAt" TIMESTAMP(3),
  "subscriptionStartAt" TIMESTAMP(3),
  "subscriptionEndAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "signature" TEXT,
  "payload" JSONB NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_subscriptionStatus_subscriptionExpiresAt_idx" ON "User"("subscriptionStatus", "subscriptionExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_providerReference_key" ON "PaymentTransaction"("providerReference");

-- CreateIndex
CREATE INDEX "PaymentTransaction_userId_createdAt_idx" ON "PaymentTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentTransaction_status_createdAt_idx" ON "PaymentTransaction"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_eventId_key" ON "PaymentWebhookEvent"("provider", "eventId");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_provider_eventType_createdAt_idx" ON "PaymentWebhookEvent"("provider", "eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "PaymentTransaction"
ADD CONSTRAINT "PaymentTransaction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
