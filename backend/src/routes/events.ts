import { Router } from 'express'
import { addClient } from '../lib/sse.js'
import { verifyToken } from '../lib/jwt.js'

export const eventsRouter = Router()

/**
 * GET /api/events?token=<jwt>
 *
 * EventSource doesn't allow custom headers, so we accept the JWT as a
 * query string param. Validate, set the SSE headers, and register the
 * response with the broadcast bus.
 */
eventsRouter.get('/', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : ''
  try {
    verifyToken(token)
  } catch {
    res.status(401).end()
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')   // disable nginx buffering
  res.flushHeaders()

  // Initial hello so the client knows we're connected
  res.write(`data: ${JSON.stringify({ type: 'hello' })}\n\n`)
  addClient(res)
})
