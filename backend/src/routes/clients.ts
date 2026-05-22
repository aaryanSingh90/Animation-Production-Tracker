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

// All authenticated users can read clients (filtering happens per-task on frontend)
clientsRouter.get('/', requireAuth, async (_req, res) => {
  const clients = await prisma.client.findMany({ orderBy: { name: 'asc' } })
  res.json({ clients })
})

clientsRouter.get('/:id', requireAuth, async (req, res) => {
  const client = await prisma.client.findUnique({ where: { id: req.params.id } })
  if (!client) return res.status(404).json({ error: 'Not found' })
  res.json({ client })
})

// MANAGER + LEAD can create/update/delete
clientsRouter.post('/', requireAuth, requireRole('MANAGER', 'LEAD'), async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: zodMsg(parsed.error) })
  const client = await prisma.client.create({ data: parsed.data })
  broadcast({ type: 'client.created', client })
  res.status(201).json({ client })
})

clientsRouter.patch('/:id', requireAuth, requireRole('MANAGER', 'LEAD'), async (req, res) => {
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
