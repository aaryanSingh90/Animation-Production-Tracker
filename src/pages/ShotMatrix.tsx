import { useClientStore } from '../store/clientStore'
import { usePipelineStore } from '../store/pipelineStore'
import { STAGE_CONFIGS } from '../config/stageConfigs'
import { StatusPill } from '../components/ui/StatusPill'
import { StatusDropdown } from '../components/ui/StatusDropdown'
import type { TaskStatus } from '../types'

// Shot-wise stages for the matrix (excludes Cut Shots which is inside Animatics)
const SHOT_STAGES = STAGE_CONFIGS.filter(s => s.workflowType === 'SHOT')

export function ShotMatrix() {
  const projects = useClientStore(s => s.projects)
  const tasks = usePipelineStore(s => s.tasks)
  const updateTaskStatus = usePipelineStore(s => s.updateTaskStatus)

  if (projects.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Shot Matrix</h1>
        <p className="text-sm text-gray-400">No projects found. Create a project first.</p>
      </div>
    )
  }

  // Show matrix for first active project by default
  const project = projects.find(p => p.status === 'ACTIVE') ?? projects[0]

  const shotTasks = tasks.filter(t => t.projectId === project.id && t.shotNumber)
  const shotNumbers = [...new Set(shotTasks.map(t => t.shotNumber!))].sort()

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Shot Matrix</h1>
        <p className="text-sm text-gray-500 mt-1">{project.name} — cross-stage status per shot</p>
      </div>

      {shotNumbers.length === 0 ? (
        <div className="text-sm text-gray-400 bg-white rounded-xl border border-gray-200 p-10 text-center">
          No shots found for this project. Add shots in the Animation, FX, Lighting, Composite, or Editing stages.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide sticky left-0 bg-gray-50 min-w-[120px]">
                  Shot
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap min-w-[120px]">
                  Frame Range
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[60px]">
                  Secs
                </th>
                {SHOT_STAGES.map(stage => (
                  <th
                    key={stage.id}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap min-w-[130px]"
                  >
                    {stage.icon} {stage.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shotNumbers.map(shotNo => {
                const sampleTask = shotTasks.find(t => t.shotNumber === shotNo)
                return (
                  <tr key={shotNo} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-800 sticky left-0 bg-inherit">
                      {shotNo}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {sampleTask?.frameRange ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {sampleTask?.seconds ?? '—'}s
                    </td>
                    {SHOT_STAGES.map(stage => {
                      const subStage = stage.subStages[0]
                      const task = tasks.find(
                        t => t.projectId === project.id &&
                          t.subStageId === subStage.id &&
                          t.shotNumber === shotNo
                      )
                      return (
                        <td key={stage.id} className="px-4 py-3">
                          {task ? (
                            <div onClick={e => e.stopPropagation()}>
                              <StatusDropdown
                                value={task.status}
                                onChange={s => updateTaskStatus(task.id, s)}
                                compact
                              />
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
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
      )}
    </div>
  )
}
