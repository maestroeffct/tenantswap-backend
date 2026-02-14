-- Keep this migration resilient for non-empty tables.
-- 1) Add new columns as nullable.
ALTER TABLE "MatchCandidate"
ADD COLUMN "budgetScore" INTEGER,
ADD COLUMN "cityScore" INTEGER,
ADD COLUMN "timelineScore" INTEGER,
ADD COLUMN "totalScore" INTEGER,
ADD COLUMN "typeScore" INTEGER;

-- 2) Backfill from legacy `score` while preserving previous total score:
-- base city/type = 70, remaining up to 30 split into budget (max 20) + timeline (max 10).
UPDATE "MatchCandidate"
SET
  "cityScore" = 40,
  "typeScore" = 30,
  "budgetScore" = LEAST(20, GREATEST(0, "score" - 70)),
  "timelineScore" = GREATEST(0, GREATEST(0, "score" - 70) - 20),
  "totalScore" = LEAST(100, GREATEST(0, "score"))
WHERE "totalScore" IS NULL;

-- 3) Enforce required columns after backfill.
ALTER TABLE "MatchCandidate"
ALTER COLUMN "budgetScore" SET NOT NULL,
ALTER COLUMN "cityScore" SET NOT NULL,
ALTER COLUMN "timelineScore" SET NOT NULL,
ALTER COLUMN "totalScore" SET NOT NULL,
ALTER COLUMN "typeScore" SET NOT NULL;

-- 4) Remove old columns and unused indexes.
ALTER TABLE "MatchCandidate"
DROP COLUMN "reasons",
DROP COLUMN "score";

DROP INDEX IF EXISTS "MatchCandidate_fromListingId_idx";
DROP INDEX IF EXISTS "MatchCandidate_toListingId_idx";
