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
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#0c1221] border-b border-[#1b253b]">
        <span className="text-xs font-black uppercase tracking-wider text-indigo-400">
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
            className="text-xs border border-[#1b253b] rounded-md px-2 py-1 bg-[#0d1424] text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
          >
            <option value="" disabled className="bg-[#0d1424]">Set status…</option>
            {ALL_STATUSES.map(s => (
              <option key={s} value={s} className="bg-[#0d1424]">{STATUS_CONFIG[s].label}</option>
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
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-rose-400 border border-rose-500/30 rounded-md hover:bg-rose-500/15 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>

        <button
          onClick={onClear}
          className="ml-auto flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-200 transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Clear
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
