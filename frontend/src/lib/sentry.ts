/**
 * Frontend Sentry initialization.
 *
 * Set VITE_SENTRY_DSN in `.env.production` to enable. When absent, every
 * export is a no-op so dev / local runs don't need a Sentry account.
 *
 * Captures:
 *   - Uncaught render errors via the global error boundary
 *   - Unhandled promise rejections
 *
 * Does NOT capture:
 *   - 401s (those route to /login — expected behaviour)
 *   - User PII (names, emails) — only stack traces + tags
 */
import * as Sentry from '@sentry/react'

const DSN     = import.meta.env.VITE_SENTRY_DSN as string | undefined
const ENV     = (import.meta.env.MODE ?? 'development') as string
const RELEASE = (import.meta.env.VITE_RELEASE as string | undefined) ?? undefined

export function initSentry(): void {
  if (!DSN) return
  Sentry.init({
    dsn:         DSN,
    environment: ENV,
    release:     RELEASE,
    // 10% session replay sample, 100% on errors (so we always see what the
    // user did right before a crash).
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: false,
    beforeSend(event) {
      // Strip request bodies / cookies from breadcrumbs.
      if (event.request?.cookies)         delete event.request.cookies
      if (event.request?.headers)         delete event.request.headers
      return event
    },
  })
}

/** Manual capture for caught errors we still want telemetry on. */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!DSN) return
  Sentry.captureException(err, { extra: context })
}

export { Sentry }
