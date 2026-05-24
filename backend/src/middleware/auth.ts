import type { Request, Response, NextFunction } from 'express'
import { verifyToken, COOKIE_NAME, type JwtPayload } from '../lib/jwt.js'
import { prisma } from '../lib/prisma.js'

// Augment Express Request with the authenticated user payload.
declare module 'express-serve-static-core' {
  interface Request {
    user?: JwtPayload
  }
}

/**
 * Reads the auth token from the most secure available source.
 *
 *   1. HttpOnly cookie `shothub_token`  ← preferred (immune to XSS)
 *   2. `Authorization: Bearer <jwt>`    ← back-compat for older clients
 *   3. `?token=<jwt>` query string      ← SSE only (EventSource can't set headers)
 */
function readToken(req: Request): string | undefined {
  const fromCookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[COOKIE_NAME]
  if (fromCookie) return fromCookie
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) return header.slice(7)
  if (typeof req.query?.token === 'string') return req.query.token
  return undefined
}

/**
 * Verifies the request's token signature + expiry and attaches `req.user`.
 * 401 on missing or invalid token. Tokens are read from cookie / header /
 * query (in that priority order).
 *
 * This is the fast path — it does NOT check `tokenVersion` against the DB.
 * Use `requireAuthStrict` for write endpoints that must enforce password
 * changes / deactivation immediately.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = readToken(req)
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  try {
    req.user = verifyToken(token)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' })
  }
}

/**
 * Strict variant — awaits a DB check that enforces:
 *   • Account is still active
 *   • tokenVersion matches (password not changed since this JWT was issued)
 *   • mustChangePassword flag is NOT set (forces password change)
 *
 * Costs one DB read per request. Apply on write endpoints (POST/PUT/PATCH/DELETE)
 * and on anything sensitive (admin actions, payment, password change confirm).
 */
export async function requireAuthStrict(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = readToken(req)
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  let payload: JwtPayload
  try { payload = verifyToken(token) }
  catch {
    res.status(401).json({ error: 'Invalid or expired session' })
    return
  }
  const fresh = await prisma.employee.findUnique({
    where: { id: payload.sub },
    select: { active: true, tokenVersion: true, mustChangePassword: true },
  })
  if (!fresh || !fresh.active) {
    res.status(401).json({ error: 'Account inactive' })
    return
  }
  if (fresh.tokenVersion !== payload.tv) {
    res.status(401).json({ error: 'Session invalidated. Sign in again.' })
    return
  }
  // Allow change-password endpoint through even when mustChangePassword is true
  // — that's the ONE thing they need to do to clear the flag.
  if (fresh.mustChangePassword && !req.path.endsWith('/change-password')) {
    res.status(403).json({ error: 'Password change required', code: 'PASSWORD_CHANGE_REQUIRED' })
    return
  }
  req.user = payload
  next()
}

/** Requires the authenticated user to have one of the given roles. */
export function requireRole(...roles: JwtPayload['role'][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden — role not allowed' })
      return
    }
    next()
  }
}
