import { X, MessageSquare, Send, Image as ImageIcon, CheckCircle, RotateCcw, AlertTriangle, Send as SubmitIcon, Play, Upload, Link, Download, Trash2, Film, Maximize2, Clock } from 'lucide-react'
import { useEffect, useState, useRef } from 'react'
import type { TaskRow, TaskVersion, ReviewComment } from '../../types'
import { API_URL } from '../../api/client'
import { Tasks } from '../../api/endpoints'
import { ANY_STATUS_CONFIG } from '../../types'
import { usePipelineStore } from '../../store/pipelineStore'
import { useAuthStore } from '../../store/authStore'
import { useToastStore } from '../../store/toastStore'
import { StatusDropdown } from '../ui/StatusDropdown'
import { StatusPill } from '../ui/StatusPill'
import { ArtistDropdown } from '../employees/ArtistDropdown'
import { DebouncedTextInput, DebouncedTextarea } from '../ui/DebouncedTextInput'
import { format } from 'date-fns'
import {
  formatElapsed,
  getTaskElapsedMs,
  isTimerRunning,
  toDateTimeInputValue,
} from '../../utils/timeTracking'
import { clsx } from 'clsx'

interface Props {
  task: TaskRow | null
  onClose: () => void
}

export function DetailDrawer({ task: passedTask, onClose }: Props) {
  const { updateTask, updateTaskStatus, addComment } = usePipelineStore()
  const { currentUser } = useAuthStore()
  const pushToast = useToastStore(s => s.push)

  // Always read the LIVE version of the task from the store so the drawer reflects
  // status changes / comments coming in via SSE without becoming stale. Falls
  // back to the snapshot from props if (briefly) the task hasn't loaded yet.
  const task = usePipelineStore(s =>
    passedTask ? (s.tasks.find(t => t.id === passedTask.id) ?? passedTask) : null
  )

  const [minuteTick, setMinuteTick] = useState(() => Date.now())
  const [newComment, setNewComment] = useState('')
  const [thumbUrlInput, setThumbUrlInput] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)

  // Manager retake flow state
  const [showRetakeInput, setShowRetakeInput] = useState(false)
  const [retakeReason, setRetakeReason] = useState('')

  // Single in-flight guard covering every action button (Start, Submit,
  // Approve, Send Retake, Post Note). Prevents double-submit when the user
  // double-clicks or hits Enter twice — a fast double-fire used to create
  // two identical comments / two status changes back-to-back.
  // ── Video version state ─────────────────────────────────────────────────────
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null)
  const [showUrlVersionInput, setShowUrlVersionInput] = useState(false)
  const [versionUrlInput, setVersionUrlInput]         = useState('')
  const [uploadingVersion, setUploadingVersion]       = useState(false)
  const videoRef    = useRef<HTMLVideoElement>(null)
  const versionFileRef = useRef<HTMLInputElement>(null)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)

  const [actionPending, setActionPending] = useState(false)
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (actionPending) return undefined
    setActionPending(true)
    try { return await fn() }
    finally { setActionPending(false) }
  }

  const isActiveTimer = isTimerRunning(task?.status ?? 'YET_TO_START')

  useEffect(() => {
    if (!task) return
    setThumbUrlInput(task.thumbnail ?? '')
    setShowUrlInput(false)
    setShowRetakeInput(false)
    setRetakeReason('')
    setActiveVersionId(null)
    setShowUrlVersionInput(false)
    setVersionUrlInput('')
    setIsVideoPlaying(false)

    const syncId = window.setTimeout(() => { setMinuteTick(Date.now()) }, 0)
    return () => window.clearTimeout(syncId)
  }, [task])

  useEffect(() => {
    if (!isActiveTimer) return
    // Tick every second so the live timer in the drawer shows seconds.
    const timerId = window.setInterval(() => { setMinuteTick(Date.now()) }, 1000)
    return () => window.clearInterval(timerId)
  }, [isActiveTimer, task?.id])

  // ── Soft-link: Animation tasks read versions from their Cut Shots twin ────────
  // IMPORTANT: this hook MUST be called before the early return below so that
  // the hook call count stays constant between renders (React rules of hooks).
  // It only depends on `passedTask` (a prop), so it is safe to call even when
  // `task` is null.
  const linkedCutShot = usePipelineStore(s => {
    if (!passedTask) return null
    const live = s.tasks.find(t => t.id === passedTask.id) ?? passedTask
    if (live.subStageId !== 'animation-animation' || !live.shotNumber) return null
    return s.tasks.find(t =>
      t.subStageId === 'animatics-cut-shots' &&
      t.shotNumber  === live.shotNumber &&
      t.projectId   === live.projectId
    ) ?? null
  })

  if (!task) return null

  const elapsed      = getTaskElapsedMs(task, minuteTick)
  const taskComments: ReviewComment[] = (task as any).comments || []

  // ── Role-aware flags ────────────────────────────────────────────────────────
  const isMyTask      = currentUser?.id === task.assignedArtistId
  const isManager     = currentUser?.role === 'MANAGER'
  const isArtist      = !isManager              // two-tier model: anyone not a manager
  const canReview     = isManager               // only managers approve / send retakes

  const showStartBtn     = isArtist && isMyTask && task.status === 'YET_TO_START'
  // Submit shows on both IN_PROGRESS and LEAD_RETAKE — when a retake lands,
  // the timer auto-resumes and the artist can ship the fix the moment they're
  // done. No more "Back to Work" button in between.
  const showSubmitBtn    = isArtist && isMyTask && (task.status === 'IN_PROGRESS' || task.status === 'LEAD_RETAKE')
  const showRetakeBanner = isMyTask && task.status === 'LEAD_RETAKE'
  const showReviewPanel  = canReview && task.status === 'LEAD_APPROVAL'

  // ── Actions ─────────────────────────────────────────────────────────────────
  // Every action posts a confirmation toast so the user has time to register
  // what happened, even when the inline action panel collapses immediately.
  // Each handler runs through `run()` — a single in-flight guard that
  // short-circuits a second click while the first is still pending. Stops
  // duplicate comments / duplicate status transitions from a double-click
  // or fast Enter-Enter.
  function handleStartWork() {
    void run(async () => {
      await addComment(task!.id, `${currentUser?.name?.split(' ')[0] ?? 'Artist'} started work on this task.`, 'note')
      await updateTaskStatus(task!.id, 'IN_PROGRESS')
      pushToast({ kind: 'info', title: 'Work started', body: `${task!.itemName} — timer is running`, ttl: 2500 })
    })
  }

  function handleSubmitForReview() {
    void run(async () => {
      await addComment(task!.id, 'Submitted for manager review.', 'note')
      await updateTaskStatus(task!.id, 'LEAD_APPROVAL')
      pushToast({ kind: 'review', title: 'Submitted for review', body: `${task!.itemName} is now waiting for the manager`, ttl: 2500 })
    })
  }

  // (`handleBackToWork` removed — LEAD_RETAKE now auto-resumes the timer via
  // isTimerRunning(), so the artist never needs to click "Back to Work". The
  // retake banner stays informational + the Submit button below it sends the
  // fix back for review.)

  function handleApprove() {
    void run(async () => {
      await addComment(task!.id, 'Approved.', 'approval')
      await updateTask(task!.id, { retakeNote: null, status: 'FINAL_APPROVAL' })
      pushToast({ kind: 'approval', title: 'Approved', body: `${task!.itemName} is now Final Approval`, ttl: 2500 })
    })
  }

  function handleRetakeSubmit() {
    if (!retakeReason.trim()) return
    const note = retakeReason.trim()
    void run(async () => {
      await addComment(task!.id, note, 'retake')
      await updateTask(task!.id, { retakeNote: note, status: 'LEAD_RETAKE' })
      pushToast({ kind: 'retake', title: 'Retake sent', body: `${task!.itemName} — note delivered to artist`, ttl: 2800 })
      setShowRetakeInput(false)
      setRetakeReason('')
    })
  }

  function handlePostComment() {
    if (!newComment.trim()) return
    const msg = newComment.trim()
    void run(async () => {
      await addComment(task!.id, msg, 'note')
      setNewComment('')
    })
  }

  function handleSaveThumbnailUrl() {
    updateTask(task!.id, { thumbnail: thumbUrlInput.trim() || undefined })
    setShowUrlInput(false)
  }

  // ── Video version helpers ────────────────────────────────────────────────────
  const ownVersions: TaskVersion[]  = (task as any).versions ?? []
  // If this is an Animation task with no own versions, fall back to the Cut Shots twin
  const taskVersions: TaskVersion[] = ownVersions.length > 0
    ? ownVersions
    : ((linkedCutShot as any)?.versions ?? [])

  const latestVersion = taskVersions[taskVersions.length - 1] ?? null
  const activeVersion = taskVersions.find(v => v.id === activeVersionId) ?? latestVersion

  // Label shown in section header when versions come from the linked cut-shot
  const versionsFromCutShots = ownVersions.length === 0 && taskVersions.length > 0

  function resolveVideoUrl(v: TaskVersion): string {
    if (v.videoUrl.startsWith('/uploads/')) return `${API_URL}${v.videoUrl}`
    return v.videoUrl
  }

  async function handleVersionFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !task) return
    e.target.value = ''
    setUploadingVersion(true)
    try {
      const { task: updated } = await Tasks.uploadVersion(task.id, file)
      // Directly merge into store; SSE may arrive later and will be deduplicated
      usePipelineStore.getState().applyServerEvent({ type: 'task.updated', task: updated })
      const vnum = updated.versions?.length ?? '?'
      pushToast({ kind: 'info', title: 'Version uploaded', body: `v${vnum} saved for ${updated.itemName}`, ttl: 2500 })
    } catch (err) {
      pushToast({ kind: 'error', title: 'Upload failed', body: err instanceof Error ? err.message : 'Check backend is running and try again', ttl: 5000 })
    } finally {
      setUploadingVersion(false)
    }
  }

  async function handleVersionUrlSave() {
    if (!versionUrlInput.trim() || !task) return
    setUploadingVersion(true)
    try {
      const { task: updated } = await Tasks.addVersionUrl(task.id, versionUrlInput.trim())
      usePipelineStore.getState().applyServerEvent({ type: 'task.updated', task: updated })
      const vnum = updated.versions?.length ?? '?'
      pushToast({ kind: 'info', title: 'Version added', body: `v${vnum} saved for ${updated.itemName}`, ttl: 2500 })
      setVersionUrlInput('')
      setShowUrlVersionInput(false)
    } catch (err) {
      pushToast({ kind: 'error', title: 'Failed to add version', body: err instanceof Error ? err.message : 'Please try again', ttl: 5000 })
    } finally {
      setUploadingVersion(false)
    }
  }

  async function handleDeleteVersion(versionId: string) {
    if (!task) return
    try {
      const { task: updated } = await Tasks.removeVersion(task.id, versionId)
      usePipelineStore.getState().applyServerEvent({ type: 'task.updated', task: updated })
      if (activeVersionId === versionId) setActiveVersionId(null)
      pushToast({ kind: 'info', title: 'Version deleted', ttl: 2000 })
    } catch (err) {
      pushToast({ kind: 'error', title: 'Delete failed', body: err instanceof Error ? err.message : 'Please try again', ttl: 5000 })
    }
  }

  async function handleFullscreen() {
    const vid = videoRef.current
    if (!vid) return
    try {
      await vid.requestFullscreen?.()
      // Start playing once fullscreen is entered (double-click = intent to watch)
      void vid.play()
    } catch { /* fullscreen blocked on some devices — ignore */ }
  }

  /**
   * Fetch-based download so cross-origin `/uploads/` files actually save instead
   * of opening a new blank tab (the `download` attribute is ignored for cross-origin
   * URLs in all major browsers).
   */
  async function downloadVersion(v: TaskVersion) {
    const url = resolveVideoUrl(v)
    if (v.videoUrl.startsWith('/uploads/')) {
      try {
        const resp = await fetch(url, { credentials: 'include' })
        const blob = await resp.blob()
        const ext  = v.videoUrl.split('.').pop() ?? 'mp4'
        const blobUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href     = blobUrl
        a.download = `${task?.itemName ?? 'shot'}-v${v.versionNum}.${ext}`
        a.click()
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000)
      } catch (err) {
        pushToast({ kind: 'error', title: 'Download failed', body: err instanceof Error ? err.message : 'Try again', ttl: 4000 })
      }
    } else {
      // External URL — open in a new tab (normal browser behaviour)
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && e.ctrlKey) handlePostComment()
  }

  const commentTypeStyle: Record<string, string> = {
    retake:   'border-l-rose-500/60 bg-rose-500/5',
    approval: 'border-l-emerald-500/60 bg-emerald-500/5',
    note:     'border-l-indigo-500/40 bg-[#0d1424]',
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-[420px] lg:w-96 max-w-full bg-[#080d1a]/95 backdrop-blur-md shadow-2xl border-l border-[#1a263e] flex flex-col animate-in slide-in-from-right duration-200 text-slate-100">

      {/* Drawer Header */}
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[#1a263e] bg-[#050810]/50">
        <div className="flex-1 min-w-0">
          {/* Editable task name — read-only for artists, debounced commit for managers.
              No uppercase transform — display matches what the user typed. */}
          {isArtist ? (
            <div className="text-sm font-black tracking-wide text-white truncate">{task.itemName}</div>
          ) : (
            <DebouncedTextInput
              value={task.itemName}
              onCommit={v => updateTask(task.id, { itemName: v })}
              placeholder="Untitled task"
              className="w-full text-sm font-black tracking-wide text-white bg-transparent border border-transparent hover:border-[#1a263e] focus:border-indigo-500 focus:bg-[#0a0f1b] rounded px-1.5 py-1 -mx-1.5 -my-1 focus:outline-none transition-colors"
            />
          )}
          {task.shotNumber && (
            <div className="text-[10px] text-indigo-400 font-mono font-bold mt-1 uppercase flex items-center gap-1.5 flex-wrap">
              <span>Shot {task.shotNumber}</span>
              {task.frameRange && (
                <>
                  <span className="text-slate-700">·</span>
                  <span>Frames {task.frameRange}</span>
                </>
              )}
              {task.seconds != null && (
                <>
                  <span className="text-slate-700">·</span>
                  <span>{task.seconds.toFixed(1)}s</span>
                </>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close task details"
          title="Close"
          className="p-1.5 rounded-md hover:bg-[#131b2e] text-slate-400 hover:text-white transition-colors border border-transparent hover:border-[#1a263e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* ── Retake Alert (Artist sees this) ───────────────────────────────── */}
        {/* Timer is already ticking on LEAD_RETAKE — no "Back to Work" button
            needed. The artist reads the note, fixes the issue, then hits the
            "Submit for Review" button below this banner. */}
        {showRetakeBanner && task.retakeNote && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3.5 space-y-2.5">
            <div className="flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 animate-pulse" />
                <span className="text-[10px] font-black text-rose-400 uppercase tracking-wider">Retake — Timer Running</span>
              </div>
              <span className="text-[9px] font-bold text-rose-300/80 uppercase tracking-wider">Submit when fixed ↓</span>
            </div>
            <p className="text-xs text-rose-300 leading-relaxed border-l-2 border-rose-500/50 pl-2.5">
              {task.retakeNote}
            </p>
          </div>
        )}

        {/* ── Start Work (Artist on a fresh task) ──────────────────────────── */}
        {showStartBtn && (
          <button
            onClick={handleStartWork}
            disabled={actionPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 rounded-lg transition-all shadow-lg shadow-amber-950/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-3.5 h-3.5" /> {actionPending ? 'Starting…' : 'Start Work'}
          </button>
        )}

        {/* ── Submit for Review (Artist in-progress task) ──────────────────── */}
        {showSubmitBtn && (
          <button
            onClick={handleSubmitForReview}
            disabled={actionPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 rounded-lg transition-all shadow-lg shadow-sky-950/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SubmitIcon className="w-3.5 h-3.5" /> {actionPending ? 'Submitting…' : 'Submit for Review'}
          </button>
        )}

        {/* ── Manager / Lead Review Panel ───────────────────────────────────── */}
        {showReviewPanel && (
          <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3.5 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="text-[10px] font-black text-sky-400 uppercase tracking-wider">Pending Your Review</span>
            </div>

            {!showRetakeInput ? (
              <div className="flex gap-2">
                <button
                  onClick={handleApprove}
                  disabled={actionPending}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white bg-emerald-600/80 hover:bg-emerald-600 rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="w-3 h-3" /> {actionPending ? 'Approving…' : 'Approve'}
                </button>
                <button
                  onClick={() => setShowRetakeInput(true)}
                  disabled={actionPending}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white bg-rose-600/70 hover:bg-rose-600 rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-3 h-3" /> Request Retake
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={retakeReason}
                  onChange={e => setRetakeReason(e.target.value)}
                  placeholder="Describe what needs to be fixed..."
                  rows={3}
                  autoFocus
                  className="w-full px-3 py-2 text-xs border border-rose-500/30 rounded-md bg-[#0a0f1b] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-rose-500 resize-none transition-colors"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleRetakeSubmit}
                    disabled={!retakeReason.trim() || actionPending}
                    className="flex-1 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white bg-rose-600/80 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-all"
                  >
                    {actionPending ? 'Sending…' : 'Send Retake'}
                  </button>
                  <button
                    onClick={() => { setShowRetakeInput(false); setRetakeReason('') }}
                    className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 border border-[#1b253b] rounded-md transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Thumbnail Panel ───────────────────────────────────────────────── */}
        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Canvas & Storyboard</label>
          <div className="relative group w-full h-44 bg-slate-950 border border-[#1b253b] rounded-lg overflow-hidden flex items-center justify-center shadow-lg">
            {task.thumbnail ? (
              <img src={task.thumbnail} className="w-full h-full object-cover" alt="" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-500">
                <ImageIcon className="w-8 h-8 opacity-40 text-indigo-500 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-wider">No Storyboard Loaded</span>
              </div>
            )}
            <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setShowUrlInput(!showUrlInput)}
                className="bg-slate-900/90 hover:bg-indigo-600 text-white text-[9px] font-bold uppercase px-2 py-1 rounded border border-[#1b253b] transition-all"
              >
                {showUrlInput ? 'CLOSE' : 'PASTE URL'}
              </button>
            </div>
          </div>

          {showUrlInput && (
            <div className="flex gap-1.5 p-2 bg-[#0d1424] border border-[#1b253b] rounded-md animate-in fade-in duration-100">
              <input
                value={thumbUrlInput}
                onChange={e => setThumbUrlInput(e.target.value)}
                placeholder="Paste Image Web URL..."
                className="flex-1 px-2.5 py-1 text-xs border border-[#1a263e] rounded bg-[#070a13] text-white focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleSaveThumbnailUrl}
                className="px-2.5 py-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded transition-all"
              >
                SAVE
              </button>
            </div>
          )}
        </div>

        {/* ── Video Player & Version History ───────────────────────────────── */}
        <div className="space-y-3 border-t border-[#1b253b] pt-4">

          {/* Section header + upload controls */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <Film className="w-3.5 h-3.5 text-indigo-400" />
              Video Versions {taskVersions.length > 0 && <span className="text-indigo-400">({taskVersions.length})</span>}
              {versionsFromCutShots && (
                <span className="text-[8px] font-black text-indigo-500/70 border border-indigo-500/30 px-1 py-0.5 rounded uppercase tracking-wider">
                  via cut shots
                </span>
              )}
            </label>

            {/* Upload controls — managers always, artists only on their own task */}
            {(isManager || isMyTask) && (
              <div className="flex items-center gap-1.5">
                {uploadingVersion && (
                  <span className="text-[9px] font-bold text-indigo-400 animate-pulse uppercase tracking-wider">Uploading…</span>
                )}
                <button
                  onClick={() => versionFileRef.current?.click()}
                  disabled={uploadingVersion}
                  title="Upload video file"
                  className="flex items-center gap-1 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-slate-300 hover:text-white border border-[#1b253b] hover:border-indigo-500/50 bg-[#0a0f1b] hover:bg-indigo-600/20 rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Upload className="w-3 h-3" /> Upload
                </button>
                <button
                  onClick={() => setShowUrlVersionInput(p => !p)}
                  disabled={uploadingVersion}
                  title="Add video by URL"
                  className={clsx(
                    "p-1 rounded border transition-all",
                    showUrlVersionInput
                      ? "border-indigo-500/60 bg-indigo-600/20 text-indigo-400"
                      : "border-[#1b253b] bg-[#0a0f1b] text-slate-400 hover:text-white hover:border-indigo-500/40"
                  )}
                >
                  <Link className="w-3.5 h-3.5" />
                </button>
                {/* Hidden file input */}
                <input
                  ref={versionFileRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleVersionFileUpload}
                />
              </div>
            )}
          </div>

          {/* URL paste row */}
          {showUrlVersionInput && (
            <div className="flex gap-1.5 p-2 bg-[#0d1424] border border-[#1b253b] rounded-md animate-in fade-in duration-100">
              <input
                value={versionUrlInput}
                onChange={e => setVersionUrlInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleVersionUrlSave() }}
                placeholder="Paste direct video URL (mp4, mov…)"
                className="flex-1 px-2.5 py-1 text-xs border border-[#1a263e] rounded bg-[#070a13] text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleVersionUrlSave}
                disabled={uploadingVersion || !versionUrlInput.trim()}
                className="px-2.5 py-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-all"
              >
                SAVE
              </button>
            </div>
          )}

          {/* ── Active version player ── */}
          {activeVersion ? (
            <div className="space-y-2">
              <div className="relative rounded-lg overflow-hidden bg-black border border-[#1b253b] shadow-lg">
                <video
                  ref={videoRef}
                  key={activeVersion.id}
                  src={resolveVideoUrl(activeVersion)}
                  controls
                  onPlay={() => setIsVideoPlaying(true)}
                  onPause={() => setIsVideoPlaying(false)}
                  onEnded={() => setIsVideoPlaying(false)}
                  onDoubleClick={handleFullscreen}
                  className="w-full max-h-52 object-contain"
                />
                {/* Big play overlay — visible when paused so a single click plays;
                    disappears when playing so native controls (scrubber etc.) are fully
                    accessible. Double-click also enters fullscreen. */}
                {!isVideoPlaying && (
                  <div
                    onClick={() => void videoRef.current?.play()}
                    onDoubleClick={handleFullscreen}
                    className="absolute inset-0 flex items-center justify-center cursor-pointer"
                  >
                    <div className="w-12 h-12 rounded-full bg-black/55 border border-white/25 flex items-center justify-center hover:bg-black/75 transition-colors">
                      <Play className="w-6 h-6 text-white ml-0.5" />
                    </div>
                  </div>
                )}
                {/* Corner action buttons */}
                <div className="absolute bottom-2 right-2 flex gap-1.5 z-10">
                  <button
                    onClick={handleFullscreen}
                    title="Fullscreen"
                    className="bg-black/70 hover:bg-indigo-600 text-white p-1 rounded transition-all"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => void downloadVersion(activeVersion)}
                    title="Download this version"
                    className="bg-black/70 hover:bg-emerald-600 text-white p-1 rounded transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {/* Version meta */}
              <div className="text-center text-[9px] font-bold text-slate-500 font-mono uppercase tracking-wider">
                v{activeVersion.versionNum}
                {' · '}
                {activeVersion.uploadedByName}
                {' · '}
                {format(new Date(activeVersion.createdAt), 'MMM d, yyyy')}
              </div>
            </div>
          ) : (
            /* Empty state — shown when there are no versions yet */
            <div className="flex flex-col items-center gap-2 py-7 text-slate-500 border border-dashed border-[#1b253b] rounded-lg">
              <Film className="w-7 h-7 opacity-25" />
              <span className="text-[10px] font-bold uppercase tracking-wider">No video versions yet</span>
              {(isManager || isMyTask) && (
                <span className="text-[9px] text-slate-600">Use Upload or paste a URL above</span>
              )}
            </div>
          )}

          {/* ── Version history list ── */}
          {taskVersions.length > 0 && (
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
              <div className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-1">All versions (newest first)</div>
              {[...taskVersions].reverse().map(v => (
                <div
                  key={v.id}
                  onClick={() => setActiveVersionId(v.id)}
                  className={clsx(
                    "flex items-center gap-2.5 px-2.5 py-2 rounded-md border cursor-pointer transition-all",
                    v.id === (activeVersion?.id)
                      ? "border-indigo-500/50 bg-indigo-500/10"
                      : "border-[#1b253b] bg-[#090f1d] hover:border-indigo-500/30 hover:bg-[#0d1424]"
                  )}
                >
                  {/* Version badge */}
                  <span className="text-[10px] font-black text-indigo-400 font-mono shrink-0 w-7">
                    v{v.versionNum}
                  </span>
                  {/* Uploader + date */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-semibold text-slate-300 truncate">{v.uploadedByName}</div>
                    <div className="text-[8px] font-bold text-slate-500 font-mono">
                      {format(new Date(v.createdAt), 'MMM d · h:mm a')}
                    </div>
                  </div>
                  {/* Action buttons */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); void downloadVersion(v) }}
                      title="Download"
                      className="p-1.5 text-slate-500 hover:text-emerald-400 transition-colors rounded hover:bg-emerald-500/10"
                    >
                      <Download className="w-3 h-3" />
                    </button>
                    {isManager && (
                      <button
                        onClick={e => { e.stopPropagation(); void handleDeleteVersion(v.id) }}
                        title="Delete version"
                        className="p-1.5 text-slate-600 hover:text-rose-400 transition-colors rounded hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Status ────────────────────────────────────────────────────────── */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Stage Pipeline Status</label>
          {isArtist ? (
            // Artists move tasks via Start / Submit / Back-to-Work buttons — never via dropdown
            <StatusPill status={task.status} />
          ) : (
            <StatusDropdown
              value={task.status}
              onChange={s => updateTaskStatus(task.id, s)}
            />
          )}
        </div>

        {/* ── Assigned Artist ───────────────────────────────────────────────── */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Assigned Artist</label>
          <ArtistDropdown
            value={task.assignedArtistId}
            onChange={id => updateTask(task.id, { assignedArtistId: id })}
            readOnly={isArtist}
          />
        </div>

        {/* ── Dates ─────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Start Date</label>
            {isArtist ? (
              <div className="w-full px-2.5 py-1.5 text-xs border border-[#1b253b] rounded-md bg-[#0a0f1b] text-slate-300 font-mono">
                {task.startDate ? task.startDate.replace('T', ' ').slice(0, 16) : '—'}
              </div>
            ) : (
              <input
                type="datetime-local"
                value={toDateTimeInputValue(task.startDate)}
                // Auto-close the calendar after pick
                onChange={e => { updateTask(task.id, { startDate: e.target.value || null }); e.target.blur() }}
                className="w-full px-2.5 py-1.5 text-xs border border-[#1b253b] rounded-md bg-[#0a0f1b] text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
              />
            )}
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">End Date</label>
            {isArtist ? (
              <div className="w-full px-2.5 py-1.5 text-xs border border-[#1b253b] rounded-md bg-[#0a0f1b] text-slate-300 font-mono">
                {task.endDate ? task.endDate.replace('T', ' ').slice(0, 16) : '—'}
              </div>
            ) : (
              <input
                type="datetime-local"
                value={toDateTimeInputValue(task.endDate)}
                // Auto-close the calendar after pick
                onChange={e => { updateTask(task.id, { endDate: e.target.value || null }); e.target.blur() }}
                className="w-full px-2.5 py-1.5 text-xs border border-[#1b253b] rounded-md bg-[#0a0f1b] text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
              />
            )}
          </div>
        </div>

        {/* ── Time Consumed ─────────────────────────────────────────────────── */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Logged Time Track</label>
          <div className={clsx(
            "w-full px-3 py-2 text-xs border border-[#1b253b] rounded-md font-mono font-black text-center tracking-wider",
            isActiveTimer ? "text-indigo-400 bg-indigo-500/5 animate-pulse border-indigo-500/30" : "text-slate-300 bg-[#070a13]"
          )}>
            ⏱ {formatElapsed(elapsed)}
          </div>
        </div>

        {/* ── Editing Stage Extras (audio + final output) ───────────────────── */}
        {task.subStageId === 'editing-editing' && (
          <div className="space-y-4 border-t border-[#1b253b] pt-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Sound Track Audio</label>
              <StatusDropdown
                mode="audio"
                value={task.audioStatus ?? 'YET_TO_START'}
                onChange={s => updateTask(task.id, { audioStatus: s })}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Final Cut Output Link</label>
              <DebouncedTextInput
                value={task.finalOutput ?? ''}
                onCommit={v => updateTask(task.id, { finalOutput: v })}
                placeholder="Link to file server or render cloud..."
                className="w-full px-2.5 py-1.5 text-xs border border-[#1b253b] rounded-md bg-[#0a0f1b] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>
        )}

        {/* ── Notes ─────────────────────────────────────────────────────────── */}
        <div className="space-y-3 border-t border-[#1b253b] pt-4">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Project Notes</label>
          <DebouncedTextarea
            value={task.notes ?? ''}
            onCommit={v => updateTask(task.id, { notes: v })}
            rows={3}
            placeholder="Studio brief, description outline..."
            className="w-full px-3 py-2 text-xs border border-[#1b253b] rounded-md bg-[#0a0f1b] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none transition-colors"
          />
        </div>

        {/* ── Dailies Review Feed ───────────────────────────────────────────── */}
        <div className="space-y-4 border-t border-[#1b253b] pt-4">
          <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
            <span>Dailies Feedback Loop ({taskComments.length})</span>
          </div>

          {/* Comment input */}
          <div className="flex flex-col gap-2 p-2 bg-[#090f1d] border border-[#1a253e] rounded-lg">
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write feedback/note... (Ctrl+Enter to post)"
              rows={2}
              className="w-full bg-transparent border-0 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-0 resize-none"
            />
            <div className="flex justify-between items-center border-t border-[#1a253e] pt-2">
              <span className="text-[8px] font-semibold text-slate-500 uppercase">
                {currentUser?.name ?? 'Guest'} · {currentUser?.role ?? '—'}
              </span>
              <button
                onClick={handlePostComment}
                disabled={actionPending || !newComment.trim()}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-black uppercase text-white bg-indigo-600 hover:bg-indigo-500 rounded transition-all shadow shadow-indigo-950 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-3 h-3" /> Post Note
              </button>
            </div>
          </div>

          {/* Comments list */}
          {taskComments.length > 0 && (
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {[...taskComments].reverse().map((cmt) => {
                const style = commentTypeStyle[(cmt as any).type ?? 'note'] ?? commentTypeStyle['note']
                return (
                  <div
                    key={cmt.id}
                    className={`p-2.5 border border-l-2 border-[#1b253b] rounded-lg space-y-1.5 animate-in fade-in duration-150 ${style}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[8px] font-black text-white"
                          style={{ backgroundColor: cmt.avatarColor }}
                        >
                          {cmt.authorName[0]}
                        </span>
                        <span className="text-[10px] font-black text-indigo-400">{cmt.authorName}</span>
                        {(cmt as any).type === 'retake' && (
                          <span className="text-[8px] font-black text-rose-400 uppercase border border-rose-500/30 px-1 rounded">RETAKE</span>
                        )}
                        {(cmt as any).type === 'approval' && (
                          <span className="text-[8px] font-black text-emerald-400 uppercase border border-emerald-500/30 px-1 rounded">APPROVED</span>
                        )}
                      </div>
                      <span className="text-[8px] font-bold text-slate-500 font-mono">
                        {format(new Date(cmt.createdAt), 'MMM d · h:mm a')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed font-medium pl-5">{cmt.message}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Status History ────────────────────────────────────────────────── */}
        {task.statusHistory.length > 0 && (
          <div className="space-y-3 border-t border-[#1b253b] pt-4">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status History Log</label>
            <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
              {[...task.statusHistory].reverse().map((h, i) => (
                <div key={i} className="flex items-start gap-2 bg-[#090f1d] border border-[#151f33] p-1.5 rounded">
                  <Clock className="w-3 h-3 text-slate-500 mt-0.5 shrink-0" />
                  <div className="text-[10px] font-semibold text-slate-400">
                    <span className="text-slate-300">{(ANY_STATUS_CONFIG[h.from] ?? { label: h.from }).label}</span>
                    {' → '}
                    <span className="text-indigo-400">{(ANY_STATUS_CONFIG[h.to] ?? { label: h.to }).label}</span>
                    <div className="text-[8px] text-slate-500 font-mono mt-0.5">
                      {format(new Date(h.changedAt), 'MMM d, yyyy · h:mm a')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-[#1a263e] bg-[#050810]/80 text-[9px] font-bold text-slate-400 tracking-wider uppercase font-mono text-center">
        UPDATED {format(new Date(task.updatedAt), 'MMM d, yyyy · h:mm a')}
        {currentUser && <span className="ml-2 text-indigo-500/60">· {currentUser.name}</span>}
      </div>
    </div>
  )
}
