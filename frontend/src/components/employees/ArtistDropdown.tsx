import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Search, ChevronDown, X, UserX } from 'lucide-react'
import { useEmployeeStore } from '../../store/employeeStore'
import { usePipelineStore } from '../../store/pipelineStore'
import type { EmployeeDepartment } from '../../types'

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

interface Props {
  value: string | null
  onChange: (id: string | null) => void
  filterDept?: EmployeeDepartment
  readOnly?: boolean
}

interface PanelPos { top: number; left: number; width: number }

export function ArtistDropdown({ value, onChange, filterDept, readOnly = false }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState<PanelPos | null>(null)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef   = useRef<HTMLDivElement>(null)
  const searchRef  = useRef<HTMLInputElement>(null)

  const employees = useEmployeeStore(s => s.employees)
  const tasks     = usePipelineStore(s => s.tasks)

  const current = employees.find(e => e.id === value)

  // ── Outside-click + escape to close ─────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (panelRef.current?.contains(t))   return
      setOpen(false); setSearch('')
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { setOpen(false); setSearch('') } }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // ── Focus search after open ─────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => searchRef.current?.focus(), 30)
      return () => clearTimeout(id)
    }
    setSearch('')
    return undefined
  }, [open])

  // ── Position the portalled panel under the trigger ──────────────────────────
  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    function update() {
      if (!triggerRef.current) return
      const r = triggerRef.current.getBoundingClientRect()
      const panelWidth = Math.max(r.width, 240)
      const viewportH  = window.innerHeight
      // If the popup would overflow the viewport bottom, place it above instead
      const estPanelH  = 320
      const placeAbove = r.bottom + estPanelH > viewportH - 12
      setPos({
        top:  placeAbove ? Math.max(8, r.top - estPanelH - 4) : r.bottom + 4,
        left: Math.min(Math.max(8, r.left), window.innerWidth - panelWidth - 8),
        width: panelWidth,
      })
    }
    update()
    // Keep position synced when scrolling within nested overflow parents
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  // ── Filter list ─────────────────────────────────────────────────────────────
  const filtered = employees.filter(e => {
    if (!e.active) return false
    if (filterDept && e.department !== filterDept) return false
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // ── Read-only: just the chip ────────────────────────────────────────────────
  if (readOnly) {
    return current ? (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-[#1b253b] bg-[#0d1424]">
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-black shrink-0"
          style={{ backgroundColor: current.avatarColor ?? '#6366f1' }}
        >
          {getInitials(current.name)}
        </span>
        <span className="text-xs text-slate-200 max-w-[80px] truncate">{current.name}</span>
      </div>
    ) : (
      <span className="text-xs text-slate-600 italic">Unassigned</span>
    )
  }

  // ── Editable: button + portalled panel ──────────────────────────────────────
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors focus:outline-none ${
          current
            ? 'border-[#1b253b] bg-[#0d1424] hover:border-slate-600'
            : 'border-dashed border-[#1b253b] bg-transparent hover:border-indigo-500/50 hover:bg-indigo-500/5'
        }`}
      >
        {current ? (
          <>
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-black shrink-0"
              style={{ backgroundColor: current.avatarColor ?? '#6366f1' }}
            >
              {getInitials(current.name)}
            </span>
            <span className="text-xs text-slate-200 max-w-[80px] truncate">{current.name}</span>
            <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
          </>
        ) : (
          <>
            <UserX className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-xs text-slate-600">Assign…</span>
            <ChevronDown className="w-3 h-3 text-slate-600 shrink-0" />
          </>
        )}
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          // position: fixed escapes the table's overflow:auto clipping; the
          // useLayoutEffect above keeps top/left synced with the trigger as
          // the user scrolls or resizes.
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
          className="z-[100] rounded-lg border border-[#1b253b] bg-[#0e1626] shadow-2xl shadow-black/60 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Search bar */}
          <div className="p-2 border-b border-[#1b253b]">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[#080d1a] border border-[#1b253b] focus-within:border-indigo-500/60 transition-colors">
              <Search className="w-3 h-3 text-slate-500 shrink-0" />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search artist…"
                className="flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder-slate-600 min-w-0"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-slate-600 hover:text-slate-300 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Artist list */}
          <div className="max-h-64 overflow-y-auto p-1.5 space-y-0.5">
            {value && !search && (
              <button
                onClick={() => { onChange(null); setOpen(false) }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-rose-500/10 text-rose-400 hover:text-rose-300 transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-rose-500/15 border border-rose-500/20 flex items-center justify-center shrink-0">
                  <X className="w-3 h-3" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wide">Unassign</span>
              </button>
            )}

            {filtered.length === 0 ? (
              <div className="px-3 py-5 text-center">
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">No artists found</p>
              </div>
            ) : (
              filtered.map(emp => {
                const isSelected = value === emp.id
                const load = tasks.filter(t =>
                  t.assignedArtistId === emp.id &&
                  (t.status === 'IN_PROGRESS' || t.status === 'LEAD_APPROVAL')
                ).length
                return (
                  <button
                    key={emp.id}
                    onClick={() => { onChange(emp.id); setOpen(false) }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors ${
                      isSelected
                        ? 'bg-indigo-500/15 border border-indigo-500/20'
                        : 'hover:bg-[#131b2e] border border-transparent'
                    }`}
                  >
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-black shrink-0 border border-white/10"
                      style={{ backgroundColor: emp.avatarColor ?? '#6366f1' }}
                    >
                      {getInitials(emp.name)}
                    </span>
                    <div className="flex-1 text-left min-w-0">
                      <div className={`text-xs font-semibold truncate ${isSelected ? 'text-indigo-300' : 'text-slate-200'}`}>
                        {emp.name}
                      </div>
                      <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">{emp.department}</div>
                    </div>
                    {load > 0 && (
                      <span className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full border ${
                        load >= 3
                          ? 'bg-rose-500/15 text-rose-400 border-rose-500/20'
                          : 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                      }`}>
                        {load}
                      </span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
