import { create } from 'zustand'
import type { TaskRow, TaskStatus } from '../types'
import { Tasks, type TaskCreate, type TaskPatch } from '../api/endpoints'

interface PipelineState {
  tasks:            TaskRow[]
  /** "projectId:subStageId" keys that have already been fetched */
  loadedSubStages:  Record<string, true>
  initialized:      boolean
  loading:          boolean

  /**
   * Called at startup for ARTIST / FREELANCE / LEAD users.
   * Loads only tasks assigned to them — keeps the payload small.
   */
  initForArtist: (userId: string) => Promise<void>

  /**
   * Called at startup for MANAGERs.
   * Managers load tasks on demand per sub-stage — nothing fetched here.
   */
  initForManager: () => void

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
  updateTask:       (id: string, patch: TaskPatch)                           => Promise<TaskRow>
  updateTaskStatus: (id: string, newStatus: TaskStatus, _userId?: string)    => Promise<TaskRow>
  deleteTask:       (id: string)                                             => Promise<void>
  addComment:       (id: string, message: string, type?: 'note' | 'retake' | 'approval') => Promise<TaskRow>

  bulkUpdateStatus: (ids: string[], status: TaskStatus)  => Promise<void>
  bulkUpdateArtist: (ids: string[], artistId: string | null) => Promise<void>
  bulkDeleteTasks:  (ids: string[])                      => Promise<void>

  // Pure-derived helpers
  getTasksBySubStage: (subStageId: string, projectId: string) => TaskRow[]
  getTasksByProject:  (projectId: string)                     => TaskRow[]
  getTasksByArtist:   (artistId: string)                      => TaskRow[]

  applyServerEvent: (event:
    | { type: 'task.created'; task: TaskRow }
    | { type: 'task.updated'; task: TaskRow }
    | { type: 'task.deleted'; taskId: string }
  ) => void
}

function upsert(tasks: TaskRow[], next: TaskRow): TaskRow[] {
  const idx = tasks.findIndex(t => t.id === next.id)
  if (idx < 0) return [...tasks, next]
  const out = tasks.slice()
  out[idx] = next
  return out
}

export const usePipelineStore = create<PipelineState>()((set, get) => ({
  tasks:           [],
  loadedSubStages: {},
  initialized:     false,
  loading:         false,

  // ── Initialisation ──────────────────────────────────────────────────────────

  initForArtist: async (userId) => {
    if (get().initialized) return
    set({ loading: true })
    try {
      // Only load this artist's tasks — bounded dataset regardless of project count
      const { tasks } = await Tasks.list({ assignedArtistId: userId })
      set({ tasks, loading: false, initialized: true })
    } catch (err) {
      console.error('[tasks] initForArtist failed', err)
      set({ loading: false, initialized: true })
    }
  },

  initForManager: () => {
    // Managers load tasks on demand per sub-stage — nothing to fetch here
    set({ initialized: true })
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
      console.error('[tasks] loadForSubStage failed', err)
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
      console.error('[tasks] loadForProject failed', err)
      set({ loading: false })
    }
  },

  // ── Mutations ───────────────────────────────────────────────────────────────

  addTask: async (data) => {
    const { task } = await Tasks.create(data)
    set(s => ({ tasks: upsert(s.tasks, task) }))
    return task
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
  },

  bulkDeleteTasks: async (ids) => {
    await Promise.allSettled(ids.map(id => Tasks.remove(id)))
    set(s => ({ tasks: s.tasks.filter(t => !ids.includes(t.id)) }))
  },

  // ── Derived helpers ─────────────────────────────────────────────────────────

  getTasksBySubStage: (subStageId, projectId) =>
    get().tasks.filter(t => t.subStageId === subStageId && t.projectId === projectId),
  getTasksByProject:  (projectId) =>
    get().tasks.filter(t => t.projectId === projectId),
  getTasksByArtist:   (artistId) =>
    get().tasks.filter(t => t.assignedArtistId === artistId),

  // ── SSE ─────────────────────────────────────────────────────────────────────

  applyServerEvent: (event) => {
    if (event.type === 'task.deleted') {
      set(s => ({ tasks: s.tasks.filter(t => t.id !== event.taskId) }))
    } else {
      // Only merge into store if this sub-stage was already loaded —
      // prevents tasks from unloaded sub-stages leaking in via SSE
      const { task } = event
      const key = `${task.projectId}:${task.subStageId}`
      const isLoaded = !!get().loadedSubStages[key]
      // Artists always accept SSE for their own tasks (already in store)
      const isOwn = get().tasks.some(t => t.id === task.id)
      if (isLoaded || isOwn) {
        set(s => ({ tasks: upsert(s.tasks, task) }))
      }
    }
  },
}))
