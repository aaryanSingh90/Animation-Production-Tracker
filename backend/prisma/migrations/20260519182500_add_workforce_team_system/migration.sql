-- Add workforce/team management models (additive, production-safe)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AvailabilityStatus') THEN
    CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'BUSY', 'ON_LEAVE', 'OVERLOADED');
  END IF;
END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "teamId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "availabilityStatus" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "skills" TEXT[];

UPDATE "User"
SET "skills" = ARRAY[]::TEXT[]
WHERE "skills" IS NULL;

ALTER TABLE "User"
  ALTER COLUMN "skills" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "skills" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "Team" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT DEFAULT '#3B82F6',
  "departmentId" TEXT,
  "leadId" INTEGER,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Team_name_key" ON "Team"("name");
CREATE INDEX IF NOT EXISTS "Team_departmentId_idx" ON "Team"("departmentId");
CREATE INDEX IF NOT EXISTS "Team_leadId_idx" ON "Team"("leadId");

CREATE TABLE IF NOT EXISTS "TeamProject" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "projectId" INTEGER NOT NULL,
  "assignedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamProject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeamProject_teamId_projectId_key" ON "TeamProject"("teamId", "projectId");
CREATE INDEX IF NOT EXISTS "TeamProject_projectId_idx" ON "TeamProject"("projectId");
CREATE INDEX IF NOT EXISTS "User_teamId_idx" ON "User"("teamId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'User_teamId_fkey'
      AND table_name = 'User'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "Team"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'Team_departmentId_fkey'
      AND table_name = 'Team'
  ) THEN
    ALTER TABLE "Team"
      ADD CONSTRAINT "Team_departmentId_fkey"
      FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'Team_leadId_fkey'
      AND table_name = 'Team'
  ) THEN
    ALTER TABLE "Team"
      ADD CONSTRAINT "Team_leadId_fkey"
      FOREIGN KEY ("leadId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'TeamProject_teamId_fkey'
      AND table_name = 'TeamProject'
  ) THEN
    ALTER TABLE "TeamProject"
      ADD CONSTRAINT "TeamProject_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "Team"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'TeamProject_projectId_fkey'
      AND table_name = 'TeamProject'
  ) THEN
    ALTER TABLE "TeamProject"
      ADD CONSTRAINT "TeamProject_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'TeamProject_assignedById_fkey'
      AND table_name = 'TeamProject'
  ) THEN
    ALTER TABLE "TeamProject"
      ADD CONSTRAINT "TeamProject_assignedById_fkey"
      FOREIGN KEY ("assignedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
