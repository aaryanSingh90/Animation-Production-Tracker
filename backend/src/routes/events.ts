import { Router } from 'express'
import { addClient } from '../lib/sse.js'
import { requireAuth } from '../middleware/auth.js'

export const eventsRouter = Router()

/**
 * GET /api/events
 *
 * Opens a Server-Sent Events stream. Auth is handled by requireAuth which
 * reads credentials in priority order:
 *   1. HttpOnly cookie  ← used automatically by EventSource on same-origin
 *   2. Authorization: Bearer header
 *   3. ?token= query string  ← fallback for cross-origin EventSource
 *
 * In single-origin (v3) mode the browser always sends the cookie, so the
 * connection works correctly even after a page refresh when the in-memory
 * JWT has been wiped.
 */
eventsRouter.get('/', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')   // disable nginx buffering
  res.flushHeaders()

  // Initial hello so the client knows the connection is live.
  res.write(`data: ${JSON.stringify({ type: 'hello' })}\n\n`)
  // BUG-27: register with the user context so the bus can scope task events to
  // their assignee for restricted roles (artists/freelancers).
  addClient(res, { sub: req.user!.sub, role: req.user!.role })
})
