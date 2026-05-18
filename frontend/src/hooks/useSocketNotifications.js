import { useEffect } from "react";
import { io } from "socket.io-client";
import { useAuthStore } from "../store/authStore";
import { useNotificationStore } from "../store/notificationStore";
import { useToastStore } from "../store/toastStore";

export function useSocketNotifications() {
  const token = useAuthStore((state) => state.token);
  const pushNotification = useNotificationStore((state) => state.pushNotification);
  const showToast = useToastStore((state) => state.showToast);
  const apiUrl = import.meta.env.VITE_API_URL;

  useEffect(() => {
    if (!token || !apiUrl) return undefined;

    const socketBaseUrl = apiUrl.replace(/\/api\/?$/, "");

    const socket = io(socketBaseUrl, {
      auth: { token }
    });

    socket.on("notification:new", (payload) => {
      pushNotification(payload);
      showToast("info", payload.message);
    });

    socket.on("connect_error", () => {
      showToast("error", "Realtime notifications are temporarily unavailable.");
    });

    return () => {
      socket.disconnect();
    };
  }, [token, apiUrl, pushNotification, showToast]);
}
