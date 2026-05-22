import { useEffect, useRef } from 'react'
import { subscribe as sseSubscribe } from '../api/sse'
import { useAuthStore } from '../store/authStore'
import { useToastStore } from '../store/toastStore'
import { usePipelineStore } from '../store/pipelineStore'
import { useClientStore } from '../store/clientStore'
import { SUB_STAGE_MAP, SUB_STAGE_TO_STAGE_SLUG } from '../config/stageConfigs'
import type { TaskRow, TaskStatus } from '../types'

/**
 * Subscribes to SSE task events and turns relevant ones into toast notifications:
 *   • Artist: their task moved to LEAD_RETAKE   → rose toast with retake note
 *   • Artist: their task moved to FINAL_APPROVAL → emerald approval toast
 *   • Manager / Lead: any task moved to LEAD_APPROVAL → sky review toast
 *
 * Dedupes by tracking the last-seen status per task — only fires when status changes.
 * On initial app load, populates the map from the current store so we don't spam
 * the user with toasts for state that already existed.
 */
export function useNotifications() {
  const currentUser = useAuthStore(s => s.currentUser)
  const initialized = usePipelineStore(s => s.initialized)
  const allTasks    = usePipelineStore(s => s.tasks)
  const projects    = useClientStore(s => s.projects)
  const pushToast   = useToastStore(s => s.push)

  const knownStatus = useRef<Map<string, TaskStatus>>(new Map())
  const primed      = useRef(false)

  // Prime the status map once the initial task list arrives, so the next SSE
  // event we receive only fires a toast on a real *change*.
  useEffect(() => {
    if (!currentUser || !initialized) return
    knownStatus.current = new Map(allTasks.map(t => [t.id, t.status]))
    primed.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, initialized])

  useEffect(() => {
    if (!currentUser) return

    const unsubscribe = sseSubscribe(event => {
      if (event.type !== 'task.updated' && event.type !== 'task.created') return
      const task = event.task as TaskRow

      const prev = knownStatus.current.get(task.id)
      knownStatus.current.set(task.id, task.status)

      // Skip until we've primed from the initial load
      if (!primed.current) return
      // Skip if the status didn't actually change
      if (prev !== undefined && prev === task.status) return
      // Don't fire on task.created for brand-new tasks unless it's already in a "ping-the-artist" state
      if (event.type === 'task.created' && prev !== undefined) return

      const isMine    = task.assignedArtistId === currentUser.id
      const canReview = currentUser.role === 'MANAGER'
      const project   = projects.find(p => p.id === task.projectId)
      const subStage  = SUB_STAGE_MAP[task.subStageId]
      const stageSlug = SUB_STAGE_TO_STAGE_SLUG[task.subStageId]
      const projectHref = project && subStage && stageSlug
        ? `/clients/${project.clientId}/projects/${project.id}/pipeline/${stageSlug}/${subStage.slug}`
        : undefined

      if (isMine && task.status === 'LEAD_RETAKE') {
        pushToast({
          kind:  'retake',
          title: `Retake — ${task.itemName || 'task'}`,
          body:  task.retakeNote ?? `${subStage?.name ?? 'A task'} sent back. Open it to see the manager's notes.`,
          taskId: task.id,
          projectHref,
          ttl: 10_000,
        })
      } else if (isMine && task.status === 'FINAL_APPROVAL') {
        pushToast({
          kind:  'approval',
          title: `Approved — ${task.itemName || 'task'}`,
          body:  `${subStage?.name ?? 'Task'} approved. Nice work!`,
          taskId: task.id,
          projectHref,
        })
      } else if (canReview && task.status === 'LEAD_APPROVAL') {
        // Skip if the reviewer is the same person who's the assigned artist
        if (task.assignedArtistId === currentUser.id) return
        pushToast({
          kind:  'review',
          title: `New submission`,
          body:  `${task.itemName || 'A task'} (${subStage?.name ?? 'stage'}) is waiting for your review.`,
          taskId: task.id,
          projectHref,
        })
      }
    })

    return unsubscribe
  }, [currentUser, projects, pushToast])
}
