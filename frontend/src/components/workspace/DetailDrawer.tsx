import { X, Clock, MessageSquare, Send, Image as ImageIcon, CheckCircle, RotateCcw, AlertTriangle, Send as SubmitIcon, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { TaskRow, ReviewComment } from '../../types'
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

  const isActiveTimer = isTimerRunning(task?.status ?? 'YET_TO_START')

  useEffect(() => {
    if (!task) return
    setThumbUrlInput(task.thumbnail ?? '')
    setShowUrlInput(false)
    setShowRetakeInput(false)
    setRetakeReason('')

    const syncId = window.setTimeout(() => { setMinuteTick(Date.now()) }, 0)
    return () => window.clearTimeout(syncId)
  }, [task])

  useEffect(() => {
    if (!isActiveTimer) return
    // Tick every second so the live timer in the drawer shows seconds.
    const timerId = window.setInterval(() => { setMinuteTick(Date.now()) }, 1000)
    return () => window.clearInterval(timerId)
  }, [isActiveTimer, task?.id])

  if (!task) return null

  const elapsed      = getTaskElapsedMs(task, minuteTick)
  const taskComments: ReviewComment[] = (task as any).comments || []

  // ── Role-aware flags ────────────────────────────────────────────────────────
  const isMyTask      = currentUser?.id === task.assignedArtistId
  const isManager     = currentUser?.role === 'MANAGER'
  const isArtist      = !isManager              // two-tier model: anyone not a manager
  const canReview     = isManager               // only managers approve / send retakes

  const showStartBtn     = isArtist && isMyTask && task.status === 'YET_TO_START'
  const showSubmitBtn    = isArtist && isMyTask && task.status === 'IN_PROGRESS'
  const showRetakeBanner = isMyTask && task.status === 'LEAD_RETAKE'
  const showReviewPanel  = canReview && task.status === 'LEAD_APPROVAL'

  // ── Actions ─────────────────────────────────────────────────────────────────
  // Every action posts a confirmation toast so the user has time to register
  // what happened, even when the inline action panel collapses immediately.
  async function handleStartWork() {
    await addComment(task!.id, `${currentUser?.name?.split(' ')[0] ?? 'Artist'} started work on this task.`, 'note')
    await updateTaskStatus(task!.id, 'IN_PROGRESS')
    pushToast({ kind: 'info', title: 'Work started', body: `${task!.itemName} — timer is running`, ttl: 2500 })
  }

  async function handleSubmitForReview() {
    await addComment(task!.id, 'Submitted for manager review.', 'note')
    await updateTaskStatus(task!.id, 'LEAD_APPROVAL')
    pushToast({ kind: 'review', title: 'Submitted for review', body: `${task!.itemName} is now waiting for the manager`, ttl: 2500 })
  }

  async function handleBackToWork() {
    const note = task!.status === 'LEAD_RETAKE'
      ? `Resumed work after retake — ${currentUser?.name?.split(' ')[0] ?? 'artist'} is on it.`
      : `Picked up — ${currentUser?.name?.split(' ')[0] ?? 'artist'} started work.`
    await addComment(task!.id, note, 'note')
    await updateTaskStatus(task!.id, 'IN_PROGRESS')
    pushToast({ kind: 'info', title: 'Back to work', body: `${task!.itemName} — timer resumed`, ttl: 2500 })
  }

  async function handleApprove() {
    await addComment(task!.id, 'Approved.', 'approval')
    await updateTask(task!.id, { retakeNote: null, status: 'FINAL_APPROVAL' })
    pushToast({ kind: 'approval', title: 'Approved', body: `${task!.itemName} is now Final Approval`, ttl: 2500 })
  }

  async function handleRetakeSubmit() {
    if (!retakeReason.trim()) return
    const note = retakeReason.trim()
    await addComment(task!.id, note, 'retake')
    await updateTask(task!.id, { retakeNote: note, status: 'LEAD_RETAKE' })
    pushToast({ kind: 'retake', title: 'Retake sent', body: `${task!.itemName} — note delivered to artist`, ttl: 2800 })
    setShowRetakeInput(false)
    setRetakeReason('')
  }

  async function handlePostComment() {
    if (!newComment.trim()) return
    await addComment(task!.id, newComment.trim(), 'note')
    setNewComment('')
  }

  function handleSaveThumbnailUrl() {
    updateTask(task!.id, { thumbnail: thumbUrlInput.trim() || undefined })
    setShowUrlInput(false)
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
    <div className="fixed inset-y-0 right-0 z-40 w-96 bg-[#080d1a]/95 backdrop-blur-md shadow-2xl border-l border-[#1a263e] flex flex-col animate-in slide-in-from-right duration-200 text-slate-100">

      {/* Drawer Header */}
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[#1a263e] bg-[#050810]/50">
        <div className="flex-1 min-w-0">
          {/* Editable task name — read-only for artists, debounced commit for managers */}
          {isArtist ? (
            <div className="text-sm font-black tracking-wide text-white uppercase truncate">{task.itemName}</div>
          ) : (
            <DebouncedTextInput
              value={task.itemName}
              onCommit={v => updateTask(task.id, { itemName: v })}
              placeholder="Untitled task"
              className="w-full text-sm font-black tracking-wide text-white uppercase bg-transparent border border-transparent hover:border-[#1a263e] focus:border-indigo-500 focus:bg-[#0a0f1b] rounded px-1.5 py-1 -mx-1.5 -my-1 focus:outline-none transition-colors"
            />
          )}
          {task.shotNumber && (
            <div className="text-[10px] text-indigo-400 font-mono font-bold mt-1 uppercase">
              {task.frameRange} · {task.seconds != null ? task.seconds.toFixed(1) : '—'}s frame range
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-[#131b2e] text-slate-400 hover:text-white transition-colors border border-transparent hover:border-[#1a263e]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* ── Retake Alert (Artist sees this) ───────────────────────────────── */}
        {showRetakeBanner && task.retakeNote && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3.5 space-y-2.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span className="text-[10px] font-black text-rose-400 uppercase tracking-wider">Retake Requested</span>
            </div>
            <p className="text-xs text-rose-300 leading-relaxed border-l-2 border-rose-500/50 pl-2.5">
              {task.retakeNote}
            </p>
            <button
              onClick={handleBackToWork}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white bg-rose-600/80 hover:bg-rose-600 rounded-md transition-all"
            >
              <RotateCcw className="w-3 h-3" /> Back to Work
            </button>
          </div>
        )}

        {/* ── Start Work (Artist on a fresh task) ──────────────────────────── */}
        {showStartBtn && (
          <button
            onClick={handleStartWork}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 rounded-lg transition-all shadow-lg shadow-amber-950/40"
          >
            <Play className="w-3.5 h-3.5" /> Start Work
          </button>
        )}

        {/* ── Submit for Review (Artist in-progress task) ──────────────────── */}
        {showSubmitBtn && (
          <button
            onClick={handleSubmitForReview}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 rounded-lg transition-all shadow-lg shadow-sky-950/40"
          >
            <SubmitIcon className="w-3.5 h-3.5" /> Submit for Review
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
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white bg-emerald-600/80 hover:bg-emerald-600 rounded-md transition-all"
                >
                  <CheckCircle className="w-3 h-3" /> Approve
                </button>
                <button
                  onClick={() => setShowRetakeInput(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white bg-rose-600/70 hover:bg-rose-600 rounded-md transition-all"
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
                    disabled={!retakeReason.trim()}
                    className="flex-1 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white bg-rose-600/80 hover:bg-rose-600 disabled:opacity-40 rounded-md transition-all"
                  >
                    Send Retake
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
                className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-black uppercase text-white bg-indigo-600 hover:bg-indigo-500 rounded transition-all shadow shadow-indigo-950"
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
