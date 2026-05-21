import * as Tooltip from '@radix-ui/react-tooltip'
import { useEmployeeStore } from '../../store/employeeStore'
import { usePipelineStore } from '../../store/pipelineStore'
import { STATUS_CONFIG, type TaskStatus } from '../../types'

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

interface Props {
  artistId: string | null
  compact?: boolean
}

export function ArtistChip({ artistId, compact }: Props) {
  const employees = useEmployeeStore(s => s.employees)
  const allTasks = usePipelineStore(s => s.tasks)

  if (!artistId) {
    return (
      <span className="text-xs text-gray-400 italic">Unassigned</span>
    )
  }

  const emp = employees.find(e => e.id === artistId)
  if (!emp) return <span className="text-xs text-gray-400">—</span>

  const tasks = allTasks.filter(t => t.assignedArtistId === artistId)
  const active = tasks.filter(t => t.status === 'IN_PROGRESS' || t.status === 'REVIEW').length
  const issues = tasks.filter(t => t.status === 'ISSUE' || t.status === 'EXTENDED')

  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <div className="flex items-center gap-2 cursor-default">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
              style={{ backgroundColor: emp.avatarColor ?? '#6366f1' }}
            >
              {getInitials(emp.name)}
            </span>
            {!compact && (
              <span className="text-sm text-gray-800 truncate max-w-[100px]">{emp.name}</span>
            )}
          </div>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="z-50 w-56 rounded-lg border border-gray-200 bg-white shadow-lg p-3 text-left"
            sideOffset={6}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                style={{ backgroundColor: emp.avatarColor ?? '#6366f1' }}
              >
                {getInitials(emp.name)}
              </span>
              <div>
                <div className="text-sm font-semibold text-gray-900">{emp.name}</div>
                <div className="text-xs text-gray-500">{emp.department}</div>
              </div>
            </div>
            {emp.specialization && (
              <div className="text-xs text-gray-500 mb-2">{emp.specialization}</div>
            )}
            <div className="text-xs text-gray-600">
              Active tasks: <strong>{active}</strong>
            </div>
            {issues.length > 0 && (
              <div className="mt-1 text-xs text-red-600">
                {issues.length} issue/extended task{issues.length > 1 ? 's' : ''}
              </div>
            )}
            <div className="mt-2 text-xs space-y-1">
              {issues.map(t => (
                <div key={t.id} className={`px-1.5 py-0.5 rounded text-xs ${t.status === 'ISSUE' ? 'bg-red-50 text-red-700' : 'bg-purple-50 text-purple-700'}`}>
                  {t.itemName} — {STATUS_CONFIG[t.status].label}
                </div>
              ))}
            </div>
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
