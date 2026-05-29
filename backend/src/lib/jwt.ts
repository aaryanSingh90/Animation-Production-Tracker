import jwt from 'jsonwebtoken'
import type { EmployeeRole } from '@prisma/client'

const SECRET = process.env.JWT_SECRET
if (!SECRET) {
  throw new Error('JWT_SECRET must be set in environment')
}
// BUG-32: detect placeholder / low-entropy secrets. The OLD check only matched
// 'change-me' / 'secret' / 'dev' and silently passed the real local default
// ("local-dev-jwt-secret-replace-in-production-please"). We now match a broad
// set of giveaway substrings (and short length), and in PRODUCTION we refuse to
// boot rather than merely warning — a predictable JWT secret lets anyone forge
// admin sessions.
const PLACEHOLDER_PATTERNS = [
  'change-me', 'changeme', 'replace', 'placeholder', 'local-dev', 'localdev',
  'dev-secret', 'please', 'example', 'insecure', 'todo', 'xxxx', 'default',
]
const secretLooksWeak =
  SECRET.length < 32 ||
  SECRET === 'secret' || SECRET === 'dev' ||
  PLACEHOLDER_PATTERNS.some(p => SECRET!.toLowerCase().includes(p))

if (secretLooksWeak) {
  const advice =
    `Generate a strong one: ` +
    `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `[security] JWT_SECRET is a placeholder or too short — refusing to start in production. ${advice}`,
    )
  }
  // eslint-disable-next-line no-console
  console.warn(
    `[security] JWT_SECRET looks like a placeholder or is short (${SECRET.length} chars). ` +
    `Fine for localhost, but replace it before deploying. ${advice}`,
  )
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
