import { create } from 'zustand'
import type { Employee } from '../types'
import { INITIAL_EMPLOYEES } from '../data/initialData'
import { db } from '../db/database'

interface EmployeeState {
  employees: Employee[]
  initialized: boolean
  initialize: () => Promise<void>
  addEmployee: (emp: Employee) => void
  updateEmployee: (id: string, patch: Partial<Employee>) => void
  deactivateEmployee: (id: string) => void
  getActiveEmployees: () => Employee[]
  getEmployee: (id: string) => Employee | undefined
}

export const useEmployeeStore = create<EmployeeState>()((set, get) => ({
  employees: [],
  initialized: false,

  initialize: async () => {
    const count = await db.employees.count()
    if (count === 0) await db.employees.bulkAdd(INITIAL_EMPLOYEES)
    const employees = await db.employees.toArray()
    set({ employees, initialized: true })
  },

  addEmployee: (emp) => {
    set(s => ({ employees: [...s.employees, emp] }))
    db.employees.add(emp)
  },

  updateEmployee: (id, patch) => {
    set(s => ({ employees: s.employees.map(e => e.id === id ? { ...e, ...patch } : e) }))
    db.employees.update(id, patch)
  },

  deactivateEmployee: (id) => {
    set(s => ({ employees: s.employees.map(e => e.id === id ? { ...e, active: false } : e) }))
    db.employees.update(id, { active: false })
  },

  getActiveEmployees: () => get().employees.filter(e => e.active),
  getEmployee: (id) => get().employees.find(e => e.id === id),
}))
