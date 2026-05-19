-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT DEFAULT '#10B981',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageDepartmentAssignment" (
    "id" TEXT NOT NULL,
    "projectStageId" INTEGER NOT NULL,
    "departmentId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageDepartmentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StageDepartmentAssignment_projectStageId_departmentId_key" ON "StageDepartmentAssignment"("projectStageId", "departmentId");

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "departmentId" TEXT,
ADD COLUMN "departmentName" TEXT;

-- Preserve legacy text department as fallback and seed department entities from it.
UPDATE "User"
SET "departmentName" = "department"
WHERE "department" IS NOT NULL
  AND "department" <> '';

INSERT INTO "Department" ("id", "name", "description", "color", "createdAt", "updatedAt")
SELECT DISTINCT
  'dept_' || md5("department") AS "id",
  "department" AS "name",
  NULL AS "description",
  '#10B981' AS "color",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User"
WHERE "department" IS NOT NULL
  AND "department" <> ''
ON CONFLICT ("name") DO NOTHING;

UPDATE "User"
SET "departmentId" = 'dept_' || md5("department")
WHERE "department" IS NOT NULL
  AND "department" <> '';

-- Backfill stage-department links from existing stage assignments.
INSERT INTO "StageDepartmentAssignment" ("id", "projectStageId", "departmentId", "assignedAt")
SELECT DISTINCT
  'sda_' || md5(ps."id"::text || ':' || u."departmentId") AS "id",
  ps."id" AS "projectStageId",
  u."departmentId" AS "departmentId",
  CURRENT_TIMESTAMP
FROM "ProjectStage" ps
JOIN "StageAssignment" sa ON sa."projectStageId" = ps."id"
JOIN "User" u ON u."id" = sa."userId"
WHERE u."departmentId" IS NOT NULL
ON CONFLICT ("projectStageId", "departmentId") DO NOTHING;

-- Drop legacy free-text field after relation backfill.
ALTER TABLE "User" DROP COLUMN "department";

-- AddForeignKey
ALTER TABLE "User"
ADD CONSTRAINT "User_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageDepartmentAssignment"
ADD CONSTRAINT "StageDepartmentAssignment_projectStageId_fkey"
FOREIGN KEY ("projectStageId") REFERENCES "ProjectStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageDepartmentAssignment"
ADD CONSTRAINT "StageDepartmentAssignment_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
