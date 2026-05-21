import { useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { Trash2, AlertTriangle, ChevronRight } from 'lucide-react'
import type { TaskRow, SubStageConfig } from '../../types'
import { usePipelineStore } from '../../store/pipelineStore'
import { StatusDropdown } from '../ui/StatusDropdown'
import { ArtistDropdown } from '../employees/ArtistDropdown'
import { ArtistChip } from '../employees/ArtistChip'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { isOverdue } from '../../utils/calcSeconds'
import { clsx } from 'clsx'

interface Props {
  tasks: TaskRow[]
  subStageConfig: SubStageConfig
  selectedIds: string[]
  onSelect: (ids: string[]) => void
  onRowClick: (task: TaskRow) => void
}

export function TaskTable({ tasks, subStageConfig, selectedIds, onSelect, onRowClick }: Props) {
  const { updateTask, updateTaskStatus, deleteTask } = usePipelineStore()
  const [deleteId, setDeleteId] = useState<string | null>(null)

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

  const columns = useMemo<ColumnDef<TaskRow>[]>(() => {
    const cols: ColumnDef<TaskRow>[] = [
      {
        id: 'select',
        header: () => (
          <input
            type="checkbox"
            checked={allSelected}
            ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
            onChange={toggleAll}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={selectedIds.includes(row.original.id)}
            onChange={() => toggleOne(row.original.id)}
            onClick={e => e.stopPropagation()}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
        ),
        size: 40,
      },
    ]

    subStageConfig.columns.forEach(col => {
      cols.push({
        id: col.key,
        header: col.label,
        size: col.width ?? 120,
        cell: ({ row }) => {
          const task = row.original
          if (col.key === 'status') {
            return (
              <StatusDropdown
                value={task.status}
                onChange={s => updateTaskStatus(task.id, s)}
                compact
              />
            )
          }
          if (col.key === 'assignedArtistId') {
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
            return (
              <input
                type="date"
                value={val ?? ''}
                onChange={e => updateTask(task.id, { [col.key]: e.target.value || null })}
                onClick={e => e.stopPropagation()}
                className="text-xs border border-transparent rounded px-1 py-0.5 hover:border-gray-300 focus:border-indigo-400 focus:outline-none bg-transparent w-full"
              />
            )
          }
          if (col.key === 'seconds') {
            return <span className="font-mono text-xs text-gray-500">{task.seconds ?? '—'}s</span>
          }
          if (col.key === 'frameRange') {
            return (
              <input
                value={task.frameRange ?? ''}
                onChange={e => updateTask(task.id, { frameRange: e.target.value })}
                onClick={e => e.stopPropagation()}
                placeholder="101-124"
                className="font-mono text-xs border border-transparent rounded px-1 py-0.5 hover:border-gray-300 focus:border-indigo-400 focus:outline-none bg-transparent w-full"
              />
            )
          }
          if (col.key === 'timeConsumed') {
            return (
              <input
                type="number"
                value={task.timeConsumed ?? ''}
                onChange={e => updateTask(task.id, { timeConsumed: e.target.value ? Number(e.target.value) : undefined })}
                onClick={e => e.stopPropagation()}
                placeholder="hrs"
                className="text-xs border border-transparent rounded px-1 py-0.5 hover:border-gray-300 focus:border-indigo-400 focus:outline-none bg-transparent w-20"
              />
            )
          }
          if (col.key === 'shotNumber') {
            return <span className="font-mono text-xs text-gray-700">{task.shotNumber}</span>
          }
          if (col.key === 'itemName') {
            return (
              <input
                value={task.itemName}
                onChange={e => updateTask(task.id, { itemName: e.target.value })}
                onClick={e => e.stopPropagation()}
                className="text-sm border border-transparent rounded px-1 py-0.5 hover:border-gray-300 focus:border-indigo-400 focus:outline-none bg-transparent w-full"
              />
            )
          }
          return <span className="text-sm text-gray-700">{String((task as any)[col.key] ?? '—')}</span>
        },
      })
    })

    cols.push({
      id: 'actions',
      header: '',
      size: 60,
      cell: ({ row }) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onRowClick(row.original)}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDeleteId(row.original.id)}
            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    })

    return cols
  }, [subStageConfig, selectedIds, tasks, allSelected, someSelected])

  const table = useReactTable({
    data: tasks,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} className="bg-gray-50 border-b border-gray-200">
                {hg.headers.map(header => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-gray-400"
                >
                  No tasks yet — use the Quick Add bar above to create one.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => {
                const task = row.original
                const overdue = isOverdue(task.endDate, task.status)
                const isSelected = selectedIds.includes(task.id)
                return (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick(task)}
                    className={clsx(
                      'border-b border-gray-100 cursor-pointer transition-colors',
                      isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50',
                      overdue && 'bg-red-50 hover:bg-red-100'
                    )}
                  >
                    {row.getVisibleCells().map(cell => (
                      <td
                        key={cell.id}
                        className={clsx(
                          'px-3 py-2.5 align-middle',
                          cell.column.id === 'endDate' && overdue && 'text-red-600'
                        )}
                      >
                        {cell.column.id === 'itemName' && overdue && (
                          <span className="inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </span>
                        )}
                        {!(cell.column.id === 'itemName' && overdue) &&
                          flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                )
              })
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
