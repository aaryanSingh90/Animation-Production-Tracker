// BUG-2 / BUG-40: fps was hardcoded to 24, so projects shot at 25/30fps got the
// wrong duration. The frame rate now flows in from project.frameRate. Edge cases
// mirror the backend's `framesInRange` (tasks.ts) so client and server agree:
//   • an unparseable / non-two-part range → 0
//   • a zero range (0-0) → 0 (no frames authored yet)
//   • end < start → 0 (don't return a negative duration)
//   • otherwise the inclusive frame count divided by fps
export function calcSeconds(frameRange: string, fps = 24): number {
  const parts = frameRange.split('-').map(s => parseInt(s.trim(), 10))
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0
  const [start, end] = parts
  if (start === 0 && end === 0) return 0
  if (end < start) return 0
  const rate = fps > 0 ? fps : 24
  // Keep exact decimals — display layer formats to 1 decimal place.
  // e.g. 101-124 (24 frames @ 24fps) → 1.0
  //      101-135 (35 frames @ 24fps) → 1.458… (shown as 1.5)
  //      101-148 (48 frames @ 24fps) → 2.0
  return (end - start + 1) / rate
}

/** Format a frame-count-derived seconds value to one decimal. e.g. 1.46 → "1.5s" */
export function formatSeconds(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${n.toFixed(1)}s`
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
  // Tasks that are done / approved are never "overdue" regardless of date
  if (status === 'DONE' || status === 'FINAL_APPROVAL') return false
  return new Date(endDate) < new Date(new Date().toDateString())
}
