import { useRef, useState, useCallback } from 'react'
import { Upload, X, Check, AlertCircle, Film } from 'lucide-react'
import { usePipelineStore } from '../../store/pipelineStore'
import { useClientStore } from '../../store/clientStore'
import { Tasks, type TaskCreate } from '../../api/endpoints'
import { ApiError } from '../../api/client'
import type { SubStageConfig } from '../../types'

// ── Mirror target ─────────────────────────────────────────────────────────────
// Every cut-shot row is also copied to Animation with the same
// shot number, frame range, and thumbnail.
const ANIMATION_SUB_STAGE_ID = 'animation-animation'

// ── Helpers ───────────────────────────────────────────────────────────────────


/**
 * Load a video file, seek to near the start, and return:
 *   - duration (seconds, raw float)
 *   - thumbnail (base64 JPEG data-URL, 320 × proportional)
 */
function extractVideoMeta(file: File): Promise<{ duration: number; thumbnail: string }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const url   = URL.createObjectURL(file)
    video.src         = url
    video.muted       = true
    video.playsInline = true
    video.preload     = 'metadata'

    video.onloadedmetadata = () => {
      // seek to 10 % of duration (≤ 2 s) to get a representative frame
      video.currentTime = Math.min(video.duration * 0.1, 2)
    }

    video.onseeked = () => {
      try {
        const W  = 320
        const H  = video.videoHeight
          ? Math.round(W * video.videoHeight / (video.videoWidth || 1))
          : 180
        const canvas = document.createElement('canvas')
        canvas.width  = W
        canvas.height = H
        canvas.getContext('2d')!.drawImage(video, 0, 0, W, H)
        const thumbnail = canvas.toDataURL('image/jpeg', 0.72)
        URL.revokeObjectURL(url)
        resolve({ duration: video.duration, thumbnail })
      } catch (e) {
        URL.revokeObjectURL(url)
        reject(e)
      }
    }

    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Cannot read "${file.name}"`))
    }

    video.load()
  })
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface VideoItem {
  /** Stable local key for list rendering */
  uid:        string
  file:       File
  shotNumber: string
  frameRange: string
  seconds:    number
  thumbnail:  string
}

interface Props {
  projectId:       string
  subStageConfig:  SubStageConfig
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BulkVideoUpload({ projectId, subStageConfig }: Props) {
  const addBatch = usePipelineStore(s => s.addBatch)
  // Count tasks already committed to the DB for this sub-stage so that
  // new uploads continue from the right shot number (e.g. if 001–004 exist
  // the next batch starts at 005, not 001).
  const committedCount = usePipelineStore(s =>
    s.tasks.filter(t => t.projectId === projectId && t.subStageId === subStageConfig.id).length
  )
  // BUG-2/BUG-40: derive the frame range from THIS project's frame rate, not 24.
  const project = useClientStore(s => s.projects.find(p => p.id === projectId))
  const fps = project?.frameRate && project.frameRate > 0 ? project.frameRate : 24
  const fileRef = useRef<HTMLInputElement>(null)

  const [items,      setItems]      = useState<VideoItem[]>([])
  const [processing, setProcessing] = useState(false)
  const [creating,   setCreating]   = useState(false)
  const [dragOver,   setDragOver]   = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // ── File processing ────────────────────────────────────────────────────────

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter(f => f.type.startsWith('video/'))
    if (!list.length) return

    setProcessing(true)
    setError(null)
    const next: VideoItem[] = []
    const failed: string[]  = []

    // Sequential shot numbers:
    //   committedCount = tasks already saved to DB for this sub-stage
    //   items.length   = items already in this preview (not yet submitted)
    // Together they tell us where the next shot number should start.
    // e.g. 4 existing shots in DB + 0 in preview → first new shot = 005
    //      4 existing shots in DB + 3 in preview  → next new shot  = 008
    const seqOffset = committedCount + items.length

    for (let i = 0; i < list.length; i++) {
      const file = list[i]
      try {
        const { duration, thumbnail } = await extractVideoMeta(file)
        const totalFrames = Math.max(1, Math.round(duration * fps))
        const startFrame  = 101
        next.push({
          uid:        `${Date.now()}-${Math.random()}`,
          file,
          shotNumber: String(seqOffset + next.length + 1).padStart(3, '0'),
          frameRange: `${startFrame}-${startFrame + totalFrames - 1}`,
          seconds:    Math.round(duration * 10) / 10,
          thumbnail,
        })
      } catch {
        failed.push(file.name)
      }
    }

    setItems(prev => [...prev, ...next])
    if (failed.length) setError(`Skipped (unreadable): ${failed.join(', ')}`)
    setProcessing(false)
  }, [committedCount, items.length, fps])

  // ── Drag & drop ────────────────────────────────────────────────────────────

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }
  function handleDragLeave() { setDragOver(false) }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files)
  }

  // ── Edits / removes ────────────────────────────────────────────────────────

  function updateShot(uid: string, val: string) {
    setItems(prev => prev.map(it => it.uid === uid ? { ...it, shotNumber: val } : it))
  }
  function removeItem(uid: string) {
    setItems(prev => prev.filter(it => it.uid !== uid))
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async function createAll() {
    if (!items.length || creating) return

    // BUG-38: validate shot numbers BEFORE creating anything. The partial unique
    // index on (projectId, subStageId, shotNumber) would otherwise reject a
    // collision mid-flight and leave a confusing partial result.
    const trimmedShots = items.map(it => it.shotNumber.trim())
    if (trimmedShots.some(s => !s)) {
      setError('Every shot needs a shot number before creating.')
      return
    }
    const seen = new Set<string>()
    const internalDupes = new Set<string>()
    for (const s of trimmedShots) {
      if (seen.has(s)) internalDupes.add(s)
      else seen.add(s)
    }
    if (internalDupes.size) {
      setError(`Duplicate shot numbers in this batch: ${[...internalDupes].join(', ')}. Make them unique.`)
      return
    }

    setCreating(true)
    setError(null)
    let versionErrors = 0
    let mirrorSkipped = 0
    try {
      // Refresh cut-shot + Animation rows for this project so the duplicate and
      // existing-mirror checks below see the latest server state.
      await Promise.all([
        usePipelineStore.getState().loadForSubStage(projectId, subStageConfig.id),
        usePipelineStore.getState().loadForSubStage(projectId, ANIMATION_SUB_STAGE_ID),
      ])
      const allTasks = usePipelineStore.getState().tasks

      // BUG-38: reject shot numbers that already exist as cut shots in this stage.
      const existingCutShots = new Set(
        allTasks
          .filter(t => t.projectId === projectId && t.subStageId === subStageConfig.id && t.shotNumber)
          .map(t => t.shotNumber as string)
      )
      const dbDupes = [...new Set(trimmedShots.filter(s => existingCutShots.has(s)))]
      if (dbDupes.length) {
        setError(`These shot numbers already exist in this stage: ${dbDupes.join(', ')}. Remove or rename them, then retry.`)
        return
      }

      // Track which Animation mirrors already exist so we don't violate the
      // partial unique index. The soft-link needs only ONE animation row per shot.
      const existingAnimShots = new Set(
        allTasks
          .filter(t => t.projectId === projectId && t.subStageId === ANIMATION_SUB_STAGE_ID && t.shotNumber)
          .map(t => t.shotNumber as string)
      )

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const shot = trimmedShots[i]
        const base = {
          projectId,
          itemName:   shot,
          shotNumber: shot,
          frameRange: item.frameRange,
          seconds:    item.seconds,
          status:     'YET_TO_START' as const,
        }

        // BUG-6: create the cut-shot row AND its Animation mirror together in ONE
        // atomic batch, so we can never end up with a cut shot that has no
        // downstream Animation twin (the old code created them with two separate
        // requests — a failure between them left an orphaned cut shot).
        const rows: TaskCreate[] = [{ ...base, subStageId: subStageConfig.id, thumbnail: item.thumbnail }]
        const needsMirror = !existingAnimShots.has(shot)
        if (needsMirror) rows.push({ ...base, subStageId: ANIMATION_SUB_STAGE_ID, thumbnail: null })
        else mirrorSkipped++

        const created = await addBatch(rows)
        existingAnimShots.add(shot)          // guard against a repeat later in this run
        const cutTask = created[0]           // element 0 is always the cut-shot row

        // BUG-6: upload the animatic video AFTER the rows exist. Best-effort —
        // if it fails the rows still exist and the user can retry from the drawer.
        try {
          const { task: updated } = await Tasks.uploadVersion(cutTask.id, item.file)
          usePipelineStore.getState().applyServerEvent({ type: 'task.updated', task: updated })
        } catch {
          versionErrors++
        }
      }

      setItems([])
      const messages: string[] = []
      if (versionErrors > 0) messages.push(`${versionErrors} video upload(s) failed — retry via the task drawer`)
      if (mirrorSkipped > 0) messages.push(`${mirrorSkipped} animation mirror(s) already existed — skipped`)
      if (messages.length > 0) setError(messages.join(' · '))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create some tasks.')
    } finally {
      setCreating(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasItems = items.length > 0

  return (
    <div className="border-t border-[#1a263e] bg-[#07090f]">

      {/* ── Upload trigger row ─────────────────────────────────────────────── */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          flex items-center gap-3 px-4 py-2.5 transition-colors
          ${dragOver ? 'bg-indigo-500/10 border-indigo-500/40' : ''}
        `}
      >
        <button
          onClick={() => fileRef.current?.click()}
          disabled={processing || creating}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider
            text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30
            rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          <Upload className="w-3.5 h-3.5" />
          {processing ? 'Reading videos…' : 'Bulk Upload Videos'}
        </button>

        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
          {dragOver
            ? 'Drop to add videos'
            : 'or drag & drop · auto-extracts shot no, frame range & thumbnail'}
        </span>

        <input
          ref={fileRef}
          type="file"
          multiple
          accept="video/*"
          className="hidden"
          onChange={e => {
            if (e.target.files?.length) {
              processFiles(e.target.files)
              e.target.value = ''   // allow re-selecting same files
            }
          }}
        />
      </div>

      {/* ── Preview table ──────────────────────────────────────────────────── */}
      {hasItems && (
        <div className="px-4 pb-4">

          <div className="rounded-xl border border-[#1b253b] overflow-hidden mb-3">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="bg-[#0c1221] border-b border-[#1b253b]">
                  <th className="px-3 py-2 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider w-20">Thumb</th>
                  <th className="px-3 py-2 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider w-32">Shot No.</th>
                  <th className="px-3 py-2 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider w-28">Frame Range</th>
                  <th className="px-3 py-2 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider w-20">Seconds</th>
                  <th className="px-3 py-2 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider">File</th>
                  <th className="px-3 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.uid} className="border-b border-[#141d2f] last:border-0 hover:bg-[#0a0f1b]/60 transition-colors">

                    {/* Thumbnail */}
                    <td className="px-3 py-2">
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt=""
                          className="w-16 h-9 object-cover rounded border border-[#1b253b]"
                        />
                      ) : (
                        <div className="w-16 h-9 flex items-center justify-center rounded border border-[#1b253b] bg-[#0d1424]">
                          <Film className="w-4 h-4 text-slate-700" />
                        </div>
                      )}
                    </td>

                    {/* Shot number — editable */}
                    <td className="px-3 py-2">
                      <input
                        value={item.shotNumber}
                        onChange={e => updateShot(item.uid, e.target.value)}
                        className="px-2 py-1 w-24 font-mono text-xs bg-[#0d1424] border border-[#1b253b]
                          rounded text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </td>

                    {/* Frame range */}
                    <td className="px-3 py-2 font-mono text-slate-300">{item.frameRange}</td>

                    {/* Seconds */}
                    <td className="px-3 py-2 font-mono text-slate-300">{item.seconds}s</td>

                    {/* Filename */}
                    <td className="px-3 py-2 text-slate-500 truncate max-w-[240px]" title={item.file.name}>
                      {item.file.name}
                    </td>

                    {/* Remove */}
                    <td className="px-3 py-2">
                      <button
                        onClick={() => removeItem(item.uid)}
                        disabled={creating}
                        className="text-slate-700 hover:text-rose-400 transition-colors disabled:opacity-30"
                        title="Remove"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action row */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={createAll}
              disabled={creating}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider
                text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check className="w-3.5 h-3.5" />
              {creating
                ? 'Uploading videos…'
                : `Create ${items.length} Shot${items.length !== 1 ? 's' : ''}`}
            </button>

            <button
              onClick={() => { setItems([]); setError(null) }}
              disabled={creating}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500
                hover:text-slate-300 border border-[#1b253b] rounded-lg transition-colors
                disabled:opacity-40"
            >
              Clear
            </button>

            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
              Also mirrors to Animation
            </span>

            {error && (
              <div className="flex items-center gap-1 text-[11px] font-bold text-amber-400 ml-auto">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
