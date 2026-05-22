import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

import { authRouter }      from './routes/auth.js'
import { employeesRouter } from './routes/employees.js'
import { clientsRouter }   from './routes/clients.js'
import { projectsRouter }  from './routes/projects.js'
import { tasksRouter }     from './routes/tasks.js'
import { eventsRouter }    from './routes/events.js'

export function createApp() {
  const app = express()

  // Security headers (disable contentSecurityPolicy because we control the frontend separately)
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))

  // CORS — accept the comma-separated list in CORS_ORIGIN
  const allowed = (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map(s => s.trim())
  app.use(cors({
    origin:       allowed,
    credentials:  true,
  }))

  app.use(express.json({ limit: '5mb' }))

  // Health check
  app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }))

  // Brute-force protection on login: 8 attempts per 15 min per IP
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 8,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' },
    skipSuccessfulRequests: true,
  })
  app.use('/api/auth/login', loginLimiter)

  // API routes
  app.use('/api/auth',      authRouter)
  app.use('/api/employees', employeesRouter)
  app.use('/api/clients',   clientsRouter)
  app.use('/api/projects',  projectsRouter)
  app.use('/api/tasks',     tasksRouter)
  app.use('/api/events',    eventsRouter)

  // 404
  app.use((req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.path}` }))

  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[error]', err)
    res.status(500).json({ error: err.message ?? 'Internal server error' })
  })

  return app
}
