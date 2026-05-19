import { useLocation } from "react-router-dom";
import NotificationBell from "./NotificationBell";
import { initials } from "../utils/format";

const titleByPath = {
  "/dashboard": "Manager Dashboard",
  "/projects": "Projects",
  "/characters": "Character Tracker",
  "/approvals": "Approval Queue",
  "/workforce": "Workforce",
  "/teams": "Teams",
  "/employees": "Employee Management",
  "/departments": "Departments",
  "/assignments": "Assignments",
  "/analytics": "Analytics",
  "/reports": "Reports",
  "/my-tasks": "My Tasks"
};

export default function Topbar({ user, onLogout }) {
  const location = useLocation();

  const title =
    Object.entries(titleByPath).find(([path]) => location.pathname === path || location.pathname.startsWith(`${path}/`))?.[1] ||
    "Animation Tracker";

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-slate-100/95 backdrop-blur">
      <div className="flex items-center justify-between px-8 py-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          <p className="text-xs uppercase tracking-wide text-slate-500">Production Pipeline Monitor</p>
        </div>

        <div className="flex items-center gap-4">
          <NotificationBell />
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-white">
              {initials(user?.name || "User")}
            </span>
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900">{user?.name}</p>
              <p className="text-xs text-slate-500">{user?.role?.replaceAll("_", " ")}</p>
            </div>
            <button onClick={onLogout} className="ml-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
