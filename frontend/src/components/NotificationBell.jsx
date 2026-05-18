import { useState } from "react";
import { Bell } from "lucide-react";
import api from "../utils/api";
import { useNotificationStore } from "../store/notificationStore";
import { formatRelative } from "../utils/format";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const notifications = useNotificationStore((state) => state.notifications);
  const markRead = useNotificationStore((state) => state.markRead);
  const markAllReadLocal = useNotificationStore((state) => state.markAllRead);

  const unreadCount = notifications.filter((item) => !item.isRead).length;

  const handleMarkRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      markRead(id);
    } catch {
      // no-op
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.put("/notifications/read-all");
      markAllReadLocal();
    } catch {
      // no-op
    }
  };

  return (
    <div className="relative">
      <button
        className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700 shadow-sm hover:bg-slate-50"
        onClick={() => setOpen((prev) => !prev)}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[360px] rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            <button className="text-xs font-semibold text-slate-500 hover:text-slate-900" onClick={handleMarkAllRead}>
              Mark all as read
            </button>
          </div>
          <div className="max-h-[420px] overflow-auto">
            {notifications.slice(0, 20).map((notification) => (
              <button
                key={notification.id}
                onClick={() => handleMarkRead(notification.id)}
                className={`w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${
                  notification.isRead ? "bg-white" : "bg-sky-50"
                }`}
              >
                <p className="text-sm text-slate-800">{notification.message}</p>
                <p className="mt-1 text-xs text-slate-500">{formatRelative(notification.createdAt)}</p>
              </button>
            ))}
            {!notifications.length && <p className="px-4 py-6 text-sm text-slate-500">No notifications yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
