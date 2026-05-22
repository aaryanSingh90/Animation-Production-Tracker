import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, isToday, isTomorrow, parseISO, differenceInDays, startOfDay } from 'date-fns'
import { clsx } from 'clsx'
import {
  Activity, AlertTriangle, CheckCheck, CheckCircle, Clock, RotateCcw, Briefcase,
  Sparkles, TrendingUp, Film, Users, ChevronRight,
} from 'lucide-react'
import { usePipelineStore } from '../store/pipelineStore'
import { useClientStore }   from '../store/clientStore'
import { useEmployeeStore } from '../store/employeeStore'
import { useAuthStore }     from '../store/authStore'
import { STATUS_CONFIG, type TaskStatus, type TaskRow } from '../types'
import { isOverdue } from '../utils/calcSeconds'
import { SUB_STAGE_MAP, SUB_STAGE_TO_STAGE_SLUG, STAGE_CONFIGS } from '../config/stageConfigs'
import { StatusPill } from '../components/ui/StatusPill'

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return format(new Date(iso), 'MMM d')
}

function pipelineHref(task: TaskRow, clientId: string | undefined): string | undefined {
  if (!clientId) return undefined
  const sub = SUB_STAGE_MAP[task.subStageId]
  const stage = SUB_STAGE_TO_STAGE_SLUG[task.subStageId]
  if (!sub || !stage) return undefined
  return `/clients/${clientId}/projects/${task.projectId}/pipeline/${stage}/${sub.slug}?open=${task.id}`
}

function initials(name: string | undefined) {
  return (name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// ─── Page ───────────────────────────────────────────────────────────────────

interface RetakeModalState { taskId: string; taskName: string }

export function Dashboard() {
  // Live clock for the header — ticks every 30s, cheap
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const allTasks    = usePipelineStore(s => s.tasks)
  const { updateTaskStatus, updateTask, addComment } = usePipelineStore()
  const clients     = useClientStore(s => s.clients)
  const projects    = useClientStore(s => s.projects)
  const employees   = useEmployeeStore(s => s.employees)
  const currentUser = useAuthStore(s => s.currentUser)

  const isManager = currentUser?.role === 'MANAGER'
  const isLead    = currentUser?.role === 'LEAD'
  const isArtist  = currentUser?.role === 'ARTIST'

  // Visible task set per role
  const tasks = useMemo<TaskRow[]>(() => {
    if (isManager) return allTasks
    if (isLead) {
      const myProjects = new Set(
        allTasks.filter(t => t.assignedArtistId === currentUser?.id).map(t => t.projectId)
      )
      return allTasks.filter(t => myProjects.has(t.projectId))
    }
    return allTasks.filter(t => t.assignedArtistId === currentUser?.id)
  }, [allTasks, currentUser, isManager, isLead])

  // ── Metrics ──────────────────────────────────────────────────────────────
  const approved   = tasks.filter(t => t.status === 'FINAL_APPROVAL').length
  const inProgress = tasks.filter(t => t.status === 'IN_PROGRESS').length
  const inReview   = tasks.filter(t => t.status === 'LEAD_APPROVAL').length
  const retakes    = tasks.filter(t => t.status === 'LEAD_RETAKE').length
  const overdue    = tasks.filter(t => isOverdue(t.endDate, t.status)).length
  const total      = tasks.length
  const completionPct = total ? Math.round((approved / total) * 100) : 0

  const visibleProjects = useMemo(() => {
    if (isManager) return projects
    const myProjectIds = new Set(tasks.map(t => t.projectId))
    return projects.filter(p => myProjectIds.has(p.id))
  }, [isManager, projects, tasks])

  // ── Daily output (artist + lead) ─────────────────────────────────────────
  const todayApprovals = useMemo(() =>
    tasks.filter(t => t.statusHistory?.some(h => h.to === 'FINAL_APPROVAL' && isToday(parseISO(h.changedAt))))
  , [tasks])
  const todaySubmissions = useMemo(() =>
    tasks.filter(t => t.statusHistory?.some(h => h.to === 'LEAD_APPROVAL' && isToday(parseISO(h.changedAt))))
  , [tasks])
  const todaySeconds = todayApprovals.reduce((acc, t) => acc + (t.seconds ?? 0), 0)

  // ── Action queue tabs (manager+lead vs artist) ───────────────────────────
  const reviewQueue = useMemo(() => {
    if (isManager) return allTasks.filter(t => t.status === 'LEAD_APPROVAL')
    if (isLead)    return tasks.filter(t => t.status === 'LEAD_APPROVAL' && t.assignedArtistId !== currentUser?.id)
    return tasks.filter(t => t.status === 'LEAD_APPROVAL')   // artist's own submitted
  }, [tasks, allTasks, isManager, isLead, currentUser])

  const activeQueue = useMemo(() => tasks.filter(t => t.status === 'IN_PROGRESS'), [tasks])
  const retakeQueue = useMemo(() => tasks.filter(t => t.status === 'LEAD_RETAKE'), [tasks])

  const recentActivity = useMemo(() => {
    type Event = { task: TaskRow; changedAt: string; from: TaskStatus; to: TaskStatus; changedByUserId?: string }
    const events: Event[] = []
    for (const task of tasks) {
      for (const entry of task.statusHistory ?? []) {
        events.push({ task, ...entry })
      }
    }
    return events.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()).slice(0, 12)
  }, [tasks])

  // ── Team workload (manager+lead) ─────────────────────────────────────────
  const teamWorkload = useMemo(() => {
    const byArtist: Record<string, number> = {}
    for (const t of tasks) {
      if (!t.assignedArtistId) continue
      if (t.status === 'IN_PROGRESS' || t.status === 'LEAD_RETAKE' || t.status === 'YET_TO_START') {
        byArtist[t.assignedArtistId] = (byArtist[t.assignedArtistId] ?? 0) + 1
      }
    }
    const list = Object.entries(byArtist)
      .map(([id, count]) => ({ id, count, employee: employees.find(e => e.id === id) }))
      .filter(x => x.employee)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
    const max = list[0]?.count ?? 1
    return { list, max }
  }, [tasks, employees])

  // ── Upcoming deadlines (next 7 days) ─────────────────────────────────────
  const upcomingDeadlines = useMemo(() => {
    const today = startOfDay(new Date())
    return tasks
      .filter(t => t.endDate && t.status !== 'FINAL_APPROVAL' && t.status !== 'DONE')
      .map(t => ({ task: t, end: parseISO(t.endDate as string) }))
      .filter(({ end }) => {
        const diff = differenceInDays(startOfDay(end), today)
        return diff >= -1 && diff <= 7         // include overdue from yesterday + next 7 days
      })
      .sort((a, b) => a.end.getTime() - b.end.getTime())
      .slice(0, 12)
  }, [tasks])

  // ── Stage breakdown (manager+lead) ───────────────────────────────────────
  const stageBreakdown = useMemo(() => {
    return STAGE_CONFIGS.map(stage => {
      const stageTasks = tasks.filter(t => stage.subStages.some(s => s.id === t.subStageId))
      const stageApproved = stageTasks.filter(t => t.status === 'FINAL_APPROVAL').length
      const pct = stageTasks.length ? Math.round((stageApproved / stageTasks.length) * 100) : 0
      return { stage, count: stageTasks.length, pct }
    }).filter(s => s.count > 0)              // only show stages with tasks
  }, [tasks])

  // ── Tab state ────────────────────────────────────────────────────────────
  type Tab = 'review' | 'active' | 'retakes' | 'activity'
  const defaultTab: Tab = isArtist ? 'active' : 'review'
  const [tab, setTab] = useState<Tab>(defaultTab)

  // ── Retake modal state (manager+lead approval action) ────────────────────
  const [retakeModal, setRetakeModal] = useState<RetakeModalState | null>(null)
  const [retakeNote, setRetakeNote]   = useState('')
  const canReview = isManager || isLead

  async function handleApprove(taskId: string) {
    await addComment(taskId, 'Approved.', 'approval')
    await updateTask(taskId, { retakeNote: null, status: 'FINAL_APPROVAL' })
  }

  async function handleSendRetake() {
    if (!retakeModal || !retakeNote.trim()) return
    const note = retakeNote.trim()
    await addComment(retakeModal.taskId, note, 'retake')
    await updateTask(retakeModal.taskId, { retakeNote: note, status: 'LEAD_RETAKE' })
    setRetakeModal(null)
    setRetakeNote('')
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-[#1a263e] pb-4">
          <div>
            <h1 className="text-xl font-black tracking-wide text-white uppercase flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-400" />
              {isManager
                ? 'Production Control'
                : isLead
                  ? `Lead Desk · ${currentUser?.name?.split(' ')[0]}`
                  : `Artist Desk · ${currentUser?.name?.split(' ')[0]}`}
            </h1>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
              {isManager
                ? 'Global studio pipeline · live'
                : isLead
                  ? 'Team supervision & approval queue'
                  : 'Your active assignments'}
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm font-mono font-bold text-slate-200">{format(now, 'h:mm a')}</div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{format(now, 'EEEE · d MMM yyyy')}</div>
          </div>
        </div>

        {/* ── KPI strip ───────────────────────────────────────────────────── */}
        <KpiStrip
          isManager={isManager}
          inProgress={inProgress}
          inReview={inReview}
          retakes={retakes}
          overdue={overdue}
          approved={approved}
          total={total}
          completionPct={completionPct}
          projectsCount={visibleProjects.length}
        />

        {/* ── Daily output for artist+lead, full width strip ─────────────── */}
        {!isManager && (todayApprovals.length > 0 || todaySubmissions.length > 0) && (
          <div className="bg-gradient-to-r from-emerald-500/10 via-[#0c1221] to-sky-500/10 rounded-xl border border-emerald-500/20 p-4 shadow-lg">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <h2 className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">
                Today's Output · {format(now, 'EEEE, MMM d')}
              </h2>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <DailyChip icon={CheckCheck}  count={todayApprovals.length}   label="Approved Today"   color="emerald" />
              <DailyChip icon={TrendingUp}  count={todaySubmissions.length} label="Submitted Today"  color="sky" />
              <DailyChip icon={Film}        count={`${todaySeconds.toFixed(1)}s`} label="Footage Delivered" color="indigo" />
            </div>
          </div>
        )}

        {/* ── Two-column: Action queue + Sidebar ─────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT — tabbed action queue */}
          <div className="lg:col-span-2 bg-[#0c1221] rounded-xl border border-[#1b253b] shadow-lg overflow-hidden flex flex-col">
            <TabBar
              tab={tab}
              setTab={setTab}
              counts={{ review: reviewQueue.length, active: activeQueue.length, retakes: retakeQueue.length, activity: recentActivity.length }}
              isArtist={isArtist}
            />
            <div className="flex-1 max-h-[480px] overflow-y-auto">
              {tab === 'review' && (
                <ReviewQueueList
                  tasks={reviewQueue}
                  projects={projects}
                  employees={employees}
                  clients={clients}
                  canReview={canReview}
                  onApprove={handleApprove}
                  onRetake={(taskId, taskName) => { setRetakeModal({ taskId, taskName }); setRetakeNote('') }}
                />
              )}
              {tab === 'active' && (
                <SimpleTaskList tasks={activeQueue} projects={projects} clients={clients} employees={employees} emptyText="Nothing in progress." />
              )}
              {tab === 'retakes' && (
                <SimpleTaskList tasks={retakeQueue} projects={projects} clients={clients} employees={employees} highlightRetake
                  emptyText={isArtist ? 'No retakes — all clear.' : 'No retakes pending.'} />
              )}
              {tab === 'activity' && (
                <ActivityFeed events={recentActivity} projects={projects} clients={clients} employees={employees} />
              )}
            </div>
          </div>

          {/* RIGHT — sidebar */}
          <div className="space-y-6">
            {/* Stage progress */}
            <div className="bg-[#0c1221] rounded-xl border border-[#1b253b] shadow-lg p-5">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Briefcase className="w-3 h-3" /> Stage Progress
              </h2>
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {stageBreakdown.length === 0 ? (
                  <p className="text-[11px] text-slate-600 italic">No tasks yet</p>
                ) : stageBreakdown.map(({ stage, count, pct }) => (
                  <div key={stage.id} className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <span>{stage.icon}</span>
                        <span className="text-slate-200">{stage.name}</span>
                        <span className="text-slate-600 font-medium">· {count}</span>
                      </span>
                      <span className="text-indigo-400 font-black">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-[#090d16] rounded-full border border-[#1b253b] overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 transition-all duration-300" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Team workload — manager + lead only */}
            {!isArtist && (
              <div className="bg-[#0c1221] rounded-xl border border-[#1b253b] shadow-lg p-5">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Users className="w-3 h-3" /> Team Workload
                </h2>
                {teamWorkload.list.length === 0 ? (
                  <p className="text-[11px] text-slate-600 italic">No active assignments</p>
                ) : (
                  <div className="space-y-2">
                    {teamWorkload.list.map(({ id, count, employee }) => {
                      const widthPct = Math.round((count / teamWorkload.max) * 100)
                      const isHot = count >= 8
                      return (
                        <div key={id} className="flex items-center gap-2.5">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-black shrink-0 border border-white/10"
                            style={{ backgroundColor: employee?.avatarColor ?? '#6366f1' }}
                          >
                            {initials(employee?.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[11px] font-bold text-slate-200 truncate">{employee?.name}</span>
                              <span className={clsx('text-[10px] font-black font-mono', isHot ? 'text-rose-400' : 'text-indigo-400')}>
                                {count}
                              </span>
                            </div>
                            <div className="h-1 bg-[#090d16] rounded-full border border-[#1b253b] overflow-hidden">
                              <div className={clsx('h-full transition-all duration-300', isHot ? 'bg-gradient-to-r from-rose-500 to-rose-400' : 'bg-gradient-to-r from-indigo-500 to-indigo-400')}
                                style={{ width: `${widthPct}%` }} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Upcoming Deadlines ─────────────────────────────────────────── */}
        {upcomingDeadlines.length > 0 && (
          <div className="bg-[#0c1221] rounded-xl border border-[#1b253b] shadow-lg p-5">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> Upcoming Deadlines · Next 7 Days
            </h2>
            <DeadlineTable items={upcomingDeadlines} projects={projects} clients={clients} employees={employees} />
          </div>
        )}

        {/* ── Active Projects grid ───────────────────────────────────────── */}
        <div className="bg-[#0c1221] rounded-xl border border-[#1b253b] shadow-lg p-5">
          <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Film className="w-3 h-3" /> {isManager ? 'Active Animation Projects' : 'My Connected Projects'}
          </h2>
          {visibleProjects.length === 0 ? (
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">No active projects.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleProjects.map(proj => {
                const client = clients.find(c => c.id === proj.clientId)
                const projTasks = (isManager ? allTasks : tasks).filter(t => t.projectId === proj.id)
                const projApproved = projTasks.filter(t => t.status === 'FINAL_APPROVAL').length
                const projRetakes  = projTasks.filter(t => t.status === 'LEAD_RETAKE').length
                const projReview   = projTasks.filter(t => t.status === 'LEAD_APPROVAL').length
                const pct = projTasks.length ? Math.round((projApproved / projTasks.length) * 100) : 0
                return (
                  <Link
                    key={proj.id}
                    to={`/clients/${proj.clientId}/projects/${proj.id}`}
                    className="block p-3.5 rounded-lg bg-[#080d17]/60 border border-[#1a263e] hover:border-indigo-500/40 hover:bg-[#0f1626] transition-all group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0">
                        <div className="text-xs font-black text-slate-100 uppercase tracking-wide truncate group-hover:text-indigo-300">{proj.name}</div>
                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 truncate">{client?.name}</div>
                      </div>
                      <span className="text-[10px] font-black text-indigo-400 font-mono shrink-0 ml-2">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-[#0a0d16] rounded-full border border-[#1b253b] overflow-hidden mb-2">
                      <div className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap text-[9px] font-black uppercase tracking-wider">
                      <span className="text-slate-500">{projTasks.length} tasks</span>
                      {projReview > 0 && <span className="text-sky-400 bg-sky-500/10 border border-sky-500/20 px-1.5 rounded">{projReview} review</span>}
                      {projRetakes > 0 && <span className="text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 rounded animate-pulse">{projRetakes} retake</span>}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Retake modal (manager/lead approval action) ──────────────────── */}
      {retakeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0c1221] border border-[#1b253b] rounded-xl shadow-2xl shadow-black/60 p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-rose-500/15 flex items-center justify-center shrink-0">
                <RotateCcw className="w-4 h-4 text-rose-400" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-100 uppercase tracking-wide">Send for Retake</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  <span className="text-indigo-400 font-bold">{retakeModal.taskName}</span> — tell the artist what needs to be fixed
                </p>
              </div>
            </div>
            <textarea
              value={retakeNote}
              onChange={e => setRetakeNote(e.target.value)}
              placeholder="Describe what needs to be corrected or improved…"
              rows={4}
              autoFocus
              className="w-full px-3 py-2.5 text-xs border border-[#1b253b] rounded-lg bg-[#0a0f1b] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-rose-500/60 resize-none transition-colors"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setRetakeModal(null); setRetakeNote('') }}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-400 border border-[#1b253b] rounded-lg hover:bg-[#131b2e] hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendRetake}
                disabled={!retakeNote.trim()}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Send Retake
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

interface KpiStripProps {
  isManager: boolean
  inProgress: number; inReview: number; retakes: number; overdue: number
  approved: number; total: number; completionPct: number; projectsCount: number
}

function KpiStrip({ isManager, inProgress, inReview, retakes, overdue, approved, total, completionPct, projectsCount }: KpiStripProps) {
  const cards = isManager
    ? [
        { label: 'Active Projects', value: projectsCount, hint: `${total} elements`, color: 'text-violet-400', bg: 'bg-violet-500/10',  icon: Briefcase },
        { label: 'In Progress',     value: inProgress,    hint: 'currently active', color: 'text-amber-400',  bg: 'bg-amber-500/10',   icon: Clock },
        { label: 'Awaiting Review', value: inReview,      hint: 'pending approval', color: 'text-sky-400',    bg: 'bg-sky-500/10',     icon: CheckCircle, pulse: inReview > 0 },
        { label: 'Approved',        value: `${completionPct}%`, hint: `${approved} of ${total}`, color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCheck },
        { label: 'Overdue',         value: overdue,       hint: overdue > 0 ? 'past end-date' : 'on schedule', color: overdue > 0 ? 'text-rose-400' : 'text-slate-500', bg: overdue > 0 ? 'bg-rose-500/10 animate-pulse' : 'bg-slate-500/10', icon: AlertTriangle },
      ]
    : [
        { label: 'My Assignments', value: total,      hint: `${approved} approved`, color: 'text-indigo-400', bg: 'bg-indigo-500/10', icon: Briefcase },
        { label: 'Active Working', value: inProgress, hint: 'in progress now',      color: 'text-amber-400',  bg: 'bg-amber-500/10',  icon: Clock },
        { label: 'Submitted',      value: inReview,   hint: 'awaiting lead',        color: 'text-sky-400',    bg: 'bg-sky-500/10',    icon: CheckCircle },
        { label: 'Retakes',        value: retakes,    hint: 'need rework',          color: retakes > 0 ? 'text-rose-400' : 'text-slate-500', bg: retakes > 0 ? 'bg-rose-500/10 animate-pulse' : 'bg-slate-500/10', icon: RotateCcw, pulse: retakes > 0 },
        { label: 'Overdue',        value: overdue,    hint: overdue > 0 ? 'past end-date' : 'on schedule', color: overdue > 0 ? 'text-rose-400' : 'text-slate-500', bg: overdue > 0 ? 'bg-rose-500/10' : 'bg-slate-500/10', icon: AlertTriangle },
      ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map(c => (
        <div key={c.label} className="bg-[#0c1221] rounded-xl border border-[#1b253b] p-3.5 shadow-lg flex items-center gap-3 hover:border-indigo-500/30 transition-colors">
          <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', c.bg)}>
            <c.icon className={clsx('w-4 h-4', c.color)} />
          </div>
          <div className="min-w-0 flex-1">
            <div className={clsx('text-xl font-black tracking-tight text-white', c.pulse && 'animate-pulse')}>{c.value}</div>
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{c.label}</div>
            <div className="text-[9px] font-medium text-slate-600 mt-0.5 truncate">{c.hint}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function DailyChip({ icon: Icon, count, label, color }: { icon: typeof Sparkles; count: number | string; label: string; color: 'emerald' | 'sky' | 'indigo' }) {
  const colorMap = {
    emerald: { bg: 'bg-emerald-500/10 border-emerald-500/20', icon: 'text-emerald-400', label: 'text-emerald-300' },
    sky:     { bg: 'bg-sky-500/10 border-sky-500/20',         icon: 'text-sky-400',     label: 'text-sky-300' },
    indigo:  { bg: 'bg-indigo-500/10 border-indigo-500/20',   icon: 'text-indigo-400',  label: 'text-indigo-300' },
  }
  const s = colorMap[color]
  return (
    <div className={clsx('flex items-center gap-2.5 px-3 py-2 rounded-lg border', s.bg)}>
      <Icon className={clsx('w-4 h-4 shrink-0', s.icon)} />
      <div>
        <div className="text-lg font-black text-white leading-tight">{count}</div>
        <div className={clsx('text-[9px] font-bold uppercase tracking-wider', s.label)}>{label}</div>
      </div>
    </div>
  )
}

function TabBar({ tab, setTab, counts, isArtist }: {
  tab: 'review' | 'active' | 'retakes' | 'activity'
  setTab: (t: 'review' | 'active' | 'retakes' | 'activity') => void
  counts: { review: number; active: number; retakes: number; activity: number }
  isArtist: boolean
}) {
  const tabs: Array<{ id: typeof tab; label: string; count: number; color: string; show: boolean }> = [
    { id: 'review',   label: isArtist ? 'Awaiting Review' : 'Pending Review', count: counts.review,   color: 'sky',     show: true },
    { id: 'active',   label: 'Active Work',                                   count: counts.active,   color: 'amber',   show: true },
    { id: 'retakes',  label: 'Retakes',                                       count: counts.retakes,  color: 'rose',    show: true },
    { id: 'activity', label: 'Recent Activity',                               count: counts.activity, color: 'indigo',  show: counts.activity > 0 },
  ]

  const colorMap: Record<string, string> = {
    sky:    'text-sky-400 border-sky-500',
    amber:  'text-amber-400 border-amber-500',
    rose:   'text-rose-400 border-rose-500',
    indigo: 'text-indigo-400 border-indigo-500',
  }
  const inactiveCls = 'text-slate-500 border-transparent hover:text-slate-300'

  return (
    <div className="flex border-b border-[#1a263e] bg-[#080d17]/50 overflow-x-auto">
      {tabs.filter(t => t.show).map(t => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={clsx(
            'flex items-center gap-1.5 px-4 py-3 text-[11px] font-black uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap',
            tab === t.id ? colorMap[t.color] : inactiveCls,
          )}
        >
          <span>{t.label}</span>
          {t.count > 0 && (
            <span className={clsx(
              'min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[9px] font-black',
              tab === t.id
                ? clsx('bg-current/20', colorMap[t.color].split(' ')[0])
                : 'bg-[#1b253b] text-slate-400',
            )}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

function ReviewQueueList({ tasks, projects, employees, clients, canReview, onApprove, onRetake }: {
  tasks: TaskRow[]; projects: ReturnType<typeof useClientStore.getState>['projects']
  employees: ReturnType<typeof useEmployeeStore.getState>['employees']
  clients: ReturnType<typeof useClientStore.getState>['clients']
  canReview: boolean
  onApprove: (id: string) => void
  onRetake: (id: string, name: string) => void
}) {
  if (tasks.length === 0) {
    return <EmptyState icon={CheckCircle} text="Nothing pending review — inbox zero." accent="emerald" />
  }
  return (
    <div className="divide-y divide-[#141d2f]">
      {tasks.map(task => {
        const project  = projects.find(p => p.id === task.projectId)
        const client   = clients.find(c => c.id === project?.clientId)
        const artist   = employees.find(e => e.id === task.assignedArtistId)
        const subStage = SUB_STAGE_MAP[task.subStageId]
        const submittedAt = task.statusHistory?.findLast?.(h => h.to === 'LEAD_APPROVAL')?.changedAt
        const href = pipelineHref(task, client?.id)
        return (
          <div key={task.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[#101728] transition-colors">
            {artist && (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-black shrink-0 border border-white/10"
                style={{ backgroundColor: artist.avatarColor ?? '#6366f1' }}
                title={artist.name}
              >
                {initials(artist.name)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {href ? (
                  <Link to={href} className="text-xs font-bold text-slate-100 hover:text-indigo-400 transition-colors uppercase tracking-wide truncate">
                    {task.itemName}
                  </Link>
                ) : (
                  <span className="text-xs font-bold text-slate-100 uppercase tracking-wide truncate">{task.itemName}</span>
                )}
                <StatusPill status={task.status} size="sm" />
              </div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 truncate">
                {artist?.name ?? 'Unassigned'} · {project?.name ?? '—'} · {subStage?.name ?? task.subStageId}
                {submittedAt && <span className="text-slate-600"> · {relativeTime(submittedAt)}</span>}
              </div>
            </div>
            {canReview && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => onApprove(task.id)}
                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-500 rounded-md transition-colors"
                >
                  <CheckCheck className="w-3 h-3" /> Approve
                </button>
                <button
                  onClick={() => onRetake(task.id, task.itemName)}
                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-400 border border-rose-500/30 hover:bg-rose-500/15 rounded-md transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> Retake
                </button>
              </div>
            )}
            {href && (
              <Link to={href} className="p-1 text-slate-600 hover:text-slate-200 transition-colors shrink-0">
                <ChevronRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SimpleTaskList({ tasks, projects, clients, employees, emptyText, highlightRetake }: {
  tasks: TaskRow[]; projects: ReturnType<typeof useClientStore.getState>['projects']
  clients: ReturnType<typeof useClientStore.getState>['clients']
  employees: ReturnType<typeof useEmployeeStore.getState>['employees']
  emptyText: string
  highlightRetake?: boolean
}) {
  if (tasks.length === 0) {
    return <EmptyState icon={CheckCircle} text={emptyText} accent="slate" />
  }
  return (
    <div className="divide-y divide-[#141d2f]">
      {tasks.slice(0, 20).map(task => {
        const project = projects.find(p => p.id === task.projectId)
        const client  = clients.find(c => c.id === project?.clientId)
        const artist  = employees.find(e => e.id === task.assignedArtistId)
        const subStage = SUB_STAGE_MAP[task.subStageId]
        const href = pipelineHref(task, client?.id)
        return (
          <Link
            key={task.id}
            to={href ?? '#'}
            className={clsx(
              'flex items-center gap-3 px-4 py-3 hover:bg-[#101728] transition-colors group',
              highlightRetake && 'bg-rose-950/10',
            )}
          >
            {artist ? (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-black shrink-0 border border-white/10"
                style={{ backgroundColor: artist.avatarColor ?? '#6366f1' }}
                title={artist.name}
              >
                {initials(artist.name)}
              </div>
            ) : (
              <div className="w-7 h-7 rounded-full bg-slate-800/60 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={clsx(
                  'text-xs font-bold uppercase tracking-wide truncate group-hover:text-indigo-300',
                  highlightRetake ? 'text-rose-300' : 'text-slate-100',
                )}>
                  {task.itemName}
                </span>
                <StatusPill status={task.status} size="sm" />
              </div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 truncate">
                {artist?.name ?? 'Unassigned'} · {project?.name ?? '—'} · {subStage?.name ?? task.subStageId}
              </div>
              {highlightRetake && task.retakeNote && (
                <p className="text-[10px] text-rose-400 mt-1 line-clamp-1">{task.retakeNote}</p>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 shrink-0" />
          </Link>
        )
      })}
    </div>
  )
}

function ActivityFeed({ events, projects, clients, employees }: {
  events: Array<{ task: TaskRow; changedAt: string; from: TaskStatus; to: TaskStatus; changedByUserId?: string }>
  projects: ReturnType<typeof useClientStore.getState>['projects']
  clients: ReturnType<typeof useClientStore.getState>['clients']
  employees: ReturnType<typeof useEmployeeStore.getState>['employees']
}) {
  if (events.length === 0) {
    return <EmptyState icon={Clock} text="No recent activity." accent="slate" />
  }
  return (
    <div className="divide-y divide-[#141d2f]">
      {events.map((ev, i) => {
        const actor   = employees.find(e => e.id === ev.changedByUserId)
        const project = projects.find(p => p.id === ev.task.projectId)
        const client  = clients.find(c => c.id === project?.clientId)
        const subStage = SUB_STAGE_MAP[ev.task.subStageId]
        const href = pipelineHref(ev.task, client?.id)
        return (
          <Link
            key={`${ev.task.id}-${i}-${ev.changedAt}`}
            to={href ?? '#'}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#101728] transition-colors group"
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-black shrink-0 border border-white/10"
              style={{ backgroundColor: actor?.avatarColor ?? '#6366f1' }}
              title={actor?.name}
            >
              {initials(actor?.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-slate-300 truncate">
                <span className="font-bold text-slate-100">{actor?.name?.split(' ')[0] ?? 'System'}</span>
                <span className="text-slate-500"> moved </span>
                <span className="font-bold text-indigo-300">{ev.task.itemName}</span>
                <span className="text-slate-500"> to </span>
                <span className={clsx('font-bold', STATUS_CONFIG[ev.to]?.color)}>
                  {STATUS_CONFIG[ev.to]?.label ?? ev.to}
                </span>
              </div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 truncate">
                {project?.name ?? '—'} · {subStage?.name ?? ev.task.subStageId} · {relativeTime(ev.changedAt)}
              </div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-700 group-hover:text-indigo-400 shrink-0" />
          </Link>
        )
      })}
    </div>
  )
}

function DeadlineTable({ items, projects, clients, employees }: {
  items: Array<{ task: TaskRow; end: Date }>
  projects: ReturnType<typeof useClientStore.getState>['projects']
  clients: ReturnType<typeof useClientStore.getState>['clients']
  employees: ReturnType<typeof useEmployeeStore.getState>['employees']
}) {
  function dayLabel(end: Date): { label: string; tone: 'overdue' | 'today' | 'soon' | 'later' } {
    const diff = differenceInDays(startOfDay(end), startOfDay(new Date()))
    if (diff < 0)        return { label: `${Math.abs(diff)}d late`, tone: 'overdue' }
    if (isToday(end))    return { label: 'Today',     tone: 'today' }
    if (isTomorrow(end)) return { label: 'Tomorrow',  tone: 'soon' }
    if (diff <= 3)       return { label: `${diff}d`,  tone: 'soon' }
    return { label: format(end, 'EEE d MMM'), tone: 'later' }
  }
  const toneStyle: Record<string, string> = {
    overdue: 'text-rose-400 bg-rose-500/10 border-rose-500/20 animate-pulse',
    today:   'text-orange-400 bg-orange-500/10 border-orange-500/20 animate-pulse',
    soon:    'text-amber-400 bg-amber-500/10 border-amber-500/20',
    later:   'text-slate-400 bg-slate-500/10 border-slate-600/30',
  }
  return (
    <div className="divide-y divide-[#141d2f]">
      {items.map(({ task, end }) => {
        const lbl = dayLabel(end)
        const artist  = employees.find(e => e.id === task.assignedArtistId)
        const project = projects.find(p => p.id === task.projectId)
        const client  = clients.find(c => c.id === project?.clientId)
        const subStage = SUB_STAGE_MAP[task.subStageId]
        const href = pipelineHref(task, client?.id)
        return (
          <Link
            key={task.id}
            to={href ?? '#'}
            className="flex items-center gap-3 px-2 py-2.5 hover:bg-[#101728] rounded-md transition-colors group -mx-2"
          >
            <span className={clsx('text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded border shrink-0 w-20 text-center font-mono', toneStyle[lbl.tone])}>
              {lbl.label}
            </span>
            {artist && (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[8px] font-black shrink-0 border border-white/10"
                style={{ backgroundColor: artist.avatarColor ?? '#6366f1' }}
                title={artist.name}
              >
                {initials(artist.name)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-slate-100 uppercase tracking-wide truncate group-hover:text-indigo-300">{task.itemName}</div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">
                {artist?.name ?? 'Unassigned'} · {project?.name ?? '—'} · {subStage?.name ?? task.subStageId}
              </div>
            </div>
            <StatusPill status={task.status} size="sm" />
            <ChevronRight className="w-3.5 h-3.5 text-slate-700 group-hover:text-indigo-400 shrink-0" />
          </Link>
        )
      })}
    </div>
  )
}

function EmptyState({ icon: Icon, text, accent }: { icon: typeof CheckCircle; text: string; accent: 'emerald' | 'sky' | 'rose' | 'slate' }) {
  const colorMap = {
    emerald: 'text-emerald-500/40',
    sky:     'text-sky-500/40',
    rose:    'text-rose-500/40',
    slate:   'text-slate-700',
  }
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2">
      <Icon className={clsx('w-8 h-8', colorMap[accent])} />
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{text}</p>
    </div>
  )
}
