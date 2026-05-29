import { create } from 'zustand'
import type { TaskRow, TaskStatus } from '../types'
import { Tasks, type TaskCreate, type TaskPatch } from '../api/endpoints'
import { logger } from '../utils/logger'
import { useToastStore } from './toastStore'

interface PipelineState {
  tasks:            TaskRow[]
  /** "projectId:subStageId" keys that have already been fetched */
  loadedSubStages:  Record<string, true>
  initialized:      boolean
  loading:          boolean

  /** BUG-01: Reset all store state — called on logout so a new login starts clean. */
  reset: () => void

  /**
   * Called at startup for ARTIST / FREELANCE / LEAD users.
   * Loads only tasks assigned to them — keeps the payload small.
   */
  initForArtist: (userId: string) => Promise<void>

  /**
   * Called at startup for MANAGERs.
   * Loads all tasks so the dashboard shows correct counts immediately and
   * incoming SSE events (task.updated etc.) have a loaded store to land in.
   */
  initForManager: () => Promise<void>

  /**
   * Load tasks for one sub-stage. Safe to call on every navigation —
   * deduplicates based on loadedSubStages so the API is only hit once.
   */
  loadForSubStage: (projectId: string, subStageId: string) => Promise<void>

  /**
   * Load ALL tasks for a project in a single API call.
   * Used by the Pipeline Matrix so it doesn't need 11 separate sub-stage fetches.
   * Marks every fetched sub-stage as loaded, so subsequent loadForSubStage
   * calls on the same project are no-ops (no double-fetching).
   */
  loadForProject: (projectId: string) => Promise<void>

  addTask:          (data: TaskCreate)                                       => Promise<TaskRow>
  /** BUG-02: Atomic batch create — all tasks created in one DB transaction or none. */
  addBatch:         (items: TaskCreate[])                                    => Promise<TaskRow[]>
  updateTask:       (id: string, patch: TaskPatch)                           => Promise<TaskRow>
  updateTaskStatus: (id: string, newStatus: TaskStatus, _userId?: string)    => Promise<TaskRow>
  deleteTask:       (id: string)                                             => Promise<void>
  addComment:       (id: string, message: string, type?: 'note' | 'retake' | 'approval') => Promise<TaskRow>

  /** Force-reload all tasks (managers only) — used on SSE reconnect to catch changes missed while offline. */
  refreshAllTasks: () => Promise<void>

  /** BUG-09: Force-reload THIS artist's own tasks — used on SSE reconnect for non-managers. */
  refreshForArtist: (userId: string) => Promise<void>

  bulkUpdateStatus: (ids: string[], status: TaskStatus)  => Promise<void>
  bulkUpdateArtist: (ids: string[], artistId: string | null) => Promise<void>
  bulkDeleteTasks:  (ids: string[])                      => Promise<void>
  /** BUG-15: Bulk retake with a required note (each task gets status LEAD_RETAKE + retakeNote). */
  bulkRetake:       (ids: string[], retakeNote: string)  => Promise<void>

  // Pure-derived helpers
  getTasksBySubStage: (subStageId: string, projectId: string) => TaskRow[]
  getTasksByProject:  (projectId: string)                     => TaskRow[]
  getTasksByArtist:   (artistId: string)                      => TaskRow[]

  applyServerEvent: (event:
    | { type: 'task.created'; task: TaskRow }
    | { type: 'task.updated'; task: TaskRow }
    | { type: 'task.deleted'; taskId: string }
  , currentUserId?: string, isManager?: boolean) => void
}

function upsert(tasks: TaskRow[], next: TaskRow): TaskRow[] {
  const idx = tasks.findIndex(t => t.id === next.id)
  if (idx < 0) return [...tasks, next]
  const out = tasks.slice()
  out[idx] = next
  return out
}

// BUG-41: bulk ops used Promise.allSettled and silently dropped rejected
// operations, so a manager who selected 20 rows and had 6 fail saw 14 change
// with zero indication anything went wrong. Surface a toast for the failures.
function notifyBulkFailures(total: number, succeeded: number, verb: string) {
  const failed = total - succeeded
  if (failed <= 0) return
  useToastStore.getState().push({
    kind:  'error',
    title: 'Some changes failed',
    body:  `${failed} of ${total} task${total !== 1 ? 's' : ''} could not be ${verb}. They were left unchanged.`,
    ttl:   5000,
  })
}

export const usePipelineStore = create<PipelineState>()((set, get) => ({
  tasks:           [],
  loadedSubStages: {},
  initialized:     false,
  loading:         false,

  // BUG-01: Reset to initial state on logout so a subsequent login sees a clean store.
  reset: () => set({ tasks: [], loadedSubStages: {}, initialized: false, loading: false }),

  // ── Initialisation ──────────────────────────────────────────────────────────

  initForArtist: async (userId) => {
    if (get().initialized) return
    set({ loading: true })
    try {
      // Only load this artist's tasks — bounded dataset regardless of project count
      const { tasks } = await Tasks.list({ assignedArtistId: userId })
      set({ tasks, loading: false, initialized: true })
    } catch (err) {
      logger.error('[tasks] initForArtist failed', err)
      set({ loading: false, initialized: true })
      // BUG-42: surface the failure — otherwise the app boots into a silent empty state.
      useToastStore.getState().push({ kind: 'error', title: 'Could not load your tasks', body: 'Check your connection and reload.', ttl: 6000 })
    }
  },

  initForManager: async () => {
    if (get().initialized) return
    set({ loading: true })
    try {
      // Load every task so the dashboard shows correct counts on login and
      // incoming SSE events have a populated loadedSubStages map to match against.
      const { tasks } = await Tasks.list()
      const loadedSubStages: Record<string, true> = {}
      for (const t of tasks) {
        loadedSubStages[`${t.projectId}:${t.subStageId}`] = true
        loadedSubStages[`project:${t.projectId}`] = true
      }
      set({ tasks, loadedSubStages, loading: false, initialized: true })
    } catch (err) {
      logger.error('[tasks] initForManager failed', err)
      set({ loading: false, initialized: true })
      // BUG-42: surface the failure — otherwise the dashboard boots empty with no clue why.
      useToastStore.getState().push({ kind: 'error', title: 'Could not load tasks', body: 'Check your connection and reload.', ttl: 6000 })
    }
  },

  refreshAllTasks: async () => {
    set({ loading: true })
    try {
      const { tasks } = await Tasks.list()
      const loadedSubStages: Record<string, true> = {}
      for (const t of tasks) {
        loadedSubStages[`${t.projectId}:${t.subStageId}`] = true
        loadedSubStages[`project:${t.projectId}`] = true
      }
      set({ tasks, loadedSubStages, loading: false })
    } catch (err) {
      logger.error('[tasks] refreshAllTasks failed', err)
      set({ loading: false })
      useToastStore.getState().push({ kind: 'error', title: 'Sync failed', body: 'Could not refresh tasks after reconnecting.', ttl: 4000 })
    }
  },

  // BUG-09: non-managers also need their own tasks re-pulled on SSE reconnect.
  // Their store only ever holds tasks assigned to them, so a full replace with
  // the freshly-fetched assignee list is correct.
  refreshForArtist: async (userId) => {
    set({ loading: true })
    try {
      const { tasks } = await Tasks.list({ assignedArtistId: userId })
      set({ tasks, loading: false })
    } catch (err) {
      logger.error('[tasks] refreshForArtist failed', err)
      set({ loading: false })
      useToastStore.getState().push({ kind: 'error', title: 'Sync failed', body: 'Could not refresh your tasks after reconnecting.', ttl: 4000 })
    }
  },

  // ── On-demand per sub-stage loading ────────────────────────────────────────

  loadForSubStage: async (projectId, subStageId) => {
    const key = `${projectId}:${subStageId}`
    if (get().loadedSubStages[key]) return   // already loaded

    set({ loading: true })
    try {
      const { tasks: fresh } = await Tasks.list({ projectId, subStageId })
      set(s => {
        // Replace any stale rows for this sub-stage, keep everything else
        const rest = s.tasks.filter(
          t => !(t.projectId === projectId && t.subStageId === subStageId)
        )
        return {
          tasks:           [...rest, ...fresh],
          loadedSubStages: { ...s.loadedSubStages, [key]: true },
          loading:         false,
        }
      })
    } catch (err) {
      logger.error('[tasks] loadForSubStage failed', err)
      set({ loading: false })
    }
  },

  loadForProject: async (projectId) => {
    // Use a synthetic key so we only fetch the full project once per session
    const projectKey = `project:${projectId}`
    if (get().loadedSubStages[projectKey]) return

    set({ loading: true })
    try {
      const { tasks: fresh } = await Tasks.list({ projectId })
      set(s => {
        // Replace all tasks for this project with the fresh batch
        const rest = s.tasks.filter(t => t.projectId !== projectId)
        // Mark the synthetic project key AND every individual sub-stage as loaded
        // so subsequent loadForSubStage calls on the same project are no-ops.
        const newLoaded: Record<string, true> = {
          ...s.loadedSubStages,
          [projectKey]: true,
        }
        for (const t of fresh) {
          newLoaded[`${projectId}:${t.subStageId}`] = true
        }
        return {
          tasks:           [...rest, ...fresh],
          loadedSubStages: newLoaded,
          loading:         false,
        }
      })
    } catch (err) {
      logger.error('[tasks] loadForProject failed', err)
      set({ loading: false })
    }
  },

  // ── Mutations ───────────────────────────────────────────────────────────────

  addTask: async (data) => {
    const { task } = await Tasks.create(data)
    set(s => ({ tasks: upsert(s.tasks, task) }))
    return task
  },

  // BUG-02: Atomic batch — all mirror tasks created in one server transaction.
  addBatch: async (items) => {
    const { tasks } = await Tasks.createBatch(items)
    set(s => {
      let updated = s.tasks
      for (const task of tasks) updated = upsert(updated, task)
      return { tasks: updated }
    })
    return tasks
  },

  updateTask: async (id, patch) => {
    const { task } = await Tasks.update(id, patch)
    set(s => ({ tasks: upsert(s.tasks, task) }))
    return task
  },

  updateTaskStatus: async (id, newStatus) => {
    const { task } = await Tasks.update(id, { status: newStatus })
    set(s => ({ tasks: upsert(s.tasks, task) }))
    return task
  },

  deleteTask: async (id) => {
    await Tasks.remove(id)
    set(s => ({ tasks: s.tasks.filter(t => t.id !== id) }))
  },

  addComment: async (id, message, type = 'note') => {
    const { task } = await Tasks.comment(id, message, type)
    set(s => ({ tasks: upsert(s.tasks, task) }))
    return task
  },

  bulkUpdateStatus: async (ids, status) => {
    const results = await Promise.allSettled(ids.map(id => Tasks.update(id, { status })))
    const ok = results
      .filter((r): r is PromiseFulfilledResult<{ task: TaskRow }> => r.status === 'fulfilled')
      .map(r => r.value.task)
    set(s => {
      let tasks = s.tasks
      for (const t of ok) tasks = upsert(tasks, t)
      return { tasks }
    })
    notifyBulkFailures(ids.length, ok.length, 'updated')
  },

  bulkUpdateArtist: async (ids, artistId) => {
    const results = await Promise.allSettled(
      ids.map(id => Tasks.update(id, { assignedArtistId: artistId }))
    )
    const ok = results
      .filter((r): r is PromiseFulfilledResult<{ task: TaskRow }> => r.status === 'fulfilled')
      .map(r => r.value.task)
    set(s => {
      let tasks = s.tasks
      for (const t of ok) tasks = upsert(tasks, t)
      return { tasks }
    })
    notifyBulkFailures(ids.length, ok.length, 'reassigned')
  },

  bulkDeleteTasks: async (ids) => {
    const results = await Promise.allSettled(ids.map(id => Tasks.remove(id)))
    // BUG-41: only drop rows that ACTUALLY deleted server-side. The old code
    // filtered out every requested id regardless of outcome, so a failed delete
    // vanished from the UI yet reappeared on the next load — a confusing ghost.
    const deletedIds = ids.filter((_, i) => results[i].status === 'fulfilled')
    set(s => ({ tasks: s.tasks.filter(t => !deletedIds.includes(t.id)) }))
    notifyBulkFailures(ids.length, deletedIds.length, 'deleted')
  },

  // BUG-15: Bulk retake with a required note so artists know what to fix.
  bulkRetake: async (ids, retakeNote) => {
    const results = await Promise.allSettled(
      ids.map(id => Tasks.update(id, { status: 'LEAD_RETAKE', retakeNote }))
    )
    const ok = results
      .filter((r): r is PromiseFulfilledResult<{ task: TaskRow }> => r.status === 'fulfilled')
      .map(r => r.value.task)
    set(s => {
      let tasks = s.tasks
      for (const t of ok) tasks = upsert(tasks, t)
      return { tasks }
    })
    notifyBulkFailures(ids.length, ok.length, 'sent for retake')
  },

  // ── Derived helpers ─────────────────────────────────────────────────────────

  getTasksBySubStage: (subStageId, projectId) =>
    get().tasks.filter(t => t.subStageId === subStageId && t.projectId === projectId),
  getTasksByProject:  (projectId) =>
    get().tasks.filter(t => t.projectId === projectId),
  getTasksByArtist:   (artistId) =>
    get().tasks.filter(t => t.assignedArtistId === artistId),

  // ── SSE ─────────────────────────────────────────────────────────────────────

  applyServerEvent: (event, currentUserId, isManager) => {
    if (event.type === 'task.deleted') {
      set(s => ({ tasks: s.tasks.filter(t => t.id !== event.taskId) }))
    } else {
      const { task } = event
      const key = `${task.projectId}:${task.subStageId}`

      // Managers always receive every event — they need full visibility across
      // all artists and projects (dashboard counts, pipeline matrix, team page).
      // For artists/leads, only accept updates for sub-stages already loaded,
      // tasks already in the store, or tasks newly assigned to them.
      const isLoaded       = !!get().loadedSubStages[key]
      const isOwn          = get().tasks.some(t => t.id === task.id)
      const isAssignedToMe = !!currentUserId && task.assignedArtistId === currentUserId

      if (isManager || isLoaded || isOwn || isAssignedToMe) {
        set(s => ({ tasks: upsert(s.tasks, task) }))
      }
    }
  },
}))
