-- Add COMMENT notification type safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'NotificationType'
      AND e.enumlabel = 'COMMENT'
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'COMMENT';
  END IF;
END $$;

-- Create CommentType enum if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'CommentType'
  ) THEN
    CREATE TYPE "CommentType" AS ENUM ('NOTE', 'QUESTION', 'FEEDBACK', 'APPROVAL_NOTE');
  END IF;
END $$;

-- Stage-level threaded comments
CREATE TABLE IF NOT EXISTS "StageComment" (
  "id" TEXT NOT NULL,
  "projectStageId" INTEGER NOT NULL,
  "authorId" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "type" "CommentType" NOT NULL DEFAULT 'NOTE',
  "parentId" TEXT,
  "isEdited" BOOLEAN NOT NULL DEFAULT false,
  "isSystemGenerated" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StageComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StageComment_projectStageId_createdAt_idx" ON "StageComment"("projectStageId", "createdAt");
CREATE INDEX IF NOT EXISTS "StageComment_authorId_idx" ON "StageComment"("authorId");
CREATE INDEX IF NOT EXISTS "StageComment_parentId_idx" ON "StageComment"("parentId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'StageComment_projectStageId_fkey'
  ) THEN
    ALTER TABLE "StageComment"
      ADD CONSTRAINT "StageComment_projectStageId_fkey"
      FOREIGN KEY ("projectStageId") REFERENCES "ProjectStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'StageComment_authorId_fkey'
  ) THEN
    ALTER TABLE "StageComment"
      ADD CONSTRAINT "StageComment_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'StageComment_parentId_fkey'
  ) THEN
    ALTER TABLE "StageComment"
      ADD CONSTRAINT "StageComment_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "StageComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
