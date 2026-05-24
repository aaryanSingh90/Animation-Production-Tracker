/**
 * Sentry initialization for the ShotHub backend.
 *
 * Set SENTRY_DSN in env to enable. When absent, every export here is a no-op
 * so a fresh clone runs without a Sentry account.
 *
 * Captures:
 *   - Uncaught exceptions
 *   - Unhandled promise rejections
 *   - Express errors via `sentryErrorHandler` middleware
 *
 * Does NOT capture:
 *   - Routine 401 / 403 / 404 (those aren't bugs — just expected behaviour)
 *   - Body payloads (might contain passwords)
 */
import * as Sentry from '@sentry/node'

const DSN = process.env.SENTRY_DSN

let initialized = false

export function initSentry(): void {
  if (initialized || !DSN) return
  Sentry.init({
    dsn:         DSN,
    environment: process.env.NODE_ENV ?? 'development',
    // 10% sample rate on traces — enough to spot slow endpoints without
    // burning through the free tier on a busy day.
    tracesSampleRate: 0.1,
    // Don't send request bodies — they may contain passwords or session
    // tokens. We have other audit trails for that.
    sendDefaultPii: false,
    beforeSend(event, hint) {
      // Skip routine HTTP errors — only escalate genuine server bugs.
      const exception = hint.originalException as { status?: number } | undefined
      if (exception?.status && exception.status < 500) return null
      return event
    },
  })
  initialized = true
  // eslint-disable-next-line no-console
  console.log('  ▸ Sentry:        enabled')
}

/** Manual capture — use in error handlers or any catch block that recovers. */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return
  Sentry.captureException(err, { extra: context })
}
