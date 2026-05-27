import { useState } from 'react'
import { X, Trash2, RotateCcw } from 'lucide-react'
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
  const [deleteOpen, setDeleteOpen]     = useState(false)
  // BUG-15: Require a retake note when bulk-setting LEAD_RETAKE.
  const [retakeOpen, setRetakeOpen]     = useState(false)
  const [retakeNote, setRetakeNote]     = useState('')
  const { bulkUpdateStatus, bulkUpdateArtist, bulkDeleteTasks, bulkRetake } = usePipelineStore()

  function handleStatusChange(s: TaskStatus) {
    if (s === 'LEAD_RETAKE') {
      setRetakeOpen(true)
    } else {
      void bulkUpdateStatus(selectedIds, s)
      onClear()
    }
  }

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
              const s = e.target.value as TaskStatus
              if (!s) return
              e.target.value = ''
              handleStatusChange(s)
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
        onConfirm={() => { void bulkDeleteTasks(selectedIds); onClear() }}
      />

      {/* BUG-15: Retake note dialog — required before bulk-setting LEAD_RETAKE */}
      {retakeOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0c1221] border border-rose-500/30 rounded-xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-rose-400 shrink-0" />
              <h3 className="text-sm font-black text-white uppercase tracking-wide">
                Retake Note — {selectedIds.length} task{selectedIds.length > 1 ? 's' : ''}
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Provide a reason for the retake. Each selected artist will see this note alongside their task.
            </p>
            <textarea
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              rows={3}
              value={retakeNote}
              onChange={e => setRetakeNote(e.target.value)}
              placeholder="Describe what needs to be changed…"
              className="w-full px-3 py-2 text-xs border border-[#1b253b] rounded-md bg-[#0a0f1b] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-rose-500 transition-colors resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setRetakeOpen(false); setRetakeNote('') }}
                className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!retakeNote.trim()) return
                  void bulkRetake(selectedIds, retakeNote.trim())
                  setRetakeOpen(false)
                  setRetakeNote('')
                  onClear()
                }}
                disabled={!retakeNote.trim()}
                className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-500 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Send Retake
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
