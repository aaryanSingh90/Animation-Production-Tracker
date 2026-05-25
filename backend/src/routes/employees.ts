import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { broadcast } from '../lib/sse.js'
import { zodMsg } from '../lib/zodMsg.js'

export const employeesRouter = Router()

const DEPT_VALUES = ['Animation','Rigging','Lighting','FX','Compositing','Modelling','Texturing','Audio','Editing'] as const
const ROLE_VALUES = ['MANAGER','LEAD','ARTIST','FREELANCE'] as const

const createSchema = z.object({
  name:           z.string().min(1),
  email:          z.string().email(),
  password:       z.string().min(6, 'Password must be at least 6 characters.'),
  role:           z.enum(ROLE_VALUES),
  department:     z.enum(DEPT_VALUES),
  specialization: z.string().optional(),
  avatarColor:    z.string().optional(),
})

const updateSchema = createSchema.partial().extend({
  active: z.boolean().optional(),
})

function stripHash<T extends { passwordHash: string }>(emp: T) {
  const { passwordHash, ...safe } = emp
  return safe
}

// GET /api/employees — any authenticated user can list employees (needed for dropdowns)
employeesRouter.get('/', requireAuth, async (_req, res) => {
  const employees = await prisma.employee.findMany({ orderBy: { name: 'asc' } })
  res.json({ employees: employees.map(stripHash) })
})

// GET /api/employees/:id
employeesRouter.get('/:id', requireAuth, async (req, res) => {
  const emp = await prisma.employee.findUnique({ where: { id: req.params.id } })
  if (!emp) return res.status(404).json({ error: 'Not found' })
  res.json({ employee: stripHash(emp) })
})

// POST /api/employees — MANAGER only
employeesRouter.post('/', requireAuth, requireRole('MANAGER'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: zodMsg(parsed.error) })
  }
  const data = parsed.data
  const exists = await prisma.employee.findUnique({ where: { email: data.email.toLowerCase() } })
  if (exists) return res.status(409).json({ error: 'Email already in use.' })
  const passwordHash = await bcrypt.hash(data.password, 10)
  const emp = await prisma.employee.create({
    data: {
      name:           data.name,
      email:          data.email.toLowerCase(),
      passwordHash,
      role:           data.role,
      department:     data.department,
      specialization: data.specialization,
      avatarColor:    data.avatarColor,
      // New accounts MUST change the temp password on first login. The login
      // route returns `mustChangePassword: true` and the frontend redirects
      // to the change-password screen; the strict auth middleware blocks
      // every other endpoint until the flag clears.
      mustChangePassword: true,
    },
  })
  const safe = stripHash(emp)
  broadcast({ type: 'employee.created', employee: safe })
  res.status(201).json({ employee: safe })
})

// PATCH /api/employees/:id — MANAGER (any field) or self (subset)
employeesRouter.patch('/:id', requireAuth, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: zodMsg(parsed.error) })
  }
  const isSelf    = req.user!.sub === req.params.id
  const isManager = req.user!.role === 'MANAGER'
  if (!isManager && !isSelf) return res.status(403).json({ error: 'Forbidden' })
  // Non-managers cannot change role/department/active
  const data = parsed.data
  if (!isManager) {
    delete data.role
    delete data.department
    delete data.active
  }
  const update: Record<string, unknown> = { ...data }
  if (data.password) {
    update.passwordHash = await bcrypt.hash(data.password, 10)
    delete (update as { password?: string }).password
    // When a manager resets someone else's password, force them to change it
    // on first login so the manager never knows it. Bump tokenVersion to
    // invalidate every existing session for that user.
    if (isManager && !isSelf) {
      update.mustChangePassword = true
      update.tokenVersion        = { increment: 1 }
      update.failedLoginAttempts = 0
      update.lockedUntil         = null
    } else {
      // Self-change → clear the force-change flag; bump tokenVersion to log
      // out every OTHER browser this user is signed in on.
      update.mustChangePassword = false
      update.tokenVersion        = { increment: 1 }
    }
  }
  // Deactivating an account also bumps tokenVersion so existing sessions die.
  if (data.active === false) {
    update.tokenVersion = { increment: 1 }
  }
  if (data.email) update.email = data.email.toLowerCase()
  const emp = await prisma.employee.update({
    where: { id: req.params.id },
    data:  update,
  })
  const safe = stripHash(emp)
  broadcast({ type: 'employee.updated', employee: safe })
  res.json({ employee: safe })
})

// DELETE /api/employees/:id — soft-delete (deactivate). MANAGER only.
employeesRouter.delete('/:id', requireAuth, requireRole('MANAGER'), async (req, res) => {
  const emp = await prisma.employee.update({
    where: { id: req.params.id },
    data:  { active: false },
  })
  const safe = stripHash(emp)
  broadcast({ type: 'employee.updated', employee: safe })
  res.json({ employee: safe })
})
