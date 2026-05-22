import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { usePipelineStore } from '../store/pipelineStore'
import { useClientStore } from '../store/clientStore'
import { useEmployeeStore } from '../store/employeeStore'
import { SUB_STAGE_MAP, SUB_STAGE_TO_STAGE_SLUG } from '../config/stageConfigs'
import { StatusPill } from '../components/ui/StatusPill'
import { getDeadlineLevel, daysUntil, DEADLINE_BADGE } from '../utils/deadline'
import type { TaskRow } from '../types'
import { ChevronRight, AlertTriangle, Clock, CheckCircle, Layers, Users } from 'lucide-react'
import { clsx } from 'clsx'

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

interface StageGroup {
  subStageId: string
  tasks: TaskRow[]
}

interface ProjectGroup {
  projectId: string
  projectName: string
  clientName: string
  clientId: string
  stageGroups: StageGroup[]
}

export function MyWorkPage() {
  const currentUser = useAuthStore(s => s.currentUser)
  const allTasks    = usePipelineStore(s => s.tasks)
  const projects    = useClientStore(s => s.projects)
  const clients     = useClientStore(s => s.clients)
  const employees   = useEmployeeStore(s => s.employees)

  const isArtist = currentUser?.role === 'ARTIST'
  const isLead   = currentUser?.role === 'LEAD'

  // Artists: only their tasks. Leads: all tasks in projects they participate in.
  const myTasks = useMemo(() => {
    if (isArtist) return allTasks.filter(t => t.assignedArtistId === currentUser?.id)
    if (isLead) {
      const myProjectIds = new Set(
        allTasks.filter(t => t.assignedArtistId === currentUser?.id).map(t => t.projectId)
      )
      return allTasks.filter(t => myProjectIds.has(t.projectId))
    }
    return allTasks
  }, [allTasks, currentUser, isArtist, isLead])

  const grouped = useMemo<ProjectGroup[]>(() => {
    const byProject: Record<string, ProjectGroup> = {}

    myTasks.forEach(task => {
      const proj   = projects.find(p => p.id === task.projectId)
      const client = clients.find(c => c.id === proj?.clientId)
      if (!proj || !client) return

      if (!byProject[task.projectId]) {
        byProject[task.projectId] = {
          projectId:   task.projectId,
          projectName: proj.name,
          clientName:  client.name,
          clientId:    client.id,
          stageGroups: [],
        }
      }

      let sg = byProject[task.projectId].stageGroups.find(g => g.subStageId === task.subStageId)
      if (!sg) {
        sg = { subStageId: task.subStageId, tasks: [] }
        byProject[task.projectId].stageGroups.push(sg)
      }
      sg.tasks.push(task)
    })

    return Object.values(byProject)
  }, [myTasks, projects, clients])

  const retakeCount = myTasks.filter(t => t.status === 'LEAD_RETAKE').length
  const activeCount = myTasks.filter(t => t.status === 'IN_PROGRESS').length
  const waitCount   = myTasks.filter(t => t.status === 'LEAD_APPROVAL').length
  const doneCount   = myTasks.filter(t => t.status === 'FINAL_APPROVAL' || t.status === 'DONE').length

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="border-b border-[#1a263e] pb-5">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-black shrink-0 border border-white/10 shadow"
              style={{ backgroundColor: currentUser?.avatarColor ?? '#6366f1' }}
            >
              {getInitials(currentUser?.name ?? '?')}
            </div>
            <div>
              <h1 className="text-xl font-black tracking-wide text-white uppercase">
                {currentUser?.name}'s Work
              </h1>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                {currentUser?.department} · {myTasks.length} tasks across {grouped.length} project{grouped.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex flex-wrap gap-3 mt-4">
            {[
              { label: 'Active',         value: activeCount, color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
              { label: 'In Review',      value: waitCount,   color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20' },
              { label: 'Retake',         value: retakeCount, color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20', pulse: retakeCount > 0 },
              { label: 'Approved',       value: doneCount,   color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
            ].map(s => (
              <div key={s.label} className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold', s.bg, s.border, s.pulse && 'animate-pulse')}>
                <span className={s.color}>{s.value}</span>
                <span className="text-slate-400 uppercase tracking-wider text-[10px]">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Retake alert strip ───────────────────────────────────────── */}
        {retakeCount > 0 && (
          <div className="flex items-center gap-2.5 px-4 py-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs font-bold text-rose-400 uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 shrink-0 animate-pulse" />
            {retakeCount} task{retakeCount > 1 ? 's' : ''} need{retakeCount === 1 ? 's' : ''} your attention — lead has sent a retake request
          </div>
        )}

        {/* ── Project groups ───────────────────────────────────────────── */}
        {grouped.length === 0 ? (
          <div className="text-center py-20 bg-[#0d1424] rounded-xl border border-[#1b253b]">
            <Layers className="w-10 h-10 mx-auto mb-3 text-slate-700" />
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">No tasks assigned yet</p>
          </div>
        ) : (
          grouped.map(pg => (
            <div key={pg.projectId} className="bg-[#0c1221] rounded-xl border border-[#1b253b] overflow-hidden shadow-lg">

              {/* Project header */}
              <div className="px-5 py-3.5 bg-[#080d1a] border-b border-[#1a263e] flex items-center justify-between">
                <div>
                  <Link
                    to={`/clients/${pg.clientId}/projects/${pg.projectId}`}
                    className="text-sm font-black text-white uppercase tracking-wide hover:text-indigo-400 transition-colors"
                  >
                    {pg.projectName}
                  </Link>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">{pg.clientName}</div>
                </div>
                <span className="text-[10px] font-black text-slate-500 border border-[#1b253b] px-2 py-0.5 rounded font-mono">
                  {pg.stageGroups.reduce((acc, g) => acc + g.tasks.length, 0)} tasks
                </span>
              </div>

              {/* Stage groups */}
              <div className="divide-y divide-[#111929]">
                {pg.stageGroups.map(sg => {
                  const subStage  = SUB_STAGE_MAP[sg.subStageId]
                  const stageSlug = SUB_STAGE_TO_STAGE_SLUG[sg.subStageId]
                  if (!subStage || !stageSlug) return null

                  return (
                    <div key={sg.subStageId}>
                      {/* Stage header row */}
                      <div className="px-5 py-2 bg-[#0a0f1b] flex items-center justify-between">
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                          {subStage.name}
                        </span>
                        <Link
                          to={`/clients/${pg.clientId}/projects/${pg.projectId}/pipeline/${stageSlug}/${subStage.slug}`}
                          className="text-[9px] font-black text-slate-500 hover:text-indigo-400 uppercase tracking-wider flex items-center gap-1 transition-colors"
                        >
                          Open Stage <ChevronRight className="w-3 h-3" />
                        </Link>
                      </div>

                      {/* Task rows */}
                      <div className="divide-y divide-[#0d1525]">
                        {sg.tasks.map(task => {
                          const level       = getDeadlineLevel(task.endDate, task.status)
                          const days        = daysUntil(task.endDate)
                          const badge       = level !== 'ok' ? DEADLINE_BADGE[level] : null
                          const artist      = task.assignedArtistId
                            ? employees.find(e => e.id === task.assignedArtistId) : null

                          return (
                            <Link
                              key={task.id}
                              to={`/clients/${pg.clientId}/projects/${pg.projectId}/pipeline/${stageSlug}/${subStage.slug}?open=${task.id}`}
                              className={clsx(
                                'flex items-center gap-3 px-5 py-3 hover:bg-[#131b2e] transition-colors group',
                                task.status === 'LEAD_RETAKE' && 'bg-rose-950/10 hover:bg-rose-950/20'
                              )}
                            >
                              {/* Retake indicator */}
                              {task.status === 'LEAD_RETAKE' && (
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 animate-pulse" />
                              )}
                              {task.status === 'LEAD_APPROVAL' && (
                                <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                              )}
                              {task.status === 'FINAL_APPROVAL' && (
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              )}
                              {!['LEAD_RETAKE', 'LEAD_APPROVAL', 'FINAL_APPROVAL'].includes(task.status) && (
                                <div className="w-3.5 shrink-0" />
                              )}

                              {/* Name */}
                              <div className="flex-1 min-w-0">
                                <div className={clsx(
                                  'text-xs font-bold uppercase tracking-wide truncate',
                                  task.status === 'LEAD_RETAKE' ? 'text-rose-300' : 'text-slate-100'
                                )}>
                                  {task.itemName}
                                  {task.shotNumber && task.shotNumber !== task.itemName && (
                                    <span className="ml-1.5 text-slate-500 font-mono text-[10px]">#{task.shotNumber}</span>
                                  )}
                                </div>
                                {task.status === 'LEAD_RETAKE' && task.retakeNote && (
                                  <p className="text-[10px] text-rose-400 mt-0.5 truncate">{task.retakeNote}</p>
                                )}
                                {/* Lead: show artist name */}
                                {!isArtist && artist && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <span
                                      className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-white text-[7px] font-black shrink-0"
                                      style={{ backgroundColor: artist.avatarColor ?? '#6366f1' }}
                                    >
                                      {getInitials(artist.name)}
                                    </span>
                                    <span className="text-[9px] text-slate-500 font-medium">{artist.name}</span>
                                  </div>
                                )}
                              </div>

                              {/* Status pill */}
                              <StatusPill status={task.status} size="sm" />

                              {/* Deadline badge */}
                              {badge && (
                                <span className={clsx('text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border', badge.cls)}>
                                  {days === null ? badge.label : days < 0 ? `${Math.abs(days)}d late` : days === 0 ? 'Today' : `${days}d`}
                                </span>
                              )}

                              {/* Arrow */}
                              <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-indigo-400 transition-colors shrink-0" />
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
