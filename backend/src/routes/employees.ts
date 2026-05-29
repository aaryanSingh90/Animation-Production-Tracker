import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { broadcast } from '../lib/sse.js'
import { zodMsg } from '../lib/zodMsg.js'
import { STRONG_PASSWORD } from '../lib/password.js'

export const employeesRouter = Router()

const DEPT_VALUES = ['Animation','Rigging','Lighting','FX','Compositing','Modelling','Texturing','Audio','Editing'] as const
const ROLE_VALUES = ['MANAGER','LEAD','ARTIST','FREELANCE'] as const

const createSchema = z.object({
  name:           z.string().min(1),
  email:          z.string().email(),
  // BUG-17: unified with the change-password policy so an account can't be
  // created with a temp password the user could never re-enter on change.
  password:       STRONG_PASSWORD,
  role:           z.enum(ROLE_VALUES),
  department:     z.enum(DEPT_VALUES),
  specialization: z.string().optional(),
  avatarColor:    z.string().optional(),
})

/**
 * BUG-19: protect the studio from being locked out. Returns a blocking error
 * message when a change would either (a) deactivate the actor's OWN account,
 * or (b) leave zero active managers (via deactivation OR demotion). Else null.
 */
async function guardManagerInvariant(
  targetId: string,
  actorId: string,
  change: { active?: boolean; role?: string },
): Promise<string | null> {
  const deactivating = change.active === false
  const demoting     = change.role !== undefined && change.role !== 'MANAGER'
  if (!deactivating && !demoting) return null

  if (deactivating && targetId === actorId) {
    return 'You cannot deactivate your own account.'
  }
  const target = await prisma.employee.findUnique({
    where: { id: targetId }, select: { role: true, active: true },
  })
  if (!target) return null  // let the update surface its own not-found error
  const targetIsActiveManager = target.role === 'MANAGER' && target.active
  if (targetIsActiveManager) {
    const activeManagers = await prisma.employee.count({ where: { role: 'MANAGER', active: true } })
    if (activeManagers <= 1) {
      return deactivating
        ? 'Cannot deactivate the last active manager.'
        : 'Cannot change the role of the last active manager.'
    }
  }
  return null
}

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
  // BUG-19: block self-deactivation and removing the last active manager
  // (whether by deactivating or demoting them).
  const block = await guardManagerInvariant(req.params.id, req.user!.sub, { active: data.active, role: data.role })
  if (block) return res.status(400).json({ error: block })
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
  // BUG-18: catch a unique-email clash (P2002) and a missing record (P2025) and
  // map them to clean 409/404 responses instead of a generic 500.
  let emp
  try {
    emp = await prisma.employee.update({
      where: { id: req.params.id },
      data:  update,
    })
  } catch (err) {
    const code = (err as { code?: string })?.code
    if (code === 'P2002') return res.status(409).json({ error: 'Email already in use.' })
    if (code === 'P2025') return res.status(404).json({ error: 'Not found' })
    throw err
  }
  const safe = stripHash(emp)
  broadcast({ type: 'employee.updated', employee: safe })
  res.json({ employee: safe })
})

// DELETE /api/employees/:id — soft-delete (deactivate). MANAGER only.
employeesRouter.delete('/:id', requireAuth, requireRole('MANAGER'), async (req, res) => {
  // BUG-19: never let a manager deactivate their own account or the last
  // remaining active manager — either would lock the studio out of admin.
  const block = await guardManagerInvariant(req.params.id, req.user!.sub, { active: false })
  if (block) return res.status(400).json({ error: block })
  // Bump tokenVersion so the deactivated user's existing sessions die on their
  // next authenticated write (consistent with the PATCH active:false path).
  const emp = await prisma.employee.update({
    where: { id: req.params.id },
    data:  { active: false, tokenVersion: { increment: 1 } },
  })
  const safe = stripHash(emp)
  broadcast({ type: 'employee.updated', employee: safe })
  res.json({ employee: safe })
})
