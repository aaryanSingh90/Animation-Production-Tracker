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
}

const TOKEN_TTL = '7d'

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET as string, { expiresIn: TOKEN_TTL })
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET as string) as JwtPayload
}
