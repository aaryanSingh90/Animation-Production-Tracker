import type { TaskRow, TaskStatus } from '../types'
import { isOverdue } from './calcSeconds'

export interface FilterState {
  search: string
  artistIds: string[]
  statuses: TaskStatus[]
  overdueOnly: boolean
}

export const DEFAULT_FILTERS: FilterState = {
  search: '',
  artistIds: [],
  statuses: [],
  overdueOnly: false,
}

export function applyFilters(tasks: TaskRow[], f: FilterState): TaskRow[] {
  return tasks.filter(t => {
    if (f.search) {
      const q = f.search.toLowerCase()
      if (!t.itemName.toLowerCase().includes(q) && !(t.shotNumber ?? '').toLowerCase().includes(q)) return false
    }
    if (f.artistIds.length && !f.artistIds.includes(t.assignedArtistId ?? '')) return false
    if (f.statuses.length && !f.statuses.includes(t.status)) return false
    if (f.overdueOnly && !isOverdue(t.endDate, t.status)) return false
    return true
  })
}
