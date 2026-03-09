-- Add auto-search tracking on listings for asynchronous recommendation alerts.
ALTER TABLE "SwapListing"
ADD COLUMN "autoSearchEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastRecommendationCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "autoSearchLastRunAt" TIMESTAMP(3),
ADD COLUMN "autoSearchMatchedAt" TIMESTAMP(3);
