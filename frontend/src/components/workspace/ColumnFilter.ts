/**
 * Per-column filter types + the predicate that applies them to a task list.
 * Excel-autofilter-style: each column header gets its own funnel.
 */
import type { TaskRow } from '../../types'

export type ColumnFilter =
  | { type: 'text';         query: string }
  | { type: 'multi';        values: string[] }            // for status / artist / audio
  | { type: 'dateRange';    from: string | null; to: string | null }
  | { type: 'numericRange'; min: number | null;  max: number | null }

export type ColumnFilterMap = Record<string, ColumnFilter>

export function isFilterActive(f: ColumnFilter | undefined): boolean {
  if (!f) return false
  switch (f.type) {
    case 'text':         return f.query.trim().length > 0
    case 'multi':        return f.values.length > 0
    case 'dateRange':    return !!(f.from || f.to)
    case 'numericRange': return f.min != null || f.max != null
  }
}

/** Apply every active column filter to the task list (AND of all filters). */
export function applyColumnFilters(tasks: TaskRow[], filters: ColumnFilterMap): TaskRow[] {
  const active = Object.entries(filters).filter(([, f]) => isFilterActive(f))
  if (active.length === 0) return tasks
  return tasks.filter(t => active.every(([key, filter]) => matchOne(t, key, filter)))
}

function matchOne(task: TaskRow, key: string, filter: ColumnFilter): boolean {
  const raw = readField(task, key)
  switch (filter.type) {
    case 'text': {
      const q = filter.query.trim().toLowerCase()
      if (!q) return true
      return String(raw ?? '').toLowerCase().includes(q)
    }
    case 'multi': {
      if (filter.values.length === 0) return true
      // Treat null/undefined assignedArtistId as the literal "__unassigned__"
      const val = raw == null || raw === '' ? '__unassigned__' : String(raw)
      return filter.values.includes(val)
    }
    case 'dateRange': {
      if (!filter.from && !filter.to) return true
      if (!raw) return false
      const ms = new Date(String(raw)).getTime()
      if (Number.isNaN(ms)) return false
      if (filter.from && ms < new Date(filter.from).getTime())           return false
      if (filter.to   && ms > new Date(filter.to).getTime()   + 86_399_999) return false
      return true
    }
    case 'numericRange': {
      if (filter.min == null && filter.max == null) return true
      const n = Number(raw)
      if (!Number.isFinite(n)) return false
      if (filter.min != null && n < filter.min) return false
      if (filter.max != null && n > filter.max) return false
      return true
    }
  }
}

function readField(task: TaskRow, key: string): unknown {
  return (task as unknown as Record<string, unknown>)[key]
}

export function countActive(filters: ColumnFilterMap): number {
  return Object.values(filters).filter(isFilterActive).length
}
