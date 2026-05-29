import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import {
  signToken, COOKIE_NAME, ACCESS_TOKEN_MAX_AGE_SECONDS, type JwtPayload,
} from '../lib/jwt.js'
import { requireAuth, requireAuthStrict } from '../middleware/auth.js'
import { STRONG_PASSWORD } from '../lib/password.js'

export const authRouter = Router()

// ─── Lockout policy ──────────────────────────────────────────────────────────
const MAX_FAILED_ATTEMPTS = 5
const FAILED_WINDOW_MS    = 60 * 60 * 1000        // 1h rolling window
const LOCK_DURATION_MS    = 60 * 60 * 1000        // 1h lock after threshold

// ─── Password policy (Phase 1) ───────────────────────────────────────────────
// STRONG_PASSWORD now lives in lib/password.ts so employee creation/reset and
// this change-password flow share one source of truth (BUG-17).

// ─── Cookie helpers ──────────────────────────────────────────────────────────
const COOKIE_PROD_ATTRS = {
  httpOnly: true,
  secure:   true,            // HTTPS only — Render + Vercel run HTTPS
  sameSite: 'lax' as const,  // same-site is fine for our frontend; 'strict' breaks email-link logins
  maxAge:   ACCESS_TOKEN_MAX_AGE_SECONDS * 1000,
  path:     '/',
}
const COOKIE_DEV_ATTRS = {
  ...COOKIE_PROD_ATTRS,
  secure:   false,           // local http://localhost requires this
  sameSite: 'lax' as const,
}
const COOKIE_ATTRS = process.env.NODE_ENV === 'production' ? COOKIE_PROD_ATTRS : COOKIE_DEV_ATTRS

function issueSessionCookie(res: import('express').Response, payload: JwtPayload) {
  const token = signToken(payload)
  res.cookie(COOKIE_NAME, token, COOKIE_ATTRS)
  return token
}

// ─── Schemas ─────────────────────────────────────────────────────────────────
const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

// ─── POST /api/auth/login ────────────────────────────────────────────────────
// Returns the same `{ token, user }` shape as before for back-compat with
// older clients that still read `token` from the body. New frontends rely on
// the HttpOnly cookie set in the response headers instead.
authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid email or password.' })
  }
  const { email, password } = parsed.data
  const employee = await prisma.employee.findUnique({
    where: { email: email.toLowerCase() },
  })
  // Generic "invalid email or password" for every failure path — never tell
  // an attacker WHICH part was wrong. Single exception: account lockout, which
  // we surface as 423 so the user knows to wait it out.
  if (!employee || !employee.active) {
    return res.status(401).json({ error: 'Invalid email or password.' })
  }
  // Lockout check.
  if (employee.lockedUntil && employee.lockedUntil > new Date()) {
    const minutes = Math.ceil((employee.lockedUntil.getTime() - Date.now()) / 60000)
    return res.status(423).json({
      error: `Too many failed attempts. Account locked for ${minutes} more minute${minutes === 1 ? '' : 's'}.`,
      lockedUntil: employee.lockedUntil.toISOString(),
    })
  }

  const ok = await bcrypt.compare(password, employee.passwordHash)
  if (!ok) {
    await recordFailedLogin(employee)
    return res.status(401).json({ error: 'Invalid email or password.' })
  }

  // Successful login → reset counter, issue token + cookie.
  await prisma.employee.update({
    where: { id: employee.id },
    data:  { failedLoginAttempts: 0, lockedUntil: null, lastFailedLoginAt: null },
  })
  const token = issueSessionCookie(res, {
    sub:   employee.id,
    email: employee.email,
    role:  employee.role,
    tv:    employee.tokenVersion,
  })
  const { passwordHash: _omit, ...safe } = employee
  return res.json({
    token,                          // back-compat for clients still reading the body
    user: safe,
    mustChangePassword: employee.mustChangePassword,
  })
})

// ─── POST /api/auth/logout ───────────────────────────────────────────────────
// Clear the cookie. Idempotent — fine to call even when already logged out.
authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' })
  return res.json({ ok: true })
})

// ─── POST /api/auth/refresh ─────────────────────────────────────────────────
// Re-issue a fresh cookie if the caller is still authenticated. The frontend
// hits this every ~50 minutes so active sessions never see a JWT expiry.
authRouter.post('/refresh', requireAuth, async (req, res) => {
  const fresh = await prisma.employee.findUnique({
    where: { id: req.user!.sub },
    select: {
      id: true, email: true, role: true, active: true,
      tokenVersion: true, mustChangePassword: true,
    },
  })
  if (!fresh || !fresh.active || fresh.tokenVersion !== req.user!.tv) {
    res.clearCookie(COOKIE_NAME, { path: '/' })
    return res.status(401).json({ error: 'Session invalidated. Sign in again.' })
  }
  issueSessionCookie(res, {
    sub:   fresh.id,
    email: fresh.email,
    role:  fresh.role,
    tv:    fresh.tokenVersion,
  })
  return res.json({ ok: true, mustChangePassword: fresh.mustChangePassword })
})

// ─── GET /api/auth/me ───────────────────────────────────────────────────────
authRouter.get('/me', requireAuth, async (req, res) => {
  const employee = await prisma.employee.findUnique({
    where: { id: req.user!.sub },
  })
  if (!employee) return res.status(401).json({ error: 'User no longer exists' })
  const { passwordHash: _omit, ...safe } = employee
  return res.json({ user: safe, mustChangePassword: employee.mustChangePassword })
})

// ─── POST /api/auth/change-password ─────────────────────────────────────────
// Any logged-in user can change their own password. Bumps tokenVersion so
// every other session is logged out instantly.
authRouter.post('/change-password', requireAuthStrict, async (req, res) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword:     STRONG_PASSWORD,
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid password.' })
  }
  const me = await prisma.employee.findUnique({ where: { id: req.user!.sub } })
  if (!me) return res.status(401).json({ error: 'User no longer exists' })
  const ok = await bcrypt.compare(parsed.data.currentPassword, me.passwordHash)
  if (!ok) return res.status(403).json({ error: 'Current password is incorrect.' })

  if (parsed.data.newPassword === parsed.data.currentPassword) {
    return res.status(400).json({ error: 'New password must be different from the current one.' })
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10)
  const updated = await prisma.employee.update({
    where: { id: me.id },
    data:  {
      passwordHash,
      mustChangePassword:  false,           // they just chose their own password
      tokenVersion:        { increment: 1 }, // invalidate every other session
      failedLoginAttempts: 0,
      lockedUntil:         null,
    },
  })
  // Re-issue THIS session's cookie with the new tokenVersion so the current
  // window keeps working without a forced re-login.
  issueSessionCookie(res, {
    sub:   updated.id,
    email: updated.email,
    role:  updated.role,
    tv:    updated.tokenVersion,
  })
  return res.json({ ok: true })
})

// ─── Internal helpers ────────────────────────────────────────────────────────

async function recordFailedLogin(emp: {
  id: string
  failedLoginAttempts: number
  lastFailedLoginAt: Date | null
}): Promise<void> {
  const now = new Date()
  const withinWindow = emp.lastFailedLoginAt &&
    (now.getTime() - emp.lastFailedLoginAt.getTime() < FAILED_WINDOW_MS)
  const nextCount = withinWindow ? emp.failedLoginAttempts + 1 : 1
  const shouldLock = nextCount >= MAX_FAILED_ATTEMPTS
  await prisma.employee.update({
    where: { id: emp.id },
    data: {
      failedLoginAttempts: nextCount,
      lastFailedLoginAt:   now,
      lockedUntil:         shouldLock ? new Date(now.getTime() + LOCK_DURATION_MS) : null,
    },
  })
}
