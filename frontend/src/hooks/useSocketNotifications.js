import { useEffect } from "react";
import { io } from "socket.io-client";
import { useAuthStore } from "../store/authStore";
import { useNotificationStore } from "../store/notificationStore";
import { useToastStore } from "../store/toastStore";

export function useSocketNotifications() {
  const token = useAuthStore((state) => state.token);
  const pushNotification = useNotificationStore((state) => state.pushNotification);
  const showToast = useToastStore((state) => state.showToast);

  useEffect(() => {
    if (!token) return undefined;

    const socket = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:4000", {
      auth: { token }
    });

    socket.on("notification:new", (payload) => {
      pushNotification(payload);
      showToast("info", payload.message);
    });

    return () => {
      socket.disconnect();
    };
  }, [token, pushNotification, showToast]);
}
