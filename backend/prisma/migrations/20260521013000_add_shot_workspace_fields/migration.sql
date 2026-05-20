ALTER TABLE "Shot"
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "audioWorkflowStatus" TEXT,
  ADD COLUMN "finalOutputName" TEXT,
  ADD COLUMN "finalOutputVersion" TEXT,
  ADD COLUMN "finalOutputApprovalStatus" "PipelineStatus",
  ADD COLUMN "finalOutputDeliveryDate" TIMESTAMP(3),
  ADD COLUMN "finalOutputClientReview" TEXT,
  ADD COLUMN "finalOutputNotes" TEXT;

ALTER TABLE "ShotStage"
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "endedAt" TIMESTAMP(3),
  ADD COLUMN "durationMinutes" INTEGER,
  ADD COLUMN "isTimerRunning" BOOLEAN NOT NULL DEFAULT false;

UPDATE "ShotStage"
SET "startedAt" = "actualStartedAt"
WHERE "startedAt" IS NULL
  AND "actualStartedAt" IS NOT NULL;

UPDATE "ShotStage"
SET "endedAt" = "actualDoneAt"
WHERE "endedAt" IS NULL
  AND "actualDoneAt" IS NOT NULL;

UPDATE "ShotStage"
SET "durationMinutes" = "timeConsumedMin"
WHERE "durationMinutes" IS NULL
  AND "timeConsumedMin" IS NOT NULL;

UPDATE "ShotStage"
SET "isTimerRunning" = true
WHERE "startedAt" IS NOT NULL
  AND "endedAt" IS NULL;

UPDATE "Shot"
SET "finalOutputName" = "finalOutput"
WHERE "finalOutputName" IS NULL
  AND "finalOutput" IS NOT NULL;

UPDATE "Shot"
SET "audioWorkflowStatus" = "audioStatus"::TEXT
WHERE "audioWorkflowStatus" IS NULL
  AND "audioStatus" IS NOT NULL;
