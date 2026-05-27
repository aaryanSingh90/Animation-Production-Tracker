/**
 * Migration recovery — wired into npm `postinstall` so it runs during the
 * very first step of every Render build (`npm install`).
 *
 * If the 20260527000001_task_shot_partial_unique migration is stuck in a
 * failed state (P3009 / P3018) this script marks it as rolled-back in the
 * _prisma_migrations table so that `prisma migrate deploy` (later in the
 * build) can re-run the fixed SQL.
 *
 * Safety guarantees:
 *   • Idempotent — does nothing when the migration is already resolved or
 *     successfully applied, so it is safe to leave in the lifecycle forever.
 *   • Skips silently when DATABASE_URL is missing (e.g. local `npm install`
 *     by a developer who hasn't configured the DB yet).
 *   • Catches every error — `npm install` never fails because of this script.
 */

// Bail out early if DATABASE_URL is missing — common on local dev / CI.
if (!process.env.DATABASE_URL) {
  console.log('[resolve] DATABASE_URL not set — skipping.')
  process.exit(0)
}

// Lazy import so we don't crash if @prisma/client isn't generated yet
// (e.g. a developer runs `npm install` for the very first time).
const { PrismaClient } = await import('@prisma/client')

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

await main()
  .catch(e => {
    // Non-fatal — if the DB is unreachable here, migrate deploy will fail
    // later with a clearer message and the developer can investigate.
    console.error('[resolve] Skipping (non-fatal):', e.message)
  })
  .finally(() => prisma.$disconnect())
