import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Building2, FolderKanban, Users, CheckCheck, ArrowRight } from "lucide-react";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { isLateStatus } from "../utils/constants";

function StatCard({ label, value, icon: Icon, tone = "slate" }) {
  const toneClass = {
    slate: "border-slate-200 bg-white/90 text-slate-950",
    emerald: "border-emerald-200 bg-emerald-50/90 text-emerald-950",
    rose: "border-rose-200 bg-rose-50/90 text-rose-950",
    sky: "border-sky-200 bg-sky-50/90 text-sky-950",
    indigo: "border-indigo-200 bg-indigo-50/90 text-indigo-950"
  };
  return (
    <div className={`rounded-3xl border px-4 py-4 shadow-sm shadow-slate-200/40 backdrop-blur ${toneClass[tone] || toneClass.slate}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        {Icon ? <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-black/5 bg-white/70"><Icon size={18} className="text-slate-500" /></span> : null}
      </div>
    </div>
  );
}

function ProgressPill({ value }) {
  const safe = Math.max(0, Math.min(100, Number(value || 0)));
  const tone = safe >= 75 ? "bg-emerald-500" : safe >= 40 ? "bg-amber-500" : "bg-rose-500";

  return (
    <div className="w-24">
      <div className="h-1.5 rounded-full bg-slate-200/80">
        <div className={`h-1.5 rounded-full ${tone}`} style={{ width: `${safe}%` }} />
      </div>
      <p className="mt-1 text-[11px] font-semibold text-slate-500">{Math.round(safe)}%</p>
    </div>
  );
}

function SectionCard({ eyebrow, title, description, action, children }) {
  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white/85 p-4 shadow-sm shadow-slate-200/40 backdrop-blur lg:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{eyebrow}</p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{title}</h3>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
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
      const delayed = (project.stages || []).filter((stage) => isLateStatus(stage.status, stage.deadline)).length;
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
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[32px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.94))] p-5 shadow-sm shadow-slate-200/50 lg:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Studio Overview</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Production command center</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Watch client activity, staffing pressure, and project health from one compact studio view.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
            <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5">{metrics.activeProjects} active projects</span>
            <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5">{metrics.pendingApprovals} pending approvals</span>
            <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5">{metrics.delayedStages} delayed stages</span>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total Clients" value={metrics.totalClients} icon={Building2} tone="indigo" />
        <StatCard label="Active Projects" value={metrics.activeProjects} icon={FolderKanban} tone="emerald" />
        <StatCard label="Active Employees" value={metrics.activeEmployees} icon={Users} tone="sky" />
        <StatCard label="Pending Approvals" value={metrics.pendingApprovals} icon={CheckCheck} tone="slate" />
        <StatCard label="Delayed Stages" value={metrics.delayedStages} icon={AlertTriangle} tone="rose" />
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <SectionCard
          eyebrow="Clients"
          title="Recent Clients"
          description="Client accounts and active portfolio."
          action={
            <button onClick={() => navigate("/clients")} className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 transition hover:text-slate-900">
              View all
            </button>
          }
        >
          {!recentClients.length ? (
            <EmptyState title="No clients" description="Create a client to organize projects." />
          ) : (
            <div className="space-y-2.5">
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
                  className="w-full rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3 text-left transition hover:border-slate-300 hover:bg-white"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{client.name}</p>
                      <p className="text-xs text-slate-500">{client.stats?.totalProjects || 0} projects · {client.stats?.activeProjects || 0} active</p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {client.stats?.totalShots || 0} shots
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          eyebrow="Projects"
          title="Recent Projects"
          description="Latest client productions."
          action={
            <button onClick={() => navigate("/clients")} className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 transition hover:text-slate-900">
              Browse
            </button>
          }
        >
          {!recentProjects.length ? (
            <EmptyState title="No projects" description="Projects will appear here once created." />
          ) : (
            <div className="space-y-2.5">
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
                  className="w-full rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3 text-left transition hover:border-slate-300 hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{project.name}</p>
                      <p className="text-xs text-slate-500">{project.client || "No client"}</p>
                    </div>
                    <ProgressPill value={project.progressPercent} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          eyebrow="Staffing"
          title="Team Workload"
          description="Capacity snapshot by artist."
          action={
            <button onClick={() => navigate("/employees")} className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 transition hover:text-slate-900">
              Employees <ArrowRight size={12} />
            </button>
          }
        >
          {!workloadRows.length ? (
            <EmptyState title="No workforce data" description="Employee utilization will appear after assignments." />
          ) : (
            <div className="space-y-2.5">
              {workloadRows.map((row) => (
                <div key={row.id} className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{row.name}</p>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{row.availabilityStatus.replaceAll("_", " ")}</p>
                    </div>
                    <p className="text-xs font-semibold text-slate-600">{row.utilization}%</p>
                  </div>
                  <p className="mb-2 text-[11px] text-slate-500">{row.activeTasks} active tasks</p>
                  <div className="h-1.5 rounded-full bg-slate-200/80">
                    <div
                      className={`h-1.5 rounded-full ${row.utilization >= 85 ? "bg-rose-500" : row.utilization >= 55 ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${row.utilization}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </section>
    </div>
  );
}
