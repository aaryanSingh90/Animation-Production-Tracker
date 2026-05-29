import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Film, Image as ImageIcon, Briefcase, User, Grid3X3, CheckCircle2, Search, X as XIcon, AlertTriangle } from 'lucide-react'
import { clsx } from 'clsx'
import { useClientStore } from '../store/clientStore'
import { usePipelineStore } from '../store/pipelineStore'
import { useEmployeeStore } from '../store/employeeStore'
import { STAGE_CONFIGS } from '../config/stageConfigs'
import { StatusDropdown } from '../components/ui/StatusDropdown'
import { StatusPill } from '../components/ui/StatusPill'
import { formatSeconds } from '../utils/calcSeconds'
import type { TaskRow, Project, Client } from '../types'

const SHOT_STAGES = STAGE_CONFIGS.filter(s => s.workflowType === 'SHOT')

const ALL_CLIENTS  = '__all_clients__'
const ALL_PROJECTS = '__all_projects__'
const NO_CLIENT    = '__no_client__'

const LS_KEY = 'shothub:matrix:client'

type View = 'project' | 'shot' | 'character'

// Character-pipeline sub-stages (what gets tracked per character/asset across projects)
const CHARACTER_STAGES: Array<{ key: string; label: string; subStageId: string }> = [
  { key: 'mod',  label: 'Modelling',    subStageId: 'modelling-character' },
  { key: 'bs',   label: 'Blendshapes',  subStageId: 'modelling-character-blendshapes' },
  { key: 'rig',  label: 'Rigging',      subStageId: 'rigging-character' },
  { key: 'tex',  label: 'Texturing',    subStageId: 'texturing-character' },
]

// ═══════════════════════════════════════════════════════════════════════════
// Top-level page — tabs + shared client filter
// ═══════════════════════════════════════════════════════════════════════════

export function ShotMatrix() {
  const clients          = useClientStore(s => s.clients)
  const projects         = useClientStore(s => s.projects)
  const tasks            = usePipelineStore(s => s.tasks)
  const loadForProject   = usePipelineStore(s => s.loadForProject)
  const employees        = useEmployeeStore(s => s.employees)
  const updateTaskStatus = usePipelineStore(s => s.updateTaskStatus)

  const [view, setView] = useState<View>('project')

  // ── Client selection ─────────────────────────────────────────────────────
  // Default: no client selected (empty state). Remembered across page reloads.
  const [selectedClientId, setSelectedClientId] = useState<string>(() => {
    try { return localStorage.getItem(LS_KEY) ?? NO_CLIENT } catch { return NO_CLIENT }
  })

  // Persist selection so the user doesn't have to re-select on every visit
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, selectedClientId) } catch {}
  }, [selectedClientId])

  // Projects in scope for the selected client (or all if ALL_CLIENTS)
  const visibleProjects = useMemo(() => {
    if (selectedClientId === NO_CLIENT) return []
    if (selectedClientId === ALL_CLIENTS) return projects
    return projects.filter(p => p.clientId === selectedClientId)
  }, [projects, selectedClientId])

  // ── Project search ───────────────────────────────────────────────────────
  const [projectSearch, setProjectSearch] = useState('')
  // Clear search when client changes
  useEffect(() => { setProjectSearch('') }, [selectedClientId])

  // Projects after applying the search filter — passed to all three views
  const displayProjects = useMemo(() => {
    if (!projectSearch.trim()) return visibleProjects
    const q = projectSearch.toLowerCase().trim()
    return visibleProjects.filter(p => p.name.toLowerCase().includes(q))
  }, [visibleProjects, projectSearch])

  // ── Data loading ─────────────────────────────────────────────────────────
  // Only load tasks when a specific client (or ALL_CLIENTS) is selected.
  // loadForProject is idempotent — safe to call on every re-render.
  // BUG-18: Load sequentially rather than all at once to avoid firing N
  // simultaneous API requests when the client has many projects.
  useEffect(() => {
    if (selectedClientId === NO_CLIENT) return
    let cancelled = false
    async function loadAll() {
      // BUG-28: load in small parallel batches. Fully sequential (one await per
      // project) was needlessly slow for clients with many projects; firing all
      // requests at once risked a connection storm. Bounded concurrency of 5
      // gets most of the speed-up without overwhelming the API / pool.
      const CONCURRENCY = 5
      const queue = [...visibleProjects]
      while (queue.length && !cancelled) {
        const batch = queue.splice(0, CONCURRENCY)
        await Promise.all(batch.map(p => loadForProject(p.id)))
      }
    }
    void loadAll()
    return () => { cancelled = true }
  }, [visibleProjects, loadForProject, selectedClientId])

  // ── Shot-view state ──────────────────────────────────────────────────────
  const [shotViewProjectId, setShotViewProjectId] = useState<string>(ALL_PROJECTS)
  useEffect(() => { setShotViewProjectId(ALL_PROJECTS) }, [selectedClientId])

  const [sequenceFilter, setSequenceFilter] = useState<string>('ALL')
  useEffect(() => { setSequenceFilter('ALL') }, [view, shotViewProjectId])

  // ── Edge case: no projects in the system at all ──────────────────────────
  if (projects.length === 0) {
    return (
      <div className="p-6 text-slate-300">
        <h1 className="text-xl font-black tracking-wide text-white uppercase mb-2">Pipeline Matrix</h1>
        <p className="text-sm text-slate-500">No projects yet. Create one to start tracking.</p>
      </div>
    )
  }

  const viewSubtitle: Record<View, string> = {
    project:   'Project rollup — each row is a project, columns are the 11 pipeline stages',
    shot:      'Shot-level breakdown — drill into each shot across all stages',
    character: 'Character / asset rollup — track each model through Modelling → Blendshapes → Rigging → Texturing',
  }

  return (
    <div className="p-6 space-y-5 text-slate-100 min-h-screen bg-[#0b0f19]">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="space-y-4 border-b border-[#1a263e] pb-5">

        {/* Title row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black tracking-wide text-white uppercase flex items-center gap-2">
              <Grid3X3 className="w-5 h-5 text-indigo-400" /> Pipeline Matrix
            </h1>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1.5">
              {viewSubtitle[view]}
            </p>
          </div>

          {/* Search — only shown when a client is selected */}
          {selectedClientId !== NO_CLIENT && (
            <div className="relative shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
              <input
                value={projectSearch}
                onChange={e => setProjectSearch(e.target.value)}
                placeholder="Search projects…"
                className="pl-8 pr-8 py-1.5 w-52 text-xs bg-[#0e1626] border border-[#1b253b] rounded-md text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              {projectSearch && (
                <button
                  onClick={() => setProjectSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Client pill selector ───────────────────────────────────────── */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest shrink-0 pr-1">
            Client:
          </span>

          {clients.map(c => {
            const count = projects.filter(p => p.clientId === c.id).length
            const isActive = selectedClientId === c.id
            return (
              <button
                key={c.id}
                onClick={() => setSelectedClientId(isActive ? NO_CLIENT : c.id)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all border shrink-0',
                  isActive
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/40'
                    : 'bg-[#0e1626] border-[#1b253b] text-slate-400 hover:text-white hover:border-slate-600 hover:bg-[#131d30]'
                )}
              >
                {c.name}
                <span className={clsx(
                  'text-[9px] font-black px-1.5 py-0.5 rounded-full transition-colors',
                  isActive
                    ? 'bg-indigo-500/40 text-indigo-200'
                    : 'bg-[#141d2f] text-slate-600'
                )}>
                  {count}
                </span>
              </button>
            )
          })}

          {/* All Clients — opt-in, loads everything */}
          <button
            onClick={() => setSelectedClientId(selectedClientId === ALL_CLIENTS ? NO_CLIENT : ALL_CLIENTS)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all border shrink-0',
              selectedClientId === ALL_CLIENTS
                ? 'bg-amber-600/30 border-amber-500/60 text-amber-300'
                : 'bg-[#0e1626] border-[#1b253b] text-slate-500 hover:text-amber-400 hover:border-amber-500/40'
            )}
          >
            <AlertTriangle className="w-3 h-3" />
            All Clients
            <span className={clsx(
              'text-[9px] font-black px-1.5 py-0.5 rounded-full',
              selectedClientId === ALL_CLIENTS ? 'bg-amber-500/20 text-amber-400' : 'bg-[#141d2f] text-slate-600'
            )}>
              {projects.length}
            </span>
          </button>
        </div>

        {/* Search result count — shown when search is active */}
        {projectSearch.trim() && (
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider -mt-1">
            {displayProjects.length === 0
              ? 'No projects match'
              : `${displayProjects.length} of ${visibleProjects.length} project${visibleProjects.length !== 1 ? 's' : ''} shown`}
          </p>
        )}
      </div>

      {/* ── No-client-selected empty state ────────────────────────────────── */}
      {selectedClientId === NO_CLIENT && (
        <div className="flex flex-col items-center gap-6 py-16 text-center">
          <div className="w-14 h-14 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Grid3X3 className="w-7 h-7 text-indigo-500/60" />
          </div>
          <div>
            <p className="text-sm font-black text-slate-300 uppercase tracking-wider">Select a client to view pipeline data</p>
            <p className="text-xs text-slate-600 mt-1.5">Only that client's projects will be loaded — keeping things fast</p>
          </div>

          {/* Client cards grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 w-full max-w-3xl text-left mt-2">
            {clients.map(c => {
              const projectCount  = projects.filter(p => p.clientId === c.id).length
              const activeCount   = projects.filter(p => p.clientId === c.id && p.status === 'ACTIVE').length
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedClientId(c.id)}
                  className="group p-4 bg-[#0c1221] border border-[#1b253b] rounded-xl hover:border-indigo-500/50 hover:bg-[#0f1828] transition-all text-left"
                >
                  <div className="text-xs font-black text-slate-100 uppercase tracking-wide group-hover:text-indigo-300 transition-colors truncate">
                    {c.name}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[9px] font-bold text-slate-500">
                      {projectCount} project{projectCount !== 1 ? 's' : ''}
                    </span>
                    {activeCount > 0 && (
                      <>
                        <span className="text-slate-700">·</span>
                        <span className="text-[9px] font-bold text-emerald-500">
                          {activeCount} active
                        </span>
                      </>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Main content (only when a client is selected) ─────────────────── */}
      {selectedClientId !== NO_CLIENT && (
        <>
          {/* Tabs + project picker */}
          <div className="flex items-center justify-between gap-4 border-b border-[#1a263e]">
            <div className="flex gap-1">
              <TabBtn icon={Briefcase} label="Project View"   active={view === 'project'}   onClick={() => setView('project')} />
              <TabBtn icon={Film}      label="Shot View"      active={view === 'shot'}      onClick={() => setView('shot')} />
              <TabBtn icon={User}      label="Character View" active={view === 'character'} onClick={() => setView('character')} />
            </div>

            {/* Project picker — only for Shot View */}
            {view === 'shot' && displayProjects.length > 0 && (
              <div className="flex items-center gap-1.5 bg-[#0e1626] border border-[#1b253b] px-2.5 py-1.5 rounded-md shrink-0">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Project:</span>
                <select
                  value={shotViewProjectId}
                  onChange={e => setShotViewProjectId(e.target.value)}
                  className="bg-transparent border-0 text-xs font-semibold text-white focus:ring-0 focus:outline-none cursor-pointer pr-6 max-w-[200px]"
                >
                  <option value={ALL_PROJECTS} className="bg-[#0e1626] text-white">All projects</option>
                  {displayProjects.map(p => (
                    <option key={p.id} value={p.id} className="bg-[#0e1626] text-white">{p.name.toUpperCase()}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* View bodies */}
          {view === 'project' && (
            <ProjectView projects={displayProjects} tasks={tasks} clients={clients} />
          )}
          {view === 'shot' && (
            <ShotView
              projects={displayProjects}
              shotViewProjectId={shotViewProjectId}
              tasks={tasks}
              employees={employees}
              updateTaskStatus={updateTaskStatus}
              sequenceFilter={sequenceFilter}
              setSequenceFilter={setSequenceFilter}
            />
          )}
          {view === 'character' && (
            <CharacterView projects={displayProjects} tasks={tasks} />
          )}
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT VIEW — one row per project, all 11 stages as columns
// ═══════════════════════════════════════════════════════════════════════════

function ProjectView({ projects, tasks, clients }: { projects: Project[]; tasks: TaskRow[]; clients: Client[] }) {
  if (projects.length === 0) {
    return <EmptyBlock text="No projects match. Try a different search or client." />
  }

  return (
    <div className="bg-[#0c1221] rounded-xl border border-[#1b253b] overflow-hidden shadow-2xl">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="bg-[#111929] border-b border-[#1b253b]">
              <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider sticky left-0 bg-[#111929] min-w-[220px] border-r border-[#1b253b] z-10">
                Project
              </th>
              {STAGE_CONFIGS.map(stage => (
                <th
                  key={stage.id}
                  className="px-3 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap min-w-[130px] border-r border-[#1b253b] last:border-r-0"
                >
                  <span className="flex items-center gap-1.5">
                    <span>{stage.icon}</span> <span>{stage.name}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projects.map(project => {
              const client = clients.find(c => c.id === project.clientId)
              const projectTasks = tasks.filter(t => t.projectId === project.id)
              return (
                <tr key={project.id} className="border-b border-[#141d2f] hover:bg-[#131b2d] transition-colors">
                  {/* Project name */}
                  <td className="px-4 py-3 sticky left-0 bg-[#0c1221] border-r border-[#1b253b] z-10 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.3)]">
                    <Link
                      to={`/clients/${project.clientId}/projects/${project.id}`}
                      className="block group"
                    >
                      <div className="text-xs font-black text-white uppercase tracking-wide truncate group-hover:text-indigo-300 transition-colors">{project.name}</div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 truncate">{client?.name ?? '—'}</div>
                    </Link>
                  </td>

                  {STAGE_CONFIGS.map(stage => {
                    const stageTasks = projectTasks.filter(t => stage.subStages.some(ss => ss.id === t.subStageId))
                    const total    = stageTasks.length
                    const approved = stageTasks.filter(t => t.status === 'FINAL_APPROVAL').length
                    return (
                      <td key={stage.id} className="px-3 py-2 border-r border-[#1b253b] last:border-r-0">
                        <Link
                          to={`/clients/${project.clientId}/projects/${project.id}/pipeline/${stage.slug}/${stage.subStages[0].slug}`}
                          className="block hover:opacity-80 transition-opacity"
                        >
                          <ProgressCell done={approved} total={total} />
                        </Link>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Per-cell progress widget ─────────────────────────────────────────────
function ProgressCell({ done, total }: { done: number; total: number }) {
  if (total === 0) {
    return <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">—</span>
  }
  const pct = Math.round((done / total) * 100)

  const tone: 'done' | 'almost' | 'half' | 'early' | 'none' =
    pct === 100 ? 'done'
    : pct >= 90 ? 'almost'
    : pct >= 50 ? 'half'
    : pct >= 10 ? 'early'
    : 'none'

  const style = {
    done:   { bar: 'bg-emerald-500', text: 'text-emerald-400', track: 'border-emerald-500/30' },
    almost: { bar: 'bg-indigo-500',  text: 'text-indigo-400',  track: 'border-indigo-500/30' },
    half:   { bar: 'bg-sky-500',     text: 'text-sky-400',     track: 'border-sky-500/30' },
    early:  { bar: 'bg-amber-500',   text: 'text-amber-400',   track: 'border-amber-500/30' },
    none:   { bar: 'bg-slate-600',   text: 'text-slate-500',   track: 'border-slate-700' },
  }[tone]

  return (
    <div className="space-y-1" title={`${done} of ${total} tasks approved`}>
      <div className={clsx('h-1.5 bg-[#080c14] rounded-full overflow-hidden border', style.track)}>
        <div className={clsx('h-full transition-all duration-300 rounded-full', style.bar)} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={clsx('text-[10px] font-black font-mono', style.text)}>
          {pct === 100 ? (
            <span className="flex items-center gap-0.5"><CheckCircle2 className="w-2.5 h-2.5" /> 100%</span>
          ) : `${pct}%`}
        </span>
        <span className="text-[10px] font-mono text-slate-600">{done}/{total}</span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SHOT VIEW — same as the existing matrix (one row per shot, per project)
// ═══════════════════════════════════════════════════════════════════════════

function ShotView({
  projects, shotViewProjectId, tasks, employees, updateTaskStatus, sequenceFilter, setSequenceFilter,
}: {
  projects: Project[]
  shotViewProjectId: string
  tasks: TaskRow[]
  employees: ReturnType<typeof useEmployeeStore.getState>['employees']
  updateTaskStatus: (id: string, s: TaskRow['status']) => Promise<TaskRow>
  sequenceFilter: string
  setSequenceFilter: (s: string) => void
}) {
  const inScopeProjects = shotViewProjectId === ALL_PROJECTS
    ? projects
    : projects.filter(p => p.id === shotViewProjectId)
  const inScopeProjectIds = new Set(inScopeProjects.map(p => p.id))
  const isAggregate = inScopeProjects.length > 1

  const shotTasks = useMemo(
    () => tasks.filter(t => t.shotNumber && inScopeProjectIds.has(t.projectId)),
    [tasks, inScopeProjectIds],
  )

  const shotRows = useMemo(() => {
    const seen = new Set<string>()
    const rows: { projectId: string; shotNumber: string }[] = []
    for (const t of shotTasks) {
      const key = `${t.projectId}::${t.shotNumber}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({ projectId: t.projectId, shotNumber: t.shotNumber! })
    }
    rows.sort((a, b) => {
      const c = a.projectId.localeCompare(b.projectId)
      return c !== 0 ? c : a.shotNumber.localeCompare(b.shotNumber, undefined, { numeric: true })
    })
    return rows
  }, [shotTasks])

  const sequences = useMemo(() => {
    const seqs = new Set<string>()
    shotRows.forEach(r => {
      const m = r.shotNumber.match(/^(seq[_\-\s]?\d+|sq[_\-\s]?\d+|\d{3})/i)
      if (m) seqs.add(m[0].toUpperCase())
    })
    return ['ALL', ...Array.from(seqs).sort()]
  }, [shotRows])

  const filteredRows = useMemo(() => {
    if (sequenceFilter === 'ALL') return shotRows
    return shotRows.filter(r => {
      const m = r.shotNumber.match(/^(seq[_\-\s]?\d+|sq[_\-\s]?\d+|\d{3})/i)
      return m && m[0].toUpperCase() === sequenceFilter
    })
  }, [shotRows, sequenceFilter])

  const projectById = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p])), [projects])

  if (filteredRows.length === 0) {
    return <EmptyBlock text="No shots in this scope. Create shot records in any shot-wise stage (Animation / FX / Lighting / Compositing / Editing)." />
  }

  return (
    <>
      {sequences.length > 2 && (
        <div className="flex items-center gap-1.5 bg-[#0e1626] border border-[#1b253b] px-2.5 py-1.5 rounded-md inline-flex">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Sequence:</span>
          <select
            value={sequenceFilter}
            onChange={e => setSequenceFilter(e.target.value)}
            className="bg-transparent border-0 text-xs font-semibold text-white focus:ring-0 focus:outline-none cursor-pointer pr-8"
          >
            {sequences.map(seq => (
              <option key={seq} value={seq} className="bg-[#0e1626] text-white">{seq}</option>
            ))}
          </select>
        </div>
      )}

      <div className="bg-[#0c1221] rounded-xl border border-[#1b253b] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-[#111929] border-b border-[#1b253b]">
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider sticky left-0 bg-[#111929] min-w-[100px] border-r border-[#1b253b] z-10">
                  Shot No.
                </th>
                {isAggregate && (
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider min-w-[160px] border-r border-[#1b253b]">Project</th>
                )}
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider min-w-[80px] border-r border-[#1b253b]">Thumbnail</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider min-w-[120px] border-r border-[#1b253b]">Frame Range</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider min-w-[70px] border-r border-[#1b253b] text-center">Seconds</th>
                {SHOT_STAGES.map(stage => (
                  <th
                    key={stage.id}
                    className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap min-w-[160px] border-r border-[#1b253b] last:border-r-0"
                  >
                    <span className="flex items-center gap-1.5"><span>{stage.icon}</span><span>{stage.name}</span></span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(({ projectId, shotNumber }) => {
                const sampleTask = shotTasks.find(t => t.projectId === projectId && t.shotNumber === shotNumber)
                const project = projectById[projectId]
                return (
                  <tr key={`${projectId}::${shotNumber}`} className="border-b border-[#141d2f] hover:bg-[#131b2d] transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-white sticky left-0 bg-[#0c1221] border-r border-[#1b253b] z-10 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.3)]">
                      {shotNumber}
                    </td>
                    {isAggregate && (
                      <td className="px-4 py-3 border-r border-[#1b253b]">
                        <div className="text-xs font-bold text-slate-200 uppercase tracking-wide truncate max-w-[160px]">{project?.name ?? '—'}</div>
                      </td>
                    )}
                    <td className="px-4 py-2 border-r border-[#1b253b]">
                      <div className="w-14 h-8 bg-slate-900/80 border border-[#202e49] rounded overflow-hidden flex items-center justify-center shadow-inner">
                        {sampleTask?.thumbnail ? (
                          <img src={sampleTask.thumbnail} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <ImageIcon className="w-4 h-4 opacity-40 text-slate-600" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-slate-300 border-r border-[#1b253b]">{sampleTask?.frameRange ?? '—'}</td>
                    <td className="px-4 py-3 font-mono font-bold text-indigo-400 text-center border-r border-[#1b253b]">{formatSeconds(sampleTask?.seconds)}</td>
                    {SHOT_STAGES.map(stage => {
                      const subStage = stage.subStages[0]
                      const task = tasks.find(t => t.projectId === projectId && t.subStageId === subStage.id && t.shotNumber === shotNumber)
                      const artist = task?.assignedArtistId ? employees.find(e => e.id === task.assignedArtistId) : null
                      const initials = artist ? artist.name.split(' ').map(n => n[0]).join('') : null
                      return (
                        <td key={stage.id} className="px-4 py-2.5 border-r border-[#1b253b] last:border-r-0">
                          {task ? (
                            <div onClick={e => e.stopPropagation()} className="flex items-center gap-1.5">
                              <div className="flex-1">
                                <StatusDropdown value={task.status} onChange={s => updateTaskStatus(task.id, s)} compact />
                              </div>
                              {initials ? (
                                <div title={artist!.name} className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white shrink-0 border border-white/10 shadow shadow-black" style={{ backgroundColor: artist!.avatarColor ?? '#6366f1' }}>
                                  {initials}
                                </div>
                              ) : (
                                <div title="Unassigned" className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-600 bg-slate-900 border border-slate-800 shrink-0">?</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CHARACTER VIEW — characters/assets × asset-pipeline stages
// ═══════════════════════════════════════════════════════════════════════════

function CharacterView({ projects, tasks }: { projects: Project[]; tasks: TaskRow[] }) {
  const projectIds = useMemo(() => new Set(projects.map(p => p.id)), [projects])

  // Each row = (project, character name). We derive characters from modelling-character tasks.
  const rows = useMemo(() => {
    const out: { projectId: string; characterName: string }[] = []
    const seen = new Set<string>()
    for (const t of tasks) {
      if (t.subStageId !== 'modelling-character') continue
      if (!projectIds.has(t.projectId)) continue
      const key = `${t.projectId}::${t.itemName}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ projectId: t.projectId, characterName: t.itemName })
    }
    out.sort((a, b) => {
      const c = a.projectId.localeCompare(b.projectId)
      return c !== 0 ? c : a.characterName.localeCompare(b.characterName)
    })
    return out
  }, [tasks, projectIds])

  const projectById = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p])), [projects])

  if (rows.length === 0) {
    return <EmptyBlock text="No characters tracked yet. Create Character tasks in Modelling → Character to populate this view." />
  }

  return (
    <div className="bg-[#0c1221] rounded-xl border border-[#1b253b] overflow-hidden shadow-2xl">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="bg-[#111929] border-b border-[#1b253b]">
              <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider sticky left-0 bg-[#111929] min-w-[180px] border-r border-[#1b253b] z-10">Character</th>
              <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider min-w-[160px] border-r border-[#1b253b]">Project</th>
              {CHARACTER_STAGES.map(s => (
                <th key={s.key} className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap min-w-[160px] border-r border-[#1b253b] last:border-r-0">{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ projectId, characterName }) => {
              const project = projectById[projectId]
              return (
                <tr key={`${projectId}::${characterName}`} className="border-b border-[#141d2f] hover:bg-[#131b2d] transition-colors">
                  <td className="px-4 py-3 sticky left-0 bg-[#0c1221] border-r border-[#1b253b] z-10 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.3)] text-sm font-bold text-white">
                    {characterName}
                  </td>
                  <td className="px-4 py-3 border-r border-[#1b253b]">
                    <Link to={`/clients/${project?.clientId}/projects/${projectId}`} className="text-xs font-semibold text-slate-200 hover:text-indigo-400 transition-colors uppercase tracking-wide">
                      {project?.name ?? '—'}
                    </Link>
                  </td>
                  {CHARACTER_STAGES.map(stage => {
                    const task = tasks.find(t =>
                      t.projectId === projectId &&
                      t.itemName  === characterName &&
                      t.subStageId === stage.subStageId
                    )
                    const stageSlug   = stage.subStageId.split('-')[0]
                    const subSlug     = stage.subStageId.replace(`${stageSlug}-`, '')
                    return (
                      <td key={stage.key} className="px-4 py-2.5 border-r border-[#1b253b] last:border-r-0">
                        {task ? (
                          <Link
                            to={`/clients/${project?.clientId}/projects/${projectId}/pipeline/${stageSlug}/${subSlug}?open=${task.id}`}
                            className="inline-block hover:opacity-80 transition-opacity"
                          >
                            <StatusPill status={task.status} size="sm" />
                          </Link>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Small UI helpers
// ═══════════════════════════════════════════════════════════════════════════

function TabBtn({ icon: Icon, label, active, onClick }: { icon: typeof Briefcase; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-colors',
        active
          ? 'border-indigo-500 text-indigo-400'
          : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-600'
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
    </button>
  )
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="text-center py-20 bg-[#0d1424] rounded-xl border border-[#1b253b] text-slate-500 font-semibold text-xs uppercase tracking-wider">
      {text}
    </div>
  )
}
