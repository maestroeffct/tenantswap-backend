-- CreateEnum
CREATE TYPE "EmailLogStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('VERIFICATION', 'MATCH_ALERT', 'VACANCY_ALERT', 'VERIFICATION_APPROVED', 'VERIFICATION_REJECTED', 'CAMPAIGN', 'SYSTEM');

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "subject" TEXT NOT NULL,
    "type" "EmailType" NOT NULL DEFAULT 'SYSTEM',
    "templateSlug" TEXT,
    "status" "EmailLogStatus" NOT NULL DEFAULT 'SENT',
    "provider" TEXT NOT NULL DEFAULT 'smtp',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "messageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailLog_recipientUserId_createdAt_idx" ON "EmailLog"("recipientUserId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_type_status_createdAt_idx" ON "EmailLog"("type", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_slug_key" ON "EmailTemplate"("slug");

-- CreateIndex
CREATE INDEX "EmailTemplate_slug_idx" ON "EmailTemplate"("slug");

-- CreateIndex
CREATE INDEX "EmailTemplate_isActive_createdAt_idx" ON "EmailTemplate"("isActive", "createdAt");
