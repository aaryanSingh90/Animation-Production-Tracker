import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Building2, FolderKanban, Users, CheckCheck, ArrowRight } from "lucide-react";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";

function StatCard({ label, value, icon: Icon, tone = "slate" }) {
  const toneClass = {
    slate: "bg-slate-900 text-white",
    emerald: "bg-emerald-600 text-white",
    rose: "bg-rose-500 text-white",
    sky: "bg-sky-600 text-white",
    indigo: "bg-indigo-600 text-white"
  };

  return (
    <div className={`${toneClass[tone] || toneClass.slate} rounded-2xl p-4 shadow-sm`}>
      <p className="text-xs uppercase tracking-wide text-white/85">{label}</p>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-2xl font-bold">{value}</p>
        {Icon ? <Icon size={18} className="text-white/80" /> : null}
      </div>
    </div>
  );
}

function ProgressPill({ value }) {
  const safe = Math.max(0, Math.min(100, Number(value || 0)));
  const tone = safe >= 75 ? "bg-emerald-500" : safe >= 40 ? "bg-amber-500" : "bg-rose-500";

  return (
    <div className="w-28">
      <div className="h-1.5 rounded-full bg-slate-200">
        <div className={`h-1.5 rounded-full ${tone}`} style={{ width: `${safe}%` }} />
      </div>
      <p className="mt-1 text-[11px] font-semibold text-slate-600">{Math.round(safe)}%</p>
    </div>
  );
}

export default function ManagerDashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      try {
        const [projectsRes, approvalsRes, usersRes, clientsRes] = await Promise.allSettled([
          api.get("/projects"),
          api.get("/approvals"),
          api.get("/users"),
          api.get("/clients")
        ]);

        if (projectsRes.status !== "fulfilled") {
          throw projectsRes.reason;
        }

        if (cancelled) return;

        setProjects(projectsRes.value.data || []);
        setPendingApprovals(approvalsRes.status === "fulfilled" ? (approvalsRes.value.data || []).length : 0);
        setUsers(usersRes.status === "fulfilled" ? usersRes.value.data || [] : []);
        setClients(clientsRes.status === "fulfilled" ? clientsRes.value.data || [] : []);
      } catch (_error) {
        if (cancelled) return;
        setProjects([]);
        setPendingApprovals(0);
        setUsers([]);
        setClients([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = useMemo(() => {
    const totalClients = clients.length;
    const activeProjects = projects.filter((project) => Number(project.progressPercent || 0) < 100).length;
    const activeEmployees = users.filter((user) => user.isActive && (user.role === "EMPLOYEE" || user.role === "COORDINATOR")).length;
    const delayedStages = projects.reduce((count, project) => {
      const delayed = (project.stages || []).filter(
        (stage) => stage.deadline && new Date(stage.deadline) < new Date() && stage.status !== "APPROVED"
      ).length;
      return count + delayed;
    }, 0);

    return {
      totalClients,
      activeProjects,
      activeEmployees,
      delayedStages,
      pendingApprovals
    };
  }, [clients, projects, users, pendingApprovals]);

  const recentClients = useMemo(() => {
    return [...clients]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 6);
  }, [clients]);

  const recentProjects = useMemo(() => {
    return [...projects]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 8);
  }, [projects]);

  const workloadRows = useMemo(() => {
    const members = users.filter((user) => user.role === "EMPLOYEE" || user.role === "COORDINATOR");
    return members
      .map((user) => {
        const activeTasks = Number(user.activeAssignmentsCount ?? user.assignedProjectCount ?? 0);
        const utilization = Math.min(100, activeTasks * 15);
        return {
          id: user.id,
          name: user.name,
          activeTasks,
          utilization,
          availabilityStatus: user.availabilityStatus || "AVAILABLE"
        };
      })
      .sort((a, b) => b.utilization - a.utilization)
      .slice(0, 10);
  }, [users]);

  if (loading) {
    return <Loader label="Loading dashboard..." />;
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total Clients" value={metrics.totalClients} icon={Building2} tone="indigo" />
        <StatCard label="Active Projects" value={metrics.activeProjects} icon={FolderKanban} tone="emerald" />
        <StatCard label="Active Employees" value={metrics.activeEmployees} icon={Users} tone="sky" />
        <StatCard label="Pending Approvals" value={metrics.pendingApprovals} icon={CheckCheck} tone="slate" />
        <StatCard label="Delayed Stages" value={metrics.delayedStages} icon={AlertTriangle} tone="rose" />
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Recent Clients</h3>
              <p className="text-xs text-slate-500">Client accounts and active portfolio</p>
            </div>
            <button onClick={() => navigate("/clients")} className="text-xs font-semibold text-slate-600 hover:text-slate-900">
              View all
            </button>
          </div>

          {!recentClients.length ? (
            <EmptyState title="No clients" description="Create a client to organize projects." />
          ) : (
            <div className="space-y-2">
              {recentClients.map((client) => (
                <button
                  key={client.id}
                  onClick={() =>
                    navigate(`/clients/${client.id}`, {
                      state: {
                        breadcrumbClientName: client.name
                      }
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-slate-100"
                >
                  <p className="text-sm font-semibold text-slate-900">{client.name}</p>
                  <p className="text-xs text-slate-500">{client.stats?.totalProjects || 0} projects · {client.stats?.activeProjects || 0} active</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Recent Projects</h3>
              <p className="text-xs text-slate-500">Latest client productions</p>
            </div>
            <button onClick={() => navigate("/clients")} className="text-xs font-semibold text-slate-600 hover:text-slate-900">
              Browse
            </button>
          </div>

          {!recentProjects.length ? (
            <EmptyState title="No projects" description="Projects will appear here once created." />
          ) : (
            <div className="space-y-2">
              {recentProjects.map((project) => (
                <button
                  key={project.id}
                  onClick={() =>
                    navigate(`/projects/${project.id}`, {
                      state: {
                        breadcrumbClientId: project.clientId,
                        breadcrumbClientName: project.client,
                        breadcrumbProjectName: project.name
                      }
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-slate-100"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{project.name}</p>
                      <p className="text-xs text-slate-500">{project.client || "No client"}</p>
                    </div>
                    <ProgressPill value={project.progressPercent} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Team Workload</h3>
              <p className="text-xs text-slate-500">Capacity snapshot by artist</p>
            </div>
            <button onClick={() => navigate("/employees")} className="text-xs font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1">
              Employees <ArrowRight size={12} />
            </button>
          </div>

          {!workloadRows.length ? (
            <EmptyState title="No workforce data" description="Employee utilization will appear after assignments." />
          ) : (
            <div className="space-y-3">
              {workloadRows.map((row) => (
                <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">{row.name}</p>
                    <p className="text-xs font-semibold text-slate-600">{row.utilization}%</p>
                  </div>
                  <p className="mb-2 text-[11px] text-slate-500">{row.activeTasks} active tasks · {row.availabilityStatus.replaceAll("_", " ")}</p>
                  <div className="h-1.5 rounded-full bg-slate-200">
                    <div
                      className={`h-1.5 rounded-full ${row.utilization >= 85 ? "bg-rose-500" : row.utilization >= 55 ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${row.utilization}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
