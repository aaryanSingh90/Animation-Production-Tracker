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
import { MIRROR_RULES } from '../lib/mirrorRules.js'

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

// BUG-09 / BUG-16: reject non-video/image files server-side. Both the browser
// `accept=` attribute and the multipart `mimetype` are client-controlled and
// trivially spoofable, so we ALSO require a known-good file extension. Disk
// storage streams the bytes straight to disk (no buffer to magic-byte sniff in
// the filter), so extension + mimetype is the right defense-in-depth here.
const ALLOWED_UPLOAD_EXTS = new Set([
  '.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v', '.ogv', '.m4p',  // video
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp',        // image
])
function videoFilter(_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const ext    = path.extname(file.originalname).toLowerCase()
  const mimeOk = file.mimetype.startsWith('video/') || file.mimetype.startsWith('image/')
  if (mimeOk && ALLOWED_UPLOAD_EXTS.has(ext)) {
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
  audioHistory:  { orderBy: { changedAt: 'asc' as const } },
  comments:      { orderBy: { createdAt: 'asc' as const } },
  versions:      { orderBy: { versionNum: 'asc' as const } },
}

// ── Authorization + workflow helpers ─────────────────────────────────────────

/** ARTIST and FREELANCE are "restricted": they may only see / act on tasks
 *  assigned to them. MANAGER and LEAD have studio-wide visibility. */
function isRestrictedRole(role: string): boolean {
  return role === 'ARTIST' || role === 'FREELANCE'
}

/** Parse a "start-end" frame range into an INCLUSIVE frame count.
 *  Returns null when the string isn't a clean numeric range; 0 for a
 *  degenerate/placeholder range (0-0 or end < start). Mirrors the frontend
 *  utils/calcSeconds so client and server agree on the math. */
function framesInRange(frameRange: string | null | undefined): number | null {
  if (!frameRange) return null
  const parts = frameRange.split('-').map(s => parseInt(s.trim(), 10))
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null
  const [start, end] = parts
  if (start === 0 && end === 0) return 0          // BUG-40: "0-0" is a placeholder, not a 1-frame shot
  const frames = end - start + 1
  return frames > 0 ? frames : 0                  // BUG-40: end < start → 0, never negative
}

/** Pure math: seconds for a frame range at a given fps, or `fallback` when the
 *  string isn't a clean numeric range (non-shot stages, free-text, etc.). */
function secondsFromFrameRange(
  frameRange: string | null | undefined,
  fps: number,
  fallback: number | null | undefined,
): number | null {
  const frames = framesInRange(frameRange)
  if (frames === null) return fallback ?? null
  return frames / (fps > 0 ? fps : 24)
}

/** BUG-14: server-authoritative seconds. If a frame range is present, derive
 *  seconds from the project's REAL frame-rate (never trust the client value);
 *  otherwise fall back to the supplied value (non-shot stages have no range). */
async function resolveSeconds(
  projectId: string,
  frameRange: string | null | undefined,
  fallback: number | null | undefined,
): Promise<number | null> {
  if (!frameRange) return fallback ?? null
  const project = await prisma.project.findUnique({
    where: { id: projectId }, select: { frameRate: true },
  })
  const fps = project?.frameRate && project.frameRate > 0 ? project.frameRate : 24
  return secondsFromFrameRange(frameRange, fps, fallback)
}

/** Remove a multer-saved upload from disk. Used when we bail out before/after
 *  the DB write so rejected/orphaned files don't accumulate on disk. */
function cleanupUpload(file: Express.Multer.File | undefined): void {
  if (!file) return
  const p = path.join(uploadsDir, file.filename)
  if (fs.existsSync(p)) fs.unlinkSync(p)
}

// GET /api/tasks (?projectId, ?subStageId, ?assignedArtistId)
tasksRouter.get('/', requireAuth, async (req, res) => {
  const where: Record<string, string> = {}
  if (typeof req.query.projectId        === 'string') where.projectId        = req.query.projectId
  if (typeof req.query.subStageId       === 'string') where.subStageId       = req.query.subStageId
  if (typeof req.query.assignedArtistId === 'string') where.assignedArtistId = req.query.assignedArtistId
  // BUG-30 (IDOR): artists/freelancers may ONLY ever see their own tasks,
  // regardless of any assignedArtistId filter they try to pass. Managers and
  // leads keep studio-wide visibility.
  if (isRestrictedRole(req.user!.role)) {
    where.assignedArtistId = req.user!.sub
  }
  const tasks = await prisma.task.findMany({ where, orderBy: { createdAt: 'asc' }, include: TASK_INCLUDE })
  res.json({ tasks })
})

tasksRouter.get('/:id', requireAuth, async (req, res) => {
  const task = await prisma.task.findUnique({ where: { id: req.params.id }, include: TASK_INCLUDE })
  if (!task) return res.status(404).json({ error: 'Not found' })
  // BUG-30 (IDOR): a restricted user can only fetch a task assigned to them.
  if (isRestrictedRole(req.user!.role) && task.assignedArtistId !== req.user!.sub) {
    return res.status(403).json({ error: 'Forbidden — not your task' })
  }
  res.json({ task })
})

// POST /api/tasks — managers only
tasksRouter.post('/', requireAuth, requireRole('MANAGER'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: zodMsg(parsed.error) })
  // BUG-14: recompute seconds from frameRange × the project's real frameRate.
  const seconds = await resolveSeconds(parsed.data.projectId, parsed.data.frameRange, parsed.data.seconds)
  const task = await prisma.task.create({
    data: {
      ...parsed.data,
      seconds,
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

  // BUG-11 / BUG-20: role-based field + transition authorization. The OLD code
  // restricted ARTIST only and let every other non-manager role (LEAD,
  // FREELANCE, …) fall through with FULL edit rights — a privilege-escalation
  // hole. This is now default-deny: a role we don't explicitly handle is
  // rejected.
  const role = req.user!.role
  const editedFields = Object.keys(parsed.data)

  if (role === 'MANAGER') {
    // Managers have full edit rights — no field or transition restrictions.
  } else if (role === 'LEAD') {
    // Leads REVIEW work: change status (review transitions only), leave a
    // retake note, edit notes, and adjust audio status. They cannot reassign
    // artists, rename items, move dates, or edit frame ranges/seconds.
    const allowed = ['status', 'retakeNote', 'notes', 'audioStatus']
    for (const key of editedFields) {
      if (!allowed.includes(key)) {
        return res.status(403).json({ error: `Leads cannot modify '${key}'.` })
      }
    }
    if (parsed.data.status) {
      const valid = (
        (existing.status === 'LEAD_APPROVAL'  && parsed.data.status === 'DONE')          ||
        (existing.status === 'LEAD_APPROVAL'  && parsed.data.status === 'LEAD_RETAKE')    ||
        (existing.status === 'LEAD_APPROVAL'  && parsed.data.status === 'FINAL_APPROVAL') ||
        (existing.status === 'FINAL_APPROVAL' && parsed.data.status === 'DONE')           ||
        (existing.status === 'FINAL_APPROVAL' && parsed.data.status === 'LEAD_RETAKE')    ||
        // Re-open an approved task for another retake round.
        (existing.status === 'DONE'           && parsed.data.status === 'LEAD_RETAKE')
      )
      if (!valid) {
        return res.status(403).json({ error: `Leads cannot move ${existing.status} → ${parsed.data.status}.` })
      }
    }
  } else if (isRestrictedRole(role)) {
    // ARTIST / FREELANCE — own task only, narrow field + transition allow-list.
    if (existing.assignedArtistId !== req.user!.sub) {
      return res.status(403).json({ error: 'Forbidden — not your task' })
    }
    const allowed = ['status', 'timeConsumed', 'notes', 'thumbnail', 'finalOutput', 'audioStatus']
    for (const key of editedFields) {
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
  } else {
    // Unknown / unhandled role → default-deny.
    return res.status(403).json({ error: 'Forbidden — role not allowed' })
  }

  // Build update payload
  const data: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.startDate !== undefined) {
    data.startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null
  }
  if (parsed.data.endDate !== undefined) {
    data.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null
  }
  // BUG-14: when the frame range changes, recompute seconds from the project's
  // frame-rate rather than trusting any client-supplied seconds.
  if (parsed.data.frameRange !== undefined) {
    data.seconds = await resolveSeconds(existing.projectId, parsed.data.frameRange, parsed.data.seconds)
  }

  // Record status / audio-status changes in their audit trails.
  const statusChanged = parsed.data.status && parsed.data.status !== existing.status
  // BUG-21: audio-status changes now get an audit trail of their own.
  const audioChanged  = parsed.data.audioStatus !== undefined
    && parsed.data.audioStatus !== existing.audioStatus

  // BUG-07: renaming a mirror SOURCE task (e.g. Modelling Character) must
  // propagate to its auto-mirrored copies (Blendshapes/Unwrapping/Texturing/
  // Rigging) so the linked rows don't drift apart. Only managers can change
  // itemName, so this only ever fires for trusted edits.
  const mirrorTargets = MIRROR_RULES[existing.subStageId]
  const renaming = mirrorTargets !== undefined
    && !!existing.itemName
    && parsed.data.itemName !== undefined
    && parsed.data.itemName !== existing.itemName

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
    if (audioChanged) {
      await tx.audioChange.create({
        data: {
          taskId: updated.id,
          from:   existing.audioStatus,
          to:     parsed.data.audioStatus ?? null,
          changedByUserId: req.user!.sub,
        },
      })
    }
    if (renaming) {
      await tx.task.updateMany({
        where: {
          projectId:  existing.projectId,
          itemName:   existing.itemName,
          subStageId: { in: mirrorTargets! },
        },
        data: { itemName: parsed.data.itemName! },
      })
    }
    return tx.task.findUnique({ where: { id: updated.id }, include: TASK_INCLUDE })
  })

  broadcast({ type: 'task.updated', task })

  // BUG-07: push the renamed mirror copies to every client too, so open
  // dashboards on the downstream stages refresh in real time.
  if (renaming) {
    const siblings = await prisma.task.findMany({
      where: {
        projectId:  existing.projectId,
        itemName:   parsed.data.itemName!,
        subStageId: { in: mirrorTargets! },
      },
      include: TASK_INCLUDE,
    })
    for (const sibling of siblings) broadcast({ type: 'task.updated', task: sibling })
  }
  res.json({ task })
})

// DELETE /api/tasks/:id — managers only
tasksRouter.delete('/:id', requireAuth, requireRole('MANAGER'), async (req, res) => {
  const existing = await prisma.task.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: 'Not found' })

  // BUG-07: when deleting a mirror SOURCE task, also remove its auto-mirrored
  // copies — but ONLY the ones still untouched (not started, no versions, no
  // comments). This cleans up "created by mistake" assets without silently
  // destroying real downstream work that already has progress.
  const idsToDelete = [existing.id]
  const mirrorTargets = MIRROR_RULES[existing.subStageId]
  if (mirrorTargets && existing.itemName) {
    const pristineSiblings = await prisma.task.findMany({
      where: {
        projectId:  existing.projectId,
        itemName:   existing.itemName,
        subStageId: { in: mirrorTargets },
        status:     'YET_TO_START',
        versions:   { none: {} },
        comments:   { none: {} },
      },
      select: { id: true },
    })
    idsToDelete.push(...pristineSiblings.map(s => s.id))
  }

  await prisma.task.deleteMany({ where: { id: { in: idsToDelete } } })
  for (const id of idsToDelete) broadcast({ type: 'task.deleted', taskId: id })
  res.json({ ok: true, deletedIds: idsToDelete })
})

// ─── Comments / Review ──────────────────────────────────────────────────────

const commentSchema = z.object({
  message: z.string().min(1),
  type:    z.enum(['note','retake','approval']).default('note'),
})

tasksRouter.post('/:id/comments', requireAuthStrict, async (req, res) => {
  const parsed = commentSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: zodMsg(parsed.error) })

  // BUG-13: verify the task exists FIRST. Otherwise the FK insert below throws
  // a Prisma P2003 that surfaces to the client as a confusing 500.
  const existing = await prisma.task.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: 'Task not found' })

  // BUG-12: only managers and leads may post 'approval' / 'retake' review
  // comments — these drive the review workflow. Artists/freelancers can leave
  // plain notes only, and only on a task assigned to them.
  const role = req.user!.role
  if ((parsed.data.type === 'approval' || parsed.data.type === 'retake') && !(role === 'MANAGER' || role === 'LEAD')) {
    return res.status(403).json({ error: `Only managers and leads can post '${parsed.data.type}' comments.` })
  }
  if (isRestrictedRole(role) && existing.assignedArtistId !== req.user!.sub) {
    return res.status(403).json({ error: 'Forbidden — not your task' })
  }

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
  // BUG-10: the task may have been deleted between the insert and this refetch
  // — only broadcast when it's actually present.
  if (task) broadcast({ type: 'task.updated', task })
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

  // Verify task exists. multer has already streamed the upload to disk by now,
  // so clean it up on every early bail-out to avoid orphaned files.
  const existing = await prisma.task.findUnique({ where: { id: taskId } })
  if (!existing) {
    cleanupUpload(req.file)
    return res.status(404).json({ error: 'Task not found' })
  }

  // BUG-15: artists/freelancers may only upload versions to their OWN task.
  if (isRestrictedRole(req.user!.role) && existing.assignedArtistId !== req.user!.sub) {
    cleanupUpload(req.file)
    return res.status(403).json({ error: 'Forbidden — not your task' })
  }

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
    cleanupUpload(req.file)   // BUG-03: don't leave an orphaned file if the DB write fails
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

  // BUG-14: recompute each row's seconds from its project's frame-rate. Cache
  // the frame-rate per project so a 20-row batch makes at most one lookup per
  // distinct project rather than one per row.
  const frameRates = new Map<string, number>()
  for (const item of parsed.data) {
    if (item.frameRange && !frameRates.has(item.projectId)) {
      const project = await prisma.project.findUnique({
        where: { id: item.projectId }, select: { frameRate: true },
      })
      frameRates.set(item.projectId, project?.frameRate && project.frameRate > 0 ? project.frameRate : 24)
    }
  }

  const tasks = await prisma.$transaction(
    parsed.data.map(item =>
      prisma.task.create({
        data: {
          ...item,
          seconds:   secondsFromFrameRange(item.frameRange, frameRates.get(item.projectId) ?? 24, item.seconds),
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
