import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { StageConfig } from '../../types'
import { usePipelineStore } from '../../store/pipelineStore'
import { useAuthStore } from '../../store/authStore'
import { QuickAddBar } from './QuickAddBar'
import { BulkVideoUpload } from './BulkVideoUpload'
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

// Sub-stages whose tasks reference the Cut Shots task via soft-link
// (thumbnail mirror + video-version mirror). We preload Cut Shots whenever
// one of these stages loads so the link works even when the user navigates
// directly to Animation (or FX / Lighting / Compositing) without having
// visited the Animatics page first in the same session.
const NEEDS_CUT_SHOTS = new Set([
  'animation-animation',
  'fx-fx',
  'lighting-lighting',
  'compositing-compositing',
])

export function WorkspaceView({ projectId, stageConfig, subStageSlug, clientId }: Props) {
  const navigate    = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const allStoreTasks    = usePipelineStore(s => s.tasks)
  const loadForSubStage  = usePipelineStore(s => s.loadForSubStage)
  const currentUser      = useAuthStore(s => s.currentUser)
  const isManager      = currentUser?.role === 'MANAGER'
  const isArtist       = !isManager
  // Two-tier model: only managers see all tasks / can add tasks. Everyone else
  // sees only their own rows in this pipeline stage.
  const canSeeAllTasks = isManager
  const canAddTasks    = isManager

  const subStageConfig = stageConfig.subStages.find(ss => ss.slug === subStageSlug)
    ?? stageConfig.subStages[0]

  const allTasks = allStoreTasks.filter(
    t => t.subStageId === subStageConfig.id &&
         t.projectId  === projectId &&
         (canSeeAllTasks || t.assignedArtistId === currentUser?.id)
  )

  // Load tasks for this sub-stage on demand.
  // Managers load per sub-stage; artists already have their own tasks from
  // initForArtist. Shot-based stages ALSO preload Cut Shots for the soft-link —
  // safe for both roles because loadForSubStage is idempotent (fetches once
  // per project+sub-stage per session).
  useEffect(() => {
    if (isManager) {
      loadForSubStage(projectId, subStageConfig.id)
    }
    if (NEEDS_CUT_SHOTS.has(subStageConfig.id)) {
      loadForSubStage(projectId, 'animatics-cut-shots')
    }
  }, [projectId, subStageConfig.id, isManager, loadForSubStage])

  const [filters, setFilters]       = useState<FilterState>(DEFAULT_FILTERS)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [drawerTask, setDrawerTask] = useState<TaskRow | null>(null)

  // Auto-open drawer when ?open=taskId is present in the URL
  const openTaskId = searchParams.get('open')
  useEffect(() => {
    if (!openTaskId) return
    const t = allStoreTasks.find(x => x.id === openTaskId)
    if (t) setDrawerTask(t)
  }, [openTaskId, allStoreTasks])

  function handleCloseDrawer() {
    setDrawerTask(null)
    if (searchParams.get('open')) {
      searchParams.delete('open')
      setSearchParams(searchParams, { replace: true })
    }
  }

  const overdueCount  = allTasks.filter(t => isOverdue(t.endDate, t.status)).length
  const filteredTasks = applyFilters(allTasks, filters)

  return (
    <div className={clsx('flex flex-col min-h-0 bg-[#0b0f19] transition-[margin] duration-200', drawerTask ? 'lg:mr-96' : '')}>

      {/* Sub-stage tabs */}
      {stageConfig.subStages.length > 1 && (
        <div className="flex gap-0 border-b border-[#1a263e] bg-[#080d1a] px-4">
          {stageConfig.subStages.map(ss => (
            <button
              key={ss.id}
              onClick={() =>
                navigate(`/clients/${clientId}/projects/${projectId}/pipeline/${stageConfig.slug}/${ss.slug}`)
              }
              className={clsx(
                'px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap',
                ss.slug === subStageSlug
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-600'
              )}
            >
              {ss.name}
            </button>
          ))}
        </div>
      )}

      {/* Quick add — manager & lead only */}
      {canAddTasks && (
        <QuickAddBar
          stageConfig={stageConfig}
          subStageConfig={subStageConfig}
          projectId={projectId}
        />
      )}

      {/* Bulk video upload — only on Cut Shots, manager only */}
      {canAddTasks && subStageConfig.slug === 'cut-shots' && (
        <BulkVideoUpload
          projectId={projectId}
          subStageConfig={subStageConfig}
        />
      )}

      {/* Filter bar */}
      <FilterBar filters={filters} onChange={setFilters} overdueCount={overdueCount} />

      {/* Bulk action bar — hidden for artists */}
      {!isArtist && <BulkActionBar selectedIds={selectedIds} onClear={() => setSelectedIds([])} />}

      {/* Table */}
      <div className="flex-1 bg-[#0b0f19]">
        <TaskTable
          tasks={filteredTasks}
          subStageConfig={subStageConfig}
          selectedIds={selectedIds}
          onSelect={setSelectedIds}
          onRowClick={setDrawerTask}
        />
      </div>

      {/* Summary footer */}
      <div className="px-4 py-2 border-t border-[#1a263e] bg-[#080d1a] text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-4">
        <span>{allTasks.length} total</span>
        {filteredTasks.length !== allTasks.length && (
          <span className="text-indigo-400">{filteredTasks.length} shown</span>
        )}
        {overdueCount > 0 && (
          <span className="text-rose-400 animate-pulse">⚠ {overdueCount} overdue</span>
        )}
      </div>

      <DetailDrawer task={drawerTask} onClose={handleCloseDrawer} />
    </div>
  )
}
