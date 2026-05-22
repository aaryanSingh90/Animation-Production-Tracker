import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { signToken } from '../lib/jwt.js'
import { requireAuth } from '../middleware/auth.js'

export const authRouter = Router()

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

/** POST /api/auth/login → { token, user } */
authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid email or password.' })
  }
  const { email, password } = parsed.data
  const employee = await prisma.employee.findUnique({
    where: { email: email.toLowerCase() },
  })
  if (!employee || !employee.active) {
    return res.status(401).json({ error: 'Invalid email or password.' })
  }
  const ok = await bcrypt.compare(password, employee.passwordHash)
  if (!ok) {
    return res.status(401).json({ error: 'Invalid email or password.' })
  }
  const token = signToken({
    sub:   employee.id,
    email: employee.email,
    role:  employee.role,
  })
  // Strip the hash before sending the user to the client
  const { passwordHash: _omit, ...safe } = employee
  return res.json({ token, user: safe })
})

/** GET /api/auth/me → current authenticated user (no password hash) */
authRouter.get('/me', requireAuth, async (req, res) => {
  const employee = await prisma.employee.findUnique({
    where: { id: req.user!.sub },
  })
  if (!employee) return res.status(401).json({ error: 'User no longer exists' })
  const { passwordHash: _omit, ...safe } = employee
  return res.json({ user: safe })
})

/** POST /api/auth/change-password — let any logged-in user change their own password */
authRouter.post('/change-password', requireAuth, async (req, res) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword:     z.string().min(6),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' })
  }
  const me = await prisma.employee.findUnique({ where: { id: req.user!.sub } })
  if (!me) return res.status(401).json({ error: 'User no longer exists' })
  const ok = await bcrypt.compare(parsed.data.currentPassword, me.passwordHash)
  if (!ok) return res.status(403).json({ error: 'Current password is incorrect.' })

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10)
  await prisma.employee.update({
    where: { id: me.id },
    data:  { passwordHash },
  })
  return res.json({ ok: true })
})
