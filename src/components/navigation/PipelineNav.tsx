import { useNavigate, useParams } from 'react-router-dom'
import { STAGE_CONFIGS } from '../../config/stageConfigs'
import { clsx } from 'clsx'

interface Props {
  clientId: string
  projectId: string
  activeStageSlug?: string
}

export function PipelineNav({ clientId, projectId, activeStageSlug }: Props) {
  const navigate = useNavigate()

  return (
    <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
      <div className="flex overflow-x-auto scrollbar-none px-4 gap-0">
        {STAGE_CONFIGS.map(stage => {
          const isActive = stage.slug === activeStageSlug
          const firstSub = stage.subStages[0]
          return (
            <button
              key={stage.id}
              onClick={() =>
                navigate(`/clients/${clientId}/projects/${projectId}/pipeline/${stage.slug}/${firstSub.slug}`)
              }
              className={clsx(
                'flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                isActive
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              )}
            >
              <span>{stage.icon}</span>
              <span>{stage.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
