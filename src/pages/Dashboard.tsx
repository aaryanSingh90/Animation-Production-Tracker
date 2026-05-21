import { usePipelineStore } from '../store/pipelineStore'
import { useClientStore } from '../store/clientStore'
import { useEmployeeStore } from '../store/employeeStore'
import { STAGE_CONFIGS } from '../config/stageConfigs'
import { StatusPill } from '../components/ui/StatusPill'
import { STATUS_CONFIG, type TaskStatus } from '../types'
import { isOverdue } from '../utils/calcSeconds'
import { Link } from 'react-router-dom'
import { Briefcase, Users, Film, AlertTriangle, CheckCircle, Clock } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: 'bg-gray-300',
  IN_PROGRESS:  'bg-amber-400',
  REVIEW:       'bg-blue-400',
  APPROVED:     'bg-green-500',
  ISSUE:        'bg-red-500',
  EXTENDED:     'bg-purple-500',
}

export function Dashboard() {
  const tasks = usePipelineStore(s => s.tasks)
  const clients = useClientStore(s => s.clients)
  const projects = useClientStore(s => s.projects)
  const employees = useEmployeeStore(s => s.employees)

  const totalTasks = tasks.length
  const approved = tasks.filter(t => t.status === 'APPROVED').length
  const inProgress = tasks.filter(t => t.status === 'IN_PROGRESS' || t.status === 'REVIEW').length
  const issues = tasks.filter(t => t.status === 'ISSUE').length
  const overdue = tasks.filter(t => isOverdue(t.endDate, t.status)).length

  const overallPct = totalTasks ? Math.round((approved / totalTasks) * 100) : 0

  const statusCounts = Object.fromEntries(
    (Object.keys(STATUS_CONFIG) as TaskStatus[]).map(s => [
      s, tasks.filter(t => t.status === s).length
    ])
  )

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of all pipeline activity</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Briefcase, label: 'Clients', value: clients.length, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { icon: Film,      label: 'Projects', value: projects.length, color: 'text-violet-600', bg: 'bg-violet-50' },
          { icon: Users,     label: 'Artists',  value: employees.filter(e => e.active).length, color: 'text-cyan-600', bg: 'bg-cyan-50' },
          { icon: Clock,     label: 'In Progress', value: inProgress, color: 'text-amber-600', bg: 'bg-amber-50' },
          { icon: CheckCircle, label: 'Approved', value: approved, color: 'text-green-600', bg: 'bg-green-50' },
          { icon: AlertTriangle, label: 'Issues', value: issues, color: 'text-red-600', bg: 'bg-red-50' },
          { icon: AlertTriangle, label: 'Overdue', value: overdue, color: 'text-orange-600', bg: 'bg-orange-50' },
          { icon: Film, label: 'Total Tasks', value: totalTasks, color: 'text-gray-600', bg: 'bg-gray-100' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>
              <card.icon className={`w-4.5 h-4.5 ${card.color}`} />
            </div>
            <div className="text-2xl font-bold text-gray-900">{card.value}</div>
            <div className="text-sm text-gray-500 mt-0.5">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Overall progress */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Overall Pipeline Progress</h2>
          <span className="text-sm font-semibold text-indigo-600">{overallPct}%</span>
        </div>
        <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${overallPct}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map(s => {
            const count = statusCounts[s] ?? 0
            if (!count) return null
            return (
              <div key={s} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[s]}`} />
                {STATUS_CONFIG[s].label}: {count}
              </div>
            )
          })}
        </div>
      </div>

      {/* Per-stage progress */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Stage Progress</h2>
        <div className="space-y-3">
          {STAGE_CONFIGS.map(stage => {
            const stageTasks = tasks.filter(t =>
              stage.subStages.some(ss => ss.id === t.subStageId)
            )
            const stageApproved = stageTasks.filter(t => t.status === 'APPROVED').length
            const pct = stageTasks.length ? Math.round((stageApproved / stageTasks.length) * 100) : 0
            return (
              <div key={stage.id}>
                <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                  <span className="flex items-center gap-1.5">
                    <span>{stage.icon}</span>
                    <span>{stage.name}</span>
                    <span className="text-gray-400">({stageTasks.length} tasks)</span>
                  </span>
                  <span className="font-medium">{pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-green-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Projects quick list */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Active Projects</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-gray-400">No projects yet.</p>
        ) : (
          <div className="space-y-2">
            {projects.map(proj => {
              const client = clients.find(c => c.id === proj.clientId)
              const projTasks = tasks.filter(t => t.projectId === proj.id)
              const projApproved = projTasks.filter(t => t.status === 'APPROVED').length
              const pct = projTasks.length ? Math.round((projApproved / projTasks.length) * 100) : 0
              return (
                <Link
                  key={proj.id}
                  to={`/clients/${proj.clientId}/projects/${proj.id}`}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 border border-gray-100"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{proj.name}</div>
                    <div className="text-xs text-gray-400">{client?.name}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1.5 rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
