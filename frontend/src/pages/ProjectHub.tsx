import { useParams, Navigate, Link } from 'react-router-dom'
import {
  ArrowLeft, AlertTriangle, CheckCircle, MessageSquare, Clock, BarChart3,
  ChevronRight, RotateCcw,
} from 'lucide-react'
import { useClientStore } from '../store/clientStore'
import { usePipelineStore } from '../store/pipelineStore'
import { useEmployeeStore } from '../store/employeeStore'
import { PipelineNav } from '../components/navigation/PipelineNav'
import { STAGE_CONFIGS, SUB_STAGE_MAP, SUB_STAGE_TO_STAGE_SLUG } from '../config/stageConfigs'
import { isOverdue } from '../utils/calcSeconds'
import { daysUntil } from '../utils/deadline'
import { STATUS_CONFIG, type TaskStatus, type TaskRow, type Employee } from '../types'
import { StatusPill } from '../components/ui/StatusPill'
import { useMemo } from 'react'
import { format } from 'date-fns'
import { clsx } from 'clsx'

const STATUS_COLORS: Record<string, string> = {
  YET_TO_START:   'bg-slate-500',
  IN_PROGRESS:    'bg-amber-400',
  LEAD_APPROVAL:  'bg-sky-400',
  LEAD_RETAKE:    'bg-rose-400',
  DONE:           'bg-teal-400',
  FINAL_APPROVAL: 'bg-green-400',
}

function getInitials(name: string | undefined) {
  return (name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function taskHref(task: TaskRow, clientId: string): string | null {
  const sub = SUB_STAGE_MAP[task.subStageId]
  const stage = SUB_STAGE_TO_STAGE_SLUG[task.subStageId]
  if (!sub || !stage) return null
  return `/clients/${clientId}/projects/${task.projectId}/pipeline/${stage}/${sub.slug}?open=${task.id}`
}

export function ProjectHub() {
  const { clientId, projectId } = useParams<{ clientId: string; projectId: string }>()
  const clients   = useClientStore(s => s.clients)
  const projects  = useClientStore(s => s.projects)
  const allTasks  = usePipelineStore(s => s.tasks)
  const employees = useEmployeeStore(s => s.employees)
  const tasks = allTasks.filter(t => t.projectId === projectId)

  const client = clients.find(c => c.id === clientId)
  const project = projects.find(p => p.id === projectId)

  // ── Derived task lists for the new "needs-attention" panel ───────────────
  // These are the actual tasks behind every count card on the page — clicking
  // any row jumps straight to that task's pipeline stage with the drawer open.
  const overdueTasks = useMemo(
    () => tasks
      .filter(t => isOverdue(t.endDate, t.status))
      .sort((a, b) => (a.endDate ?? '').localeCompare(b.endDate ?? '')),
    [tasks],
  )
  const retakeTasks = useMemo(
    () => tasks
      .filter(t => t.status === 'LEAD_RETAKE')
      .sort((a, b) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '')),
    [tasks],
  )
  const inProgressTasks = useMemo(
    () => tasks
      .filter(t => t.status === 'IN_PROGRESS')
      .sort((a, b) => (a.endDate ?? '￿').localeCompare(b.endDate ?? '￿')),
    [tasks],
  )

  if (!client || !project) return <Navigate to="/clients" replace />

  const totalTasks = tasks.length
  const approved = tasks.filter(t => t.status === 'FINAL_APPROVAL').length
  const inProgress = inProgressTasks.length
  const issues = retakeTasks.length
  const overdueCount = overdueTasks.length
  const overallPct = totalTasks ? Math.round((approved / totalTasks) * 100) : 0

  const statusCounts = Object.fromEntries(
    (Object.keys(STATUS_CONFIG) as TaskStatus[]).map(s => [s, tasks.filter(t => t.status === s).length])
  ) as Record<TaskStatus, number>

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

  // Stat card definitions — every card with `anchor` is clickable and scrolls
  // the user to the matching attention section below. Cards without an anchor
  // (Total / Approved) are display-only.
  const statCards = [
    { label: 'Total Tasks',    value: totalTasks, icon: BarChart3,    color: 'text-indigo-400',  border: 'border-indigo-500/20',  bg: 'bg-indigo-500/10',  anchor: null as string | null },
    { label: 'Working Status', value: inProgress, icon: Clock,         color: 'text-amber-400',   border: 'border-amber-500/20',   bg: 'bg-amber-500/10',   anchor: inProgress    > 0 ? 'attention-active'  : null },
    { label: 'Final Approved', value: approved,   icon: CheckCircle,   color: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/10', anchor: null },
    { label: 'Retake Alert',   value: issues,     icon: AlertTriangle, color: 'text-rose-400',    border: 'border-rose-500/20',    bg: 'bg-rose-500/10',    anchor: issues        > 0 ? 'attention-retake'  : null },
  ] as const

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
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-black tracking-wide text-white uppercase truncate">{project.name}</h1>
            {project.description && (
              <p className="text-xs text-slate-400 mt-1 font-medium">{project.description}</p>
            )}
          </div>
          <span className={clsx(
            'text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded border shrink-0',
            project.status === 'ACTIVE'  && 'bg-[#101b35] text-indigo-400 border-indigo-500/20',
            project.status === 'ON_HOLD' && 'bg-[#261c16] text-amber-400 border-amber-500/20',
            project.status === 'COMPLETED' && 'bg-slate-900 text-slate-400 border-slate-800',
          )}>
            {project.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Pipeline Navigation Ribbons */}
      <PipelineNav clientId={clientId!} projectId={projectId!} />

      {/* Hub contents */}
      <div className="p-6 max-w-5xl mx-auto space-y-6">

        {/* Overall Status Ribbon Cards — clickable when there's something to drill into */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map(c => {
            const inner = (
              <>
                <div className="min-w-0">
                  <div className="text-2xl font-black text-white tracking-tight">{c.value}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{c.label}</div>
                </div>
                <div className={clsx('w-9 h-9 rounded-md flex items-center justify-center shrink-0', c.bg)}>
                  <c.icon className={clsx('w-4 h-4', c.color)} />
                </div>
              </>
            )
            const baseCls = clsx(
              'bg-[#0c1221] rounded-xl border p-4 shadow-lg flex items-center justify-between transition-colors',
              c.border,
            )
            if (c.anchor) {
              return (
                <a
                  key={c.label}
                  href={`#${c.anchor}`}
                  className={clsx(baseCls, 'hover:border-indigo-500/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40')}
                >
                  {inner}
                </a>
              )
            }
            return (
              <div key={c.label} className={baseCls}>
                {inner}
              </div>
            )
          })}
        </div>

        {/* Warning messages */}
        {overdueCount > 0 && (
          <a
            href="#attention-overdue"
            className="flex items-center gap-2 px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs font-bold text-rose-400 uppercase tracking-wider hover:bg-rose-500/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 animate-pulse" />
            <span>
              {overdueCount} element{overdueCount > 1 ? 's are' : ' is'} overdue behind deadline schedules
            </span>
            <span className="ml-auto text-[10px] text-rose-300 flex items-center gap-1">See list <ChevronRight className="w-3 h-3" /></span>
          </a>
        )}

        {/* ── Needs Attention — overdue / retake / active drill-downs ─────── */}
        {(overdueCount > 0 || issues > 0 || inProgress > 0) && (
          <div className="bg-[#0c1221] rounded-xl border border-[#1b253b] shadow-lg overflow-hidden">
            <div className="px-5 py-3 bg-[#080d17]/60 border-b border-[#1a263e] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h2 className="text-[11px] font-black text-slate-200 uppercase tracking-wider">Needs Attention</h2>
              <span className="text-[10px] font-bold text-slate-500 ml-auto">
                {overdueCount + issues} blocking · {inProgress} active
              </span>
            </div>

            {/* Overdue */}
            {overdueCount > 0 && (
              <AttentionSection
                id="attention-overdue"
                title="Overdue"
                count={overdueCount}
                accent="rose"
                icon={AlertTriangle}
              >
                {overdueTasks.map(t => (
                  <AttentionRow
                    key={t.id}
                    task={t}
                    clientId={clientId!}
                    employees={employees}
                    badge={overdueBadge(t.endDate)}
                  />
                ))}
              </AttentionSection>
            )}

            {/* Retake */}
            {issues > 0 && (
              <AttentionSection
                id="attention-retake"
                title="Retake"
                count={issues}
                accent="rose"
                icon={RotateCcw}
              >
                {retakeTasks.map(t => (
                  <AttentionRow
                    key={t.id}
                    task={t}
                    clientId={clientId!}
                    employees={employees}
                    badge={t.retakeNote ? { label: 'See note', cls: 'text-rose-400 border-rose-500/30 bg-rose-500/10' } : null}
                  />
                ))}
              </AttentionSection>
            )}

            {/* In Progress */}
            {inProgress > 0 && (
              <AttentionSection
                id="attention-active"
                title="Working Status"
                count={inProgress}
                accent="amber"
                icon={Clock}
              >
                {inProgressTasks.slice(0, 12).map(t => (
                  <AttentionRow
                    key={t.id}
                    task={t}
                    clientId={clientId!}
                    employees={employees}
                    badge={activeBadge(t.endDate)}
                  />
                ))}
                {inProgressTasks.length > 12 && (
                  <div className="px-5 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center bg-[#080d17]/40">
                    Showing first 12 of {inProgressTasks.length} · open a stage tab above for the full list
                  </div>
                )}
              </AttentionSection>
            )}
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
              {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map(s => {
                const count = statusCounts[s] ?? 0
                if (!count) return null
                return (
                  <div key={s} className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-400 bg-slate-950 border border-slate-900 px-2 py-0.5 rounded-full">
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[s]}`} />
                    <span>{STATUS_CONFIG[s].label}: {count}</span>
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
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider text-center my-auto py-6">No review comments logged on shot elements yet.</p>
            ) : (
              <div className="space-y-3 flex-1 overflow-y-auto max-h-52 pr-1">
                {recentComments.map((cmtInfo, idx) => (
                  <div key={idx} className="p-3 bg-[#080d17]/50 border border-[#162035] hover:bg-[#131b2e] hover:border-slate-700 transition-all rounded-lg">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-indigo-400 font-mono tracking-wide uppercase truncate">{cmtInfo.taskName}</span>
                      <span className="text-[9px] font-bold text-slate-500 shrink-0 ml-2">
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
                  <div className="flex items-center justify-between text-xs gap-2">
                    <Link
                      to={`/clients/${clientId}/projects/${projectId}/pipeline/${stage.slug}/${firstSub.slug}`}
                      className="flex items-center gap-1.5 text-slate-300 font-bold uppercase tracking-wider hover:text-indigo-400 transition-colors min-w-0"
                    >
                      <span>{stage.icon}</span>
                      <span className="truncate">{stage.name}</span>
                      <span className="text-slate-500 font-medium font-mono text-[10px] shrink-0">({stageTasks.length} elements)</span>
                    </Link>
                    <span className="text-[10px] font-black text-indigo-400 font-mono shrink-0">{pct}%</span>
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

// ─── Sub-components ─────────────────────────────────────────────────────────

function AttentionSection({
  id, title, count, accent, icon: Icon, children,
}: {
  id: string
  title: string
  count: number
  accent: 'rose' | 'amber'
  icon: typeof AlertTriangle
  children: React.ReactNode
}) {
  const tone = accent === 'rose'
    ? { text: 'text-rose-400', bg: 'bg-rose-500/5', border: 'border-rose-500/20' }
    : { text: 'text-amber-400', bg: 'bg-amber-500/5', border: 'border-amber-500/20' }
  return (
    <section id={id} className="border-t border-[#1a263e] first:border-t-0 scroll-mt-24">
      <header className={clsx('flex items-center gap-2 px-5 py-2 border-b', tone.border, tone.bg)}>
        <Icon className={clsx('w-3.5 h-3.5', tone.text)} />
        <h3 className={clsx('text-[10px] font-black uppercase tracking-wider', tone.text)}>{title}</h3>
        <span className="text-[10px] font-bold text-slate-500 font-mono">· {count}</span>
      </header>
      <div className="divide-y divide-[#141d2f]">
        {children}
      </div>
    </section>
  )
}

function AttentionRow({
  task, clientId, employees, badge,
}: {
  task: TaskRow
  clientId: string
  employees: Employee[]
  badge: { label: string; cls: string } | null
}) {
  const href = taskHref(task, clientId)
  const artist = task.assignedArtistId ? employees.find(e => e.id === task.assignedArtistId) : null
  const subStage = SUB_STAGE_MAP[task.subStageId]
  const Wrapper: any = href ? Link : 'div'
  const wrapperProps = href ? { to: href } : {}

  return (
    <Wrapper
      {...wrapperProps}
      className="flex items-center gap-3 px-5 py-2.5 hover:bg-[#131b2e] transition-colors group focus-visible:outline-none focus-visible:bg-[#131b2e]"
    >
      {artist ? (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-black shrink-0 border border-white/10"
          style={{ backgroundColor: artist.avatarColor ?? '#6366f1' }}
          title={artist.name}
        >
          {getInitials(artist.name)}
        </div>
      ) : (
        <div className="w-7 h-7 rounded-full bg-slate-800/60 shrink-0 flex items-center justify-center text-slate-600 text-[9px] font-bold">?</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-100 uppercase tracking-wide truncate group-hover:text-indigo-300 transition-colors">
            {task.itemName || 'Untitled'}
          </span>
          <StatusPill status={task.status} size="sm" />
        </div>
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 truncate">
          {artist?.name ?? 'Unassigned'} · {subStage?.name ?? task.subStageId}
          {task.endDate && <span className="text-slate-600"> · due {format(new Date(task.endDate), 'd MMM')}</span>}
        </div>
        {task.retakeNote && task.status === 'LEAD_RETAKE' && (
          <p className="text-[10px] text-rose-400 mt-1 truncate">↩ {task.retakeNote}</p>
        )}
      </div>
      {badge && (
        <span className={clsx('text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 font-mono', badge.cls)}>
          {badge.label}
        </span>
      )}
      {href && <ChevronRight className="w-3.5 h-3.5 text-slate-700 group-hover:text-indigo-400 shrink-0 transition-colors" />}
    </Wrapper>
  )
}

function overdueBadge(endDate: string | null): { label: string; cls: string } | null {
  const days = daysUntil(endDate)
  if (days == null) return null
  return {
    label: `${Math.abs(days)}d late`,
    cls:   'text-rose-400 border-rose-500/30 bg-rose-500/10 animate-pulse',
  }
}

function activeBadge(endDate: string | null): { label: string; cls: string } | null {
  const days = daysUntil(endDate)
  if (days == null) return null
  if (days < 0)  return { label: `${Math.abs(days)}d late`, cls: 'text-rose-400 border-rose-500/30 bg-rose-500/10' }
  if (days === 0) return { label: 'Today',                  cls: 'text-orange-400 border-orange-500/30 bg-orange-500/10' }
  if (days <= 3)  return { label: `${days}d`,               cls: 'text-amber-400 border-amber-500/30 bg-amber-500/10' }
  return null
}
