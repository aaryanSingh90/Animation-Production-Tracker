import { PrismaClient } from '@prisma/client'

// Re-use the same client in dev across hot-reloads to avoid connection storms.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

// BUG-29: cap the connection pool. Prisma's default is (num_cpus * 2 + 1),
// which on a many-core dev machine — combined with tsx hot-reloads spawning
// fresh clients — can march toward Postgres' default 100-connection ceiling and
// start throwing "too many clients". Prisma reads `connection_limit` from the
// DATABASE_URL query string; inject a sane default when one isn't already set.
function databaseUrlWithPoolLimit(): string | undefined {
  const raw = process.env.DATABASE_URL
  if (!raw || raw.includes('connection_limit')) return raw
  const sep = raw.includes('?') ? '&' : '?'
  return `${raw}${sep}connection_limit=10`
}

const pooledUrl = databaseUrlWithPoolLimit()

export const prisma = global.__prisma ?? new PrismaClient({
  ...(pooledUrl ? { datasources: { db: { url: pooledUrl } } } : {}),
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn'],
})

if (process.env.NODE_ENV !== 'production') global.__prisma = prisma
