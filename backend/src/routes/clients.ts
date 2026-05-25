import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { broadcast } from '../lib/sse.js'
import { zodMsg } from '../lib/zodMsg.js'

export const clientsRouter = Router()

const upsertSchema = z.object({
  name:         z.string().min(1),
  description:  z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
})

// GET /api/clients
//   Managers — every client in the studio.
//   Artists  — only clients with a project containing a task assigned to them.
// Source of truth is the API; the frontend used to filter locally which left
// a hole an artist could exploit by typing a client URL directly.
clientsRouter.get('/', requireAuth, async (req, res) => {
  if (req.user!.role === 'ARTIST') {
    const ownedClientIds = await artistOwnedClientIds(req.user!.sub)
    const clients = await prisma.client.findMany({
      where:   { id: { in: ownedClientIds } },
      orderBy: { name: 'asc' },
    })
    return res.json({ clients })
  }
  const clients = await prisma.client.findMany({ orderBy: { name: 'asc' } })
  res.json({ clients })
})

clientsRouter.get('/:id', requireAuth, async (req, res) => {
  const client = await prisma.client.findUnique({ where: { id: req.params.id } })
  if (!client) return res.status(404).json({ error: 'Not found' })

  // Ownership check — artists can only open clients they have tasks under.
  if (req.user!.role === 'ARTIST') {
    const ownedClientIds = await artistOwnedClientIds(req.user!.sub)
    if (!ownedClientIds.includes(client.id)) {
      return res.status(403).json({ error: 'No access to this client.', code: 'NO_ACCESS' })
    }
  }

  res.json({ client })
})

// ─── Internal helper ────────────────────────────────────────────────────────
/** Distinct client IDs whose projects contain at least one task assigned to
 *  this artist. Used by GET / and GET /:id ownership checks. */
async function artistOwnedClientIds(employeeId: string): Promise<string[]> {
  const projects = await prisma.task.findMany({
    where:  { assignedArtistId: employeeId },
    select: { project: { select: { clientId: true } } },
    distinct: ['projectId'],
  })
  return [...new Set(projects.map(p => p.project.clientId))]
}

// Only managers create / update / delete clients
clientsRouter.post('/', requireAuth, requireRole('MANAGER'), async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: zodMsg(parsed.error) })
  const client = await prisma.client.create({ data: parsed.data })
  broadcast({ type: 'client.created', client })
  res.status(201).json({ client })
})

clientsRouter.patch('/:id', requireAuth, requireRole('MANAGER'), async (req, res) => {
  const parsed = upsertSchema.partial().safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: zodMsg(parsed.error) })
  const client = await prisma.client.update({ where: { id: req.params.id }, data: parsed.data })
  broadcast({ type: 'client.updated', client })
  res.json({ client })
})

clientsRouter.delete('/:id', requireAuth, requireRole('MANAGER'), async (req, res) => {
  await prisma.client.delete({ where: { id: req.params.id } })
  broadcast({ type: 'client.deleted', clientId: req.params.id })
  res.json({ ok: true })
})
