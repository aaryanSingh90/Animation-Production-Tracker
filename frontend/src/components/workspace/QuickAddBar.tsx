import { useState } from 'react'
import { Plus, AlertCircle } from 'lucide-react'
import type { AudioStatus, StageConfig, SubStageConfig, TaskStatus } from '../../types'
import { calcSeconds, formatSeconds } from '../../utils/calcSeconds'
import { getCurrentDateTimeLocal } from '../../utils/timeTracking'
import { usePipelineStore } from '../../store/pipelineStore'
import { ArtistDropdown } from '../employees/ArtistDropdown'
import { StatusDropdown } from '../ui/StatusDropdown'
import { MIRROR_RULES } from '../../config/stageConfigs'
import { ApiError } from '../../api/client'

interface Props {
  stageConfig: StageConfig
  subStageConfig: SubStageConfig
  projectId: string
}

export function QuickAddBar({ stageConfig, subStageConfig, projectId }: Props) {
  const addTask = usePipelineStore(s => s.addTask)

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

  const seconds = frameRange ? calcSeconds(frameRange) : 0

  async function submit() {
    if (!name && !frameRange) return
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const itemName = name || frameRange
      await addTask({
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

      // Auto-mirror: propagate name + artist to all downstream pipeline stages
      // (Character Blendshapes, Unwrapping, Texturing, Rigging — per MIRROR_RULES)
      const mirrorTargets = MIRROR_RULES[subStageConfig.id]
      if (mirrorTargets) {
        await Promise.allSettled(mirrorTargets.map(targetSubStageId => addTask({
          subStageId: targetSubStageId,
          projectId,
          itemName,
          assignedArtistId: artist,
          status: 'YET_TO_START',
        })))
      }

      setName('')
      setFrameRange('')
      setArtist(null)
      setStatus('YET_TO_START')
      setAudioStatus('YET_TO_START')
      setStartDate(getCurrentDateTimeLocal())
      setEndDate('')
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
            className={`${inputCls} w-24 font-mono uppercase shrink-0`}
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
          className={`${inputCls} w-40 uppercase shrink-0`}
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
            // Auto-close the native date picker once the user picks a value.
            // Without this, the calendar lingers and they have to click outside.
            onChange={e => { setStartDate(e.target.value); e.target.blur() }}
            onKeyDown={handleKeyDown}
            className={`${inputCls} w-40 font-mono text-[11px] text-slate-300 shrink-0`}
          />
          <input
            type="datetime-local"
            value={endDate}
            onChange={e => { setEndDate(e.target.value); e.target.blur() }}
            onKeyDown={handleKeyDown}
            className={`${inputCls} w-40 font-mono text-[11px] text-slate-300 shrink-0`}
          />
        </>
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
