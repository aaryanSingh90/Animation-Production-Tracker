import { create } from "zustand";

let seq = 0;

export const useToastStore = create((set, get) => ({
  toasts: [],
  showToast: (type, message) => {
    const id = ++seq;
    set({ toasts: [...get().toasts, { id, type, message }] });
    setTimeout(() => {
      get().removeToast(id);
    }, 2800);
  },
  removeToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) })
}));
