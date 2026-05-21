import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TaskRow, TaskStatus } from '../types'
import { INITIAL_TASKS } from '../data/initialData'
import { calcSeconds } from '../utils/calcSeconds'

interface PipelineState {
  tasks: TaskRow[]
  addTask: (task: TaskRow) => void
  updateTask: (id: string, patch: Partial<TaskRow>) => void
  updateTaskStatus: (id: string, newStatus: TaskStatus, userId?: string) => void
  deleteTask: (id: string) => void
  bulkUpdateStatus: (ids: string[], status: TaskStatus) => void
  bulkUpdateArtist: (ids: string[], artistId: string | null) => void
  bulkDeleteTasks: (ids: string[]) => void
  getTasksBySubStage: (subStageId: string, projectId: string) => TaskRow[]
  getTasksByProject: (projectId: string) => TaskRow[]
  getTasksByArtist: (artistId: string) => TaskRow[]
}

export const usePipelineStore = create<PipelineState>()(
  persist(
    (set, get) => ({
      tasks: INITIAL_TASKS,

      addTask: (task) =>
        set(s => ({ tasks: [...s.tasks, task] })),

      updateTask: (id, patch) =>
        set(s => ({
          tasks: s.tasks.map(t => {
            if (t.id !== id) return t
            const updated = { ...t, ...patch, updatedAt: new Date().toISOString() }
            if (patch.frameRange !== undefined) {
              updated.seconds = calcSeconds(patch.frameRange ?? '')
            }
            return updated
          }),
        })),

      updateTaskStatus: (id, newStatus, userId) =>
        set(s => ({
          tasks: s.tasks.map(t => {
            if (t.id !== id) return t
            return {
              ...t,
              status: newStatus,
              updatedAt: new Date().toISOString(),
              statusHistory: [
                ...t.statusHistory,
                {
                  from: t.status,
                  to: newStatus,
                  changedAt: new Date().toISOString(),
                  changedByUserId: userId,
                },
              ],
            }
          }),
        })),

      deleteTask: (id) =>
        set(s => ({ tasks: s.tasks.filter(t => t.id !== id) })),

      bulkUpdateStatus: (ids, status) =>
        set(s => ({
          tasks: s.tasks.map(t =>
            ids.includes(t.id)
              ? {
                  ...t,
                  status,
                  updatedAt: new Date().toISOString(),
                  statusHistory: [
                    ...t.statusHistory,
                    { from: t.status, to: status, changedAt: new Date().toISOString() },
                  ],
                }
              : t
          ),
        })),

      bulkUpdateArtist: (ids, artistId) =>
        set(s => ({
          tasks: s.tasks.map(t =>
            ids.includes(t.id)
              ? { ...t, assignedArtistId: artistId, updatedAt: new Date().toISOString() }
              : t
          ),
        })),

      bulkDeleteTasks: (ids) =>
        set(s => ({ tasks: s.tasks.filter(t => !ids.includes(t.id)) })),

      getTasksBySubStage: (subStageId, projectId) =>
        get().tasks.filter(t => t.subStageId === subStageId && t.projectId === projectId),

      getTasksByProject: (projectId) =>
        get().tasks.filter(t => t.projectId === projectId),

      getTasksByArtist: (artistId) =>
        get().tasks.filter(t => t.assignedArtistId === artistId),
    }),
    { name: 'anim-pipeline' }
  )
)
