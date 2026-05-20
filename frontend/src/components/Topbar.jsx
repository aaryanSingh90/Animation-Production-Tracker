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
    } else if (third === "modelling" && fourth) {
      base.push({ label: "Modelling", to: `/projects/${second}/workspace/modelling` });
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
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-slate-100/95 backdrop-blur">
      <div className="flex items-center justify-between px-8 py-4">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {breadcrumbs.map((item, index) => (
              <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
                {item.to ? (
                  <Link to={item.to} className="hover:text-slate-700">
                    {item.label}
                  </Link>
                ) : (
                  <span className="text-slate-700">{item.label}</span>
                )}
                {index < breadcrumbs.length - 1 ? <span>/</span> : null}
              </span>
            ))}
          </div>
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          <p className="text-xs uppercase tracking-wide text-slate-500">Studio Production Control</p>
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
            <button
              onClick={onLogout}
              className="ml-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
