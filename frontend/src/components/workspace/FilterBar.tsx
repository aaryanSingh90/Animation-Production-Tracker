import { useEffect, useRef, useState } from 'react'
import { Search, X, ChevronDown } from 'lucide-react'
import type { TaskStatus } from '../../types'
import { STATUS_CONFIG } from '../../types'
import { useEmployeeStore } from '../../store/employeeStore'
import type { FilterState } from '../../utils/filterUtils'
import { DEFAULT_FILTERS } from '../../utils/filterUtils'

export type { FilterState }
export { DEFAULT_FILTERS }

const ALL_STATUSES = Object.keys(STATUS_CONFIG) as TaskStatus[]

interface Props {
  filters: FilterState
  onChange: (f: FilterState) => void
  overdueCount: number
}

export function FilterBar({ filters, onChange, overdueCount }: Props) {
  const allEmployees = useEmployeeStore(s => s.employees)
  const employees    = allEmployees.filter(e => e.active)
  const [artistOpen, setArtistOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const artistWrapRef = useRef<HTMLDivElement>(null)
  const statusWrapRef = useRef<HTMLDivElement>(null)

  // Dismiss the per-button popovers on outside click / Escape so they don't
  // linger when the user moves on to another control.
  useEffect(() => {
    if (!artistOpen && !statusOpen) return
    function onDown(e: PointerEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (artistOpen && !artistWrapRef.current?.contains(target)) setArtistOpen(false)
      if (statusOpen && !statusWrapRef.current?.contains(target)) setStatusOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setArtistOpen(false); setStatusOpen(false) }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [artistOpen, statusOpen])

  const hasFilters = filters.search || filters.artistIds.length || filters.statuses.length || filters.overdueOnly

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-[#080d1a] border-b border-[#1a263e]">

      {/* Search */}
      <div className="flex items-center gap-2 bg-[#0d1424] border border-[#1b253b] rounded-md px-3 py-1.5 min-w-[220px] focus-within:border-indigo-500/60 transition-colors">
        <Search className="w-3 h-3 text-slate-500 shrink-0" />
        <input
          value={filters.search}
          onChange={e => onChange({ ...filters, search: e.target.value })}
          placeholder="Search rows…"
          className="flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder-slate-600"
        />
      </div>

      {/* Artist filter */}
      <div ref={artistWrapRef} className="relative">
        <button
          onClick={() => { setArtistOpen(v => !v); setStatusOpen(false) }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md border transition-colors ${
            filters.artistIds.length
              ? 'border-indigo-500/60 text-indigo-400 bg-indigo-500/10'
              : 'border-[#1b253b] text-slate-400 bg-[#0d1424] hover:border-slate-600 hover:text-slate-300'
          }`}
        >
          Artist {filters.artistIds.length > 0 && `(${filters.artistIds.length})`}
          <ChevronDown className="w-3 h-3" />
        </button>
        {artistOpen && (
          <div className="absolute top-full mt-1 left-0 z-40 w-52 bg-[#0e1626] border border-[#1b253b] rounded-lg shadow-2xl p-1 max-h-52 overflow-y-auto">
            {employees.map(emp => {
              const initials = emp.name.split(' ').map(n => n[0]).join('')
              return (
                <label key={emp.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#131b2e] rounded-md cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.artistIds.includes(emp.id)}
                    onChange={e => onChange({
                      ...filters,
                      artistIds: e.target.checked
                        ? [...filters.artistIds, emp.id]
                        : filters.artistIds.filter(id => id !== emp.id),
                    })}
                    className="rounded border-slate-600 bg-[#080d1a] text-indigo-600 focus:ring-indigo-500 focus:ring-offset-[#0e1626]"
                  />
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white shrink-0"
                    style={{ backgroundColor: emp.avatarColor ?? '#6366f1' }}
                  >
                    {initials}
                  </span>
                  <span className="text-xs text-slate-300">{emp.name}</span>
                </label>
              )
            })}
            {employees.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-3">No active artists</p>
            )}
          </div>
        )}
      </div>

      {/* Status filter */}
      <div ref={statusWrapRef} className="relative">
        <button
          onClick={() => { setStatusOpen(v => !v); setArtistOpen(false) }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md border transition-colors ${
            filters.statuses.length
              ? 'border-indigo-500/60 text-indigo-400 bg-indigo-500/10'
              : 'border-[#1b253b] text-slate-400 bg-[#0d1424] hover:border-slate-600 hover:text-slate-300'
          }`}
        >
          Status {filters.statuses.length > 0 && `(${filters.statuses.length})`}
          <ChevronDown className="w-3 h-3" />
        </button>
        {statusOpen && (
          <div className="absolute top-full mt-1 left-0 z-40 w-52 bg-[#0e1626] border border-[#1b253b] rounded-lg shadow-2xl p-1">
            {ALL_STATUSES.map(s => (
              <label key={s} className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#131b2e] rounded-md cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.statuses.includes(s)}
                  onChange={e => onChange({
                    ...filters,
                    statuses: e.target.checked
                      ? [...filters.statuses, s]
                      : filters.statuses.filter(st => st !== s),
                  })}
                  className="rounded border-slate-600 bg-[#080d1a] text-indigo-600 focus:ring-indigo-500 focus:ring-offset-[#0e1626]"
                />
                <span className="text-xs text-slate-300">{STATUS_CONFIG[s].label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Overdue */}
      {overdueCount > 0 && (
        <button
          onClick={() => onChange({ ...filters, overdueOnly: !filters.overdueOnly })}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md border transition-colors ${
            filters.overdueOnly
              ? 'border-rose-500/60 text-rose-400 bg-rose-500/10'
              : 'border-rose-500/30 text-rose-500 bg-[#0d1424] hover:bg-rose-500/10'
          }`}
        >
          ⚠ Overdue ({overdueCount})
        </button>
      )}

      {/* Clear */}
      {hasFilters && (
        <button
          onClick={() => onChange(DEFAULT_FILTERS)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 border border-[#1b253b] bg-[#0d1424] hover:border-slate-600 hover:text-slate-300 rounded-md transition-colors"
        >
          <X className="w-3 h-3" /> Clear
        </button>
      )}
    </div>
  )
}
