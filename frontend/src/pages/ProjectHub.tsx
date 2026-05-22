import { useParams, Navigate, Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, CheckCircle, MessageSquare, Clock, BarChart3 } from 'lucide-react'
import { useClientStore } from '../store/clientStore'
import { usePipelineStore } from '../store/pipelineStore'
import { PipelineNav } from '../components/navigation/PipelineNav'
import { STAGE_CONFIGS } from '../config/stageConfigs'
import { isOverdue } from '../utils/calcSeconds'
import { STATUS_CONFIG, type TaskStatus } from '../types'
import { useMemo } from 'react'
import { format } from 'date-fns'

const STATUS_COLORS: Record<string, string> = {
  YET_TO_START:   'bg-slate-500',
  IN_PROGRESS:    'bg-amber-400',
  LEAD_APPROVAL:  'bg-sky-400',
  LEAD_RETAKE:    'bg-rose-400',
  DONE:           'bg-teal-400',
  FINAL_APPROVAL: 'bg-green-400',
}

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
  const approved = tasks.filter(t => t.status === 'FINAL_APPROVAL').length
  const inProgress = tasks.filter(t => t.status === 'IN_PROGRESS').length
  const issues = tasks.filter(t => t.status === 'LEAD_RETAKE').length
  const overdueCount = tasks.filter(t => isOverdue(t.endDate, t.status)).length
  const overallPct = totalTasks ? Math.round((approved / totalTasks) * 100) : 0

  const statusCounts = Object.fromEntries(
    (Object.keys(STATUS_CONFIG) as TaskStatus[]).map(s => [s, tasks.filter(t => t.status === s).length])
  )

  // Aggregate recent Dailies Feedback comments dynamically across all project tasks
  const recentComments = useMemo(() => {
    const list: { taskName: string; comment: any }[] = []
    tasks.forEach(t => {
      const cmts = (t as any).comments || []
      cmts.forEach((c: any) => {
        list.push({ taskName: t.itemName, comment: c })
      })
    })
    return list.sort((a, b) => b.comment.createdAt.localeCompare(a.comment.createdAt)).slice(0, 5)
  }, [tasks])

  // Radial progress ring variables
  const radius = 30
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (overallPct / 100) * circumference

  return (
    <div className="bg-[#0b0f19] min-h-screen text-slate-100 pb-10">
      
      {/* Dynamic Header */}
      <div className="bg-[#080d1a] border-b border-[#1a263e] px-6 py-4">
        <Link
          to={`/clients/${clientId}`}
          className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-indigo-400 mb-2 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> BACK TO {client.name.toUpperCase()}
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-black tracking-wide text-white uppercase">{project.name}</h1>
            {project.description && (
              <p className="text-xs text-slate-400 mt-1 font-medium">{project.description}</p>
            )}
          </div>
          <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded border ${
            project.status === 'ACTIVE' ? 'bg-[#101b35] text-indigo-400 border-indigo-500/20'
              : project.status === 'ON_HOLD' ? 'bg-[#261c16] text-amber-400 border-amber-500/20'
              : 'bg-slate-900 text-slate-400 border-slate-800'
          }`}>
            {project.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Pipeline Navigation Ribbons */}
      <PipelineNav clientId={clientId!} projectId={projectId!} />

      {/* Hub contents */}
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        
        {/* Overall Status Ribbon Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Tasks', value: totalTasks, icon: BarChart3,    color: 'text-indigo-400 border-indigo-500/20', bg: 'bg-indigo-500/10' },
            { label: 'Working Status', value: inProgress, icon: Clock,         color: 'text-amber-400 border-amber-500/20', bg: 'bg-amber-500/10' },
            { label: 'Final Approved', value: approved, icon: CheckCircle,   color: 'text-emerald-400 border-emerald-500/20', bg: 'bg-emerald-500/10' },
            { label: 'Retake Alert',    value: issues,   icon: AlertTriangle, color: 'text-rose-400 border-rose-500/20', bg: 'bg-rose-500/10' },
          ].map((c, idx) => (
            <div key={idx} className={`bg-[#0c1221] rounded-xl border p-4 shadow-lg flex items-center justify-between ${c.color.split(' ')[1]}`}>
              <div>
                <div className="text-2xl font-black text-white tracking-tight">{c.value}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{c.label}</div>
              </div>
              <div className={`w-8 h-8 rounded-md ${c.bg} flex items-center justify-center`}>
                <c.icon className={`w-4.5 h-4.5 ${c.color.split(' ')[0]}`} />
              </div>
            </div>
          ))}
        </div>

        {/* Warning messages */}
        {overdueCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs font-bold text-rose-400 uppercase tracking-wider animate-pulse">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            WARNING: {overdueCount} element{overdueCount > 1 ? 's are' : ' is'} overdue behind deadline schedules
          </div>
        )}

        {/* Circular Progress & Aggregated Dailies Loop Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Circular project progress */}
          <div className="bg-[#0c1221] border border-[#1b253b] rounded-xl p-5 flex flex-col items-center justify-center shadow-lg text-center">
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4 self-start">Project Progression Ratio</h2>
            <div className="relative w-28 h-28 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="56"
                  cy="56"
                  r={radius}
                  className="stroke-slate-800"
                  strokeWidth="6"
                  fill="transparent"
                />
                <circle
                  cx="56"
                  cy="56"
                  r={radius}
                  className="stroke-indigo-500 transition-all duration-500"
                  strokeWidth="6"
                  fill="transparent"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-white tracking-tight">{overallPct}%</span>
                <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Done</span>
              </div>
            </div>
            
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {Object.keys(STATUS_CONFIG).map(s => {
                const count = statusCounts[s] ?? 0
                if (!count) return null
                return (
                  <div key={s} className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-400 bg-slate-950 border border-slate-900 px-2 py-0.5 rounded-full">
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[s]}`} />
                    <span>{STATUS_CONFIG[cmtKey(s)].label}: {count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Dailies notes activity loop feed */}
          <div className="bg-[#0c1221] border border-[#1b253b] rounded-xl p-5 col-span-2 shadow-lg flex flex-col">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">
              <MessageSquare className="w-4 h-4 text-indigo-400" />
              <span>Project Dailies activity Feed</span>
            </div>
            
            {recentComments.length === 0 ? (
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider text-center my-auto">No review comments logged on shot elements yet.</p>
            ) : (
              <div className="space-y-3 flex-1 overflow-y-auto max-h-52 pr-1">
                {recentComments.map((cmtInfo, idx) => (
                  <div key={idx} className="p-3 bg-[#080d17]/50 border border-[#162035] hover:bg-[#131b2e] hover:border-slate-700 transition-all rounded-lg">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-indigo-400 font-mono tracking-wide uppercase">{cmtInfo.taskName}</span>
                      <span className="text-[9px] font-bold text-slate-500">
                        {format(new Date(cmtInfo.comment.createdAt), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[9px] font-black uppercase text-slate-400 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cmtInfo.comment.avatarColor }} />
                      {cmtInfo.comment.authorName}
                    </div>
                    <p className="text-xs font-medium text-slate-300 pl-2 border-l border-[#24324f] leading-relaxed">{cmtInfo.comment.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Stage-wise progression blocks */}
        <div className="bg-[#0c1221] rounded-xl border border-[#1b253b] p-5 shadow-lg">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">Pipeline Stages Breakdown</h2>
          <div className="space-y-3.5">
            {STAGE_CONFIGS.map(stage => {
              const stageTasks = tasks.filter(t => stage.subStages.some(ss => ss.id === t.subStageId))
              const stageApproved = stageTasks.filter(t => t.status === 'FINAL_APPROVAL').length
              const pct = stageTasks.length ? Math.round((stageApproved / stageTasks.length) * 100) : 0
              const firstSub = stage.subStages[0]
              return (
                <div key={stage.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <Link
                      to={`/clients/${clientId}/projects/${projectId}/pipeline/${stage.slug}/${firstSub.slug}`}
                      className="flex items-center gap-1.5 text-slate-300 font-bold uppercase tracking-wider hover:text-indigo-400 transition-colors"
                    >
                      <span>{stage.icon}</span>
                      <span>{stage.name}</span>
                      <span className="text-slate-500 font-medium font-mono text-[10px]">({stageTasks.length} elements)</span>
                    </Link>
                    <span className="text-[10px] font-black text-indigo-400 font-mono">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-[#090d16] border border-[#1b253b] rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-indigo-400 transition-all duration-300" style={{ width: `${pct}%` }} />
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

function cmtKey(s: string): TaskStatus {
  return s as TaskStatus
}
