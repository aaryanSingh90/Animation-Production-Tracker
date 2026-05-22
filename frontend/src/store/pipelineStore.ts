import { create } from 'zustand'
import type { TaskRow, TaskStatus } from '../types'
import { Tasks, type TaskCreate, type TaskPatch } from '../api/endpoints'

interface PipelineState {
  tasks:       TaskRow[]
  initialized: boolean
  loading:     boolean

  initialize: () => Promise<void>
  refresh:    () => Promise<void>

  addTask:          (data: TaskCreate)                                       => Promise<TaskRow>
  updateTask:       (id: string, patch: TaskPatch)                           => Promise<TaskRow>
  updateTaskStatus: (id: string, newStatus: TaskStatus, _userId?: string)    => Promise<TaskRow>
  deleteTask:       (id: string)                                             => Promise<void>
  addComment:       (id: string, message: string, type?: 'note' | 'retake' | 'approval') => Promise<TaskRow>

  bulkUpdateStatus: (ids: string[], status: TaskStatus)                      => Promise<void>
  bulkUpdateArtist: (ids: string[], artistId: string | null)                 => Promise<void>
  bulkDeleteTasks:  (ids: string[])                                          => Promise<void>

  // Pure-derived helpers
  getTasksBySubStage: (subStageId: string, projectId: string) => TaskRow[]
  getTasksByProject:  (projectId: string)                     => TaskRow[]
  getTasksByArtist:   (artistId: string)                      => TaskRow[]

  // Apply an SSE-pushed update without re-fetching
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
  tasks:       [],
  initialized: false,
  loading:     false,

  initialize: async () => {
    if (get().initialized) return
    await get().refresh()
    set({ initialized: true })
  },

  refresh: async () => {
    set({ loading: true })
    try {
      const { tasks } = await Tasks.list()
      set({ tasks, loading: false })
    } catch (err) {
      console.error('[tasks] refresh failed', err)
      set({ loading: false })
    }
  },

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
    const results = await Promise.allSettled(ids.map(id => Tasks.update(id, { assignedArtistId: artistId })))
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

  getTasksBySubStage: (subStageId, projectId) =>
    get().tasks.filter(t => t.subStageId === subStageId && t.projectId === projectId),
  getTasksByProject: (projectId) =>
    get().tasks.filter(t => t.projectId === projectId),
  getTasksByArtist: (artistId) =>
    get().tasks.filter(t => t.assignedArtistId === artistId),

  applyServerEvent: (event) => {
    if (event.type === 'task.deleted') {
      set(s => ({ tasks: s.tasks.filter(t => t.id !== event.taskId) }))
    } else {
      set(s => ({ tasks: upsert(s.tasks, event.task) }))
    }
  },
}))
