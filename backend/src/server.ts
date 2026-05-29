import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import path from 'path'
import fs from 'fs'
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

  // Security headers (Content Security Policy).
  // v3 serves the built React SPA from this same origin, so the CSP must allow
  // the app's own bundled scripts/styles. 'self' covers the JS/CSS bundles;
  // data:/blob: cover base64 thumbnails and object-URL video playback.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],   // Tailwind injects inline styles
        imgSrc:     ["'self'", 'data:', 'blob:'],      // thumbnails are data URLs
        mediaSrc:   ["'self'", 'data:', 'blob:'],      // <video> uses blob/object URLs
        connectSrc: ["'self'"],                        // API + SSE on same origin
        fontSrc:    ["'self'", 'data:'],
        objectSrc:  ["'none'"],
        frameSrc:   ["'none'"],
        // Disable Helmet's default upgrade-insecure-requests — it breaks the
        // app on LAN IPs (e.g. 192.168.x.x) over plain HTTP by telling browsers
        // to silently upgrade asset loads to HTTPS, which doesn't exist locally.
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
    // Keep cross-origin so a separately-hosted frontend (SERVE_FRONTEND=false)
    // can still load /uploads/ media when not running single-origin.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }))

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
  // Uses UPLOADS_DIR env var so the same code works both locally (relative path)
  // and on Render where a persistent disk is mounted at a fixed absolute path.
  const uploadsDir = process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.join(__dirname, '..', 'uploads')
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

  // ─── Serve the built frontend (v3 single-origin local deployment) ──────────
  // The compiled React app is served from the same origin as the API, so there
  // is no CORS and only one port to run. Set SERVE_FRONTEND=false to run the
  // API alone (e.g. when the frontend is hosted separately).
  if (process.env.SERVE_FRONTEND !== 'false') {
    const distDir = process.env.FRONTEND_DIST
      ? path.resolve(process.env.FRONTEND_DIST)
      : path.join(__dirname, '..', '..', 'frontend', 'dist')
    if (fs.existsSync(distDir)) {
      // Serve hashed assets (JS/CSS bundles) with long-term immutable cache.
      // index: false so we control index.html caching ourselves below.
      app.use(express.static(distDir, { maxAge: '1y', immutable: true, index: false }))
      // SPA fallback — any GET that isn't an API/uploads/health route returns
      // index.html. Always no-cache so browsers never serve a stale index.html
      // that points to deleted content-hashed bundles (causes white screen).
      app.get(/^(?!\/api\/|\/uploads\/|\/health).*/, (_req, res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
        res.sendFile(path.join(distDir, 'index.html'))
      })
    } else {
      console.warn(`[server] SERVE_FRONTEND is on but ${distDir} not found — build the frontend first. Serving API only.`)
    }
  }

  // 404 (API routes + anything else when the frontend isn't served)
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
