import { differenceInDays, startOfDay, parseISO } from 'date-fns'

export type DeadlineLevel = 'ok' | 'soon' | 'urgent' | 'overdue'

/**
 * Returns urgency level based on how many days remain until endDate.
 * Completed tasks (FINAL_APPROVAL / DONE) always return 'ok'.
 */
export function getDeadlineLevel(endDate: string | null, status: string): DeadlineLevel {
  if (!endDate) return 'ok'
  if (status === 'FINAL_APPROVAL' || status === 'DONE') return 'ok'
  const today = startOfDay(new Date())
  const due   = startOfDay(parseISO(endDate))
  const days  = differenceInDays(due, today)
  if (days < 0)  return 'overdue'
  if (days === 0) return 'urgent'
  if (days <= 2)  return 'soon'
  return 'ok'
}

export function daysUntil(endDate: string | null): number | null {
  if (!endDate) return null
  return differenceInDays(startOfDay(parseISO(endDate)), startOfDay(new Date()))
}

export const DEADLINE_BADGE: Record<Exclude<DeadlineLevel, 'ok'>, { label: string; cls: string; dot: string }> = {
  soon:    { label: 'Due Soon',  cls: 'text-amber-400  border-amber-500/30  bg-amber-500/10',  dot: 'bg-amber-400' },
  urgent:  { label: 'Due Today', cls: 'text-orange-400 border-orange-500/30 bg-orange-500/10', dot: 'bg-orange-400 animate-pulse' },
  overdue: { label: 'Overdue',   cls: 'text-rose-400   border-rose-500/30   bg-rose-500/10',   dot: 'bg-rose-400 animate-pulse' },
}
