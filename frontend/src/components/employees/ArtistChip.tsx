import * as Tooltip from '@radix-ui/react-tooltip'
import { useEmployeeStore } from '../../store/employeeStore'
import { usePipelineStore } from '../../store/pipelineStore'

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
      <span className="text-xs text-slate-600 italic">Unassigned</span>
    )
  }

  const emp = employees.find(e => e.id === artistId)
  if (!emp) return <span className="text-xs text-slate-600">—</span>

  const tasks = allTasks.filter(t => t.assignedArtistId === artistId)
  const active = tasks.filter(t => t.status === 'IN_PROGRESS' || t.status === 'LEAD_APPROVAL').length
  const retakes = tasks.filter(t => t.status === 'LEAD_RETAKE')

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
              <span className="text-xs text-slate-200 truncate max-w-[100px]">{emp.name}</span>
            )}
          </div>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="z-50 w-56 rounded-lg border border-[#1b253b] bg-[#0e1626] shadow-2xl shadow-black/60 p-3 text-left"
            sideOffset={6}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                style={{ backgroundColor: emp.avatarColor ?? '#6366f1' }}
              >
                {getInitials(emp.name)}
              </span>
              <div>
                <div className="text-xs font-bold text-slate-100">{emp.name}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{emp.department}</div>
              </div>
            </div>
            {emp.specialization && (
              <div className="text-[10px] text-slate-500 mb-2">{emp.specialization}</div>
            )}
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Active tasks: <span className="text-slate-200 font-black">{active}</span>
            </div>
            {retakes.length > 0 && (
              <div className="mt-1.5 space-y-1">
                <div className="text-[10px] font-black text-rose-400 uppercase tracking-wider">
                  {retakes.length} retake{retakes.length > 1 ? 's' : ''}
                </div>
                {retakes.map(t => (
                  <div key={t.id} className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/15 text-rose-400 border border-rose-500/20">
                    {t.itemName}
                  </div>
                ))}
              </div>
            )}
            <Tooltip.Arrow className="fill-[#1b253b]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
