import { create } from 'zustand'
import type { Employee } from '../types'
import { db } from '../db/database'

interface AuthState {
  currentUser: Employee | null
  login: (employee: Employee) => void
  logout: () => void
  loadCurrentUser: (employees: Employee[]) => Promise<void>
}

export const useAuthStore = create<AuthState>()((set) => ({
  currentUser: null,

  login: (employee) => {
    set({ currentUser: employee })
    db.settings.put({ key: 'currentUserId', value: employee.id })
  },

  logout: () => {
    set({ currentUser: null })
    db.settings.delete('currentUserId')
  },

  loadCurrentUser: async (employees) => {
    const setting = await db.settings.get('currentUserId')
    if (setting) {
      const emp = employees.find(e => e.id === setting.value && e.active)
      if (emp) set({ currentUser: emp })
    }
  },
}))
