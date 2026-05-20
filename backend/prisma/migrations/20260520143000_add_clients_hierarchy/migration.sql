-- Add Client hierarchy model and nullable Project.clientId (production-safe/additive)

CREATE TABLE IF NOT EXISTS "Client" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "companyName" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "clientId" INTEGER;

CREATE INDEX IF NOT EXISTS "Project_clientId_idx" ON "Project"("clientId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'Project_clientId_fkey'
      AND table_name = 'Project'
  ) THEN
    ALTER TABLE "Project"
      ADD CONSTRAINT "Project_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill client rows from existing Project.client text values.
INSERT INTO "Client" ("name", "createdAt", "updatedAt")
SELECT legacy.client_name, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT TRIM("client") AS client_name
  FROM "Project"
  WHERE "client" IS NOT NULL AND LENGTH(TRIM("client")) > 0
) AS legacy
WHERE NOT EXISTS (
  SELECT 1
  FROM "Client" c
  WHERE LOWER(c."name") = LOWER(legacy.client_name)
);

-- Backfill Project.clientId from matching Client.name (case-insensitive)
UPDATE "Project" p
SET "clientId" = c."id"
FROM "Client" c
WHERE p."clientId" IS NULL
  AND p."client" IS NOT NULL
  AND LENGTH(TRIM(p."client")) > 0
  AND LOWER(TRIM(p."client")) = LOWER(c."name");
