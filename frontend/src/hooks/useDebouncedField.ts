import { useEffect, useRef, useState } from 'react'

/**
 * Controlled-input wrapper that fires the commit callback at most once per
 * `delay` (default 400ms) of idle typing, or immediately on blur.
 * Keeps a local value so React stays in control of every keystroke
 * but the server only sees the final value.
 */
export function useDebouncedField<T extends string | number | null | undefined>(
  initial: T,
  onCommit: (next: T) => void,
  delay = 400,
) {
  const [value, setValue] = useState<T>(initial)
  const lastCommitted = useRef<T>(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // External changes (e.g. SSE) win unless the user is actively editing
  useEffect(() => {
    if (timer.current) return                              // user is mid-edit, ignore
    setValue(initial)
    lastCommitted.current = initial
  }, [initial])

  function commit(next: T) {
    if (next === lastCommitted.current) return
    lastCommitted.current = next
    onCommit(next)
  }

  function onChange(next: T) {
    setValue(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      commit(next)
    }, delay)
  }

  function onBlur() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    commit(value)
  }

  return { value, onChange, onBlur }
}
