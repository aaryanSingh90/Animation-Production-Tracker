import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { StageConfig } from '../../types'
import { usePipelineStore } from '../../store/pipelineStore'
import { QuickAddBar } from './QuickAddBar'
import { FilterBar, DEFAULT_FILTERS, type FilterState } from './FilterBar'
import { applyFilters } from '../../utils/filterUtils'
import { BulkActionBar } from './BulkActionBar'
import { TaskTable } from './TaskTable'
import { DetailDrawer } from './DetailDrawer'
import type { TaskRow } from '../../types'
import { isOverdue } from '../../utils/calcSeconds'
import { clsx } from 'clsx'

interface Props {
  projectId: string
  stageConfig: StageConfig
  subStageSlug: string
  clientId: string
}

export function WorkspaceView({ projectId, stageConfig, subStageSlug, clientId }: Props) {
  const navigate = useNavigate()
  const allStoreTasks = usePipelineStore(s => s.tasks)

  const subStageConfig = stageConfig.subStages.find(ss => ss.slug === subStageSlug)
    ?? stageConfig.subStages[0]

  const allTasks = allStoreTasks.filter(
    t => t.subStageId === subStageConfig.id && t.projectId === projectId
  )

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [drawerTask, setDrawerTask] = useState<TaskRow | null>(null)

  const overdueCount = allTasks.filter(t => isOverdue(t.endDate, t.status)).length
  const filteredTasks = applyFilters(allTasks, filters)

  return (
    <div className={clsx('flex flex-col', drawerTask ? 'mr-96' : '')}>
      {/* Sub-stage tabs (if more than one) */}
      {stageConfig.subStages.length > 1 && (
        <div className="flex gap-0 border-b border-gray-200 bg-white px-4">
          {stageConfig.subStages.map(ss => (
            <button
              key={ss.id}
              onClick={() =>
                navigate(`/clients/${clientId}/projects/${projectId}/pipeline/${stageConfig.slug}/${ss.slug}`)
              }
              className={clsx(
                'px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                ss.slug === subStageSlug
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              {ss.name}
            </button>
          ))}
        </div>
      )}

      {/* Quick add */}
      <QuickAddBar
        stageConfig={stageConfig}
        subStageConfig={subStageConfig}
        projectId={projectId}
      />

      {/* Filter bar */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        overdueCount={overdueCount}
      />

      {/* Bulk action bar */}
      <BulkActionBar
        selectedIds={selectedIds}
        onClear={() => setSelectedIds([])}
      />

      {/* Table */}
      <div className="flex-1 bg-white">
        <TaskTable
          tasks={filteredTasks}
          subStageConfig={subStageConfig}
          selectedIds={selectedIds}
          onSelect={setSelectedIds}
          onRowClick={setDrawerTask}
        />
      </div>

      {/* Summary footer */}
      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 flex items-center gap-4">
        <span>{allTasks.length} total</span>
        {filteredTasks.length !== allTasks.length && (
          <span>{filteredTasks.length} shown</span>
        )}
        {overdueCount > 0 && (
          <span className="text-red-600 font-medium">⚠ {overdueCount} overdue</span>
        )}
      </div>

      {/* Detail drawer */}
      <DetailDrawer task={drawerTask} onClose={() => setDrawerTask(null)} />
    </div>
  )
}
