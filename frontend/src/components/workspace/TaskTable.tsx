import { useState, useMemo, useRef, useEffect } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type Row,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Trash2, AlertTriangle, ChevronRight } from 'lucide-react'
import type { TaskRow, SubStageConfig } from '../../types'
import { usePipelineStore } from '../../store/pipelineStore'
import { useAuthStore } from '../../store/authStore'
import { StatusDropdown } from '../ui/StatusDropdown'
import { StatusPill } from '../ui/StatusPill'
import { ArtistDropdown } from '../employees/ArtistDropdown'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { DebouncedTextInput } from '../ui/DebouncedTextInput'
import { ColumnFilterMenu, ActiveFilterBadge } from './ColumnFilterMenu'
import { applyColumnFilters, countActive, type ColumnFilterMap } from './ColumnFilter'
import { isOverdue } from '../../utils/calcSeconds'
import { formatElapsed, getTaskElapsedMs, isTimerRunning, toDateTimeInputValue } from '../../utils/timeTracking'
import { clsx } from 'clsx'

interface Props {
  tasks: TaskRow[]
  subStageConfig: SubStageConfig
  selectedIds: string[]
  onSelect: (ids: string[]) => void
  onRowClick: (task: TaskRow) => void
}

type ListElement =
  | { type: 'header'; key: string; name: string; tasks: TaskRow[]; approvedCount: number }
  | { type: 'row'; key: string; task: TaskRow; index: number; rowObj: Row<TaskRow> }

// Procedural vector storyboard fallbacks for high-fidelity empty states
function ProceduralThumbnail({ subStageId }: { subStageId: string; itemName?: string }) {
  const idLower = subStageId.toLowerCase()
  
  if (idLower.includes('anim') || idLower.includes('story')) {
    return (
      <svg className="w-5 h-5 text-indigo-400/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="6" width="20" height="12" rx="1.5" />
        <path d="M12 10l4-3v8l-4-3" />
        <circle cx="7" cy="12" r="1.5" />
      </svg>
    )
  }
  if (idLower.includes('model')) {
    return (
      <svg className="w-5 h-5 text-sky-400/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <path d="M3.27 6.96L12 12.01l8.73-5.05" />
        <path d="M12 22.08V12" />
      </svg>
    )
  }
  if (idLower.includes('rig')) {
    return (
      <svg className="w-5 h-5 text-emerald-400/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="5" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="6" cy="18" r="1.5" />
        <circle cx="18" cy="18" r="1.5" />
        <path d="M12 6.5v4M12 13.5l-4.5 3M12 13.5l4.5 3" />
      </svg>
    )
  }
  if (idLower.includes('texture') || idLower.includes('paint')) {
    return (
      <svg className="w-5 h-5 text-amber-400/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 14.7255 3.09032 17.1962 4.85857 19" />
        <circle cx="7.5" cy="10.5" r="1" fill="currentColor" />
        <circle cx="11.5" cy="7.5" r="1" fill="currentColor" />
        <circle cx="16.5" cy="9.5" r="1" fill="currentColor" />
        <circle cx="15.5" cy="14.5" r="1" fill="currentColor" />
      </svg>
    )
  }
  if (idLower.includes('anim')) {
    return (
      <svg className="w-5 h-5 text-rose-400/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 18C6 18 10 14 12 10C14 6 18 6 21 6" strokeDasharray="3 3" />
        <circle cx="12" cy="10" r="2.5" />
        <circle cx="3" cy="18" r="1.5" />
        <circle cx="21" cy="6" r="1.5" />
      </svg>
    )
  }
  if (idLower.includes('fx')) {
    return (
      <svg className="w-5 h-5 text-purple-400/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    )
  }
  if (idLower.includes('light')) {
    return (
      <svg className="w-5 h-5 text-yellow-400/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="9" r="3.5" />
        <path d="M9 14.5h6M10 17.5h4" />
      </svg>
    )
  }
  if (idLower.includes('comp') || idLower.includes('post')) {
    return (
      <svg className="w-5 h-5 text-cyan-400/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="12" r="3.5" />
        <circle cx="16" cy="12" r="3.5" />
      </svg>
    )
  }
  if (idLower.includes('edit') || idLower.includes('sound') || idLower.includes('audi')) {
    return (
      <svg className="w-5 h-5 text-teal-400/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 12h2M7 6v12M11 3v18M15 8v8M19 11v2M21 12h2" />
      </svg>
    )
  }

  return (
    <svg className="w-5 h-5 text-slate-500/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  )
}

export function TaskTable({ tasks, subStageConfig, selectedIds, onSelect, onRowClick }: Props) {
  const { updateTask, updateTaskStatus, deleteTask } = usePipelineStore()
  const currentUser = useAuthStore(s => s.currentUser)
  const isArtist    = currentUser?.role === 'ARTIST'
  const canEdit     = !isArtist // managers and leads can edit status/artist inline

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [minuteTick, setMinuteTick] = useState(() => Date.now())
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [columnFilters, setColumnFilters] = useState<ColumnFilterMap>({})

  // Reset filters when the user navigates to a different sub-stage
  useEffect(() => { setColumnFilters({}) }, [subStageConfig.id])

  const parentRef = useRef<HTMLDivElement>(null)

  // Apply per-column filters to the incoming task list
  const visibleTasks = useMemo(() => applyColumnFilters(tasks, columnFilters), [tasks, columnFilters])
  const activeFilterCount = countActive(columnFilters)

  function setFilter(key: string, next: import('./ColumnFilter').ColumnFilter | undefined) {
    setColumnFilters(s => {
      if (!next) {
        const { [key]: _removed, ...rest } = s
        return rest
      }
      return { ...s, [key]: next }
    })
  }

  // For multi-select filters, list the distinct artist IDs present in the *unfiltered* task list
  const distinctArtistIds = useMemo(() => {
    const out: string[] = []
    let hasUnassigned = false
    for (const t of tasks) {
      if (!t.assignedArtistId) hasUnassigned = true
      else if (!out.includes(t.assignedArtistId)) out.push(t.assignedArtistId)
    }
    if (hasUnassigned) out.push('__unassigned__')
    return out
  }, [tasks])

  const allSelected = tasks.length > 0 && tasks.every(t => selectedIds.includes(t.id))
  const someSelected = tasks.some(t => selectedIds.includes(t.id))

  function toggleAll() {
    if (allSelected) {
      onSelect(selectedIds.filter(id => !tasks.find(t => t.id === id)))
    } else {
      onSelect([...new Set([...selectedIds, ...tasks.map(t => t.id)])])
    }
  }

  function toggleOne(id: string) {
    onSelect(
      selectedIds.includes(id)
        ? selectedIds.filter(x => x !== id)
        : [...selectedIds, id]
    )
  }

  // Persistent Dexie-backed Base64 Thumbnail Upload System (100% frontend only)
  function handleThumbnailUpload(taskId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        updateTask(taskId, { thumbnail: reader.result })
      }
    }
    reader.readAsDataURL(file)
  }

  // Parse Sequence prefix from shot numbers automatically (standard film pipeline procedure)
  function getSequenceName(task: TaskRow) {
    const name = (task.shotNumber || task.itemName || '').trim()
    const match = name.match(/^(seq[_\-\s]?\d+|sq[_\-\s]?\d+|\d{3})/i)
    if (match) return match[0].toUpperCase()
    return 'OTHER ASSETS'
  }

  const columns = useMemo<ColumnDef<TaskRow>[]>(() => {
    const cols: ColumnDef<TaskRow>[] = []

    // Checkbox select — hidden for artists (they have no bulk actions)
    if (!isArtist) {
      cols.push({
        id: 'select',
        header: () => (
          <input
            type="checkbox"
            checked={allSelected}
            ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
            onChange={toggleAll}
            className="rounded border-slate-700 bg-[#0d1424] text-indigo-600 focus:ring-indigo-500 focus:ring-offset-[#080d1a]"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={selectedIds.includes(row.original.id)}
            onChange={() => toggleOne(row.original.id)}
            onClick={e => e.stopPropagation()}
            className="rounded border-slate-700 bg-[#0d1424] text-indigo-600 focus:ring-indigo-500 focus:ring-offset-[#080d1a]"
          />
        ),
        size: 35,
      })
    }

    cols.push({
      id: 'thumbnail',
      header: 'Thumbnail',
      size: 70,
      cell: ({ row }) => {
        const task = row.original
        return (
          <div
            onClick={e => e.stopPropagation()}
            className="relative group w-12 h-7 bg-slate-950/80 border border-[#202e49] rounded overflow-hidden flex items-center justify-center cursor-pointer shadow-inner"
          >
            {task.thumbnail ? (
              <img src={task.thumbnail} className="w-full h-full object-cover" alt="" />
            ) : (
              <ProceduralThumbnail subStageId={task.subStageId} itemName={task.itemName} />
            )}
            {canEdit && (
              <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-150">
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleThumbnailUpload(task.id, e)}
                  className="hidden"
                  id={`thumb-upload-${task.id}`}
                />
                <label
                  htmlFor={`thumb-upload-${task.id}`}
                  className="text-[8px] font-black tracking-wider uppercase text-white bg-indigo-600 px-1 py-0.5 rounded cursor-pointer hover:bg-indigo-500 scale-90"
                >
                  SET
                </label>
              </div>
            )}
          </div>
        )
      }
    })

    subStageConfig.columns.forEach(col => {
      // Pick the right filter control per column type
      const filterKind: 'text' | 'status' | 'audio' | 'artist' | 'date' | 'number' | null =
        col.key === 'status'           ? 'status'
        : col.key === 'audioStatus'    ? 'audio'
        : col.key === 'assignedArtistId' ? 'artist'
        : col.key === 'startDate' || col.key === 'endDate' ? 'date'
        : col.key === 'seconds' || col.key === 'timeConsumed' ? 'number'
        : col.type === 'text' || col.type === 'frameRange'    ? 'text'
        : null

      // Exclude shotNumber if we are grouping, but keeping it visible is fine for reference.
      cols.push({
        id: col.key,
        header: () => (
          <div className="flex items-center gap-1">
            <span>{col.label}</span>
            {filterKind && (
              <ColumnFilterMenu
                kind={filterKind}
                value={columnFilters[col.key]}
                onChange={next => setFilter(col.key, next)}
                uniqueValues={filterKind === 'artist' ? distinctArtistIds : undefined}
              />
            )}
          </div>
        ),
        size: col.width ?? 120,
        cell: ({ row }) => {
          const task = row.original
          if (col.key === 'status') {
            // Artists see a read-only pill — they use Submit/Back-to-Work buttons in the drawer
            if (!canEdit) return <StatusPill status={task.status} size="sm" />
            return (
              <div onClick={e => e.stopPropagation()}>
                <StatusDropdown
                  value={task.status}
                  onChange={s => updateTaskStatus(task.id, s)}
                  compact
                />
              </div>
            )
          }
          if (col.key === 'audioStatus') {
            if (!canEdit) return <StatusPill status={task.audioStatus ?? 'YET_TO_START'} size="sm" />
            return (
              <div onClick={e => e.stopPropagation()}>
                <StatusDropdown
                  value={task.audioStatus ?? 'YET_TO_START'}
                  mode="audio"
                  onChange={s => updateTask(task.id, { audioStatus: s })}
                  compact
                />
              </div>
            )
          }
          if (col.key === 'finalOutput') {
            return (
              <DebouncedTextInput
                value={task.finalOutput ?? ''}
                onCommit={v => updateTask(task.id, { finalOutput: v })}
                onClick={e => e.stopPropagation()}
                placeholder="Link or note…"
                className="text-xs font-medium border border-transparent rounded px-1.5 py-0.5 hover:border-slate-700 hover:bg-[#131b2e] focus:border-indigo-500 focus:bg-[#131b2e] focus:outline-none bg-transparent w-full text-slate-200 transition-colors"
              />
            )
          }
          if (col.key === 'assignedArtistId') {
            if (!canEdit) {
              // Artist: show name-only, no dropdown
              return <ArtistDropdown value={task.assignedArtistId} onChange={() => {}} readOnly />
            }
            return (
              <div onClick={e => e.stopPropagation()}>
                <ArtistDropdown
                  value={task.assignedArtistId}
                  onChange={id => updateTask(task.id, { assignedArtistId: id })}
                />
              </div>
            )
          }
          if (col.key === 'startDate' || col.key === 'endDate') {
            const val = col.key === 'startDate' ? task.startDate : task.endDate
            if (!canEdit) {
              return <span className="text-[11px] font-mono text-slate-400">{val ? val.replace('T', ' ').slice(0, 16) : '—'}</span>
            }
            return (
              <input
                type="datetime-local"
                value={toDateTimeInputValue(val)}
                // Auto-close the calendar after pick
                onChange={e => { updateTask(task.id, { [col.key]: e.target.value || null }); e.target.blur() }}
                onClick={e => e.stopPropagation()}
                className="text-[11px] font-mono border border-transparent rounded px-1 py-0.5 hover:border-slate-700 hover:bg-[#131b2e] focus:border-indigo-500 focus:bg-[#131b2e] focus:outline-none bg-transparent w-full text-slate-300 transition-colors"
              />
            )
          }
          if (col.key === 'seconds') {
            return <span className="font-mono text-xs text-indigo-400 font-bold">{task.seconds ?? '—'}s</span>
          }
          if (col.key === 'frameRange') {
            return (
              <DebouncedTextInput
                value={task.frameRange ?? ''}
                onCommit={v => updateTask(task.id, { frameRange: v })}
                onClick={e => e.stopPropagation()}
                placeholder="101-124"
                className="font-mono text-xs border border-transparent rounded px-1 py-0.5 hover:border-slate-700 hover:bg-[#131b2e] focus:border-indigo-500 focus:bg-[#131b2e] focus:outline-none bg-transparent w-full text-slate-300 transition-colors"
              />
            )
          }
          if (col.key === 'timeConsumed') {
            const elapsed = getTaskElapsedMs(task, minuteTick)
            // "Active" purely means: is the timer currently ticking? That's just
            // whether status === IN_PROGRESS — start/end dates are deadlines, not timer anchors.
            const active = isTimerRunning(task.status)
            return (
              <span className={clsx(
                "font-mono text-xs font-black tracking-wide rounded px-1.5 py-0.5",
                active ? "text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 animate-pulse" : "text-slate-400"
              )}>
                {formatElapsed(elapsed)}
              </span>
            )
          }
          if (col.key === 'shotNumber') {
            return <span className="font-mono text-xs font-bold text-slate-200">{task.shotNumber}</span>
          }
          if (col.key === 'itemName') {
            return (
              <DebouncedTextInput
                value={task.itemName}
                onCommit={v => updateTask(task.id, { itemName: v })}
                onClick={e => e.stopPropagation()}
                className="text-xs font-semibold border border-transparent rounded px-1.5 py-0.5 hover:border-slate-700 hover:bg-[#131b2e] focus:border-indigo-500 focus:bg-[#131b2e] focus:outline-none bg-transparent w-full text-slate-100 transition-colors"
              />
            )
          }
          return <span className="text-xs font-semibold text-slate-300">{String((task as any)[col.key] ?? '—')}</span>
        },
      })
    })

    cols.push({
      id: 'actions',
      header: '',
      size: canEdit ? 55 : 32,
      cell: ({ row }) => (
        <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onRowClick(row.original)}
            className="p-1 rounded hover:bg-[#1f2c47] text-slate-400 hover:text-slate-100 transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          {canEdit && (
            <button
              onClick={() => setDeleteId(row.original.id)}
              className="p-1 rounded hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    })

    return cols
  }, [subStageConfig, selectedIds, tasks, allSelected, someSelected, minuteTick, canEdit, isArtist, columnFilters, distinctArtistIds])

  const table = useReactTable({
    data: visibleTasks,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const rows = table.getRowModel().rows

  // Flat mapping of Collapsible headers + sub-rows for rendering and TanStack virtualization.
  // Built from `visibleTasks` so per-column filters hide groups whose members are all filtered out.
  const flatListElements = useMemo(() => {
    const elements: ListElement[] = []
    const groups: Record<string, TaskRow[]> = {}

    visibleTasks.forEach(task => {
      const seq = getSequenceName(task)
      if (!groups[seq]) groups[seq] = []
      groups[seq].push(task)
    })

    // Sort sequences alphabetically so matrix is consistently structured
    Object.keys(groups).sort().forEach(seqName => {
      const seqTasks = groups[seqName]
      const approved = seqTasks.filter(t => t.status === 'FINAL_APPROVAL').length

      elements.push({
        type: 'header',
        key: `header-${seqName}`,
        name: seqName,
        tasks: seqTasks,
        approvedCount: approved,
      })

      if (!collapsedGroups[seqName]) {
        seqTasks.forEach(task => {
          const rowObj = rows.find(r => r.original.id === task.id)
          if (rowObj) {
            elements.push({
              type: 'row',
              key: `row-${task.id}`,
              task,
              index: rowObj.index,
              rowObj,
            })
          }
        })
      }
    })

    return elements
  }, [visibleTasks, collapsedGroups, rows])

  const virtualizer = useVirtualizer({
    count: flatListElements.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 38,
    overscan: 10,
  })

  const virtualRows = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()
  const paddingTop = virtualRows.length > 0 ? (virtualRows[0]?.start ?? 0) : 0
  const paddingBottom = virtualRows.length > 0
    ? totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0)
    : 0

  const hasVisibleActiveRows = useMemo(
    () =>
      virtualRows.some(v => {
        const item = flatListElements[v.index]
        if (!item || item.type !== 'row') return false
        const task = item.task
        return Boolean(task?.startDate) && !task?.endDate && isTimerRunning(task.status)
      }),
    [flatListElements, virtualRows],
  )

  useEffect(() => {
    if (!hasVisibleActiveRows) return
    const syncId = window.setTimeout(() => {
      setMinuteTick(Date.now())
    }, 0)

    // Tick every second so the live timer shows seconds ticking up
    // (only runs when at least one IN_PROGRESS task is visible).
    const timerId = window.setInterval(() => {
      setMinuteTick(Date.now())
    }, 1000)

    return () => {
      window.clearTimeout(syncId)
      window.clearInterval(timerId)
    }
  }, [hasVisibleActiveRows])

  return (
    <>
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-[#1a263e] bg-[#0a0f1b]">
          <ActiveFilterBadge count={activeFilterCount} onClear={() => setColumnFilters({})} />
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            {visibleTasks.length} of {tasks.length} rows shown
          </span>
        </div>
      )}
      <div ref={parentRef} className="overflow-auto border border-[#1b253b] bg-[#0c1221]" style={{ maxHeight: 'calc(100vh - 240px)' }}>
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-20">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} className="bg-[#111929] border-b border-[#1b253b]">
                {hg.headers.map(header => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="px-3 py-2 text-left text-[10px] font-black text-slate-400 tracking-wider uppercase whitespace-nowrap border-r border-[#1b253b] last:border-r-0"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-16 text-center text-xs font-semibold text-slate-500">
                  No tracking records found. Log assets or shots in the Ribbon above to initialize the pipeline sheet.
                </td>
              </tr>
            ) : visibleTasks.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-16 text-center text-xs font-semibold text-slate-500">
                  No rows match the active filters.{' '}
                  <button onClick={() => setColumnFilters({})} className="text-indigo-400 hover:text-indigo-300 underline font-bold">
                    Clear all filters
                  </button>
                </td>
              </tr>
            ) : (
              <>
                {paddingTop > 0 && (
                  <tr><td style={{ height: paddingTop }} colSpan={columns.length} /></tr>
                )}
                {virtualRows.map(virtualRow => {
                  const item = flatListElements[virtualRow.index]
                  if (!item) return null

                  // RenderCollapsible Group Header
                  if (item.type === 'header') {
                    const isCollapsed = collapsedGroups[item.name]
                    const pct = item.tasks.length ? Math.round((item.approvedCount / item.tasks.length) * 100) : 0
                    return (
                      <tr
                        key={item.key}
                        onClick={() => setCollapsedGroups(prev => ({ ...prev, [item.name]: !prev[item.name] }))}
                        className="bg-[#101726] border-b border-[#1b253b] cursor-pointer hover:bg-[#162035] transition-colors select-none"
                        style={{ height: 32 }}
                      >
                        <td colSpan={columns.length} className="px-3 py-1.5 text-xs font-bold text-slate-300 align-middle">
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-indigo-400">{isCollapsed ? '▶' : '▼'}</span>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded">
                                SEQUENCE
                              </span>
                              <span className="text-white font-extrabold font-mono tracking-wide">{item.name}</span>
                              <span className="text-slate-400 font-semibold text-[10px] ml-1">({item.tasks.length} elements)</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Progression:</span>
                              <div className="w-20 h-1.5 bg-[#0a0d16] rounded-full overflow-hidden border border-[#1b253b]">
                                <div
                                  className="h-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-300"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-black text-emerald-400 w-8 text-right">{pct}%</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  }

                  // RenderStandard Task Row
                  const row = item.rowObj
                  const task = item.task
                  const overdue = isOverdue(task.endDate, task.status)
                  const isSelected = selectedIds.includes(task.id)

                  return (
                    <tr
                      key={row.id}
                      onClick={() => onRowClick(task)}
                      className={clsx(
                        'border-b border-[#141d2f] cursor-pointer transition-colors',
                        isSelected ? 'bg-indigo-950/30' : 'hover:bg-[#131b2d]',
                        overdue && !isSelected && 'bg-rose-950/10 hover:bg-rose-950/20'
                      )}
                      style={{ height: 38 }}
                    >
                      {row.getVisibleCells().map(cell => (
                        <td
                          key={cell.id}
                          className={clsx(
                            'px-3 py-1 align-middle border-r border-[#141d2f] last:border-r-0',
                            cell.column.id === 'endDate' && overdue && 'text-rose-400 font-bold font-mono'
                          )}
                        >
                          {cell.column.id === 'itemName' && overdue ? (
                            <span className="inline-flex items-center gap-1.5 text-rose-400">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </span>
                          ) : (
                            flexRender(cell.column.columnDef.cell, cell.getContext())
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
                {paddingBottom > 0 && (
                  <tr><td style={{ height: paddingBottom }} colSpan={columns.length} /></tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={v => !v && setDeleteId(null)}
        title="Delete task"
        description="This task will be permanently deleted."
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (deleteId) deleteTask(deleteId); setDeleteId(null) }}
      />
    </>
  )
}
