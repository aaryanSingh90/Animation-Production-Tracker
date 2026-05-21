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
    <div className="flex flex-col h-full">
      {/* Project header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link to={`/clients/${clientId}`} className="hover:text-gray-900 hover:underline transition-colors">
            {client.name}
          </Link>
          <span>/</span>
          <Link to={`/clients/${clientId}/projects/${projectId}`} className="font-medium text-gray-900 hover:text-indigo-600 hover:underline transition-colors">
            {project.name}
          </Link>
          <span>/</span>
          <span className="text-indigo-600 font-medium">{stageConfig.icon} {stageConfig.name}</span>
        </div>
      </div>

      {/* Pipeline tabs */}
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
