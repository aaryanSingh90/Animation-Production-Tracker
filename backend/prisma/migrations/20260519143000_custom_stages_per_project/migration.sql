-- Additive enum updates for dynamic/custom stages
ALTER TYPE "StageName" ADD VALUE IF NOT EXISTS 'CHARACTER_MODELLING';
ALTER TYPE "StageName" ADD VALUE IF NOT EXISTS 'BLENDSHAPES';
ALTER TYPE "StageName" ADD VALUE IF NOT EXISTS 'CUSTOM';

-- Stage template catalog
CREATE TABLE IF NOT EXISTS "StageTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legacyStageName" "StageName",
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StageTemplate_name_key" ON "StageTemplate"("name");

-- Extend ProjectStage with dynamic stage metadata
ALTER TABLE "ProjectStage"
  ADD COLUMN IF NOT EXISTS "stageTemplateId" TEXT,
  ADD COLUMN IF NOT EXISTS "customName" TEXT,
  ADD COLUMN IF NOT EXISTS "order" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Create default stage templates (idempotent)
INSERT INTO "StageTemplate" ("id", "name", "legacyStageName", "color", "createdAt")
VALUES
  ('template_audio', 'Audio', 'AUDIO', '#6366F1', CURRENT_TIMESTAMP),
  ('template_animatics', 'Animatics', 'ANIMATICS', '#8B5CF6', CURRENT_TIMESTAMP),
  ('template_char_model', 'Character Modelling', 'CHARACTER_MODELLING', '#EC4899', CURRENT_TIMESTAMP),
  ('template_blendshapes', 'Blendshapes', 'BLENDSHAPES', '#D946EF', CURRENT_TIMESTAMP),
  ('template_char_model_blend', 'Character Modelling & Blendshapes', 'CHARACTER_MODELLING_BLENDSHAPES', '#EC4899', CURRENT_TIMESTAMP),
  ('template_bg_model', 'BG Modelling', 'BG_MODELLING', '#10B981', CURRENT_TIMESTAMP),
  ('template_rigging', 'Rigging', 'RIGGING', '#F59E0B', CURRENT_TIMESTAMP),
  ('template_texturing', 'Texturing', 'TEXTURING', '#EF4444', CURRENT_TIMESTAMP),
  ('template_animation', 'Animation', 'ANIMATION', '#3B82F6', CURRENT_TIMESTAMP),
  ('template_lighting', 'Lighting', 'LIGHTING', '#F97316', CURRENT_TIMESTAMP),
  ('template_rendering', 'Rendering', 'RENDER', '#14B8A6', CURRENT_TIMESTAMP),
  ('template_comping', 'Comping', 'COMPOSITING', '#84CC16', CURRENT_TIMESTAMP),
  ('template_editing', 'Editing', 'EDITING', '#06B6D4', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO UPDATE SET
  "legacyStageName" = EXCLUDED."legacyStageName",
  "color" = EXCLUDED."color";

-- Backfill stage template references for existing rows
UPDATE "ProjectStage" ps
SET "stageTemplateId" = st."id"
FROM "StageTemplate" st
WHERE ps."stageTemplateId" IS NULL
  AND st."legacyStageName" = ps."stageName";

-- Preserve deterministic stage order for existing data
UPDATE "ProjectStage"
SET "order" = CASE "stageName"
  WHEN 'AUDIO' THEN 1
  WHEN 'ANIMATICS' THEN 2
  WHEN 'CHARACTER_MODELLING' THEN 3
  WHEN 'BLENDSHAPES' THEN 4
  WHEN 'CHARACTER_MODELLING_BLENDSHAPES' THEN 5
  WHEN 'BG_MODELLING' THEN 6
  WHEN 'RIGGING' THEN 7
  WHEN 'TEXTURING' THEN 8
  WHEN 'ANIMATION' THEN 9
  WHEN 'LIGHTING' THEN 10
  WHEN 'RENDER' THEN 11
  WHEN 'COMPOSITING' THEN 12
  WHEN 'EDITING' THEN 13
  ELSE "order"
END
WHERE "order" = 0;

-- Replace unique constraint to allow custom-stage variants safely
DROP INDEX IF EXISTS "ProjectStage_projectId_stageName_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectStage_projectId_stageName_customName_key" ON "ProjectStage"("projectId", "stageName", "customName");
CREATE INDEX IF NOT EXISTS "ProjectStage_projectId_order_idx" ON "ProjectStage"("projectId", "order");
CREATE INDEX IF NOT EXISTS "ProjectStage_projectId_isActive_idx" ON "ProjectStage"("projectId", "isActive");

-- Link project stages to templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'ProjectStage_stageTemplateId_fkey'
  ) THEN
    ALTER TABLE "ProjectStage"
      ADD CONSTRAINT "ProjectStage_stageTemplateId_fkey"
      FOREIGN KEY ("stageTemplateId") REFERENCES "StageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
