import { useClientStore } from '../store/clientStore'
import { usePipelineStore } from '../store/pipelineStore'
import { useEmployeeStore } from '../store/employeeStore'
import { STAGE_CONFIGS } from '../config/stageConfigs'
import { StatusDropdown } from '../components/ui/StatusDropdown'
import { useState, useMemo } from 'react'
import { Film, Image as ImageIcon } from 'lucide-react'

// Shot-wise stages for the matrix (excludes Cut Shots which is inside Animatics)
const SHOT_STAGES = STAGE_CONFIGS.filter(s => s.workflowType === 'SHOT')

export function ShotMatrix() {
  const projects = useClientStore(s => s.projects)
  const tasks = usePipelineStore(s => s.tasks)
  const employees = useEmployeeStore(s => s.employees)
  const updateTaskStatus = usePipelineStore(s => s.updateTaskStatus)

  // Track active project selection in matrix dropdown
  const activeProjects = useMemo(() => projects.filter(p => p.status === 'ACTIVE'), [projects])
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    return activeProjects[0]?.id ?? projects[0]?.id ?? ''
  })
  
  const [sequenceFilter, setSequenceFilter] = useState<string>('ALL')

  if (projects.length === 0) {
    return (
      <div className="p-6 text-slate-300">
        <h1 className="text-xl font-black tracking-wide text-white uppercase mb-2">Shot Matrix</h1>
        <p className="text-sm text-slate-500">No active projects found. Create a project first.</p>
      </div>
    )
  }

  const project = projects.find(p => p.id === selectedProjectId) ?? projects[0]
  const shotTasks = tasks.filter(t => t.projectId === project.id && t.shotNumber)
  
  // Extract all shot numbers in project
  const shotNumbers = [...new Set(shotTasks.map(t => t.shotNumber!))].sort()

  // Extract all sequences for filter selector
  const sequences = useMemo(() => {
    const seqs = new Set<string>()
    shotNumbers.forEach(num => {
      const match = num.match(/^(seq[_\-\s]?\d+|sq[_\-\s]?\d+|\d{3})/i)
      if (match) seqs.add(match[0].toUpperCase())
    })
    return ['ALL', ...Array.from(seqs).sort()]
  }, [shotNumbers])

  // Filter shots based on selected sequence
  const filteredShotNumbers = useMemo(() => {
    if (sequenceFilter === 'ALL') return shotNumbers
    return shotNumbers.filter(num => {
      const match = num.match(/^(seq[_\-\s]?\d+|sq[_\-\s]?\d+|\d{3})/i)
      return match && match[0].toUpperCase() === sequenceFilter
    })
  }, [shotNumbers, sequenceFilter])

  return (
    <div className="p-6 space-y-6 text-slate-100 min-h-screen bg-[#0b0f19]">
      
      {/* Header and Quick Filters Ribbon */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1a263e] pb-5">
        <div>
          <h1 className="text-xl font-black tracking-wide text-white uppercase flex items-center gap-2">
            <Film className="w-5 h-5 text-indigo-400" /> Shot Grid Matrix
          </h1>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1.5">
            {project.name} · Cross-stage production pipeline status
          </p>
        </div>

        {/* Filters Panel */}
        <div className="flex items-center gap-2.5 flex-wrap">
          
          {/* Project selector */}
          <div className="flex items-center gap-1.5 bg-[#0e1626] border border-[#1b253b] px-2.5 py-1.5 rounded-md">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Project:</span>
            <select
              value={selectedProjectId}
              onChange={e => setSelectedProjectId(e.target.value)}
              className="bg-transparent border-0 text-xs font-semibold text-white focus:ring-0 focus:outline-none cursor-pointer pr-8"
            >
              {projects.map(p => (
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
                  <option key={seq} value={seq} className="bg-[#0e1626] text-white">
                    {seq}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {shotNumbers.length === 0 ? (
        <div className="text-center py-20 bg-[#0d1424] rounded-xl border border-[#1b253b] text-slate-500 font-semibold text-xs uppercase tracking-wider">
          No shots detected in this project. Create shot records in Shot Stages (Animation, FX, Lighting, Compositing, Editing) to initialize.
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
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider min-w-[80px] border-r border-[#1b253b]">
                    Thumbnail
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider min-w-[120px] border-r border-[#1b253b]">
                    Frame Range
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider min-w-[60px] border-r border-[#1b253b] text-center">
                    Frames
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
                {filteredShotNumbers.map(shotNo => {
                  const sampleTask = shotTasks.find(t => t.shotNumber === shotNo)
                  return (
                    <tr key={shotNo} className="border-b border-[#141d2f] hover:bg-[#131b2d] transition-colors">
                      
                      {/* Shot Number (Sticky) */}
                      <td className="px-4 py-3 font-mono font-bold text-white sticky left-0 bg-[#0c1221] border-r border-[#1b253b] z-10 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.3)]">
                        {shotNo}
                      </td>

                      {/* Shot Thumbnail */}
                      <td className="px-4 py-2 border-r border-[#1b253b]">
                        <div className="w-14 h-8 bg-slate-900/80 border border-[#202e49] rounded overflow-hidden flex items-center justify-center shadow-inner">
                          {sampleTask?.thumbnail ? (
                            <img src={sampleTask.thumbnail} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <div className="flex items-center justify-center text-slate-600">
                              <ImageIcon className="w-4 h-4 opacity-40" />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Frame Range */}
                      <td className="px-4 py-3 font-mono font-semibold text-slate-300 border-r border-[#1b253b]">
                        {sampleTask?.frameRange ?? '—'}
                      </td>

                      {/* Seconds Count */}
                      <td className="px-4 py-3 font-mono font-bold text-indigo-400 text-center border-r border-[#1b253b]">
                        {sampleTask?.seconds ?? '—'}s
                      </td>

                      {/* Stage status blocks */}
                      {SHOT_STAGES.map(stage => {
                        const subStage = stage.subStages[0]
                        const task = tasks.find(
                          t => t.projectId === project.id &&
                            t.subStageId === subStage.id &&
                            t.shotNumber === shotNo
                        )
                        
                        // Fetch artist initials to display superimposed in status matrix block
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
                                
                                {/* Superimposed Artist Initials badge in cell */}
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
