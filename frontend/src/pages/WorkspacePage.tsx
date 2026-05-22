import { useParams, Navigate, Link } from 'react-router-dom'
import { useClientStore } from '../store/clientStore'
import { STAGE_MAP } from '../config/stageConfigs'
import { PipelineNav } from '../components/navigation/PipelineNav'
import { WorkspaceView } from '../components/workspace/WorkspaceView'

export function WorkspacePage() {
  const { clientId, projectId, stageSlug, subStageSlug } = useParams<{
    clientId: string
    projectId: string
    stageSlug: string
    subStageSlug: string
  }>()

  const projects = useClientStore(s => s.projects)
  const clients  = useClientStore(s => s.clients)

  const client  = clients.find(c => c.id === clientId)
  const project = projects.find(p => p.id === projectId)
  const stageConfig = STAGE_MAP[stageSlug ?? '']

  if (!client || !project || !stageConfig) {
    return <Navigate to="/clients" replace />
  }

  const resolvedSubStage = subStageSlug ?? stageConfig.subStages[0].slug

  return (
    <div className="flex flex-col h-full bg-[#0b0f19]">
      {/* Project breadcrumb header */}
      <div className="bg-[#080d1a] border-b border-[#1a263e] px-6 py-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
          <Link
            to={`/clients/${clientId}`}
            className="text-slate-500 hover:text-slate-200 transition-colors"
          >
            {client.name}
          </Link>
          <span className="text-slate-700">/</span>
          <Link
            to={`/clients/${clientId}/projects/${projectId}`}
            className="text-slate-300 hover:text-indigo-400 transition-colors"
          >
            {project.name}
          </Link>
          <span className="text-slate-700">/</span>
          <span className="text-indigo-400">{stageConfig.icon} {stageConfig.name}</span>
        </div>
      </div>

      {/* Pipeline stage tabs */}
      <PipelineNav
        clientId={clientId!}
        projectId={projectId!}
        activeStageSlug={stageSlug}
      />

      {/* Workspace */}
      <WorkspaceView
        projectId={projectId!}
        stageConfig={stageConfig}
        subStageSlug={resolvedSubStage}
        clientId={clientId!}
      />
    </div>
  )
}
