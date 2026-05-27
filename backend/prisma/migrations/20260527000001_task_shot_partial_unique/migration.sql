-- BUG-22: Partial unique index on (projectId, subStageId, shotNumber).
-- A standard @@unique in Prisma would reject multiple rows where shotNumber IS
-- NULL (non-shot tasks), so this must be a raw SQL partial index instead.
-- The WHERE clause ensures only non-null shotNumbers are compared, allowing
-- unlimited asset/character tasks (shotNumber = NULL) to coexist while still
-- preventing duplicate shot numbers within a stage.

CREATE UNIQUE INDEX IF NOT EXISTS "Task_projectId_subStageId_shotNumber_unique"
  ON "Task" ("projectId", "subStageId", "shotNumber")
  WHERE "shotNumber" IS NOT NULL;
