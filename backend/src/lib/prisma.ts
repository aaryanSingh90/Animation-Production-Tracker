import { PrismaClient } from '@prisma/client'

// Re-use the same client in dev across hot-reloads to avoid connection storms.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

export const prisma = global.__prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn'],
})

if (process.env.NODE_ENV !== 'production') global.__prisma = prisma
