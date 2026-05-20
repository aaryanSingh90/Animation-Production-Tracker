-- Reconcile additive tracking columns that were introduced in schema/code
-- after the initial project/shot/asset rollout. This is idempotent and safe
-- to apply on partially-upgraded production databases.

-- Ensure AssetType includes BG for the current asset workflow.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssetType')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'AssetType'
        AND e.enumlabel = 'BG'
    ) THEN
    ALTER TYPE "AssetType" ADD VALUE 'BG';
  END IF;
END $$;

-- Asset sub-category enum used by modelling / unwrapping / texturing / rigging views.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssetSubCategory') THEN
    CREATE TYPE "AssetSubCategory" AS ENUM ('CHARACTER', 'CHARACTER_BLENDSHAPES', 'PROP', 'BG');
  END IF;
END $$;

-- Project stage detail columns.
ALTER TABLE "ProjectStage" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
ALTER TABLE "ProjectStage" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);
ALTER TABLE "ProjectStage" ADD COLUMN IF NOT EXISTS "actualStartedAt" TIMESTAMP(3);
ALTER TABLE "ProjectStage" ADD COLUMN IF NOT EXISTS "actualDoneAt" TIMESTAMP(3);
ALTER TABLE "ProjectStage" ADD COLUMN IF NOT EXISTS "timeConsumedMin" INTEGER;
ALTER TABLE "ProjectStage" ADD COLUMN IF NOT EXISTS "audioStatus" "StageStatus";
ALTER TABLE "ProjectStage" ADD COLUMN IF NOT EXISTS "finalOutput" TEXT;

-- Shot metadata required by animatics / editing workspaces.
ALTER TABLE "Shot" ADD COLUMN IF NOT EXISTS "label" TEXT;
ALTER TABLE "Shot" ADD COLUMN IF NOT EXISTS "frameStart" INTEGER NOT NULL DEFAULT 101;
ALTER TABLE "Shot" ADD COLUMN IF NOT EXISTS "frameEnd" INTEGER;
ALTER TABLE "Shot" ADD COLUMN IF NOT EXISTS "seconds" DOUBLE PRECISION;

UPDATE "Shot"
SET
  "label" = COALESCE("label", "name", 'Shot_' || LPAD("shotNumber"::TEXT, 2, '0')),
  "frameStart" = COALESCE("frameStart", 101),
  "seconds" = COALESCE("seconds", "duration"),
  "frameEnd" = COALESCE(
    "frameEnd",
    CASE
      WHEN COALESCE("seconds", "duration") IS NOT NULL
        THEN 101 + GREATEST(ROUND(COALESCE("seconds", "duration") * 24)::INTEGER, 1) - 1
      ELSE NULL
    END
  )
WHERE
  "label" IS NULL
  OR "frameEnd" IS NULL
  OR "seconds" IS NULL;

-- Shot stage timeline columns.
ALTER TABLE "ShotStage" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
ALTER TABLE "ShotStage" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);
ALTER TABLE "ShotStage" ADD COLUMN IF NOT EXISTS "actualStartedAt" TIMESTAMP(3);
ALTER TABLE "ShotStage" ADD COLUMN IF NOT EXISTS "actualDoneAt" TIMESTAMP(3);
ALTER TABLE "ShotStage" ADD COLUMN IF NOT EXISTS "timeConsumedMin" INTEGER;

-- Asset metadata required by asset workspaces.
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "subCategory" "AssetSubCategory";
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "order" INTEGER NOT NULL DEFAULT 0;

UPDATE "Asset"
SET "subCategory" = CASE
  WHEN "subCategory" IS NOT NULL THEN "subCategory"
  WHEN "type" = 'CHARACTER' AND LOWER(COALESCE("name", '')) LIKE '%blendshape%' THEN 'CHARACTER_BLENDSHAPES'::"AssetSubCategory"
  WHEN "type" = 'CHARACTER' THEN 'CHARACTER'::"AssetSubCategory"
  WHEN "type" = 'PROP' THEN 'PROP'::"AssetSubCategory"
  ELSE NULL
END
WHERE "subCategory" IS NULL;

-- Asset stage timeline columns.
ALTER TABLE "AssetStage" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
ALTER TABLE "AssetStage" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);
ALTER TABLE "AssetStage" ADD COLUMN IF NOT EXISTS "actualStartedAt" TIMESTAMP(3);
ALTER TABLE "AssetStage" ADD COLUMN IF NOT EXISTS "actualDoneAt" TIMESTAMP(3);
ALTER TABLE "AssetStage" ADD COLUMN IF NOT EXISTS "timeConsumedMin" INTEGER;
