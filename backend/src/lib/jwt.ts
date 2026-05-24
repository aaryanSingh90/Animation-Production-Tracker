import jwt from 'jsonwebtoken'
import type { EmployeeRole } from '@prisma/client'

const SECRET = process.env.JWT_SECRET
if (!SECRET) {
  throw new Error('JWT_SECRET must be set in environment')
}
if (SECRET.length < 32) {
  // eslint-disable-next-line no-console
  console.warn(
    `[security] JWT_SECRET is short (${SECRET.length} chars). ` +
    `Generate a long random string for production: ` +
    `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`,
  )
}
if (SECRET.includes('change-me') || SECRET === 'secret' || SECRET === 'dev') {
  // eslint-disable-next-line no-console
  console.warn('[security] JWT_SECRET appears to be a placeholder. Replace it before deploying.')
}

export interface JwtPayload {
  sub:   string         // employee id
  email: string
  role:  EmployeeRole
  // tokenVersion: lets us invalidate every issued token for a user by bumping
  // Employee.tokenVersion in the DB. Set on password change, deactivation,
  // or an admin "log everyone out" action.
  tv:    number
}

// Access tokens are short-lived (1h). The cookie is refreshed silently by
// the frontend every ~50 minutes via /api/auth/refresh as long as the user
// is still active. Net effect: a stolen cookie expires in ≤1h, but genuine
// users never see a session interruption.
const TOKEN_TTL = '1h'

export const ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 60
export const COOKIE_NAME = 'shothub_token'

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET as string, { expiresIn: TOKEN_TTL })
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET as string) as JwtPayload
}
