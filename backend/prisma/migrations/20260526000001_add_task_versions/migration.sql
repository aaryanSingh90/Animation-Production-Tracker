CREATE TABLE "TaskVersion" (
  "id"             TEXT NOT NULL,
  "versionNum"     INTEGER NOT NULL,
  "videoUrl"       TEXT NOT NULL,
  "uploadedByName" TEXT NOT NULL,
  "uploadedById"   TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "taskId"         TEXT NOT NULL,

  CONSTRAINT "TaskVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskVersion_taskId_idx" ON "TaskVersion"("taskId");

ALTER TABLE "TaskVersion"
  ADD CONSTRAINT "TaskVersion_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
