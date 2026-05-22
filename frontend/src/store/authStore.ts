import { create } from 'zustand'
import type { Employee } from '../types'
import { Auth } from '../api/endpoints'
import { ApiError, getToken, setToken } from '../api/client'

interface AuthState {
  currentUser:  Employee | null
  loginError:   string | null
  loggingIn:    boolean
  /** Email + password against the API. Returns true on success. */
  login: (email: string, password: string) => Promise<boolean>
  /** Restore session from the saved JWT (called on app boot). */
  restoreSession: () => Promise<void>
  logout: () => void
  clearError: () => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  currentUser:  null,
  loginError:   null,
  loggingIn:    false,

  login: async (email, password) => {
    set({ loggingIn: true, loginError: null })
    try {
      const { token, user } = await Auth.login(email.trim().toLowerCase(), password)
      setToken(token)
      set({ currentUser: user, loggingIn: false })
      return true
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Network error — is the server running?'
      set({ loginError: msg, loggingIn: false })
      return false
    }
  },

  restoreSession: async () => {
    if (!getToken()) return
    try {
      const { user } = await Auth.me()
      set({ currentUser: user })
    } catch {
      // Token invalid/expired — clear it silently
      setToken(null)
      set({ currentUser: null })
    }
  },

  logout: () => {
    setToken(null)
    set({ currentUser: null, loginError: null })
  },

  clearError: () => set({ loginError: null }),
}))

// Force logout if any API call comes back 401 (token expired or revoked).
if (typeof window !== 'undefined') {
  window.addEventListener('shothub:unauthorized', () => {
    useAuthStore.getState().logout()
  })
}
