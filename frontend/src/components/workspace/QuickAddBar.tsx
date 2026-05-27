import { useState, useRef } from 'react'
import { Plus, AlertCircle, Film, X } from 'lucide-react'
import type { AudioStatus, StageConfig, SubStageConfig, TaskStatus } from '../../types'
import { calcSeconds, formatSeconds } from '../../utils/calcSeconds'
import { getCurrentDateTimeLocal } from '../../utils/timeTracking'
import { usePipelineStore } from '../../store/pipelineStore'
import { ArtistDropdown } from '../employees/ArtistDropdown'
import { StatusDropdown } from '../ui/StatusDropdown'
import { MIRROR_RULES } from '../../config/stageConfigs'
import { ApiError } from '../../api/client'
import { Tasks } from '../../api/endpoints'
import { clsx } from 'clsx'

interface Props {
  stageConfig: StageConfig
  subStageConfig: SubStageConfig
  projectId: string
}

export function QuickAddBar({ stageConfig, subStageConfig, projectId }: Props) {
  const addTask  = usePipelineStore(s => s.addTask)
  const addBatch = usePipelineStore(s => s.addBatch)

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

  const seconds = frameRange ? calcSeconds(frameRange) : 0

  async function submit() {
    if (!name && !frameRange) return
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const itemName = name || frameRange
      const created = await addTask({
        subStageId: subStageConfig.id,
        projectId,
        itemName,
        shotNumber:       isShot ? (name || undefined) : undefined,
        frameRange:       isShot ? (frameRange || undefined) : undefined,
        seconds:          isShot ? seconds : undefined,
        assignedArtistId: artist,
        status,
        startDate:        startDate || getCurrentDateTimeLocal(),
        endDate:          endDate || null,
        audioStatus:      isEditing ? audioStatus : undefined,
      })

      // If the user attached a video, upload it now as v1 of this task.
      if (videoFile) {
        try {
          const { task: updated } = await Tasks.uploadVersion(created.id, videoFile)
          usePipelineStore.getState().applyServerEvent({ type: 'task.updated', task: updated })
        } catch {
          setError('Shot created — but video upload failed. Upload it from the sidebar.')
        }
      }

      // Auto-mirror: propagate name + artist to all downstream pipeline stages
      // (Character Blendshapes, Unwrapping, Texturing, Rigging — per MIRROR_RULES)
      // BUG-02: Use atomic batch so all mirror tasks are created together or not at all.
      const mirrorTargets = MIRROR_RULES[subStageConfig.id]
      if (mirrorTargets) {
        await addBatch(mirrorTargets.map(targetSubStageId => ({
          subStageId:       targetSubStageId,
          projectId,
          itemName,
          assignedArtistId: artist,
          status:           'YET_TO_START' as const,
        })))
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
