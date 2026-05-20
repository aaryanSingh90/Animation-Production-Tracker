CREATE TYPE "AssignmentRoleType" AS ENUM ('LEAD', 'SUPPORT');

CREATE TABLE "TaskAssignment" (
  "id" TEXT NOT NULL,
  "projectId" INTEGER NOT NULL,
  "projectStageId" INTEGER,
  "shotStageId" TEXT,
  "assetStageId" TEXT,
  "audioTaskId" TEXT,
  "departmentId" TEXT,
  "employeeId" INTEGER NOT NULL,
  "roleType" "AssignmentRoleType" NOT NULL DEFAULT 'LEAD',
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedById" INTEGER,
  CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskAssignment_projectStageId_employeeId_key" ON "TaskAssignment"("projectStageId", "employeeId");
CREATE UNIQUE INDEX "TaskAssignment_shotStageId_employeeId_key" ON "TaskAssignment"("shotStageId", "employeeId");
CREATE UNIQUE INDEX "TaskAssignment_assetStageId_employeeId_key" ON "TaskAssignment"("assetStageId", "employeeId");
CREATE UNIQUE INDEX "TaskAssignment_audioTaskId_employeeId_key" ON "TaskAssignment"("audioTaskId", "employeeId");
CREATE INDEX "TaskAssignment_projectId_idx" ON "TaskAssignment"("projectId");
CREATE INDEX "TaskAssignment_departmentId_idx" ON "TaskAssignment"("departmentId");
CREATE INDEX "TaskAssignment_employeeId_idx" ON "TaskAssignment"("employeeId");
CREATE INDEX "TaskAssignment_assignedById_idx" ON "TaskAssignment"("assignedById");

ALTER TABLE "TaskAssignment"
  ADD CONSTRAINT "TaskAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment"
  ADD CONSTRAINT "TaskAssignment_projectStageId_fkey" FOREIGN KEY ("projectStageId") REFERENCES "ProjectStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment"
  ADD CONSTRAINT "TaskAssignment_shotStageId_fkey" FOREIGN KEY ("shotStageId") REFERENCES "ShotStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment"
  ADD CONSTRAINT "TaskAssignment_assetStageId_fkey" FOREIGN KEY ("assetStageId") REFERENCES "AssetStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment"
  ADD CONSTRAINT "TaskAssignment_audioTaskId_fkey" FOREIGN KEY ("audioTaskId") REFERENCES "AudioTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment"
  ADD CONSTRAINT "TaskAssignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment"
  ADD CONSTRAINT "TaskAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment"
  ADD CONSTRAINT "TaskAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "TaskAssignment" ("id", "projectId", "projectStageId", "departmentId", "employeeId", "roleType", "assignedAt", "assignedById")
SELECT CONCAT('legacy-project-', ps."id"::text, '-', ps."assignedUserId"::text), ps."projectId", ps."id", u."departmentId", ps."assignedUserId", 'LEAD', ps."updatedAt", NULL
FROM "ProjectStage" ps
LEFT JOIN "User" u ON u."id" = ps."assignedUserId"
WHERE ps."assignedUserId" IS NOT NULL
ON CONFLICT ("projectStageId", "employeeId") DO NOTHING;

INSERT INTO "TaskAssignment" ("id", "projectId", "shotStageId", "departmentId", "employeeId", "roleType", "assignedAt", "assignedById")
SELECT CONCAT('legacy-shot-', ss."id", '-', ss."assignedUserId"::text), s."projectId", ss."id", u."departmentId", ss."assignedUserId", 'LEAD', ss."updatedAt", NULL
FROM "ShotStage" ss
JOIN "Shot" s ON s."id" = ss."shotId"
LEFT JOIN "User" u ON u."id" = ss."assignedUserId"
WHERE ss."assignedUserId" IS NOT NULL
ON CONFLICT ("shotStageId", "employeeId") DO NOTHING;

INSERT INTO "TaskAssignment" ("id", "projectId", "assetStageId", "departmentId", "employeeId", "roleType", "assignedAt", "assignedById")
SELECT CONCAT('legacy-asset-', ast."id", '-', ast."assignedUserId"::text), a."projectId", ast."id", u."departmentId", ast."assignedUserId", 'LEAD', ast."updatedAt", NULL
FROM "AssetStage" ast
JOIN "Asset" a ON a."id" = ast."assetId"
LEFT JOIN "User" u ON u."id" = ast."assignedUserId"
WHERE ast."assignedUserId" IS NOT NULL
ON CONFLICT ("assetStageId", "employeeId") DO NOTHING;

INSERT INTO "TaskAssignment" ("id", "projectId", "audioTaskId", "departmentId", "employeeId", "roleType", "assignedAt", "assignedById")
SELECT CONCAT('legacy-audio-', at."id", '-', at."assignedUserId"::text), at."projectId", at."id", u."departmentId", at."assignedUserId", 'LEAD', at."updatedAt", NULL
FROM "AudioTask" at
LEFT JOIN "User" u ON u."id" = at."assignedUserId"
WHERE at."assignedUserId" IS NOT NULL
ON CONFLICT ("audioTaskId", "employeeId") DO NOTHING;
