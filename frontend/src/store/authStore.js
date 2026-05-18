import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      ready: false,
      setAuth: ({ token, user }) => set({ token, user, ready: true }),
      setUser: (user) => set({ user, ready: true }),
      setReady: (ready) => set({ ready }),
      logout: () => set({ token: null, user: null, ready: true })
    }),
    {
      name: "animation-tracker-auth"
    }
  )
);
