import { useState, useRef } from 'react'
import { Plus } from 'lucide-react'
import type { StageConfig, SubStageConfig, TaskRow, TaskStatus } from '../../types'
import { calcSeconds } from '../../utils/calcSeconds'
import { usePipelineStore } from '../../store/pipelineStore'
import { ArtistDropdown } from '../employees/ArtistDropdown'
import { StatusDropdown } from '../ui/StatusDropdown'

function newId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

interface Props {
  stageConfig: StageConfig
  subStageConfig: SubStageConfig
  projectId: string
}

export function QuickAddBar({ stageConfig, subStageConfig, projectId }: Props) {
  const addTask = usePipelineStore(s => s.addTask)
  const isShot = stageConfig.workflowType === 'SHOT' || subStageConfig.slug === 'cut-shots'

  const [name, setName] = useState('')
  const [frameRange, setFrameRange] = useState('')
  const [artist, setArtist] = useState<string | null>(null)
  const [status, setStatus] = useState<TaskStatus>('NOT_STARTED')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const seconds = frameRange ? calcSeconds(frameRange) : 0

  function submit() {
    if (!name && !frameRange) return
    const task: TaskRow = {
      id: newId(),
      subStageId: subStageConfig.id,
      projectId,
      itemName: name || frameRange,
      shotNumber: isShot ? name || undefined : undefined,
      frameRange: isShot ? frameRange || undefined : undefined,
      seconds: isShot ? seconds : undefined,
      assignedArtistId: artist,
      status,
      startDate: startDate || null,
      endDate: endDate || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      statusHistory: [],
    }
    addTask(task)
    setName('')
    setFrameRange('')
    setArtist(null)
    setStatus('NOT_STARTED')
    setStartDate('')
    setEndDate('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') submit()
  }

  const inputCls = 'px-2 py-1.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex-wrap">
      {isShot ? (
        <>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Shot No."
            className={`${inputCls} w-24 font-mono`}
          />
          <input
            value={frameRange}
            onChange={e => setFrameRange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="101-124"
            className={`${inputCls} w-28 font-mono`}
          />
          <div className="px-2 py-1.5 text-sm text-gray-400 w-16 text-center border border-gray-200 rounded-md bg-gray-100">
            {seconds > 0 ? `${seconds}s` : '—'}
          </div>
        </>
      ) : (
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={stageConfig.id === 'audio' ? 'Audio name…' : 'Asset name…'}
          className={`${inputCls} w-44`}
        />
      )}

      <ArtistDropdown value={artist} onChange={setArtist} />
      <StatusDropdown value={status} onChange={setStatus} compact />

      <input
        type="date"
        value={startDate}
        onChange={e => setStartDate(e.target.value)}
        onKeyDown={handleKeyDown}
        className={`${inputCls} w-36`}
      />
      <input
        type="date"
        value={endDate}
        onChange={e => setEndDate(e.target.value)}
        onKeyDown={handleKeyDown}
        className={`${inputCls} w-36`}
      />

      <button
        onClick={submit}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Create
      </button>
    </div>
  )
}
