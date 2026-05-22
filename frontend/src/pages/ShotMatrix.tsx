import { useState, useMemo, useEffect } from 'react'
import { Film, Image as ImageIcon } from 'lucide-react'
import { useClientStore } from '../store/clientStore'
import { usePipelineStore } from '../store/pipelineStore'
import { useEmployeeStore } from '../store/employeeStore'
import { STAGE_CONFIGS } from '../config/stageConfigs'
import { StatusDropdown } from '../components/ui/StatusDropdown'
import { formatSeconds } from '../utils/calcSeconds'

// Shot-wise stages for the matrix (excludes Cut Shots which is inside Animatics)
const SHOT_STAGES = STAGE_CONFIGS.filter(s => s.workflowType === 'SHOT')

const ALL_CLIENTS = '__all_clients__'
const ALL_PROJECTS = '__all_projects__'

export function ShotMatrix() {
  const clients   = useClientStore(s => s.clients)
  const projects  = useClientStore(s => s.projects)
  const tasks     = usePipelineStore(s => s.tasks)
  const employees = useEmployeeStore(s => s.employees)
  const updateTaskStatus = usePipelineStore(s => s.updateTaskStatus)

  // Default: first client with at least one project
  const [selectedClientId, setSelectedClientId] = useState<string>(() => {
    const firstWithProjects = clients.find(c => projects.some(p => p.clientId === c.id))
    return firstWithProjects?.id ?? clients[0]?.id ?? ALL_CLIENTS
  })

  // Default: show all projects of the selected client
  const [selectedProjectId, setSelectedProjectId] = useState<string>(ALL_PROJECTS)

  // If the client changes, reset to "All projects"
  useEffect(() => {
    setSelectedProjectId(ALL_PROJECTS)
  }, [selectedClientId])

  const [sequenceFilter, setSequenceFilter] = useState<string>('ALL')

  // ── Compute which projects + tasks are in scope ────────────────────────────
  const clientProjects = useMemo(() => {
    if (selectedClientId === ALL_CLIENTS) return projects
    return projects.filter(p => p.clientId === selectedClientId)
  }, [projects, selectedClientId])

  // Did the user pick a specific project, or are we showing all of the client's projects?
  const isAggregate = selectedProjectId === ALL_PROJECTS
  const inScopeProjects = isAggregate
    ? clientProjects
    : clientProjects.filter(p => p.id === selectedProjectId)
  const inScopeProjectIds = new Set(inScopeProjects.map(p => p.id))

  const shotTasks = useMemo(
    () => tasks.filter(t => t.shotNumber && inScopeProjectIds.has(t.projectId)),
    [tasks, inScopeProjectIds],
  )

  // Unique (projectId, shotNumber) pairs — a "row" in the matrix
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
      // Group by project, then sort shots
      const projCmp = a.projectId.localeCompare(b.projectId)
      if (projCmp !== 0) return projCmp
      return a.shotNumber.localeCompare(b.shotNumber, undefined, { numeric: true })
    })
    return rows
  }, [shotTasks])

  // Sequence filter list (derived from in-scope shots)
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

  // Lookup helpers
  const projectById = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p])), [projects])
  const clientById  = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])),  [clients])

  // ── Empty / pre-state UI ───────────────────────────────────────────────────
  if (projects.length === 0) {
    return (
      <div className="p-6 text-slate-300">
        <h1 className="text-xl font-black tracking-wide text-white uppercase mb-2">Shot Matrix</h1>
        <p className="text-sm text-slate-500">No active projects found. Create a project first.</p>
      </div>
    )
  }

  // Build a friendly subtitle that describes what's on screen right now
  const subtitle = isAggregate
    ? (selectedClientId === ALL_CLIENTS
        ? `All clients · ${inScopeProjects.length} projects · cross-stage status`
        : `${clientById[selectedClientId]?.name ?? '—'} · ${inScopeProjects.length} project${inScopeProjects.length !== 1 ? 's' : ''} · cross-stage status`)
    : `${projectById[selectedProjectId]?.name ?? '—'} · cross-stage production pipeline status`

  return (
    <div className="p-6 space-y-6 text-slate-100 min-h-screen bg-[#0b0f19]">

      {/* Header + filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1a263e] pb-5">
        <div>
          <h1 className="text-xl font-black tracking-wide text-white uppercase flex items-center gap-2">
            <Film className="w-5 h-5 text-indigo-400" /> Shot Grid Matrix
          </h1>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1.5">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Client selector */}
          <div className="flex items-center gap-1.5 bg-[#0e1626] border border-[#1b253b] px-2.5 py-1.5 rounded-md">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Client:</span>
            <select
              value={selectedClientId}
              onChange={e => setSelectedClientId(e.target.value)}
              className="bg-transparent border-0 text-xs font-semibold text-white focus:ring-0 focus:outline-none cursor-pointer pr-8"
            >
              <option value={ALL_CLIENTS} className="bg-[#0e1626] text-white">All Clients</option>
              {clients.map(c => (
                <option key={c.id} value={c.id} className="bg-[#0e1626] text-white">
                  {c.name.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Project selector — limited to the selected client */}
          <div className="flex items-center gap-1.5 bg-[#0e1626] border border-[#1b253b] px-2.5 py-1.5 rounded-md">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Project:</span>
            <select
              value={selectedProjectId}
              onChange={e => setSelectedProjectId(e.target.value)}
              className="bg-transparent border-0 text-xs font-semibold text-white focus:ring-0 focus:outline-none cursor-pointer pr-8"
            >
              <option value={ALL_PROJECTS} className="bg-[#0e1626] text-white">
                {selectedClientId === ALL_CLIENTS ? 'All projects' : 'All projects of this client'}
              </option>
              {clientProjects.map(p => (
                <option key={p.id} value={p.id} className="bg-[#0e1626] text-white">
                  {p.name.toUpperCase()} {p.status === 'ACTIVE' ? '· (ACTIVE)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Sequence filter */}
          {sequences.length > 2 && (
            <div className="flex items-center gap-1.5 bg-[#0e1626] border border-[#1b253b] px-2.5 py-1.5 rounded-md">
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
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <div className="text-center py-20 bg-[#0d1424] rounded-xl border border-[#1b253b] text-slate-500 font-semibold text-xs uppercase tracking-wider">
          No shots in this scope. Create shot records in any shot-wise stage (Animation, FX, Lighting, Compositing, Editing) to initialize.
        </div>
      ) : (
        <div className="bg-[#0c1221] rounded-xl border border-[#1b253b] overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-[#111929] border-b border-[#1b253b]">
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider sticky left-0 bg-[#111929] min-w-[100px] border-r border-[#1b253b] z-10">
                    Shot No.
                  </th>
                  {/* Show project column only in aggregate mode (multiple projects mixed) */}
                  {isAggregate && (
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider min-w-[160px] border-r border-[#1b253b]">
                      Project
                    </th>
                  )}
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider min-w-[80px] border-r border-[#1b253b]">
                    Thumbnail
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider min-w-[120px] border-r border-[#1b253b]">
                    Frame Range
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider min-w-[70px] border-r border-[#1b253b] text-center">
                    Seconds
                  </th>
                  {SHOT_STAGES.map(stage => (
                    <th
                      key={stage.id}
                      className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap min-w-[160px] border-r border-[#1b253b] last:border-r-0"
                    >
                      <span className="flex items-center gap-1.5">
                        <span>{stage.icon}</span> <span>{stage.name}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(({ projectId, shotNumber }) => {
                  const sampleTask = shotTasks.find(t => t.projectId === projectId && t.shotNumber === shotNumber)
                  const project = projectById[projectId]
                  const client  = project ? clientById[project.clientId] : null
                  return (
                    <tr key={`${projectId}::${shotNumber}`} className="border-b border-[#141d2f] hover:bg-[#131b2d] transition-colors">

                      {/* Shot Number (sticky) */}
                      <td className="px-4 py-3 font-mono font-bold text-white sticky left-0 bg-[#0c1221] border-r border-[#1b253b] z-10 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.3)]">
                        {shotNumber}
                      </td>

                      {/* Project column only in aggregate mode */}
                      {isAggregate && (
                        <td className="px-4 py-3 border-r border-[#1b253b]">
                          <div className="text-xs font-bold text-slate-200 uppercase tracking-wide truncate max-w-[160px]" title={project?.name}>
                            {project?.name ?? '—'}
                          </div>
                          {client && (
                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 truncate">{client.name}</div>
                          )}
                        </td>
                      )}

                      {/* Thumbnail */}
                      <td className="px-4 py-2 border-r border-[#1b253b]">
                        <div className="w-14 h-8 bg-slate-900/80 border border-[#202e49] rounded overflow-hidden flex items-center justify-center shadow-inner">
                          {sampleTask?.thumbnail ? (
                            <img src={sampleTask.thumbnail} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <ImageIcon className="w-4 h-4 opacity-40 text-slate-600" />
                          )}
                        </div>
                      </td>

                      {/* Frame Range */}
                      <td className="px-4 py-3 font-mono font-semibold text-slate-300 border-r border-[#1b253b]">
                        {sampleTask?.frameRange ?? '—'}
                      </td>

                      {/* Seconds — one decimal */}
                      <td className="px-4 py-3 font-mono font-bold text-indigo-400 text-center border-r border-[#1b253b]">
                        {formatSeconds(sampleTask?.seconds)}
                      </td>

                      {/* Stage status cells */}
                      {SHOT_STAGES.map(stage => {
                        const subStage = stage.subStages[0]
                        const task = tasks.find(
                          t => t.projectId === projectId &&
                            t.subStageId === subStage.id &&
                            t.shotNumber === shotNumber
                        )
                        const artist = task?.assignedArtistId
                          ? employees.find(e => e.id === task.assignedArtistId)
                          : null
                        const artistInitials = artist
                          ? artist.name.split(' ').map(n => n[0]).join('')
                          : null

                        return (
                          <td key={stage.id} className="px-4 py-2.5 border-r border-[#1b253b] last:border-r-0">
                            {task ? (
                              <div onClick={e => e.stopPropagation()} className="flex items-center gap-1.5">
                                <div className="flex-1">
                                  <StatusDropdown
                                    value={task.status}
                                    onChange={s => updateTaskStatus(task.id, s)}
                                    compact
                                  />
                                </div>
                                {artistInitials ? (
                                  <div
                                    title={artist!.name}
                                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white shrink-0 border border-white/10 shadow shadow-black"
                                    style={{ backgroundColor: artist!.avatarColor ?? '#6366f1' }}
                                  >
                                    {artistInitials}
                                  </div>
                                ) : (
                                  <div
                                    title="Unassigned"
                                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-600 bg-slate-900 border border-slate-800 shrink-0"
                                  >
                                    ?
                                  </div>
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
      )}
    </div>
  )
}
