-- CreateEnum
CREATE TYPE "Role" AS ENUM ('BOSS', 'PRODUCTION_MANAGER', 'COORDINATOR', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "StageName" AS ENUM ('AUDIO', 'ANIMATICS', 'CHARACTER_MODELLING', 'BLENDSHAPES', 'BG_MODELLING', 'RIGGING', 'TEXTURING', 'ANIMATION', 'LIGHTING', 'RENDER', 'COMPOSITING', 'EDITING');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ISSUE', 'EXTENDED');

-- CreateEnum
CREATE TYPE "CharacterStageName" AS ENUM ('REFERENCE', 'MODELLING', 'BLENDSHAPES', 'TEXTURING', 'RIGGING');

-- CreateEnum
CREATE TYPE "IssueType" AS ENUM ('TECHNICAL', 'SOFTWARE_CRASH', 'ASSET_MISSING', 'HARDWARE_FAILURE', 'ARTIST_UNAVAILABLE', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('APPROVAL_NEEDED', 'APPROVED', 'REJECTED', 'DEADLINE_WARNING', 'DEADLINE_MISSED', 'ISSUE_LOGGED', 'ASSIGNED');

-- CreateEnum
CREATE TYPE "OverallStatus" AS ENUM ('ON_TRACK', 'DELAYED', 'COMPLETED', 'HAS_ISSUES');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "department" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "audioReceivedDate" TIMESTAMP(3) NOT NULL,
    "overallStatus" "OverallStatus" NOT NULL DEFAULT 'ON_TRACK',
    "progressPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectStage" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "stageName" "StageName" NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "deadline" TIMESTAMP(3),
    "assignedUserId" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "notes" TEXT,
    "feedback" TEXT,
    "isDeadlineMissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterStage" (
    "id" SERIAL NOT NULL,
    "characterId" INTEGER NOT NULL,
    "stageName" "CharacterStageName" NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "deadline" TIMESTAMP(3),
    "assignedUserId" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCharacter" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "characterId" INTEGER NOT NULL,

    CONSTRAINT "ProjectCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueLog" (
    "id" SERIAL NOT NULL,
    "projectStageId" INTEGER NOT NULL,
    "issueType" "IssueType" NOT NULL,
    "description" TEXT NOT NULL,
    "originalDeadline" TIMESTAMP(3),
    "newDeadline" TIMESTAMP(3),
    "extensionReason" TEXT,
    "loggedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "relatedProjectId" INTEGER,
    "relatedStageId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "stageId" INTEGER,
    "actorId" INTEGER,
    "eventType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Project_name_key" ON "Project"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectStage_projectId_stageName_key" ON "ProjectStage"("projectId", "stageName");

-- CreateIndex
CREATE UNIQUE INDEX "Character_name_key" ON "Character"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterStage_characterId_stageName_key" ON "CharacterStage"("characterId", "stageName");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCharacter_projectId_characterId_key" ON "ProjectCharacter"("projectId", "characterId");

-- AddForeignKey
ALTER TABLE "ProjectStage" ADD CONSTRAINT "ProjectStage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStage" ADD CONSTRAINT "ProjectStage_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterStage" ADD CONSTRAINT "CharacterStage_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterStage" ADD CONSTRAINT "CharacterStage_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCharacter" ADD CONSTRAINT "ProjectCharacter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCharacter" ADD CONSTRAINT "ProjectCharacter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueLog" ADD CONSTRAINT "IssueLog_projectStageId_fkey" FOREIGN KEY ("projectStageId") REFERENCES "ProjectStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueLog" ADD CONSTRAINT "IssueLog_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_relatedProjectId_fkey" FOREIGN KEY ("relatedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_relatedStageId_fkey" FOREIGN KEY ("relatedStageId") REFERENCES "ProjectStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProjectStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
