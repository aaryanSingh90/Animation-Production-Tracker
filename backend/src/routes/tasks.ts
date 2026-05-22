import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { broadcast } from '../lib/sse.js'
import { zodMsg } from '../lib/zodMsg.js'

export const tasksRouter = Router()

const TASK_STATUS = ['YET_TO_START','IN_PROGRESS','LEAD_APPROVAL','LEAD_RETAKE','DONE','FINAL_APPROVAL'] as const
const AUDIO_STATUS = ['YET_TO_START','IN_PROGRESS','RECEIVED','FINAL_APPROVAL','RETAKE','DONE_INHOUSE','WIP_INHOUSE','APPROVED_INHOUSE'] as const

// Accepts any string the browser's <input type="datetime-local"> can produce:
//   "2026-05-22"                 (date only)
//   "2026-05-22T12:43"           (datetime-local)
//   "2026-05-22T12:43:00"        (with seconds)
//   "2026-05-22T12:43:00.000Z"   (full ISO 8601)
// Anything else Date.parse can understand also passes.
const isoDate = z.string()
  .refine(s => !s || !Number.isNaN(new Date(s).getTime()), 'Invalid date format')
  .nullable()
  .optional()


const createSchema = z.object({
  projectId:        z.string(),
  subStageId:       z.string(),
  itemName:         z.string().default(''),
  shotNumber:       z.string().nullable().optional(),
  frameRange:       z.string().nullable().optional(),
  seconds:          z.number().nullable().optional(),
  assignedArtistId: z.string().nullable().optional(),
  status:           z.enum(TASK_STATUS).optional(),
  startDate:        isoDate,
  endDate:          isoDate,
  timeConsumed:     z.number().nullable().optional(),
  audioStatus:      z.enum(AUDIO_STATUS).nullable().optional(),
  finalOutput:      z.string().nullable().optional(),
  notes:            z.string().nullable().optional(),
  thumbnail:        z.string().nullable().optional(),
})

const updateSchema = createSchema.partial().extend({
  retakeNote: z.string().nullable().optional(),
})

// Include relations so the frontend can hydrate without extra round-trips
const TASK_INCLUDE = {
  statusHistory: { orderBy: { changedAt: 'asc' as const } },
  comments:      { orderBy: { createdAt: 'asc' as const } },
}

// GET /api/tasks (?projectId, ?subStageId, ?assignedArtistId)
tasksRouter.get('/', requireAuth, async (req, res) => {
  const where: Record<string, string> = {}
  if (typeof req.query.projectId        === 'string') where.projectId        = req.query.projectId
  if (typeof req.query.subStageId       === 'string') where.subStageId       = req.query.subStageId
  if (typeof req.query.assignedArtistId === 'string') where.assignedArtistId = req.query.assignedArtistId
  const tasks = await prisma.task.findMany({ where, orderBy: { createdAt: 'asc' }, include: TASK_INCLUDE })
  res.json({ tasks })
})

tasksRouter.get('/:id', requireAuth, async (req, res) => {
  const task = await prisma.task.findUnique({ where: { id: req.params.id }, include: TASK_INCLUDE })
  if (!task) return res.status(404).json({ error: 'Not found' })
  res.json({ task })
})

// POST /api/tasks — MANAGER + LEAD
tasksRouter.post('/', requireAuth, requireRole('MANAGER','LEAD'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: zodMsg(parsed.error) })
  const task = await prisma.task.create({
    data: {
      ...parsed.data,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      endDate:   parsed.data.endDate   ? new Date(parsed.data.endDate)   : null,
    },
    include: TASK_INCLUDE,
  })
  broadcast({ type: 'task.created', task })
  res.status(201).json({ task })
})

// PATCH /api/tasks/:id — any authenticated user (status transitions enforced below)
tasksRouter.patch('/:id', requireAuth, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: zodMsg(parsed.error) })
  const existing = await prisma.task.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: 'Not found' })

  // Artists can only edit their own tasks, and only certain fields.
  if (req.user!.role === 'ARTIST') {
    if (existing.assignedArtistId !== req.user!.sub) {
      return res.status(403).json({ error: 'Forbidden — not your task' })
    }
    const allowed = ['status', 'timeConsumed', 'notes', 'thumbnail', 'finalOutput', 'audioStatus']
    for (const key of Object.keys(parsed.data)) {
      if (!allowed.includes(key)) {
        return res.status(403).json({ error: `Artists cannot modify '${key}'.` })
      }
    }
    // Artists can only transition IN_PROGRESS ↔ LEAD_APPROVAL, and LEAD_RETAKE → IN_PROGRESS
    if (parsed.data.status) {
      const valid = (
        (existing.status === 'IN_PROGRESS' && parsed.data.status === 'LEAD_APPROVAL') ||
        (existing.status === 'LEAD_RETAKE' && parsed.data.status === 'IN_PROGRESS')   ||
        (existing.status === 'YET_TO_START' && parsed.data.status === 'IN_PROGRESS')
      )
      if (!valid) {
        return res.status(403).json({ error: `Artists cannot move ${existing.status} → ${parsed.data.status}.` })
      }
    }
  }

  // Build update payload
  const data: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.startDate !== undefined) {
    data.startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null
  }
  if (parsed.data.endDate !== undefined) {
    data.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null
  }
  // Record status change in history
  const statusChanged = parsed.data.status && parsed.data.status !== existing.status

  const task = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({ where: { id: req.params.id }, data })
    if (statusChanged) {
      await tx.statusChange.create({
        data: {
          taskId: updated.id,
          from:   existing.status,
          to:     parsed.data.status!,
          changedByUserId: req.user!.sub,
        },
      })
    }
    return tx.task.findUnique({ where: { id: updated.id }, include: TASK_INCLUDE })
  })

  broadcast({ type: 'task.updated', task })
  res.json({ task })
})

// DELETE /api/tasks/:id — MANAGER + LEAD
tasksRouter.delete('/:id', requireAuth, requireRole('MANAGER','LEAD'), async (req, res) => {
  await prisma.task.delete({ where: { id: req.params.id } })
  broadcast({ type: 'task.deleted', taskId: req.params.id })
  res.json({ ok: true })
})

// ─── Comments / Review ──────────────────────────────────────────────────────

const commentSchema = z.object({
  message: z.string().min(1),
  type:    z.enum(['note','retake','approval']).default('note'),
})

tasksRouter.post('/:id/comments', requireAuth, async (req, res) => {
  const parsed = commentSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: zodMsg(parsed.error) })
  const author = await prisma.employee.findUnique({ where: { id: req.user!.sub } })
  if (!author) return res.status(401).json({ error: 'User no longer exists' })
  const comment = await prisma.reviewComment.create({
    data: {
      taskId:      req.params.id,
      message:     parsed.data.message,
      type:        parsed.data.type,
      authorId:    author.id,
      authorName:  author.name,
      avatarColor: author.avatarColor ?? '#6366f1',
    },
  })
  const task = await prisma.task.findUnique({ where: { id: req.params.id }, include: TASK_INCLUDE })
  broadcast({ type: 'task.updated', task })
  res.status(201).json({ comment, task })
})
