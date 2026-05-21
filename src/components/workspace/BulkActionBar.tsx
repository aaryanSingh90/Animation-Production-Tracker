import { useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import type { TaskStatus } from '../../types'
import { STATUS_CONFIG } from '../../types'
import { ArtistDropdown } from '../employees/ArtistDropdown'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { usePipelineStore } from '../../store/pipelineStore'

const ALL_STATUSES = Object.keys(STATUS_CONFIG) as TaskStatus[]

interface Props {
  selectedIds: string[]
  onClear: () => void
}

export function BulkActionBar({ selectedIds, onClear }: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const { bulkUpdateStatus, bulkUpdateArtist, bulkDeleteTasks } = usePipelineStore()

  if (!selectedIds.length) return null

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border-b border-indigo-200">
        <span className="text-sm font-medium text-indigo-800">
          {selectedIds.length} selected
        </span>

        <div className="flex items-center gap-2 ml-2">
          {/* Set status */}
          <select
            defaultValue=""
            onChange={e => {
              if (e.target.value) {
                bulkUpdateStatus(selectedIds, e.target.value as TaskStatus)
                e.target.value = ''
              }
            }}
            className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="" disabled>Set status…</option>
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>

          {/* Assign artist */}
          <ArtistDropdown
            value={null}
            onChange={id => { if (id) bulkUpdateArtist(selectedIds, id) }}
          />

          {/* Delete */}
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded-md hover:bg-red-50"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>

        <button
          onClick={onClear}
          className="ml-auto flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
        >
          <X className="w-4 h-4" /> Clear
        </button>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete selected tasks"
        description={`This will permanently delete ${selectedIds.length} task${selectedIds.length > 1 ? 's' : ''}. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => { bulkDeleteTasks(selectedIds); onClear() }}
      />
    </>
  )
}
