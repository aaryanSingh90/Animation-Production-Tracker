CREATE TABLE "AudioTask" (
  "id" TEXT NOT NULL,
  "projectId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "assignedUserId" INTEGER,
  "status" "PipelineStatus" NOT NULL DEFAULT 'YTS',
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "notes" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AudioTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AudioTask_projectId_order_idx" ON "AudioTask"("projectId", "order");
CREATE INDEX "AudioTask_assignedUserId_idx" ON "AudioTask"("assignedUserId");
CREATE INDEX "AudioTask_projectId_status_idx" ON "AudioTask"("projectId", "status");

ALTER TABLE "AudioTask"
  ADD CONSTRAINT "AudioTask_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AudioTask"
  ADD CONSTRAINT "AudioTask_assignedUserId_fkey"
  FOREIGN KEY ("assignedUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
