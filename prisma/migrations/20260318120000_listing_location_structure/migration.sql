ALTER TABLE "SwapListing"
ADD COLUMN IF NOT EXISTS "desiredState" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "desiredArea" TEXT,
ADD COLUMN IF NOT EXISTS "currentState" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "currentArea" TEXT;

UPDATE "SwapListing"
SET
  "desiredState" = CASE
    WHEN COALESCE("desiredState", '') = '' THEN "desiredCity"
    ELSE "desiredState"
  END,
  "currentState" = CASE
    WHEN COALESCE("currentState", '') = '' THEN "currentCity"
    ELSE "currentState"
  END;

ALTER TABLE "SwapListing"
ALTER COLUMN "desiredState" DROP DEFAULT,
ALTER COLUMN "currentState" DROP DEFAULT,
ALTER COLUMN "currentAvailableOn" DROP NOT NULL;
