import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { broadcast } from '../lib/sse.js'
import { zodMsg } from '../lib/zodMsg.js'

export const projectsRouter = Router()

const createSchema = z.object({
  clientId:    z.string().min(1),
  name:        z.string().min(1),
  description: z.string().optional(),
  folderName:  z.string().min(1).optional().nullable(),
  status:      z.enum(['ACTIVE','ON_HOLD','COMPLETED','ARCHIVED']).default('ACTIVE'),
  frameRate:   z.literal(24).optional(),
})

const updateSchema = z.object({
  name:        z.string().min(1).optional(),
  description: z.string().optional(),
  folderName:  z.string().min(1).optional().nullable(),
  status:      z.enum(['ACTIVE','ON_HOLD','COMPLETED','ARCHIVED']).optional(),
})

// GET /api/projects (?clientId=… &includeArchived=true)
//   By default ARCHIVED projects are excluded — keeps the payload small.
//   Pass includeArchived=true to load the archive section on demand.
//   Managers — all matching projects.
//   Artists  — only projects they have tasks in.
projectsRouter.get('/', requireAuth, async (req, res) => {
  const clientFilter     = typeof req.query.clientId === 'string' ? { clientId: req.query.clientId } : {}
  const includeArchived  = req.query.includeArchived === 'true'

  // When NOT including archived: only return ARCHIVED rows when explicitly
  // requested; otherwise exclude them entirely.
  const archivedFilter   = includeArchived
    ? { status: 'ARCHIVED' as const }           // archived-only view
    : { status: { not: 'ARCHIVED' as const } }  // normal view: hide archived

  if (req.user!.role !== 'MANAGER') {
    const ownedProjectIds = await artistOwnedProjectIds(req.user!.sub)
    const projects = await prisma.project.findMany({
      where:   { ...clientFilter, ...archivedFilter, id: { in: ownedProjectIds } },
      orderBy: { name: 'asc' },
    })
    return res.json({ projects })
  }

  const projects = await prisma.project.findMany({
    where:   { ...clientFilter, ...archivedFilter },
    orderBy: { name: 'asc' },
  })
  res.json({ projects })
})

projectsRouter.get('/:id', requireAuth, async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.id } })
  if (!project) return res.status(404).json({ error: 'Not found' })

  // Ownership check — artists can only open projects they have tasks in.
  if (req.user!.role === 'ARTIST') {
    const ownedProjectIds = await artistOwnedProjectIds(req.user!.sub)
    if (!ownedProjectIds.includes(project.id)) {
      return res.status(403).json({ error: 'No access to this project.', code: 'NO_ACCESS' })
    }
  }

  res.json({ project })
})

// ─── Internal helper ────────────────────────────────────────────────────────
/** Distinct project IDs the artist has at least one task in. */
async function artistOwnedProjectIds(employeeId: string): Promise<string[]> {
  const rows = await prisma.task.findMany({
    where:    { assignedArtistId: employeeId },
    select:   { projectId: true },
    distinct: ['projectId'],
  })
  return rows.map(r => r.projectId)
}

projectsRouter.post('/', requireAuth, requireRole('MANAGER'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: zodMsg(parsed.error) })
  const project = await prisma.project.create({
    data: { ...parsed.data, frameRate: 24 },
  })
  broadcast({ type: 'project.created', project })
  res.status(201).json({ project })
})

projectsRouter.patch('/:id', requireAuth, requireRole('MANAGER'), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: zodMsg(parsed.error) })
  const project = await prisma.project.update({ where: { id: req.params.id }, data: parsed.data })
  broadcast({ type: 'project.updated', project })
  res.json({ project })
})

projectsRouter.delete('/:id', requireAuth, requireRole('MANAGER'), async (req, res) => {
  await prisma.project.delete({ where: { id: req.params.id } })
  broadcast({ type: 'project.deleted', projectId: req.params.id })
  res.json({ ok: true })
})
