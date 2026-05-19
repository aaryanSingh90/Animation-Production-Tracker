import { NavLink } from "react-router-dom";
import { LayoutDashboard, FolderKanban, Users, CheckCheck, Shapes, BarChart3, ListTodo, PanelLeft, Building2 } from "lucide-react";
import { useUiStore } from "../store/uiStore";

const managerLinks = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", to: "/projects", icon: FolderKanban },
  { label: "Characters", to: "/characters", icon: Shapes },
  { label: "Approval Queue", to: "/approvals", icon: CheckCheck },
  { label: "Employees", to: "/employees", icon: Users },
  { label: "Departments", to: "/departments", icon: Building2 },
  { label: "Reports", to: "/reports", icon: BarChart3 }
];

const employeeLinks = [{ label: "My Tasks", to: "/my-tasks", icon: ListTodo }];

export default function Sidebar({ role }) {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const setCollapsed = useUiStore((state) => state.setSidebarCollapsed);

  const links = role === "EMPLOYEE" ? employeeLinks : managerLinks;

  return (
    <aside
      className={`sticky top-0 h-screen border-r border-slate-200 bg-slate-900 text-slate-100 transition-all ${
        collapsed ? "w-[84px]" : "w-[280px]"
      }`}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-5">
          {!collapsed && (
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Studio</p>
              <h1 className="text-lg font-bold">Animation Tracker</h1>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800"
            title="Toggle sidebar"
          >
            <PanelLeft size={16} />
          </button>
        </div>

        <nav className="flex-1 space-y-2 p-3">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive ? "bg-emerald-500/20 text-emerald-300" : "text-slate-200 hover:bg-slate-800"
                  }`
                }
              >
                <Icon size={18} />
                {!collapsed && <span>{link.label}</span>}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
