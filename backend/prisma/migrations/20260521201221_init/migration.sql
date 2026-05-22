-- CreateEnum
CREATE TYPE "EmployeeRole" AS ENUM ('MANAGER', 'LEAD', 'ARTIST');

-- CreateEnum
CREATE TYPE "EmployeeDepartment" AS ENUM ('Animation', 'Rigging', 'Lighting', 'FX', 'Compositing', 'Modelling', 'Texturing', 'Audio', 'Editing');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('YET_TO_START', 'IN_PROGRESS', 'LEAD_APPROVAL', 'LEAD_RETAKE', 'DONE', 'FINAL_APPROVAL');

-- CreateEnum
CREATE TYPE "AudioStatus" AS ENUM ('YET_TO_START', 'IN_PROGRESS', 'RECEIVED', 'FINAL_APPROVAL', 'RETAKE', 'DONE_INHOUSE', 'WIP_INHOUSE', 'APPROVED_INHOUSE');

-- CreateEnum
CREATE TYPE "CommentType" AS ENUM ('note', 'retake', 'approval');

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "EmployeeRole" NOT NULL,
    "department" "EmployeeDepartment" NOT NULL,
    "specialization" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "avatarColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "contactEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "frameRate" INTEGER NOT NULL DEFAULT 24,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "subStageId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL DEFAULT '',
    "shotNumber" TEXT,
    "frameRange" TEXT,
    "seconds" DOUBLE PRECISION,
    "status" "TaskStatus" NOT NULL DEFAULT 'YET_TO_START',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "timeConsumed" DOUBLE PRECISION,
    "audioStatus" "AudioStatus",
    "finalOutput" TEXT,
    "notes" TEXT,
    "thumbnail" TEXT,
    "retakeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "assignedArtistId" TEXT,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusChange" (
    "id" TEXT NOT NULL,
    "from" "TaskStatus" NOT NULL,
    "to" "TaskStatus" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT NOT NULL,
    "changedByUserId" TEXT,

    CONSTRAINT "StatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewComment" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "CommentType" NOT NULL DEFAULT 'note',
    "authorName" TEXT NOT NULL,
    "avatarColor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT,

    CONSTRAINT "ReviewComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE INDEX "Employee_email_idx" ON "Employee"("email");

-- CreateIndex
CREATE INDEX "Employee_department_idx" ON "Employee"("department");

-- CreateIndex
CREATE INDEX "Employee_active_idx" ON "Employee"("active");

-- CreateIndex
CREATE INDEX "Client_name_idx" ON "Client"("name");

-- CreateIndex
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- CreateIndex
CREATE INDEX "Task_subStageId_idx" ON "Task"("subStageId");

-- CreateIndex
CREATE INDEX "Task_assignedArtistId_idx" ON "Task"("assignedArtistId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_shotNumber_idx" ON "Task"("shotNumber");

-- CreateIndex
CREATE INDEX "StatusChange_taskId_idx" ON "StatusChange"("taskId");

-- CreateIndex
CREATE INDEX "StatusChange_changedAt_idx" ON "StatusChange"("changedAt");

-- CreateIndex
CREATE INDEX "ReviewComment_taskId_idx" ON "ReviewComment"("taskId");

-- CreateIndex
CREATE INDEX "ReviewComment_createdAt_idx" ON "ReviewComment"("createdAt");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedArtistId_fkey" FOREIGN KEY ("assignedArtistId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusChange" ADD CONSTRAINT "StatusChange_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusChange" ADD CONSTRAINT "StatusChange_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
