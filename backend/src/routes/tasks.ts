import { Router } from 'express'
import { z } from 'zod'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireAuthStrict, requireRole } from '../middleware/auth.js'
import { broadcast } from '../lib/sse.js'
import { zodMsg } from '../lib/zodMsg.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── File upload (multer) ────────────────────────────────────────────────────
// UPLOADS_DIR can be overridden via env var so that on Render we use the
// persistent disk mount (/opt/render/project/uploads) rather than the
// ephemeral build directory (which is wiped on every redeploy).
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '..', '..', 'uploads')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname)
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
    cb(null, name)
  },
})

// BUG-09: reject non-video/image files server-side (browser accept= is just a hint)
function videoFilter(_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (file.mimetype.startsWith('video/') || file.mimetype.startsWith('image/')) {
    cb(null, true)
  } else {
    cb(new Error('Only video and image files are allowed.'))
  }
}

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB max
  fileFilter: videoFilter,
})

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
  versions:      { orderBy: { versionNum: 'asc' as const } },
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

// POST /api/tasks — managers only
tasksRouter.post('/', requireAuth, requireRole('MANAGER'), async (req, res) => {
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

// PATCH /api/tasks/:id — BUG-12: use strict auth so deactivated/password-changed
// users are rejected immediately instead of continuing for up to 1h on the old token
tasksRouter.patch('/:id', requireAuthStrict, async (req, res) => {
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
    // Allowed artist transitions:
    //   • YET_TO_START → IN_PROGRESS  (Start Work)
    //   • IN_PROGRESS  → LEAD_APPROVAL (Submit for Review)
    //   • LEAD_RETAKE  → LEAD_APPROVAL (Submit for Review — retake auto-resumes
    //                                   the timer so the artist goes straight
    //                                   to Submit, no Back-to-Work step)
    //   • LEAD_RETAKE  → IN_PROGRESS   (back-compat: older clients may still
    //                                   send this path)
    if (parsed.data.status) {
      const valid = (
        (existing.status === 'YET_TO_START' && parsed.data.status === 'IN_PROGRESS')   ||
        (existing.status === 'IN_PROGRESS'  && parsed.data.status === 'LEAD_APPROVAL') ||
        (existing.status === 'LEAD_RETAKE'  && parsed.data.status === 'LEAD_APPROVAL') ||
        (existing.status === 'LEAD_RETAKE'  && parsed.data.status === 'IN_PROGRESS')
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

// DELETE /api/tasks/:id — managers only
tasksRouter.delete('/:id', requireAuth, requireRole('MANAGER'), async (req, res) => {
  await prisma.task.delete({ where: { id: req.params.id } })
  broadcast({ type: 'task.deleted', taskId: req.params.id })
  res.json({ ok: true })
})

// ─── Comments / Review ──────────────────────────────────────────────────────

const commentSchema = z.object({
  message: z.string().min(1),
  type:    z.enum(['note','retake','approval']).default('note'),
})

tasksRouter.post('/:id/comments', requireAuthStrict, async (req, res) => {
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

// ─── Video Versions ─────────────────────────────────────────────────────────

/**
 * POST /api/tasks/:id/versions
 *   • multipart/form-data field "video" → uploads file to /uploads/, creates version
 *   • application/json { videoUrl: string }  → stores external URL as version
 * Both paths auto-increment versionNum and broadcast task.updated.
 */
tasksRouter.post('/:id/versions', requireAuthStrict, upload.single('video'), async (req, res) => {
  const taskId = req.params.id

  // Verify task exists
  const existing = await prisma.task.findUnique({ where: { id: taskId } })
  if (!existing) return res.status(404).json({ error: 'Task not found' })

  // Resolve video URL
  let videoUrl: string
  if (req.file) {
    // File uploaded — build a server-relative URL the frontend can use
    videoUrl = `/uploads/${req.file.filename}`
  } else if (typeof req.body?.videoUrl === 'string' && req.body.videoUrl.trim()) {
    videoUrl = req.body.videoUrl.trim()
  } else {
    return res.status(400).json({ error: 'Provide a video file or videoUrl.' })
  }

  // Get uploader info
  const uploader = await prisma.employee.findUnique({ where: { id: req.user!.sub } })
  const uploaderName = uploader?.name ?? 'Unknown'

  // Next version number
  const count = await prisma.taskVersion.count({ where: { taskId } })
  const versionNum = count + 1

  // BUG-03: if the DB write fails after the file was saved, delete the orphaned
  // file so it doesn't accumulate on disk with no DB record
  try {
    await prisma.taskVersion.create({
      data: { taskId, versionNum, videoUrl, uploadedByName: uploaderName, uploadedById: req.user!.sub },
    })
  } catch (err) {
    if (req.file) {
      const filePath = path.join(uploadsDir, req.file.filename)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }
    throw err // re-throw so the global error handler sends a 500
  }

  const task = await prisma.task.findUnique({ where: { id: taskId }, include: TASK_INCLUDE })
  broadcast({ type: 'task.updated', task })
  res.status(201).json({ task })
})

/**
 * DELETE /api/tasks/:id/versions/:versionId — managers only
 * Removes the version record and deletes the file from disk if it is a local upload.
 */
tasksRouter.delete('/:id/versions/:versionId', requireAuth, requireRole('MANAGER'), async (req, res) => {
  const version = await prisma.taskVersion.findUnique({ where: { id: req.params.versionId } })
  if (!version) return res.status(404).json({ error: 'Version not found' })

  // Delete file from disk if it was a local upload
  if (version.videoUrl.startsWith('/uploads/')) {
    const filePath = path.join(uploadsDir, path.basename(version.videoUrl))
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  }

  await prisma.taskVersion.delete({ where: { id: version.id } })
  const task = await prisma.task.findUnique({ where: { id: req.params.id }, include: TASK_INCLUDE })
  broadcast({ type: 'task.updated', task })
  res.json({ ok: true, task })
})

// ─── BUG-02: Batch task creation (atomic mirror tasks) ──────────────────────
/**
 * POST /api/tasks/batch — MANAGER only
 * Creates multiple tasks in a single Prisma transaction.
 * Used for character auto-mirroring: Modelling → Blendshapes, Rigging,
 * Unwrapping, Texturing. All succeed or all fail — no partial state.
 */
const batchCreateSchema = z.array(createSchema).min(1).max(20)

tasksRouter.post('/batch', requireAuth, requireRole('MANAGER'), async (req, res) => {
  const parsed = batchCreateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: zodMsg(parsed.error) })

  const tasks = await prisma.$transaction(
    parsed.data.map(item =>
      prisma.task.create({
        data: {
          ...item,
          startDate: item.startDate ? new Date(item.startDate) : null,
          endDate:   item.endDate   ? new Date(item.endDate)   : null,
        },
        include: TASK_INCLUDE,
      })
    )
  )

  for (const task of tasks) {
    broadcast({ type: 'task.created', task })
  }
  res.status(201).json({ tasks })
})
