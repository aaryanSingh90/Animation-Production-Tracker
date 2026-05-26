import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

import { captureError } from './lib/sentry.js'
import { authRouter }      from './routes/auth.js'
import { employeesRouter } from './routes/employees.js'
import { clientsRouter }   from './routes/clients.js'
import { projectsRouter }  from './routes/projects.js'
import { tasksRouter }     from './routes/tasks.js'
import { eventsRouter }    from './routes/events.js'

export function createApp() {
  const app = express()

  // Security headers. CSP is disabled because the frontend runs on a separate
  // origin and we'd need a more elaborate policy to allow it — covered by
  // Vercel's own headers config in production.
  // crossOriginResourcePolicy is set to 'cross-origin' so that <video> and
  // <img> elements on the frontend (different origin) can load /uploads/ files.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }))

  // Trust X-Forwarded-* headers when sitting behind Render's proxy, so
  // express-rate-limit can correctly key on the real client IP.
  app.set('trust proxy', 1)

  // CORS — accept the comma-separated list in CORS_ORIGIN. `credentials: true`
  // is required for cookie-based auth.
  const allowed = (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map(s => s.trim())
  app.use(cors({
    origin:       allowed,
    credentials:  true,
  }))

  app.use(cookieParser())
  app.use(express.json({ limit: '10mb' }))

  // Serve uploaded video files as static assets.
  // Files are stored in <backend-root>/uploads/ and accessible at /uploads/<filename>.
  const uploadsDir = path.join(__dirname, '..', 'uploads')
  app.use('/uploads', express.static(uploadsDir))

  // Health check (bypasses rate limit + auth).
  app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }))

  // ─── Rate limiters ────────────────────────────────────────────────────────
  // Brute-force protection on login: 8 attempts per 15 min per IP.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 8,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' },
    skipSuccessfulRequests: true,
  })
  app.use('/api/auth/login', loginLimiter)

  // Password change — 5 attempts per hour per IP. Stops a stolen-token attacker
  // from spraying old-password guesses to take over an account.
  const passwordChangeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many password change attempts. Try again in an hour.' },
  })
  app.use('/api/auth/change-password', passwordChangeLimiter)

  // Refresh — 60 per hour per IP. Real frontend hits ~1/hour, plenty of room.
  const refreshLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many refresh requests.' },
  })
  app.use('/api/auth/refresh', refreshLimiter)

  // Global write-path limiter: 120 per minute per IP across all mutating verbs.
  // Reads are unlimited (most pages issue a burst on load). This catches any
  // runaway script that's POST-spamming us without affecting normal users.
  const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: req => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
    message: { error: 'Too many requests. Slow down.' },
  })
  app.use(writeLimiter)

  // ─── API routes ───────────────────────────────────────────────────────────
  app.use('/api/auth',      authRouter)
  app.use('/api/employees', employeesRouter)
  app.use('/api/clients',   clientsRouter)
  app.use('/api/projects',  projectsRouter)
  app.use('/api/tasks',     tasksRouter)
  app.use('/api/events',    eventsRouter)

  // 404
  app.use((req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.path}` }))

  // Final error handler — logs to console + escalates 5xxs to Sentry.
  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[error]', err)
    const status = (err as Error & { status?: number }).status ?? 500
    if (status >= 500) {
      captureError(err, { method: req.method, path: req.path })
    }
    res.status(status).json({ error: err.message ?? 'Internal server error' })
  })

  return app
}
