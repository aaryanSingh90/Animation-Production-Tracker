import type { TaskRow, TaskStatus } from '../types'

// Work paused — clock freezes at the moment status last changed (updatedAt)
const PAUSED_STATUSES = new Set<TaskStatus>(['YET_TO_START', 'LEAD_APPROVAL', 'LEAD_RETAKE'])
// Work complete — clock locked (uses endDate if set, otherwise updatedAt)
const FROZEN_STATUSES = new Set<TaskStatus>(['DONE', 'FINAL_APPROVAL'])

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function getCurrentDateTimeLocal(date = new Date()): string {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join('-') + `T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

export function parseTaskDate(value: string | null | undefined): Date | null {
  if (!value) return null

  // Treat date-only values as local midnight, so existing seeded rows still parse.
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function toDateTimeInputValue(value: string | null | undefined): string {
  const parsed = parseTaskDate(value)
  return parsed ? getCurrentDateTimeLocal(parsed) : ''
}

export function isTimerRunning(status: TaskStatus): boolean {
  return status === 'IN_PROGRESS'
}

export function getTaskElapsedMs(
  task: Pick<TaskRow, 'startDate' | 'endDate' | 'status' | 'updatedAt'>,
  nowMs = Date.now(),
): number | null {
  const start = parseTaskDate(task.startDate)
  if (!start) return null

  const startMs = start.getTime()
  const end = parseTaskDate(task.endDate)
  if (end) return Math.max(0, end.getTime() - startMs)

  if (isTimerRunning(task.status)) {
    return Math.max(0, nowMs - startMs)
  }

  if (PAUSED_STATUSES.has(task.status) || FROZEN_STATUSES.has(task.status)) {
    const anchor = parseTaskDate(task.updatedAt)
    if (anchor) return Math.max(0, anchor.getTime() - startMs)
  }

  return Math.max(0, nowMs - startMs)
}

export function formatElapsed(ms: number | null): string {
  if (ms === null) return '—'

  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) return `${days}d${hours > 0 ? ` ${hours}h` : ''}`
  if (hours > 0) return `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`
  return `${minutes}m`
}
