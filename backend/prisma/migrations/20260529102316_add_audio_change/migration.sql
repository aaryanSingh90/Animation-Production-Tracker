-- CreateTable
CREATE TABLE "AudioChange" (
    "id" TEXT NOT NULL,
    "from" "AudioStatus",
    "to" "AudioStatus",
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT NOT NULL,
    "changedByUserId" TEXT,

    CONSTRAINT "AudioChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AudioChange_taskId_idx" ON "AudioChange"("taskId");

-- CreateIndex
CREATE INDEX "AudioChange_changedAt_idx" ON "AudioChange"("changedAt");

-- AddForeignKey
ALTER TABLE "AudioChange" ADD CONSTRAINT "AudioChange_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioChange" ADD CONSTRAINT "AudioChange_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
