/**
 * Migration recovery — runs before `prisma migrate deploy` in the build.
 *
 * If the 20260527000001_task_shot_partial_unique migration is stuck in a
 * failed state (P3009 / P3018) this script marks it as rolled-back in the
 * _prisma_migrations table so that migrate deploy can re-run the fixed SQL.
 *
 * Idempotent: does nothing when the migration has already been resolved or
 * successfully applied, so it is safe to leave in the build pipeline forever.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const count = await prisma.$executeRaw`
    UPDATE "_prisma_migrations"
    SET    "rolled_back_at" = NOW()
    WHERE  "migration_name" = '20260527000001_task_shot_partial_unique'
      AND  "rolled_back_at" IS NULL
      AND  "finished_at"    IS NULL
  `
  if (count > 0) {
    console.log('[resolve] Cleared stuck migration — prisma migrate deploy can now proceed.')
  } else {
    console.log('[resolve] Nothing to clear (migration already resolved or not yet run).')
  }
}

main()
  .catch(e => {
    // Non-fatal — if the DB is unreachable here, migrate deploy will fail
    // with a clearer message anyway.
    console.error('[resolve] Skipping (non-fatal):', e.message)
  })
  .finally(() => prisma.$disconnect())
