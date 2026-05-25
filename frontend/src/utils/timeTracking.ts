import type { TaskRow, TaskStatus } from '../types'

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
  // Treat date-only values as local midnight so seeded rows still parse.
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function toDateTimeInputValue(value: string | null | undefined): string {
  const parsed = parseTaskDate(value)
  return parsed ? getCurrentDateTimeLocal(parsed) : ''
}

/**
 * Active work — timer accumulates milliseconds while the task is in any of
 * these states.
 *
 * Both IN_PROGRESS and LEAD_RETAKE count: when a manager sends a retake the
 * artist is back in active work immediately, no extra click needed. Time
 * spent fixing a retake is part of the project's real cost — we want it
 * tracked, not paused.
 */
export function isTimerRunning(status: TaskStatus): boolean {
  return status === 'IN_PROGRESS' || status === 'LEAD_RETAKE'
}

/**
 * Time consumed = total milliseconds the task has spent in a "running" state
 * (IN_PROGRESS or LEAD_RETAKE), derived from the statusHistory entries.
 *
 * Workflow this implements:
 *   ─ Default status YET_TO_START → 0 ms
 *   ─ Status transitions TO IN_PROGRESS / LEAD_RETAKE → timer starts ticking
 *   ─ Status transitions to a non-running state → timer pauses; total accumulates
 *   ─ LEAD_APPROVAL → paused (waiting for manager's review)
 *   ─ LEAD_RETAKE   → RUNNING (artist is fixing it; time spent fixing counts)
 *   ─ FINAL_APPROVAL / DONE → frozen at the last accumulated value
 *
 * startDate / endDate are kept as DEADLINES (set by the manager) and are
 * deliberately NOT used to compute consumed time — they answer a different
 * question ("when was the work supposed to happen?") vs. this function
 * ("how much actual work has been done?").
 */
export function getTaskElapsedMs(
  task: Pick<TaskRow, 'status' | 'statusHistory' | 'createdAt'>,
  nowMs = Date.now(),
): number {
  const history = task.statusHistory ?? []
  let total = 0
  let activeStart: number | null = null

  // Determine the initial state of the task.
  // - history empty → task was created at its current status, never moved
  // - history has entries → history[0].from is the original state at creation
  const initialStatus: TaskStatus = history.length > 0 ? history[0].from : task.status
  if (isTimerRunning(initialStatus)) {
    const createdAt = parseTaskDate(task.createdAt)
    if (createdAt) activeStart = createdAt.getTime()
  }

  for (const change of history) {
    const t = parseTaskDate(change.changedAt)?.getTime()
    if (t === undefined) continue

    const fromRunning = isTimerRunning(change.from)
    const toRunning   = isTimerRunning(change.to)

    // Close an open session when we leave a running state for a paused one.
    if (activeStart !== null && fromRunning && !toRunning) {
      total += Math.max(0, t - activeStart)
      activeStart = null
    }
    // Open a session when we enter a running state from a paused one.
    if (!fromRunning && toRunning) {
      activeStart = t
    }
    // Transitions between two running states (IN_PROGRESS ↔ LEAD_RETAKE) keep
    // the timer ticking — no close/open. The activeStart stays as is.
  }

  // If still in a running state right now, count time since the last session opened.
  if (isTimerRunning(task.status) && activeStart !== null) {
    total += Math.max(0, nowMs - activeStart)
  }

  return total
}

export function formatElapsed(ms: number | null): string {
  if (ms === null) return '—'
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const totalMinutes = Math.floor(totalSeconds / 60)
  const days    = Math.floor(totalMinutes / (24 * 60))
  const hours   = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minutes = totalMinutes % 60
  const seconds = totalSeconds % 60

  if (days > 0)  return `${days}d${hours > 0 ? ` ${hours}h` : ''}`
  if (hours > 0) return `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`
  if (minutes > 0) return `${minutes}m`
  // Show seconds only for very short sessions — useful while the live timer ticks up
  return `${seconds}s`
}
