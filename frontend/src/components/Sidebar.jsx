import { NavLink } from "react-router-dom";
import { LayoutDashboard, Building2, Users, ListTodo, PanelLeft } from "lucide-react";
import { useUiStore } from "../store/uiStore";

const managerLinks = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Clients", to: "/clients", icon: Building2 },
  { label: "Employees", to: "/employees", icon: Users },
  { label: "Departments", to: "/departments", icon: Building2 }
];

const employeeLinks = [{ label: "My Tasks", to: "/my-tasks", icon: ListTodo }];

export default function Sidebar({ role }) {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const setCollapsed = useUiStore((state) => state.setSidebarCollapsed);

  const links = role === "EMPLOYEE" ? employeeLinks : managerLinks;

  return (
    <aside
      className={`sticky top-0 h-screen border-r border-white/10 bg-[linear-gradient(180deg,#0f172a_0%,#111827_48%,#020617_100%)] text-slate-100 transition-all ${
        collapsed ? "w-[88px]" : "w-[272px]"
      }`}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-5">
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Studio OS</p>
              <h1 className="text-lg font-semibold tracking-tight text-white">Animation Tracker</h1>
              <p className="mt-1 text-xs text-slate-400">Pipeline command center</p>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition hover:bg-white/[0.08]"
            title="Toggle sidebar"
          >
            <PanelLeft size={16} />
          </button>
        </div>

        <nav className="flex-1 space-y-1.5 px-3 py-4">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition ${
                    isActive
                      ? "bg-white/[0.08] text-white shadow-inner shadow-white/5"
                      : "text-slate-300 hover:bg-white/[0.05] hover:text-white"
                  }`
                }
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                  <Icon size={18} />
                </span>
                {!collapsed && <span>{link.label}</span>}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
