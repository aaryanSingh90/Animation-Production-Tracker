-- Additive migration for project/shot/asset tracking architecture
-- Safe for existing production data and compatible with existing routes.

-- 1) Enums (create only if missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TrackingMode') THEN
    CREATE TYPE "TrackingMode" AS ENUM ('PROJECT', 'SHOT', 'ASSET');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssetType') THEN
    CREATE TYPE "AssetType" AS ENUM ('CHARACTER', 'PROP', 'ENVIRONMENT');
  END IF;
END $$;

-- StageStatus needs REVISION_REQUIRED for modern approval flow.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'StageStatus'
      AND e.enumlabel = 'REVISION_REQUIRED'
  ) THEN
    ALTER TYPE "StageStatus" ADD VALUE 'REVISION_REQUIRED';
  END IF;
END $$;

-- 2) Project metadata for hybrid/dynamic tracking
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "client" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "totalShots" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "activeStageCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "lightingMode" "TrackingMode" NOT NULL DEFAULT 'PROJECT';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "renderingMode" "TrackingMode" NOT NULL DEFAULT 'PROJECT';

-- 3) Stage definitions catalog (no PostgreSQL enum dependency for stage names)
CREATE TABLE IF NOT EXISTS "StageDefinition" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "trackingMode" "TrackingMode" NOT NULL,
  "isHybrid" BOOLEAN NOT NULL DEFAULT false,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
  "order" INTEGER NOT NULL,
  "color" TEXT,
  "icon" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StageDefinition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StageDefinition_code_key" ON "StageDefinition"("code");
CREATE INDEX IF NOT EXISTS "StageDefinition_trackingMode_order_idx" ON "StageDefinition"("trackingMode", "order");

-- Seed core stage definitions (idempotent)
INSERT INTO "StageDefinition" (
  "id", "name", "code", "trackingMode", "isHybrid", "requiresApproval", "order", "color", "icon", "isActive", "createdAt", "updatedAt"
)
VALUES
  ('stage_def_audio', 'Audio', 'AUDIO', 'PROJECT', false, true, 1, '#6366F1', 'music', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('stage_def_animatics', 'Animatics', 'ANIMATICS', 'SHOT', false, true, 2, '#8B5CF6', 'clapperboard', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('stage_def_char_model', 'Character Modelling', 'CHARACTER_MODELLING', 'ASSET', false, true, 3, '#EC4899', 'box', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('stage_def_blendshapes', 'Blendshapes', 'BLENDSHAPES', 'ASSET', false, true, 4, '#D946EF', 'sparkles', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('stage_def_bg_model', 'BG Modelling', 'BG_MODELLING', 'ASSET', false, true, 5, '#10B981', 'mountain', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('stage_def_rigging', 'Rigging', 'RIGGING', 'ASSET', false, true, 6, '#F59E0B', 'wrench', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('stage_def_texturing', 'Texturing', 'TEXTURING', 'SHOT', false, true, 7, '#EF4444', 'paintbrush', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('stage_def_animation', 'Animation', 'ANIMATION', 'SHOT', false, true, 8, '#3B82F6', 'film', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('stage_def_lighting', 'Lighting', 'LIGHTING', 'PROJECT', true, true, 9, '#F97316', 'sun', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('stage_def_rendering', 'Rendering', 'RENDERING', 'PROJECT', true, true, 10, '#14B8A6', 'monitor', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('stage_def_compositing', 'Compositing', 'COMPOSITING', 'PROJECT', false, true, 11, '#84CC16', 'layers', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('stage_def_editing', 'Editing', 'EDITING', 'PROJECT', false, true, 12, '#06B6D4', 'scissors', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "trackingMode" = EXCLUDED."trackingMode",
  "isHybrid" = EXCLUDED."isHybrid",
  "requiresApproval" = EXCLUDED."requiresApproval",
  "order" = EXCLUDED."order",
  "color" = EXCLUDED."color",
  "icon" = EXCLUDED."icon",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

-- 4) Extend ProjectStage for dynamic tracking linkage
ALTER TABLE "ProjectStage" ADD COLUMN IF NOT EXISTS "trackingMode" "TrackingMode" NOT NULL DEFAULT 'PROJECT';
ALTER TABLE "ProjectStage" ADD COLUMN IF NOT EXISTS "stageDefinitionId" TEXT;

CREATE INDEX IF NOT EXISTS "ProjectStage_stageDefinitionId_idx" ON "ProjectStage"("stageDefinitionId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'ProjectStage_stageDefinitionId_fkey'
      AND table_name = 'ProjectStage'
  ) THEN
    ALTER TABLE "ProjectStage"
      ADD CONSTRAINT "ProjectStage_stageDefinitionId_fkey"
      FOREIGN KEY ("stageDefinitionId") REFERENCES "StageDefinition"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill definition linkage for existing project stages.
UPDATE "ProjectStage" ps
SET "stageDefinitionId" = sd."id"
FROM "StageDefinition" sd
WHERE ps."stageDefinitionId" IS NULL
  AND sd."code" = CASE
    WHEN UPPER(ps."stageName") = 'RENDER' THEN 'RENDERING'
    WHEN UPPER(ps."stageName") = 'CHARACTER_MODELLING_BLENDSHAPES' THEN 'CHARACTER_MODELLING'
    ELSE UPPER(ps."stageName")
  END;

-- Backfill tracking mode on existing project stages from linked definition + project hybrid settings.
UPDATE "ProjectStage" ps
SET "trackingMode" = CASE
  WHEN sd."code" = 'LIGHTING' AND p."lightingMode" = 'SHOT' THEN 'SHOT'::"TrackingMode"
  WHEN sd."code" = 'RENDERING' AND p."renderingMode" = 'SHOT' THEN 'SHOT'::"TrackingMode"
  WHEN sd."trackingMode" = 'ASSET' THEN 'ASSET'::"TrackingMode"
  WHEN sd."trackingMode" = 'SHOT' THEN 'SHOT'::"TrackingMode"
  ELSE 'PROJECT'::"TrackingMode"
END
FROM "StageDefinition" sd
JOIN "Project" p ON p."id" = ps."projectId"
WHERE ps."stageDefinitionId" = sd."id";

-- Backfill active stage codes from active project stages where currently empty.
UPDATE "Project" p
SET "activeStageCodes" = src.codes
FROM (
  SELECT
    ps."projectId",
    COALESCE(
      ARRAY_AGG(DISTINCT COALESCE(sd."code", CASE WHEN UPPER(ps."stageName") = 'RENDER' THEN 'RENDERING' ELSE UPPER(ps."stageName") END)),
      ARRAY[]::TEXT[]
    ) AS codes
  FROM "ProjectStage" ps
  LEFT JOIN "StageDefinition" sd ON sd."id" = ps."stageDefinitionId"
  WHERE ps."isActive" = true
  GROUP BY ps."projectId"
) src
WHERE p."id" = src."projectId"
  AND (p."activeStageCodes" IS NULL OR array_length(p."activeStageCodes", 1) IS NULL OR array_length(p."activeStageCodes", 1) = 0);

-- 5) Shot entities
CREATE TABLE IF NOT EXISTS "Shot" (
  "id" TEXT NOT NULL,
  "projectId" INTEGER NOT NULL,
  "shotNumber" INTEGER NOT NULL,
  "name" TEXT,
  "description" TEXT,
  "duration" DOUBLE PRECISION,
  "order" INTEGER NOT NULL,
  "status" "StageStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Shot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Shot_projectId_shotNumber_key" ON "Shot"("projectId", "shotNumber");
CREATE INDEX IF NOT EXISTS "Shot_projectId_order_idx" ON "Shot"("projectId", "order");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Shot_projectId_fkey' AND table_name = 'Shot'
  ) THEN
    ALTER TABLE "Shot"
      ADD CONSTRAINT "Shot_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ShotStage" (
  "id" TEXT NOT NULL,
  "shotId" TEXT NOT NULL,
  "stageDefinitionId" TEXT NOT NULL,
  "assignedUserId" INTEGER,
  "status" "StageStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "deadline" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "notes" TEXT,
  "feedback" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShotStage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShotStage_shotId_stageDefinitionId_key" ON "ShotStage"("shotId", "stageDefinitionId");
CREATE INDEX IF NOT EXISTS "ShotStage_assignedUserId_idx" ON "ShotStage"("assignedUserId");
CREATE INDEX IF NOT EXISTS "ShotStage_stageDefinitionId_status_idx" ON "ShotStage"("stageDefinitionId", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ShotStage_shotId_fkey' AND table_name = 'ShotStage'
  ) THEN
    ALTER TABLE "ShotStage"
      ADD CONSTRAINT "ShotStage_shotId_fkey"
      FOREIGN KEY ("shotId") REFERENCES "Shot"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ShotStage_stageDefinitionId_fkey' AND table_name = 'ShotStage'
  ) THEN
    ALTER TABLE "ShotStage"
      ADD CONSTRAINT "ShotStage_stageDefinitionId_fkey"
      FOREIGN KEY ("stageDefinitionId") REFERENCES "StageDefinition"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ShotStage_assignedUserId_fkey' AND table_name = 'ShotStage'
  ) THEN
    ALTER TABLE "ShotStage"
      ADD CONSTRAINT "ShotStage_assignedUserId_fkey"
      FOREIGN KEY ("assignedUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 6) Asset entities
CREATE TABLE IF NOT EXISTS "Asset" (
  "id" TEXT NOT NULL,
  "projectId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "type" "AssetType" NOT NULL,
  "description" TEXT,
  "referenceImageUrl" TEXT,
  "status" "StageStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Asset_projectId_type_idx" ON "Asset"("projectId", "type");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Asset_projectId_fkey' AND table_name = 'Asset'
  ) THEN
    ALTER TABLE "Asset"
      ADD CONSTRAINT "Asset_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "AssetStage" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "stageDefinitionId" TEXT NOT NULL,
  "assignedUserId" INTEGER,
  "status" "StageStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "deadline" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "notes" TEXT,
  "feedback" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetStage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AssetStage_assetId_stageDefinitionId_key" ON "AssetStage"("assetId", "stageDefinitionId");
CREATE INDEX IF NOT EXISTS "AssetStage_assignedUserId_idx" ON "AssetStage"("assignedUserId");
CREATE INDEX IF NOT EXISTS "AssetStage_stageDefinitionId_status_idx" ON "AssetStage"("stageDefinitionId", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AssetStage_assetId_fkey' AND table_name = 'AssetStage'
  ) THEN
    ALTER TABLE "AssetStage"
      ADD CONSTRAINT "AssetStage_assetId_fkey"
      FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AssetStage_stageDefinitionId_fkey' AND table_name = 'AssetStage'
  ) THEN
    ALTER TABLE "AssetStage"
      ADD CONSTRAINT "AssetStage_stageDefinitionId_fkey"
      FOREIGN KEY ("stageDefinitionId") REFERENCES "StageDefinition"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AssetStage_assignedUserId_fkey' AND table_name = 'AssetStage'
  ) THEN
    ALTER TABLE "AssetStage"
      ADD CONSTRAINT "AssetStage_assignedUserId_fkey"
      FOREIGN KEY ("assignedUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 7) Threaded comments for shot/asset stage workflows
CREATE TABLE IF NOT EXISTS "ShotStageComment" (
  "id" TEXT NOT NULL,
  "shotStageId" TEXT NOT NULL,
  "authorId" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "type" "CommentType" NOT NULL DEFAULT 'NOTE',
  "parentId" TEXT,
  "isEdited" BOOLEAN NOT NULL DEFAULT false,
  "isInternal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShotStageComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ShotStageComment_shotStageId_createdAt_idx" ON "ShotStageComment"("shotStageId", "createdAt");
CREATE INDEX IF NOT EXISTS "ShotStageComment_authorId_idx" ON "ShotStageComment"("authorId");
ALTER TABLE "ShotStageComment" ADD COLUMN IF NOT EXISTS "type" "CommentType" NOT NULL DEFAULT 'NOTE';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ShotStageComment_shotStageId_fkey' AND table_name = 'ShotStageComment'
  ) THEN
    ALTER TABLE "ShotStageComment"
      ADD CONSTRAINT "ShotStageComment_shotStageId_fkey"
      FOREIGN KEY ("shotStageId") REFERENCES "ShotStage"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ShotStageComment_authorId_fkey' AND table_name = 'ShotStageComment'
  ) THEN
    ALTER TABLE "ShotStageComment"
      ADD CONSTRAINT "ShotStageComment_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ShotStageComment_parentId_fkey' AND table_name = 'ShotStageComment'
  ) THEN
    ALTER TABLE "ShotStageComment"
      ADD CONSTRAINT "ShotStageComment_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "ShotStageComment"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "AssetStageComment" (
  "id" TEXT NOT NULL,
  "assetStageId" TEXT NOT NULL,
  "authorId" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "type" "CommentType" NOT NULL DEFAULT 'NOTE',
  "parentId" TEXT,
  "isEdited" BOOLEAN NOT NULL DEFAULT false,
  "isInternal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetStageComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AssetStageComment_assetStageId_createdAt_idx" ON "AssetStageComment"("assetStageId", "createdAt");
CREATE INDEX IF NOT EXISTS "AssetStageComment_authorId_idx" ON "AssetStageComment"("authorId");
ALTER TABLE "AssetStageComment" ADD COLUMN IF NOT EXISTS "type" "CommentType" NOT NULL DEFAULT 'NOTE';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AssetStageComment_assetStageId_fkey' AND table_name = 'AssetStageComment'
  ) THEN
    ALTER TABLE "AssetStageComment"
      ADD CONSTRAINT "AssetStageComment_assetStageId_fkey"
      FOREIGN KEY ("assetStageId") REFERENCES "AssetStage"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AssetStageComment_authorId_fkey' AND table_name = 'AssetStageComment'
  ) THEN
    ALTER TABLE "AssetStageComment"
      ADD CONSTRAINT "AssetStageComment_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AssetStageComment_parentId_fkey' AND table_name = 'AssetStageComment'
  ) THEN
    ALTER TABLE "AssetStageComment"
      ADD CONSTRAINT "AssetStageComment_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "AssetStageComment"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 8) Keep totalShots aligned with existing shot rows where present.
UPDATE "Project" p
SET "totalShots" = src.cnt
FROM (
  SELECT "projectId", COUNT(*)::INT AS cnt
  FROM "Shot"
  GROUP BY "projectId"
) src
WHERE p."id" = src."projectId"
  AND src.cnt > p."totalShots";
