-- BUG-22: Partial unique index on (projectId, subStageId, shotNumber).
-- A standard @@unique in Prisma would reject multiple rows where shotNumber IS
-- NULL (non-shot tasks), so this must be a raw SQL partial index instead.

-- Step 1: Deduplicate existing data.
-- For each (projectId, subStageId, shotNumber) group that has more than one row,
-- keep the earliest-created row unchanged and append "-dup-N" to the rest.
-- Nothing is deleted — shot numbers are just made unique so the index can be built.
WITH duplicates AS (
  SELECT
    id,
    "shotNumber",
    ROW_NUMBER() OVER (
      PARTITION BY "projectId", "subStageId", "shotNumber"
      ORDER BY "createdAt" ASC
    ) AS rn
  FROM "Task"
  WHERE "shotNumber" IS NOT NULL
)
UPDATE "Task"
SET    "shotNumber" = "Task"."shotNumber" || '-dup-' || (duplicates.rn - 1)
FROM   duplicates
WHERE  "Task".id = duplicates.id
  AND  duplicates.rn > 1;

-- Step 2: Now that no duplicates remain, create the partial unique index.
-- The WHERE clause lets multiple NULL shotNumbers coexist (asset/character tasks).
CREATE UNIQUE INDEX IF NOT EXISTS "Task_projectId_subStageId_shotNumber_unique"
  ON "Task" ("projectId", "subStageId", "shotNumber")
  WHERE "shotNumber" IS NOT NULL;
