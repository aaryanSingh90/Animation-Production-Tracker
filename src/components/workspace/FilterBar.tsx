import { useState } from 'react'
import { Search, X } from 'lucide-react'
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
  const employees = allEmployees.filter(e => e.active)
  const [artistOpen, setArtistOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)

  const hasFilters = filters.search || filters.artistIds.length || filters.statuses.length || filters.overdueOnly

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-white border-b border-gray-200">
      <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 bg-gray-50 min-w-[220px]">
        <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <input
          value={filters.search}
          onChange={e => onChange({ ...filters, search: e.target.value })}
          placeholder="Search rows…"
          className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder-gray-400"
        />
      </div>

      {/* Artist filter */}
      <div className="relative">
        <button
          onClick={() => { setArtistOpen(v => !v); setStatusOpen(false) }}
          className={`px-3 py-1.5 text-sm border rounded-lg ${filters.artistIds.length ? 'border-indigo-500 text-indigo-700 bg-indigo-50' : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'}`}
        >
          Artist {filters.artistIds.length > 0 && `(${filters.artistIds.length})`}
        </button>
        {artistOpen && (
          <div className="absolute top-full mt-1 left-0 z-40 w-48 bg-white border border-gray-200 rounded-lg shadow-lg p-1 max-h-48 overflow-y-auto">
            {employees.map(emp => (
              <label key={emp.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded-md cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={filters.artistIds.includes(emp.id)}
                  onChange={e => onChange({
                    ...filters,
                    artistIds: e.target.checked
                      ? [...filters.artistIds, emp.id]
                      : filters.artistIds.filter(id => id !== emp.id),
                  })}
                  className="rounded"
                />
                {emp.name}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Status filter */}
      <div className="relative">
        <button
          onClick={() => { setStatusOpen(v => !v); setArtistOpen(false) }}
          className={`px-3 py-1.5 text-sm border rounded-lg ${filters.statuses.length ? 'border-indigo-500 text-indigo-700 bg-indigo-50' : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'}`}
        >
          Status {filters.statuses.length > 0 && `(${filters.statuses.length})`}
        </button>
        {statusOpen && (
          <div className="absolute top-full mt-1 left-0 z-40 w-48 bg-white border border-gray-200 rounded-lg shadow-lg p-1">
            {ALL_STATUSES.map(s => (
              <label key={s} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded-md cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={filters.statuses.includes(s)}
                  onChange={e => onChange({
                    ...filters,
                    statuses: e.target.checked
                      ? [...filters.statuses, s]
                      : filters.statuses.filter(st => st !== s),
                  })}
                  className="rounded"
                />
                {STATUS_CONFIG[s].label}
              </label>
            ))}
          </div>
        )}
      </div>

      {overdueCount > 0 && (
        <button
          onClick={() => onChange({ ...filters, overdueOnly: !filters.overdueOnly })}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg ${filters.overdueOnly ? 'border-red-500 text-red-700 bg-red-50' : 'border-red-200 text-red-600 bg-white hover:bg-red-50'}`}
        >
          ⚠ Overdue ({overdueCount})
        </button>
      )}

      {hasFilters && (
        <button
          onClick={() => onChange(DEFAULT_FILTERS)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <X className="w-3.5 h-3.5" /> Clear
        </button>
      )}
    </div>
  )
}
