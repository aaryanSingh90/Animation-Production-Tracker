import { create } from "zustand";

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  setNotifications: (items) => set({ notifications: items }),
  pushNotification: (item) => set({ notifications: [item, ...get().notifications].slice(0, 50) }),
  markRead: (id) =>
    set({
      notifications: get().notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    }),
  markAllRead: () => set({ notifications: get().notifications.map((n) => ({ ...n, isRead: true })) })
}));
