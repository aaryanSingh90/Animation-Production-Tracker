import { useParams, Navigate, Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, CheckCircle, Activity } from 'lucide-react'
import { useClientStore } from '../store/clientStore'
import { usePipelineStore } from '../store/pipelineStore'
import { PipelineNav } from '../components/navigation/PipelineNav'
import { STAGE_CONFIGS } from '../config/stageConfigs'
import { isOverdue } from '../utils/calcSeconds'
import { STATUS_CONFIG, type TaskStatus } from '../types'

export function ProjectHub() {
  const { clientId, projectId } = useParams<{ clientId: string; projectId: string }>()
  const clients = useClientStore(s => s.clients)
  const projects = useClientStore(s => s.projects)
  const allTasks = usePipelineStore(s => s.tasks)
  const tasks = allTasks.filter(t => t.projectId === projectId)

  const client = clients.find(c => c.id === clientId)
  const project = projects.find(p => p.id === projectId)

  if (!client || !project) return <Navigate to="/clients" replace />

  const totalTasks = tasks.length
  const approved = tasks.filter(t => t.status === 'APPROVED').length
  const inProgress = tasks.filter(t => t.status === 'IN_PROGRESS' || t.status === 'REVIEW').length
  const issues = tasks.filter(t => t.status === 'ISSUE').length
  const overdueCount = tasks.filter(t => isOverdue(t.endDate, t.status)).length
  const overallPct = totalTasks ? Math.round((approved / totalTasks) * 100) : 0

  const statusCounts = Object.fromEntries(
    (Object.keys(STATUS_CONFIG) as TaskStatus[]).map(s => [s, tasks.filter(t => t.status === s).length])
  )

  const STATUS_COLORS: Record<string, string> = {
    NOT_STARTED: 'bg-gray-300',
    IN_PROGRESS:  'bg-amber-400',
    REVIEW:       'bg-blue-400',
    APPROVED:     'bg-green-500',
    ISSUE:        'bg-red-500',
    EXTENDED:     'bg-purple-500',
  }

  return (
    <div>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <Link
          to={`/clients/${clientId}`}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> {client.name}
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
            {project.description && (
              <p className="text-sm text-gray-500 mt-0.5">{project.description}</p>
            )}
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            project.status === 'ACTIVE' ? 'bg-green-100 text-green-800'
              : project.status === 'ON_HOLD' ? 'bg-amber-100 text-amber-800'
              : 'bg-gray-100 text-gray-700'
          }`}>
            {project.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Pipeline nav */}
      <PipelineNav clientId={clientId!} projectId={projectId!} />

      {/* Dashboard content */}
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Stat row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Tasks', value: totalTasks, icon: Activity,      color: 'text-gray-600', bg: 'bg-gray-100' },
            { label: 'In Progress', value: inProgress, icon: Activity,      color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Approved',    value: approved,   icon: CheckCircle,   color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Issues',      value: issues,     icon: AlertTriangle, color: 'text-red-600',   bg: 'bg-red-50' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center mb-2`}>
                <c.icon className={`w-4 h-4 ${c.color}`} />
              </div>
              <div className="text-2xl font-bold text-gray-900">{c.value}</div>
              <div className="text-xs text-gray-500">{c.label}</div>
            </div>
          ))}
        </div>

        {overdueCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {overdueCount} task{overdueCount > 1 ? 's are' : ' is'} overdue
          </div>
        )}

        {/* Overall progress */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700">Overall Progress</h2>
            <span className="text-sm font-semibold text-indigo-600">{overallPct}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden mb-3">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${overallPct}%` }} />
          </div>
          <div className="flex flex-wrap gap-3">
            {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map(s => {
              const count = statusCounts[s] ?? 0
              if (!count) return null
              return (
                <div key={s} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[s]}`} />
                  {STATUS_CONFIG[s].label}: {count}
                </div>
              )
            })}
          </div>
        </div>

        {/* Per-stage bars */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Per Stage</h2>
          <div className="space-y-3">
            {STAGE_CONFIGS.map(stage => {
              const stageTasks = tasks.filter(t => stage.subStages.some(ss => ss.id === t.subStageId))
              const stageApproved = stageTasks.filter(t => t.status === 'APPROVED').length
              const pct = stageTasks.length ? Math.round((stageApproved / stageTasks.length) * 100) : 0
              const firstSub = stage.subStages[0]
              return (
                <div key={stage.id}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <Link
                      to={`/clients/${clientId}/projects/${projectId}/pipeline/${stage.slug}/${firstSub.slug}`}
                      className="flex items-center gap-1.5 text-gray-600 hover:text-indigo-600"
                    >
                      <span>{stage.icon}</span>
                      <span>{stage.name}</span>
                      <span className="text-gray-400">({stageTasks.length})</span>
                    </Link>
                    <span className="font-medium text-gray-600">{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
