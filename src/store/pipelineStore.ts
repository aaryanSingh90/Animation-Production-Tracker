import { create } from 'zustand'
import type { TaskRow, TaskStatus } from '../types'
import { INITIAL_TASKS } from '../data/initialData'
import { calcSeconds } from '../utils/calcSeconds'
import { db } from '../db/database'

interface PipelineState {
  tasks: TaskRow[]
  initialized: boolean
  initialize: () => Promise<void>
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

export const usePipelineStore = create<PipelineState>()((set, get) => ({
  tasks: [],
  initialized: false,

  initialize: async () => {
    const count = await db.tasks.count()
    if (count === 0) await db.tasks.bulkAdd(INITIAL_TASKS)
    const tasks = await db.tasks.toArray()
    set({ tasks, initialized: true })
  },

  addTask: (task) => {
    set(s => ({ tasks: [...s.tasks, task] }))
    db.tasks.add(task)
  },

  updateTask: (id, patch) => {
    const updatedAt = new Date().toISOString()
    const extra = patch.frameRange !== undefined ? { seconds: calcSeconds(patch.frameRange ?? '') } : {}
    const fullPatch = { ...patch, ...extra, updatedAt }
    set(s => ({ tasks: s.tasks.map(t => t.id === id ? { ...t, ...fullPatch } : t) }))
    db.tasks.update(id, fullPatch)
  },

  updateTaskStatus: (id, newStatus, userId) => {
    const task = get().tasks.find(t => t.id === id)
    if (!task) return
    const updatedAt = new Date().toISOString()
    const updated: TaskRow = {
      ...task,
      status: newStatus,
      updatedAt,
      statusHistory: [
        ...task.statusHistory,
        { from: task.status, to: newStatus, changedAt: updatedAt, changedByUserId: userId },
      ],
    }
    set(s => ({ tasks: s.tasks.map(t => t.id === id ? updated : t) }))
    db.tasks.put(updated)
  },

  deleteTask: (id) => {
    set(s => ({ tasks: s.tasks.filter(t => t.id !== id) }))
    db.tasks.delete(id)
  },

  bulkUpdateStatus: (ids, status) => {
    const updatedAt = new Date().toISOString()
    const updated = get().tasks.map(t => {
      if (!ids.includes(t.id)) return t
      return {
        ...t, status, updatedAt,
        statusHistory: [...t.statusHistory, { from: t.status, to: status, changedAt: updatedAt }],
      }
    })
    set({ tasks: updated })
    ids.forEach(id => {
      const t = updated.find(x => x.id === id)
      if (t) db.tasks.put(t)
    })
  },

  bulkUpdateArtist: (ids, artistId) => {
    const updatedAt = new Date().toISOString()
    set(s => ({ tasks: s.tasks.map(t => ids.includes(t.id) ? { ...t, assignedArtistId: artistId, updatedAt } : t) }))
    ids.forEach(id => db.tasks.update(id, { assignedArtistId: artistId, updatedAt }))
  },

  bulkDeleteTasks: (ids) => {
    set(s => ({ tasks: s.tasks.filter(t => !ids.includes(t.id)) }))
    db.tasks.bulkDelete(ids)
  },

  getTasksBySubStage: (subStageId, projectId) =>
    get().tasks.filter(t => t.subStageId === subStageId && t.projectId === projectId),
  getTasksByProject: (projectId) =>
    get().tasks.filter(t => t.projectId === projectId),
  getTasksByArtist: (artistId) =>
    get().tasks.filter(t => t.assignedArtistId === artistId),
}))
