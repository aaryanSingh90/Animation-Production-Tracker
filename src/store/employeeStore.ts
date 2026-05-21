import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Employee } from '../types'
import { INITIAL_EMPLOYEES } from '../data/initialData'

interface EmployeeState {
  employees: Employee[]
  addEmployee: (emp: Employee) => void
  updateEmployee: (id: string, patch: Partial<Employee>) => void
  deactivateEmployee: (id: string) => void
  getActiveEmployees: () => Employee[]
  getEmployee: (id: string) => Employee | undefined
}

export const useEmployeeStore = create<EmployeeState>()(
  persist(
    (set, get) => ({
      employees: INITIAL_EMPLOYEES,

      addEmployee: (emp) =>
        set(s => ({ employees: [...s.employees, emp] })),

      updateEmployee: (id, patch) =>
        set(s => ({ employees: s.employees.map(e => e.id === id ? { ...e, ...patch } : e) })),

      deactivateEmployee: (id) =>
        set(s => ({ employees: s.employees.map(e => e.id === id ? { ...e, active: false } : e) })),

      getActiveEmployees: () => get().employees.filter(e => e.active),

      getEmployee: (id) => get().employees.find(e => e.id === id),
    }),
    { name: 'anim-employees' }
  )
)
