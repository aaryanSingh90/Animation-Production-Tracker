ALTER TABLE "Asset"
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AssetStage"
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "endedAt" TIMESTAMP(3),
  ADD COLUMN "durationMinutes" INTEGER,
  ADD COLUMN "isTimerRunning" BOOLEAN NOT NULL DEFAULT false;

UPDATE "AssetStage"
SET "startedAt" = "actualStartedAt"
WHERE "startedAt" IS NULL
  AND "actualStartedAt" IS NOT NULL;

UPDATE "AssetStage"
SET "endedAt" = "actualDoneAt"
WHERE "endedAt" IS NULL
  AND "actualDoneAt" IS NOT NULL;

UPDATE "AssetStage"
SET "durationMinutes" = "timeConsumedMin"
WHERE "durationMinutes" IS NULL
  AND "timeConsumedMin" IS NOT NULL;

UPDATE "AssetStage"
SET "isTimerRunning" = true
WHERE "startedAt" IS NOT NULL
  AND "endedAt" IS NULL;

CREATE INDEX "Asset_projectId_subCategory_isArchived_idx" ON "Asset"("projectId", "subCategory", "isArchived");
