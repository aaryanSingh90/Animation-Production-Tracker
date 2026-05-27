/**
 * BUG-23: Production-aware logger.
 *
 * In development (Vite DEV mode):  all levels are emitted to the console.
 * In production (Vite PROD mode):  info/debug are suppressed; warn/error
 *   still reach the console so operators can diagnose issues in the field.
 *
 * Usage:
 *   import { logger } from '../utils/logger'
 *   logger.info('[sse] connected')
 *   logger.warn('[tasks] fetch failed', err)
 *   logger.error('[auth] unexpected 500', err)
 */

const isDev = import.meta.env.DEV

export const logger = {
  // eslint-disable-next-line no-console
  debug: (...args: unknown[]) => { if (isDev) console.debug(...args) },
  // eslint-disable-next-line no-console
  info:  (...args: unknown[]) => { if (isDev) console.info(...args) },
  // eslint-disable-next-line no-console
  warn:  (...args: unknown[]) => { console.warn(...args) },
  // eslint-disable-next-line no-console
  error: (...args: unknown[]) => { console.error(...args) },
}
