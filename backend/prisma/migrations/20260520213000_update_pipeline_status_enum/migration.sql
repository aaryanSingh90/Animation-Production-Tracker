ALTER TYPE "StageStatus" RENAME TO "StageStatus_old";

CREATE TYPE "PipelineStatus" AS ENUM ('YTS', 'IP', 'TEST', 'DONE', 'APPROVED', 'RTK', 'FINAL', 'LATE');

ALTER TABLE "ProjectStage"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "PipelineStatus" USING (
    CASE "status"::text
      WHEN 'NOT_STARTED' THEN 'YTS'::"PipelineStatus"
      WHEN 'IN_PROGRESS' THEN 'IP'::"PipelineStatus"
      WHEN 'SUBMITTED' THEN 'TEST'::"PipelineStatus"
      WHEN 'APPROVED' THEN 'APPROVED'::"PipelineStatus"
      WHEN 'REJECTED' THEN 'RTK'::"PipelineStatus"
      WHEN 'REVISION_REQUIRED' THEN 'RTK'::"PipelineStatus"
      WHEN 'ISSUE' THEN 'LATE'::"PipelineStatus"
      WHEN 'EXTENDED' THEN 'IP'::"PipelineStatus"
      ELSE 'YTS'::"PipelineStatus"
    END
  ),
  ALTER COLUMN "status" SET DEFAULT 'YTS';

ALTER TABLE "ProjectStage"
  ALTER COLUMN "audioStatus" TYPE "PipelineStatus" USING (
    CASE
      WHEN "audioStatus" IS NULL THEN NULL
      ELSE CASE "audioStatus"::text
        WHEN 'NOT_STARTED' THEN 'YTS'::"PipelineStatus"
        WHEN 'IN_PROGRESS' THEN 'IP'::"PipelineStatus"
        WHEN 'SUBMITTED' THEN 'TEST'::"PipelineStatus"
        WHEN 'APPROVED' THEN 'APPROVED'::"PipelineStatus"
        WHEN 'REJECTED' THEN 'RTK'::"PipelineStatus"
        WHEN 'REVISION_REQUIRED' THEN 'RTK'::"PipelineStatus"
        WHEN 'ISSUE' THEN 'LATE'::"PipelineStatus"
        WHEN 'EXTENDED' THEN 'IP'::"PipelineStatus"
        ELSE 'YTS'::"PipelineStatus"
      END
    END
  );

ALTER TABLE "CharacterStage"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "PipelineStatus" USING (
    CASE "status"::text
      WHEN 'NOT_STARTED' THEN 'YTS'::"PipelineStatus"
      WHEN 'IN_PROGRESS' THEN 'IP'::"PipelineStatus"
      WHEN 'SUBMITTED' THEN 'TEST'::"PipelineStatus"
      WHEN 'APPROVED' THEN 'APPROVED'::"PipelineStatus"
      WHEN 'REJECTED' THEN 'RTK'::"PipelineStatus"
      WHEN 'REVISION_REQUIRED' THEN 'RTK'::"PipelineStatus"
      WHEN 'ISSUE' THEN 'LATE'::"PipelineStatus"
      WHEN 'EXTENDED' THEN 'IP'::"PipelineStatus"
      ELSE 'YTS'::"PipelineStatus"
    END
  ),
  ALTER COLUMN "status" SET DEFAULT 'YTS';

ALTER TABLE "Shot"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "PipelineStatus" USING (
    CASE "status"::text
      WHEN 'NOT_STARTED' THEN 'YTS'::"PipelineStatus"
      WHEN 'IN_PROGRESS' THEN 'IP'::"PipelineStatus"
      WHEN 'SUBMITTED' THEN 'TEST'::"PipelineStatus"
      WHEN 'APPROVED' THEN 'APPROVED'::"PipelineStatus"
      WHEN 'REJECTED' THEN 'RTK'::"PipelineStatus"
      WHEN 'REVISION_REQUIRED' THEN 'RTK'::"PipelineStatus"
      WHEN 'ISSUE' THEN 'LATE'::"PipelineStatus"
      WHEN 'EXTENDED' THEN 'IP'::"PipelineStatus"
      ELSE 'YTS'::"PipelineStatus"
    END
  ),
  ALTER COLUMN "status" SET DEFAULT 'YTS';

ALTER TABLE "Shot"
  ALTER COLUMN "audioStatus" TYPE "PipelineStatus" USING (
    CASE
      WHEN "audioStatus" IS NULL THEN NULL
      ELSE CASE "audioStatus"::text
        WHEN 'NOT_STARTED' THEN 'YTS'::"PipelineStatus"
        WHEN 'IN_PROGRESS' THEN 'IP'::"PipelineStatus"
        WHEN 'SUBMITTED' THEN 'TEST'::"PipelineStatus"
        WHEN 'APPROVED' THEN 'APPROVED'::"PipelineStatus"
        WHEN 'REJECTED' THEN 'RTK'::"PipelineStatus"
        WHEN 'REVISION_REQUIRED' THEN 'RTK'::"PipelineStatus"
        WHEN 'ISSUE' THEN 'LATE'::"PipelineStatus"
        WHEN 'EXTENDED' THEN 'IP'::"PipelineStatus"
        ELSE 'YTS'::"PipelineStatus"
      END
    END
  );

ALTER TABLE "ShotStage"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "PipelineStatus" USING (
    CASE "status"::text
      WHEN 'NOT_STARTED' THEN 'YTS'::"PipelineStatus"
      WHEN 'IN_PROGRESS' THEN 'IP'::"PipelineStatus"
      WHEN 'SUBMITTED' THEN 'TEST'::"PipelineStatus"
      WHEN 'APPROVED' THEN 'APPROVED'::"PipelineStatus"
      WHEN 'REJECTED' THEN 'RTK'::"PipelineStatus"
      WHEN 'REVISION_REQUIRED' THEN 'RTK'::"PipelineStatus"
      WHEN 'ISSUE' THEN 'LATE'::"PipelineStatus"
      WHEN 'EXTENDED' THEN 'IP'::"PipelineStatus"
      ELSE 'YTS'::"PipelineStatus"
    END
  ),
  ALTER COLUMN "status" SET DEFAULT 'YTS';

ALTER TABLE "Asset"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "PipelineStatus" USING (
    CASE "status"::text
      WHEN 'NOT_STARTED' THEN 'YTS'::"PipelineStatus"
      WHEN 'IN_PROGRESS' THEN 'IP'::"PipelineStatus"
      WHEN 'SUBMITTED' THEN 'TEST'::"PipelineStatus"
      WHEN 'APPROVED' THEN 'APPROVED'::"PipelineStatus"
      WHEN 'REJECTED' THEN 'RTK'::"PipelineStatus"
      WHEN 'REVISION_REQUIRED' THEN 'RTK'::"PipelineStatus"
      WHEN 'ISSUE' THEN 'LATE'::"PipelineStatus"
      WHEN 'EXTENDED' THEN 'IP'::"PipelineStatus"
      ELSE 'YTS'::"PipelineStatus"
    END
  ),
  ALTER COLUMN "status" SET DEFAULT 'YTS';

ALTER TABLE "AssetStage"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "PipelineStatus" USING (
    CASE "status"::text
      WHEN 'NOT_STARTED' THEN 'YTS'::"PipelineStatus"
      WHEN 'IN_PROGRESS' THEN 'IP'::"PipelineStatus"
      WHEN 'SUBMITTED' THEN 'TEST'::"PipelineStatus"
      WHEN 'APPROVED' THEN 'APPROVED'::"PipelineStatus"
      WHEN 'REJECTED' THEN 'RTK'::"PipelineStatus"
      WHEN 'REVISION_REQUIRED' THEN 'RTK'::"PipelineStatus"
      WHEN 'ISSUE' THEN 'LATE'::"PipelineStatus"
      WHEN 'EXTENDED' THEN 'IP'::"PipelineStatus"
      ELSE 'YTS'::"PipelineStatus"
    END
  ),
  ALTER COLUMN "status" SET DEFAULT 'YTS';

DROP TYPE "StageStatus_old";
