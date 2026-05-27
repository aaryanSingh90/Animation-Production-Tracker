import { create } from 'zustand'
import type { Employee } from '../types'
import { Auth } from '../api/endpoints'
import { ApiError, clearSession, setToken } from '../api/client'
import { usePipelineStore } from './pipelineStore'
import { useClientStore }   from './clientStore'
import { useEmployeeStore }  from './employeeStore'

interface AuthState {
  currentUser:        Employee | null
  loginError:         string | null
  loggingIn:          boolean
  mustChangePassword: boolean
  /** Email + password against the API. Returns true on success. */
  login: (email: string, password: string) => Promise<boolean>
  /** Restore session from the cookie (called on app boot). */
  restoreSession: () => Promise<void>
  /** Sign out, server-side + locally. */
  logout: () => Promise<void>
  /** Clear the password-change requirement after the user completes it. */
  acknowledgePasswordChange: () => void
  clearError: () => void
}

// Auto-refresh the session cookie ~10 min before the 1h JWT expires so an
// active user never sees a session interruption.
const REFRESH_INTERVAL_MS = 50 * 60 * 1000
let refreshTimer: ReturnType<typeof setInterval> | null = null

function startRefreshTimer() {
  if (refreshTimer) return
  refreshTimer = setInterval(() => {
    void Auth.refresh().catch(() => {/* 401 already handled globally */})
  }, REFRESH_INTERVAL_MS)
}
function stopRefreshTimer() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
}

export const useAuthStore = create<AuthState>()((set) => ({
  currentUser:        null,
  loginError:         null,
  loggingIn:          false,
  mustChangePassword: false,

  login: async (email, password) => {
    set({ loggingIn: true, loginError: null })
    try {
      const { token, user, mustChangePassword } = await Auth.login(email.trim().toLowerCase(), password)
      // The HttpOnly cookie is the real session — but stash the token in
      // memory too for back-compat (lets the SSE EventSource pass `?token=`).
      if (token) setToken(token)
      set({
        currentUser: user,
        loggingIn:   false,
        mustChangePassword: !!mustChangePassword,
      })
      startRefreshTimer()
      return true
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Network error — is the server running?'
      set({ loginError: msg, loggingIn: false })
      return false
    }
  },

  restoreSession: async () => {
    // The cookie travels automatically via credentials:'include'. Try /me;
    // if it 401s the user simply isn't signed in.
    try {
      const { user, mustChangePassword } = await Auth.me()
      set({ currentUser: user, mustChangePassword: !!mustChangePassword })
      startRefreshTimer()
    } catch {
      clearSession()
      set({ currentUser: null, mustChangePassword: false })
    }
  },

  logout: async () => {
    stopRefreshTimer()
    // BUG-01: Reset all data stores so the next user who logs in on the same
    // browser tab sees a clean slate, not the previous user's data.
    usePipelineStore.getState().reset()
    useClientStore.getState().reset()
    useEmployeeStore.getState().reset()
    try { await Auth.logout() } catch { /* still log out locally even if server unreachable */ }
    clearSession()
    set({ currentUser: null, loginError: null, mustChangePassword: false })
  },

  acknowledgePasswordChange: () => set({ mustChangePassword: false }),

  clearError: () => set({ loginError: null }),
}))

// Global 401 listener — force logout if any API call comes back 401.
if (typeof window !== 'undefined') {
  window.addEventListener('shothub:unauthorized', () => {
    stopRefreshTimer()
    clearSession()
    // BUG-01: Also reset data stores on a forced 401 logout.
    usePipelineStore.getState().reset()
    useClientStore.getState().reset()
    useEmployeeStore.getState().reset()
    useAuthStore.setState({ currentUser: null, mustChangePassword: false })
  })

  // Backend says password change is required → surface the flag so any
  // protected route can redirect to /account (the change-password screen).
  window.addEventListener('shothub:password-change-required', () => {
    useAuthStore.setState({ mustChangePassword: true })
  })
}
