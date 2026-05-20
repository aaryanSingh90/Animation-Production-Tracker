import { Link, useLocation } from "react-router-dom";
import NotificationBell from "./NotificationBell";
import { initials } from "../utils/format";

const titleByRoot = {
  dashboard: "Studio Overview",
  clients: "Clients",
  projects: "Project Workspace",
  employees: "Employee Management",
  departments: "Departments",
  "my-tasks": "My Tasks"
};

function stageLabelFromSlug(slug = "") {
  return String(slug)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildBreadcrumbs(location) {
  const { pathname, state } = location;
  const segments = pathname.split("/").filter(Boolean);

  if (!segments.length) {
    return [{ label: "Dashboard", to: "/dashboard" }];
  }

  const [root, second, third, fourth] = segments;

  if (root === "dashboard") {
    return [{ label: "Dashboard", to: "/dashboard" }];
  }

  if (root === "clients") {
    if (!second) return [{ label: "Clients", to: "/clients" }];
    return [
      { label: "Clients", to: "/clients" },
      { label: state?.breadcrumbClientName || `Client #${second}` }
    ];
  }

  if (root === "projects") {
    const base = [{ label: "Clients", to: "/clients" }];
    if (state?.breadcrumbClientId && state?.breadcrumbClientName) {
      base.push({ label: state.breadcrumbClientName, to: `/clients/${state.breadcrumbClientId}` });
    }

    if (second) {
      base.push({ label: state?.breadcrumbProjectName || `Project #${second}`, to: `/projects/${second}` });
    }

    if (third === "workspace" && segments[3]) {
      base.push({ label: stageLabelFromSlug(segments[3]) });
    } else if (["modelling", "unwrapping", "texturing", "rigging"].includes(third) && fourth) {
      base.push({ label: stageLabelFromSlug(third), to: `/projects/${second}/workspace/${third}` });
      base.push({ label: stageLabelFromSlug(fourth) });
    } else if (third) {
      base.push({ label: stageLabelFromSlug(third) });
    }

    return base;
  }

  if (root === "employees") {
    return [{ label: "Employees", to: "/employees" }];
  }

  if (root === "departments") {
    return [{ label: "Departments", to: "/departments" }];
  }

  if (root === "my-tasks") {
    return [{ label: "My Tasks", to: "/my-tasks" }];
  }

  return [{ label: "Animation Tracker" }];
}

export default function Topbar({ user, onLogout }) {
  const location = useLocation();
  const breadcrumbs = buildBreadcrumbs(location);
  const root = location.pathname.split("/").filter(Boolean)[0];
  const title = titleByRoot[root] || "Animation Tracker";

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-slate-50/90 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-5 lg:px-6 xl:px-8">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            {breadcrumbs.map((item, index) => (
              <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
                {item.to ? (
                  <Link to={item.to} className="transition hover:text-slate-700">
                    {item.label}
                  </Link>
                ) : (
                  <span className="text-slate-700">{item.label}</span>
                )}
                {index < breadcrumbs.length - 1 ? <span>/</span> : null}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="truncate text-lg font-semibold tracking-tight text-slate-950 sm:text-xl">{title}</h2>
            <span className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Studio Production Control
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <NotificationBell />
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-2 shadow-sm shadow-slate-200/50">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-sm font-bold text-white">
              {initials(user?.name || "User")}
            </span>
            <div className="min-w-0 text-right">
              <p className="truncate text-sm font-semibold text-slate-900">{user?.name}</p>
              <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{user?.role?.replaceAll("_", " ")}</p>
            </div>
            <button
              onClick={onLogout}
              className="ml-1 rounded-xl border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 transition hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
