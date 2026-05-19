-- Employment type support
CREATE TYPE "EmploymentType" AS ENUM ('INHOUSE', 'FREELANCE');
ALTER TABLE "User" ADD COLUMN "employmentType" "EmploymentType" NOT NULL DEFAULT 'INHOUSE';

-- Multi-artist and department support
ALTER TABLE "ProjectStage" ADD COLUMN "departmentName" TEXT;

CREATE TABLE "StageAssignment" (
    "id" TEXT NOT NULL,
    "projectStageId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StageAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StageAssignment_projectStageId_userId_key" ON "StageAssignment"("projectStageId", "userId");

ALTER TABLE "StageAssignment" ADD CONSTRAINT "StageAssignment_projectStageId_fkey"
  FOREIGN KEY ("projectStageId") REFERENCES "ProjectStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StageAssignment" ADD CONSTRAINT "StageAssignment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill stage assignments from legacy lead assignment
INSERT INTO "StageAssignment" ("id", "projectStageId", "userId", "createdAt")
SELECT CONCAT('legacy_', ps."id", '_', ps."assignedUserId"), ps."id", ps."assignedUserId", CURRENT_TIMESTAMP
FROM "ProjectStage" ps
WHERE ps."assignedUserId" IS NOT NULL
ON CONFLICT ("projectStageId", "userId") DO NOTHING;

-- Merge BLENDSHAPES into CHARACTER_MODELLING before enum migration
WITH merge_pairs AS (
  SELECT b."id" AS blend_id, m."id" AS model_id
  FROM "ProjectStage" b
  JOIN "ProjectStage" m
    ON m."projectId" = b."projectId"
   AND m."stageName" = 'CHARACTER_MODELLING'
  WHERE b."stageName" = 'BLENDSHAPES'
)
UPDATE "IssueLog" i
SET "projectStageId" = p.model_id
FROM merge_pairs p
WHERE i."projectStageId" = p.blend_id;

WITH merge_pairs AS (
  SELECT b."id" AS blend_id, m."id" AS model_id
  FROM "ProjectStage" b
  JOIN "ProjectStage" m
    ON m."projectId" = b."projectId"
   AND m."stageName" = 'CHARACTER_MODELLING'
  WHERE b."stageName" = 'BLENDSHAPES'
)
UPDATE "Notification" n
SET "relatedStageId" = p.model_id
FROM merge_pairs p
WHERE n."relatedStageId" = p.blend_id;

WITH merge_pairs AS (
  SELECT b."id" AS blend_id, m."id" AS model_id
  FROM "ProjectStage" b
  JOIN "ProjectStage" m
    ON m."projectId" = b."projectId"
   AND m."stageName" = 'CHARACTER_MODELLING'
  WHERE b."stageName" = 'BLENDSHAPES'
)
UPDATE "ActivityLog" a
SET "stageId" = p.model_id
FROM merge_pairs p
WHERE a."stageId" = p.blend_id;

DELETE FROM "ProjectStage" b
USING "ProjectStage" m
WHERE b."projectId" = m."projectId"
  AND b."stageName" = 'BLENDSHAPES'
  AND m."stageName" = 'CHARACTER_MODELLING';

UPDATE "ProjectStage"
SET "stageName" = 'CHARACTER_MODELLING'
WHERE "stageName" = 'BLENDSHAPES';

-- StageName enum migration with merged stage name
DROP INDEX IF EXISTS "ProjectStage_projectId_stageName_key";

ALTER TABLE "ProjectStage"
ALTER COLUMN "stageName" TYPE TEXT;

UPDATE "ProjectStage"
SET "stageName" = 'CHARACTER_MODELLING_BLENDSHAPES'
WHERE "stageName" = 'CHARACTER_MODELLING';

ALTER TYPE "StageName" RENAME TO "StageName_old";

CREATE TYPE "StageName" AS ENUM (
  'AUDIO',
  'ANIMATICS',
  'CHARACTER_MODELLING_BLENDSHAPES',
  'BG_MODELLING',
  'RIGGING',
  'TEXTURING',
  'ANIMATION',
  'LIGHTING',
  'RENDER',
  'COMPOSITING',
  'EDITING'
);

ALTER TABLE "ProjectStage"
ALTER COLUMN "stageName" TYPE "StageName"
USING ("stageName"::"StageName");

DROP TYPE "StageName_old";

CREATE UNIQUE INDEX "ProjectStage_projectId_stageName_key" ON "ProjectStage"("projectId", "stageName");

-- Backfill department names
UPDATE "ProjectStage"
SET "departmentName" = CASE "stageName"
  WHEN 'AUDIO' THEN 'Audio Department'
  WHEN 'ANIMATICS' THEN 'Animatics Department'
  WHEN 'CHARACTER_MODELLING_BLENDSHAPES' THEN 'Character Modelling & Blendshapes'
  WHEN 'BG_MODELLING' THEN 'BG Modelling Department'
  WHEN 'RIGGING' THEN 'Rigging Department'
  WHEN 'TEXTURING' THEN 'Texturing Department'
  WHEN 'ANIMATION' THEN 'Animation Department'
  WHEN 'LIGHTING' THEN 'Lighting Department'
  WHEN 'RENDER' THEN 'Render Department'
  WHEN 'COMPOSITING' THEN 'Compositing Department'
  WHEN 'EDITING' THEN 'Editing Department'
  ELSE "departmentName"
END
WHERE "departmentName" IS NULL;
