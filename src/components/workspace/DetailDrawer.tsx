import { X, Clock } from 'lucide-react'
import { useState } from 'react'
import type { TaskRow } from '../../types'
import { STATUS_CONFIG } from '../../types'
import { usePipelineStore } from '../../store/pipelineStore'
import { StatusDropdown } from '../ui/StatusDropdown'
import { ArtistDropdown } from '../employees/ArtistDropdown'
import { ArtistChip } from '../employees/ArtistChip'
import { format } from 'date-fns'

interface Props {
  task: TaskRow | null
  onClose: () => void
}

export function DetailDrawer({ task, onClose }: Props) {
  const { updateTask, updateTaskStatus } = usePipelineStore()

  if (!task) return null

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-96 bg-white shadow-2xl border-l border-gray-200 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
        <div>
          <div className="text-base font-semibold text-gray-900">{task.itemName}</div>
          {task.shotNumber && (
            <div className="text-xs text-gray-500 font-mono mt-0.5">{task.frameRange} · {task.seconds}s</div>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Status */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
          <StatusDropdown
            value={task.status}
            onChange={s => updateTaskStatus(task.id, s)}
          />
        </div>

        {/* Artist */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Assigned Artist</label>
          <ArtistDropdown
            value={task.assignedArtistId}
            onChange={id => updateTask(task.id, { assignedArtistId: id })}
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Start Date</label>
            <input
              type="date"
              value={task.startDate ?? ''}
              onChange={e => updateTask(task.id, { startDate: e.target.value || null })}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">End Date</label>
            <input
              type="date"
              value={task.endDate ?? ''}
              onChange={e => updateTask(task.id, { endDate: e.target.value || null })}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Time consumed */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Total Time Consumed (hrs)</label>
          <input
            type="number"
            value={task.timeConsumed ?? ''}
            onChange={e => updateTask(task.id, { timeConsumed: e.target.value ? Number(e.target.value) : undefined })}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g. 8"
          />
        </div>

        {/* Editing-stage extras */}
        {task.audioStatus !== undefined && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Audio Status</label>
              <StatusDropdown
                value={task.audioStatus ?? 'NOT_STARTED'}
                onChange={s => updateTask(task.id, { audioStatus: s })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Final Output</label>
              <input
                value={task.finalOutput ?? ''}
                onChange={e => updateTask(task.id, { finalOutput: e.target.value })}
                placeholder="Link or filename…"
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </>
        )}

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes</label>
          <textarea
            value={task.notes ?? ''}
            onChange={e => updateTask(task.id, { notes: e.target.value })}
            rows={4}
            placeholder="Add notes, feedback, or links…"
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        {/* Activity log */}
        {task.statusHistory.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Activity</label>
            <div className="space-y-2">
              {[...task.statusHistory].reverse().map((h, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Clock className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                  <div className="text-xs text-gray-600">
                    <span className="text-gray-800">{STATUS_CONFIG[h.from].label}</span>
                    {' → '}
                    <span className="text-gray-800">{STATUS_CONFIG[h.to].label}</span>
                    <div className="text-gray-400 mt-0.5">
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
      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
        Updated {format(new Date(task.updatedAt), 'MMM d, yyyy · h:mm a')}
      </div>
    </div>
  )
}
