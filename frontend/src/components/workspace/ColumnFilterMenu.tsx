import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Filter, X, Search } from 'lucide-react'
import { clsx } from 'clsx'
import { STATUS_CONFIG, AUDIO_STATUS_CONFIG, type TaskStatus, type AudioStatus } from '../../types'
import { useEmployeeStore } from '../../store/employeeStore'
import type { ColumnFilter } from './ColumnFilter'
import { isFilterActive } from './ColumnFilter'

type Kind = 'text' | 'status' | 'audio' | 'artist' | 'date' | 'number'

interface Props {
  /** What column we're filtering on (drives the type of control rendered). */
  kind:     Kind
  value:    ColumnFilter | undefined
  onChange: (next: ColumnFilter | undefined) => void
  /** Available task list — used to compute "unique values in this column" for multi-selects. */
  uniqueValues?: string[]
  align?:   'left' | 'right'
}

const POPUP_W = 256 // matches w-64
const VIEWPORT_PAD = 8

/**
 * Funnel icon that opens a typed filter popover beside a column header.
 *
 * The popup is rendered into a React portal at <body> level with fixed
 * positioning calculated from the funnel's bounding rect. This avoids
 * the table's `overflow:auto` container from clipping the popup, and
 * prevents stale ref-contains checks (the popup is always reachable in
 * the DOM regardless of where the column header lives).
 *
 * Closes on outside pointer-down (works for both mouse and touch) or
 * Escape. Re-positions on scroll/resize so it stays glued to the funnel.
 */
export function ColumnFilterMenu({ kind, value, onChange, uniqueValues, align = 'left' }: Props) {
  const [open, setOpen] = useState(false)
  const btnRef    = useRef<HTMLButtonElement>(null)
  const popupRef  = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const active = isFilterActive(value)

  // ─── Position computation ───────────────────────────────────────────────
  function recompute() {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const top = r.bottom + 4
    let left: number
    if (align === 'right') {
      left = r.right - POPUP_W
    } else {
      left = r.left
    }
    // Clamp to viewport so the popup never escapes the screen.
    const maxLeft = window.innerWidth - POPUP_W - VIEWPORT_PAD
    left = Math.max(VIEWPORT_PAD, Math.min(left, maxLeft))
    setPos({ top, left })
  }

  useLayoutEffect(() => {
    if (!open) return
    recompute()
    // Recompute on scroll / resize so the popup follows the column header.
    window.addEventListener('scroll', recompute, true)
    window.addEventListener('resize', recompute)
    return () => {
      window.removeEventListener('scroll', recompute, true)
      window.removeEventListener('resize', recompute)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ─── Outside dismissal (pointerdown handles both mouse + touch) ─────────
  useEffect(() => {
    if (!open) return
    function onDown(e: Event) {
      const target = e.target as Node | null
      if (!target) return
      if (btnRef.current?.contains(target)) return
      if (popupRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className={clsx(
          'p-1 rounded transition-colors relative',
          active
            ? 'text-indigo-300 bg-indigo-500/15 hover:bg-indigo-500/25'
            : 'text-slate-500 hover:text-slate-200 hover:bg-[#162035]',
        )}
        title={active ? 'Filter active — click to edit' : 'Filter this column'}
      >
        <Filter className="w-3 h-3" />
        {active && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-indigo-400 ring-1 ring-[#0c1221]" />}
      </button>

      {open && createPortal(
        <div
          ref={popupRef}
          // Stop bubbling so a parent click handler (e.g. the row onClick that
          // opens the drawer) never fires when the user interacts with the popup.
          onClick={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: POPUP_W }}
          className="z-[100] bg-[#0c1221] border border-[#1b253b] rounded-lg shadow-2xl shadow-black/60 p-3 space-y-2 text-slate-100"
        >
          <Body kind={kind} value={value} onChange={onChange} uniqueValues={uniqueValues} />

          <div className="flex items-center justify-between pt-2 border-t border-[#1b253b]">
            <button
              onClick={() => onChange(undefined)}
              disabled={!active}
              className="text-[10px] font-bold text-slate-500 hover:text-rose-400 uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Clear
            </button>
            <button
              onClick={() => setOpen(false)}
              className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-wider transition-colors"
            >
              Done
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

// ─── Per-kind controls ──────────────────────────────────────────────────────

function Body({ kind, value, onChange, uniqueValues }: Pick<Props, 'kind' | 'value' | 'onChange' | 'uniqueValues'>) {
  switch (kind) {
    case 'text':   return <TextBody   value={value} onChange={onChange} />
    case 'status': return <StatusBody value={value} onChange={onChange} mode="task" />
    case 'audio':  return <StatusBody value={value} onChange={onChange} mode="audio" />
    case 'artist': return <ArtistBody value={value} onChange={onChange} uniqueValues={uniqueValues} />
    case 'date':   return <DateBody   value={value} onChange={onChange} />
    case 'number': return <NumberBody value={value} onChange={onChange} />
  }
}

function TextBody({ value, onChange }: { value: ColumnFilter | undefined; onChange: (n: ColumnFilter | undefined) => void }) {
  const q = value?.type === 'text' ? value.query : ''
  return (
    <div>
      <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Search</label>
      <div className="relative mt-1">
        <Search className="w-3 h-3 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
        <input
          autoFocus
          value={q}
          onChange={e => onChange({ type: 'text', query: e.target.value })}
          placeholder="Contains…"
          className="w-full pl-7 pr-2 py-1.5 text-xs rounded bg-[#0a0f1b] border border-[#1b253b] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 transition-colors"
        />
      </div>
    </div>
  )
}

function StatusBody({ value, onChange, mode }: { value: ColumnFilter | undefined; onChange: (n: ColumnFilter | undefined) => void; mode: 'task' | 'audio' }) {
  const selected = value?.type === 'multi' ? value.values : []
  const entries = mode === 'task'
    ? (Object.keys(STATUS_CONFIG) as TaskStatus[]).map(k => ({ key: k, label: STATUS_CONFIG[k].label, color: STATUS_CONFIG[k].color }))
    : (Object.keys(AUDIO_STATUS_CONFIG) as AudioStatus[]).map(k => ({ key: k, label: AUDIO_STATUS_CONFIG[k].label, color: AUDIO_STATUS_CONFIG[k].color }))

  function toggle(k: string) {
    const next = selected.includes(k)
      ? selected.filter(v => v !== k)
      : [...selected, k]
    onChange(next.length ? { type: 'multi', values: next } : undefined)
  }

  return (
    <div className="max-h-56 overflow-y-auto pr-1 space-y-1">
      {entries.map(e => (
        <label key={e.key} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-[#131b2e] cursor-pointer">
          <input type="checkbox" checked={selected.includes(e.key)} onChange={() => toggle(e.key)}
            className="rounded border-slate-700 bg-[#0d1424] text-indigo-600 focus:ring-indigo-500" />
          <span className={clsx('text-[11px] font-bold uppercase tracking-wider', e.color)}>{e.label}</span>
        </label>
      ))}
    </div>
  )
}

function ArtistBody({ value, onChange, uniqueValues }: { value: ColumnFilter | undefined; onChange: (n: ColumnFilter | undefined) => void; uniqueValues?: string[] }) {
  const employees = useEmployeeStore(s => s.employees)
  const selected = value?.type === 'multi' ? value.values : []
  const [search, setSearch] = useState('')

  // Only show artists who actually appear in this column's data (if uniqueValues provided);
  // otherwise show all employees.
  const allowed = uniqueValues ? new Set(uniqueValues) : null
  let list = employees
    .filter(e => !allowed || allowed.has(e.id))
    .filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()))

  const showUnassigned = !allowed || allowed.has('__unassigned__')

  function toggle(id: string) {
    const next = selected.includes(id)
      ? selected.filter(v => v !== id)
      : [...selected, id]
    onChange(next.length ? { type: 'multi', values: next } : undefined)
  }

  return (
    <div className="space-y-1.5">
      <input
        autoFocus
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search artist…"
        className="w-full px-2 py-1 text-[11px] rounded bg-[#0a0f1b] border border-[#1b253b] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/60"
      />
      <div className="max-h-48 overflow-y-auto pr-1 space-y-0.5">
        {showUnassigned && (
          <label className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-[#131b2e] cursor-pointer">
            <input type="checkbox" checked={selected.includes('__unassigned__')} onChange={() => toggle('__unassigned__')}
              className="rounded border-slate-700 bg-[#0d1424] text-indigo-600 focus:ring-indigo-500" />
            <span className="text-[11px] font-semibold text-slate-500 italic">Unassigned</span>
          </label>
        )}
        {list.map(e => (
          <label key={e.id} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-[#131b2e] cursor-pointer">
            <input type="checkbox" checked={selected.includes(e.id)} onChange={() => toggle(e.id)}
              className="rounded border-slate-700 bg-[#0d1424] text-indigo-600 focus:ring-indigo-500" />
            <span
              className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black text-white shrink-0 border border-white/10"
              style={{ backgroundColor: e.avatarColor ?? '#6366f1' }}
            >
              {e.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </span>
            <span className="text-[11px] font-semibold text-slate-200 truncate">{e.name}</span>
          </label>
        ))}
        {list.length === 0 && !showUnassigned && (
          <div className="text-[10px] text-slate-600 italic px-1.5 py-2">No matching artists</div>
        )}
      </div>
    </div>
  )
}

function DateBody({ value, onChange }: { value: ColumnFilter | undefined; onChange: (n: ColumnFilter | undefined) => void }) {
  const from = value?.type === 'dateRange' ? value.from ?? '' : ''
  const to   = value?.type === 'dateRange' ? value.to   ?? '' : ''
  function update(next: { from: string; to: string }) {
    if (!next.from && !next.to) onChange(undefined)
    else onChange({ type: 'dateRange', from: next.from || null, to: next.to || null })
  }
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">From</span>
        <input
          type="date" value={from}
          onChange={e => update({ from: e.target.value, to })}
          className="mt-0.5 w-full px-2 py-1 text-xs rounded bg-[#0a0f1b] border border-[#1b253b] text-slate-200 focus:outline-none focus:border-indigo-500/60"
        />
      </label>
      <label className="block">
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">To</span>
        <input
          type="date" value={to}
          onChange={e => update({ from, to: e.target.value })}
          className="mt-0.5 w-full px-2 py-1 text-xs rounded bg-[#0a0f1b] border border-[#1b253b] text-slate-200 focus:outline-none focus:border-indigo-500/60"
        />
      </label>
    </div>
  )
}

function NumberBody({ value, onChange }: { value: ColumnFilter | undefined; onChange: (n: ColumnFilter | undefined) => void }) {
  const min = value?.type === 'numericRange' && value.min != null ? String(value.min) : ''
  const max = value?.type === 'numericRange' && value.max != null ? String(value.max) : ''
  function update(nextMin: string, nextMax: string) {
    const lo = nextMin === '' ? null : Number(nextMin)
    const hi = nextMax === '' ? null : Number(nextMax)
    if (lo == null && hi == null) onChange(undefined)
    else onChange({ type: 'numericRange', min: lo, max: hi })
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="block">
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Min</span>
        <input
          type="number" value={min} placeholder="—"
          onChange={e => update(e.target.value, max)}
          className="mt-0.5 w-full px-2 py-1 text-xs rounded bg-[#0a0f1b] border border-[#1b253b] text-slate-200 focus:outline-none focus:border-indigo-500/60 font-mono"
        />
      </label>
      <label className="block">
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Max</span>
        <input
          type="number" value={max} placeholder="—"
          onChange={e => update(min, e.target.value)}
          className="mt-0.5 w-full px-2 py-1 text-xs rounded bg-[#0a0f1b] border border-[#1b253b] text-slate-200 focus:outline-none focus:border-indigo-500/60 font-mono"
        />
      </label>
    </div>
  )
}

/** Optional helper used by the "Clear all" pill in the filter bar. */
export function ActiveFilterBadge({ count, onClear }: { count: number; onClear: () => void }) {
  if (count === 0) return null
  return (
    <button
      onClick={onClear}
      className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 hover:bg-indigo-500/25 rounded-md transition-colors"
    >
      <Filter className="w-3 h-3" />
      {count} column filter{count > 1 ? 's' : ''}
      <X className="w-3 h-3 ml-0.5" />
    </button>
  )
}
