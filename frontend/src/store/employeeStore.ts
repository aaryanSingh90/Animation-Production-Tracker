import { create } from 'zustand'
import type { Employee } from '../types'
import { Employees, type EmployeeUpsert } from '../api/endpoints'

interface EmployeeState {
  employees:   Employee[]
  initialized: boolean
  loading:     boolean
  initialize:  () => Promise<void>
  refresh:     () => Promise<void>
  addEmployee: (data: EmployeeUpsert) => Promise<Employee>
  updateEmployee: (id: string, patch: Partial<EmployeeUpsert>) => Promise<Employee>
  deactivateEmployee: (id: string) => Promise<void>
  getActiveEmployees: () => Employee[]
  getEmployee: (id: string) => Employee | undefined
  applyServerEvent: (event:
    | { type: 'employee.created'; employee: Employee }
    | { type: 'employee.updated'; employee: Employee }
  ) => void
}

function upsertEmp(list: Employee[], next: Employee): Employee[] {
  const idx = list.findIndex(e => e.id === next.id)
  if (idx < 0) return [...list, next]
  const out = list.slice()
  out[idx] = next
  return out
}

export const useEmployeeStore = create<EmployeeState>()((set, get) => ({
  employees:   [],
  initialized: false,
  loading:     false,

  initialize: async () => {
    if (get().initialized) return
    await get().refresh()
    set({ initialized: true })
  },

  refresh: async () => {
    set({ loading: true })
    try {
      const { employees } = await Employees.list()
      set({ employees, loading: false })
    } catch (err) {
      console.error('[employees] refresh failed', err)
      set({ loading: false })
    }
  },

  addEmployee: async (data) => {
    const { employee } = await Employees.create(data)
    set(s => ({ employees: [...s.employees, employee] }))
    return employee
  },

  updateEmployee: async (id, patch) => {
    const { employee } = await Employees.update(id, patch)
    set(s => ({ employees: s.employees.map(e => e.id === id ? employee : e) }))
    return employee
  },

  deactivateEmployee: async (id) => {
    const { employee } = await Employees.remove(id)
    set(s => ({ employees: s.employees.map(e => e.id === id ? employee : e) }))
  },

  getActiveEmployees: () => get().employees.filter(e => e.active),
  getEmployee: (id) => get().employees.find(e => e.id === id),

  applyServerEvent: (event) => {
    set(s => ({ employees: upsertEmp(s.employees, event.employee) }))
  },
}))
