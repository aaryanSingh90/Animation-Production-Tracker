import { useEffect } from "react";
import api from "../lib/api";
import { useAuthStore } from "../store/authStore";

export function useAuthBootstrap() {
  const token = useAuthStore((state) => state.token);
  const ready = useAuthStore((state) => state.ready);
  const setUser = useAuthStore((state) => state.setUser);
  const setReady = useAuthStore((state) => state.setReady);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!token) {
        setReady(true);
        return;
      }

      try {
        const { data } = await api.get("/auth/me");
        if (!cancelled) setUser(data);
      } catch (error) {
        if (!cancelled) logout();
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    if (!ready) {
      bootstrap();
    }

    return () => {
      cancelled = true;
    };
  }, [token, ready, setUser, setReady, logout]);
}
