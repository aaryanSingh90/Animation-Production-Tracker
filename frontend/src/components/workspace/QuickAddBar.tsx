import { useState, useRef } from 'react'
import { Plus, AlertCircle, Film, X } from 'lucide-react'
import type { AudioStatus, StageConfig, SubStageConfig, TaskStatus } from '../../types'
import { calcSeconds, formatSeconds } from '../../utils/calcSeconds'
import { getCurrentDateTimeLocal } from '../../utils/timeTracking'
import { usePipelineStore } from '../../store/pipelineStore'
import { useClientStore } from '../../store/clientStore'
import { ArtistDropdown } from '../employees/ArtistDropdown'
import { StatusDropdown } from '../ui/StatusDropdown'
import { MIRROR_RULES } from '../../config/stageConfigs'
import { ApiError } from '../../api/client'
import { Tasks, type TaskCreate } from '../../api/endpoints'
import { clsx } from 'clsx'

// BUG-3: reject nonsensical frame ranges before we create a shot. Returns a
// user-facing message, or null when the range is valid. Mirrors the duration
// rules in calcSeconds / the backend's framesInRange.
function validateFrameRange(range: string): string | null {
  const parts = range.split('-').map(s => parseInt(s.trim(), 10))
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
    return 'Frame range must look like 101-124.'
  }
  const [start, end] = parts
  if (start < 0 || end < 0) return 'Frame numbers cannot be negative.'
  if (end < start) return 'End frame must be ≥ start frame.'
  return null
}

interface Props {
  stageConfig: StageConfig
  subStageConfig: SubStageConfig
  projectId: string
}

export function QuickAddBar({ stageConfig, subStageConfig, projectId }: Props) {
  const addBatch = usePipelineStore(s => s.addBatch)

  // BUG-2/BUG-40: derive seconds from THIS project's frame rate, not a hardcoded 24.
  const project = useClientStore(s => s.projects.find(p => p.id === projectId))
  const fps = project?.frameRate && project.frameRate > 0 ? project.frameRate : 24

  // Shot-based if SHOT workflow OR the Cut Shots sub-stage inside Animatics
  const isShot = stageConfig.workflowType === 'SHOT' || subStageConfig.slug === 'cut-shots'
  const isEditing = stageConfig.id === 'editing'

  const [name, setName] = useState('')
  const [frameRange, setFrameRange] = useState('')
  const [artist, setArtist] = useState<string | null>(null)
  const [status, setStatus] = useState<TaskStatus>('YET_TO_START')
  const [audioStatus, setAudioStatus] = useState<AudioStatus>('YET_TO_START')
  const [startDate, setStartDate] = useState(() => getCurrentDateTimeLocal())
  const [endDate, setEndDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const videoFileRef = useRef<HTMLInputElement>(null)

  const seconds = frameRange ? calcSeconds(frameRange, fps) : 0

  async function submit() {
    if (submitting) return
    // BUG-3: trim before validating/creating so " Asset " and stray whitespace
    // don't produce mismatched mirror rows or sneak past the empty-input guard.
    const trimmedName  = name.trim()
    const trimmedRange = frameRange.trim()
    if (!trimmedName && !trimmedRange) return

    // BUG-3: validate the frame range up front — never persist a shot whose
    // duration would silently zero out (end < start, negatives, garbage).
    if (isShot && trimmedRange) {
      const rangeErr = validateFrameRange(trimmedRange)
      if (rangeErr) { setError(rangeErr); return }
    }

    setSubmitting(true)
    setError(null)
    try {
      const itemName = trimmedName || trimmedRange
      const computedSeconds = isShot && trimmedRange ? calcSeconds(trimmedRange, fps) : 0

      // BUG-5: create the parent row AND its auto-mirror copies in ONE atomic
      // batch. Previously the parent was a standalone create() followed by a
      // separate batch() for the mirrors, so a failure between the two left an
      // orphaned parent with no downstream rows. Now it's all-or-nothing.
      // The parent is always element 0, so the batch result's [0] is the row we
      // attach any uploaded video to.
      const mirrorTargets = MIRROR_RULES[subStageConfig.id] ?? []
      const items: TaskCreate[] = [
        {
          subStageId:       subStageConfig.id,
          projectId,
          itemName,
          shotNumber:       isShot ? (trimmedName || undefined) : undefined,
          frameRange:       isShot ? (trimmedRange || undefined) : undefined,
          seconds:          isShot ? computedSeconds : undefined,
          assignedArtistId: artist,
          status,
          startDate:        startDate || getCurrentDateTimeLocal(),
          endDate:          endDate || null,
          audioStatus:      isEditing ? audioStatus : undefined,
        },
        ...mirrorTargets.map<TaskCreate>(targetSubStageId => ({
          subStageId:       targetSubStageId,
          projectId,
          itemName,
          assignedArtistId: artist,
          status:           'YET_TO_START' as const,
        })),
      ]

      const createdTasks = await addBatch(items)
      const created = createdTasks[0]

      // If the user attached a video, upload it now as v1 of the parent task.
      if (videoFile && created) {
        try {
          const { task: updated } = await Tasks.uploadVersion(created.id, videoFile)
          usePipelineStore.getState().applyServerEvent({ type: 'task.updated', task: updated })
        } catch {
          setError('Shot created — but video upload failed. Upload it from the sidebar.')
        }
      }

      setName('')
      setFrameRange('')
      setArtist(null)
      setStatus('YET_TO_START')
      setAudioStatus('YET_TO_START')
      setStartDate(getCurrentDateTimeLocal())
      setEndDate('')
      setVideoFile(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create task — check connection.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') submit()
  }

  const inputCls = 'px-3 py-1.5 text-xs font-semibold tracking-wide border border-[#1b253b] rounded-md bg-[#0a0f1b] hover:border-slate-700 focus:border-indigo-500 focus:outline-none text-slate-100 placeholder-slate-500 transition-all'
  const isCutShots = subStageConfig.slug === 'cut-shots'

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-[#0c1221] border-b border-[#1b253b] overflow-x-auto whitespace-nowrap">
      {isShot ? (
        <>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="SHOT NO."
            // No uppercase transform — what the user types is what gets saved
            // and rendered in the row. The placeholder stays uppercase because
            // the literal text is already capitalised.
            className={`${inputCls} w-24 font-mono shrink-0`}
          />
          <input
            value={frameRange}
            onChange={e => setFrameRange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="101-124"
            className={`${inputCls} w-24 font-mono shrink-0`}
          />
          <div className="px-2.5 py-1.5 text-xs font-black text-indigo-400 w-14 text-center border border-[#1b253b] rounded-md bg-[#080d17] font-mono shrink-0">
            {seconds > 0 ? formatSeconds(seconds) : '—'}
          </div>
        </>
      ) : (
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={stageConfig.id === 'audio' ? 'AUDIO NAME…' : 'ASSET NAME…'}
          // No uppercase transform — what the user types is what gets saved
          // and rendered in the row.
          className={`${inputCls} w-40 shrink-0`}
        />
      )}

      <div className="shrink-0"><ArtistDropdown value={artist} onChange={setArtist} /></div>
      <div className="shrink-0"><StatusDropdown value={status} onChange={setStatus} compact /></div>

      {/* Editing: Audio status inline */}
      {isEditing && (
        <div className="flex items-center gap-1.5 border border-[#1b253b] bg-[#080d17] px-2 py-0.5 rounded-md shrink-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Audio:</span>
          <StatusDropdown mode="audio" value={audioStatus} onChange={setAudioStatus} compact />
        </div>
      )}

      {!isCutShots && (
        <>
          <input
            type="datetime-local"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            onKeyDown={handleKeyDown}
            className={`${inputCls} w-40 font-mono text-[11px] text-slate-300 shrink-0`}
          />
          <input
            type="datetime-local"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            onKeyDown={handleKeyDown}
            className={`${inputCls} w-40 font-mono text-[11px] text-slate-300 shrink-0`}
          />
        </>
      )}

      {/* Video attach — shown on all shot-based stages (optional) */}
      {isShot && (
        <div className="flex items-center gap-1 shrink-0">
          <input
            ref={videoFileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={e => { setVideoFile(e.target.files?.[0] ?? null); e.target.value = '' }}
          />
          <button
            type="button"
            onClick={() => videoFileRef.current?.click()}
            disabled={submitting}
            title={videoFile ? videoFile.name : 'Attach a video to this shot (optional)'}
            className={clsx(
              'flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md border transition-all disabled:opacity-40 disabled:cursor-not-allowed',
              videoFile
                ? 'border-indigo-500/60 bg-indigo-600/20 text-indigo-300'
                : 'border-[#1b253b] bg-[#0a0f1b] text-slate-400 hover:text-white hover:border-indigo-500/40'
            )}
          >
            <Film className="w-3.5 h-3.5 shrink-0" />
            {videoFile
              ? <span className="max-w-[72px] truncate">{videoFile.name}</span>
              : <span>Video</span>
            }
          </button>
          {videoFile && (
            <button
              type="button"
              onClick={() => setVideoFile(null)}
              title="Remove video"
              className="p-1 text-slate-500 hover:text-rose-400 transition-colors rounded"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      <button
        onClick={submit}
        disabled={submitting}
        className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold tracking-wider uppercase text-white bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 rounded-md transition-all shadow-md shadow-indigo-950/40 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
      >
        <Plus className="w-3.5 h-3.5" /> {submitting ? 'CREATING…' : 'CREATE'}
      </button>
      {error && (
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-400 ml-2 shrink-0">
          <AlertCircle className="w-3 h-3" /> {error}
        </div>
      )}
    </div>
  )
}
