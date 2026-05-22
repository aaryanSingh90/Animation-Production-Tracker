import type { Request, Response, NextFunction } from 'express'
import { verifyToken, type JwtPayload } from '../lib/jwt.js'

// Augment Express Request with the authenticated user payload.
declare module 'express-serve-static-core' {
  interface Request {
    user?: JwtPayload
  }
}

/** Verifies bearer token and attaches `req.user`. 401 on missing/invalid. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing bearer token' })
    return
  }
  const token = header.slice(7)
  try {
    req.user = verifyToken(token)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
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
