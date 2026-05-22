import { create } from 'zustand'

export type ToastKind = 'retake' | 'approval' | 'review' | 'info' | 'error'

export interface Toast {
  id:       string
  kind:     ToastKind
  title:    string
  body?:    string
  /** Optional task to open when the user clicks the toast. */
  taskId?:  string
  projectHref?: string
  /** ms before auto-dismiss; 0 means sticky. */
  ttl?:     number
}

interface ToastState {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id'>) => string
  dismiss: (id: string) => void
  clear: () => void
}

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    set(s => ({ toasts: [...s.toasts, { ...toast, id }] }))
    return id
  },
  dismiss: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  clear:   ()   => set({ toasts: [] }),
}))
