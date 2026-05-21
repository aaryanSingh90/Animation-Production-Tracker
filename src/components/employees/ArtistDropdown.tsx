import { useState, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
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
}

export function ArtistDropdown({ value, onChange, filterDept }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const employees = useEmployeeStore(s => s.employees)
  const tasks = usePipelineStore(s => s.tasks)

  const current = employees.find(e => e.id === value)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered = employees.filter(e => {
    if (!e.active) return false
    if (filterDept && e.department !== filterDept) return false
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50 text-sm min-w-[140px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {current ? (
          <>
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
              style={{ backgroundColor: current.avatarColor ?? '#6366f1' }}
            >
              {getInitials(current.name)}
            </span>
            <span className="truncate">{current.name}</span>
          </>
        ) : (
          <span className="text-gray-400 text-xs">Assign artist…</span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-56 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-2 py-1 rounded bg-gray-50">
              <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className="flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {value && (
              <button
                onClick={() => { onChange(null); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md"
              >
                <X className="w-3.5 h-3.5" /> Unassign
              </button>
            )}
            {filtered.map(emp => {
              const load = tasks.filter(t => t.assignedArtistId === emp.id && (t.status === 'IN_PROGRESS' || t.status === 'REVIEW')).length
              return (
                <button
                  key={emp.id}
                  onClick={() => { onChange(emp.id); setOpen(false) }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-gray-50 ${value === emp.id ? 'bg-indigo-50' : ''}`}
                >
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                    style={{ backgroundColor: emp.avatarColor ?? '#6366f1' }}
                  >
                    {getInitials(emp.name)}
                  </span>
                  <span className="flex-1 text-left truncate">{emp.name}</span>
                  {load > 0 && (
                    <span className="shrink-0 text-xs bg-gray-100 text-gray-600 rounded-full px-1.5">{load}</span>
                  )}
                </button>
              )
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400">No artists found</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
