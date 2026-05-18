import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import api from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { useNotificationStore } from "../store/notificationStore";
import { useSocketNotifications } from "../hooks/useSocketNotifications";

export default function AppShell({ children }) {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const logout = useAuthStore((state) => state.logout);
  const setNotifications = useNotificationStore((state) => state.setNotifications);

  useSocketNotifications();

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    async function fetchNotifications() {
      try {
        const { data } = await api.get("/notifications");
        if (!cancelled) setNotifications(data);
      } catch {
        // no-op
      }
    }

    fetchNotifications();

    return () => {
      cancelled = true;
    };
  }, [token, setNotifications]);

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // no-op
    }
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar role={user?.role} />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar user={user} onLogout={handleLogout} />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
