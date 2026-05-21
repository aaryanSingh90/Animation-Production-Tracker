export function calcSeconds(frameRange: string): number {
  const parts = frameRange.split('-').map(s => parseInt(s.trim(), 10))
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0
  return Math.round((parts[1] - parts[0] + 1) / 24)
}

export function workingDaysBetween(start: string, end: string): number {
  const s = new Date(start)
  const e = new Date(end)
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0
  let count = 0
  const cur = new Date(s)
  while (cur <= e) {
    const day = cur.getDay()
    if (day !== 0 && day !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

export function isOverdue(endDate: string | null, status: string): boolean {
  if (!endDate) return false
  if (status === 'APPROVED' || status === 'EXTENDED') return false
  return new Date(endDate) < new Date(new Date().toDateString())
}
