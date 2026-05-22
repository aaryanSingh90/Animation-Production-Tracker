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
  status:      z.enum(['ACTIVE','ON_HOLD','COMPLETED']).default('ACTIVE'),
  frameRate:   z.literal(24).optional(),
})

const updateSchema = z.object({
  name:        z.string().min(1).optional(),
  description: z.string().optional(),
  status:      z.enum(['ACTIVE','ON_HOLD','COMPLETED']).optional(),
})

// GET /api/projects (?clientId=…)
projectsRouter.get('/', requireAuth, async (req, res) => {
  const where = typeof req.query.clientId === 'string' ? { clientId: req.query.clientId } : {}
  const projects = await prisma.project.findMany({ where, orderBy: { name: 'asc' } })
  res.json({ projects })
})

projectsRouter.get('/:id', requireAuth, async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.id } })
  if (!project) return res.status(404).json({ error: 'Not found' })
  res.json({ project })
})

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
