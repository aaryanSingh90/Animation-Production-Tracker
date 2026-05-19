import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowUpRight,
  Briefcase,
  CalendarClock,
  Gauge,
  Layers3,
  Mail,
  Phone,
  Sparkles,
  Users,
  X
} from "lucide-react";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import { formatDate, initials, labelize } from "../utils/format";
import { useToastStore } from "../store/toastStore";

const ROLE_OPTIONS = ["ALL", "EMPLOYEE", "COORDINATOR", "PRODUCTION_MANAGER", "BOSS"];
const STATUS_OPTIONS = ["ALL", "On Track", "Overloaded", "Delayed", "Idle", "Available", "Inactive"];
const AVAILABILITY_OPTIONS = ["ALL", "AVAILABLE", "BUSY", "ON_LEAVE", "OVERLOADED"];
const WORKLOAD_OPTIONS = ["ALL", "IDLE", "LOW", "MEDIUM", "HIGH", "OVERLOADED"];
const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "workload", label: "Workload" },
  { value: "projects", label: "Projects" },
  { value: "tasks", label: "Tasks" },
  { value: "status", label: "Status" }
];

const METRIC_CARD_THEME = {
  totalEmployees: "from-slate-900 via-slate-800 to-slate-700",
  activeArtists: "from-emerald-700 via-emerald-600 to-emerald-500",
  overloadedArtists: "from-rose-700 via-rose-600 to-rose-500",
  freelancers: "from-blue-700 via-blue-600 to-blue-500",
  idleArtists: "from-amber-700 via-amber-600 to-amber-500",
  activeTeams: "from-indigo-700 via-indigo-600 to-indigo-500"
};

function utilizationTone(percent) {
  if (percent >= 90) return "bg-red-500";
  if (percent >= 75) return "bg-amber-500";
  if (percent >= 40) return "bg-emerald-500";
  if (percent > 0) return "bg-sky-500";
  return "bg-slate-400";
}

function performanceTone(status) {
  if (status === "Overloaded") return "bg-red-100 text-red-700 border-red-200";
  if (status === "Delayed") return "bg-amber-100 text-amber-700 border-amber-200";
  if (status === "Idle") return "bg-slate-200 text-slate-700 border-slate-300";
  if (status === "Inactive") return "bg-slate-300 text-slate-700 border-slate-400";
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
}

function availabilityTone(status) {
  if (status === "OVERLOADED") return "bg-red-100 text-red-700";
  if (status === "ON_LEAVE") return "bg-indigo-100 text-indigo-700";
  if (status === "BUSY") return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

export default function WorkforcePage() {
  const navigate = useNavigate();
  const showToast = useToastStore((state) => state.showToast);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metrics, setMetrics] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [teams, setTeams] = useState([]);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [moveOpen, setMoveOpen] = useState(false);
  const [movingEmployee, setMovingEmployee] = useState(null);
  const [teamTarget, setTeamTarget] = useState("");
  const [deactivatingId, setDeactivatingId] = useState(null);

  const [filters, setFilters] = useState({
    search: "",
    departmentId: "",
    teamId: "",
    role: "ALL",
    status: "ALL",
    availability: "ALL",
    workload: "ALL",
    sortBy: "workload",
    sortDir: "asc"
  });

  async function loadLookupData() {
    const [departmentRes, teamRes] = await Promise.all([api.get("/departments"), api.get("/teams")]);
    setDepartments(departmentRes.data || []);
    setTeams(teamRes.data || []);
  }

  async function loadWorkforce() {
    setLoading(true);
    setError("");

    try {
      const query = {};
      for (const [key, value] of Object.entries(filters)) {
        if (!value || value === "ALL") continue;
        query[key] = value;
      }

      const { data } = await api.get("/workforce/overview", { params: query });
      setMetrics(data.metrics);
      setEmployees(data.employees || []);
    } catch (err) {
      const message = err.userMessage || err.response?.data?.message || "Failed to load workforce overview.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function boot() {
      try {
        await loadLookupData();
      } catch (err) {
        if (active) {
          showToast("error", err.userMessage || err.response?.data?.message || "Failed to load departments and teams");
        }
      }
      if (active) {
        await loadWorkforce();
      }
    }

    boot();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadWorkforce();
    }, 280);

    return () => clearTimeout(timeout);
  }, [filters.search, filters.departmentId, filters.teamId, filters.role, filters.status, filters.availability, filters.workload, filters.sortBy, filters.sortDir]);

  async function openProfile(employeeId) {
    setSelectedEmployeeId(employeeId);
    setProfileLoading(true);

    try {
      const { data } = await api.get(`/workforce/employees/${employeeId}`);
      setSelectedProfile(data);
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Failed to load employee profile");
    } finally {
      setProfileLoading(false);
    }
  }

  function closeProfile() {
    setSelectedEmployeeId(null);
    setSelectedProfile(null);
  }

  async function deactivateEmployee(employee) {
    if (!window.confirm(`Deactivate ${employee.name}? They will lose access immediately.`)) return;

    setDeactivatingId(employee.id);
    try {
      await api.put(`/users/${employee.id}`, { isActive: false });
      showToast("success", `${employee.name} deactivated`);
      if (selectedEmployeeId === employee.id) closeProfile();
      await loadWorkforce();
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to deactivate employee");
    } finally {
      setDeactivatingId(null);
    }
  }

  function openMoveTeam(employee) {
    setMovingEmployee(employee);
    setTeamTarget(employee.team?.id || "");
    setMoveOpen(true);
  }

  async function moveToTeam() {
    if (!movingEmployee) return;

    try {
      await api.put(`/users/${movingEmployee.id}`, { teamId: teamTarget || null });
      showToast("success", teamTarget ? "Employee moved to team" : "Employee removed from team");
      setMoveOpen(false);
      setMovingEmployee(null);
      await loadWorkforce();
      if (selectedEmployeeId === movingEmployee.id) {
        await openProfile(movingEmployee.id);
      }
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to move employee");
    }
  }

  const metricCards = useMemo(() => {
    if (!metrics) return [];

    return [
      { key: "totalEmployees", label: "Total Employees", value: metrics.totalEmployees, icon: Users },
      { key: "activeArtists", label: "Active Artists", value: metrics.activeArtists, icon: Sparkles },
      { key: "overloadedArtists", label: "Overloaded Artists", value: metrics.overloadedArtists, icon: AlertCircle },
      { key: "freelancers", label: "Freelancers", value: metrics.freelancers, icon: Briefcase },
      { key: "idleArtists", label: "Idle Artists", value: metrics.idleArtists, icon: Gauge },
      { key: "activeTeams", label: "Teams Active", value: metrics.activeTeams, icon: Layers3 }
    ];
  }, [metrics]);

  if (loading && !metrics) return <Loader label="Loading workforce..." />;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.key}
              className={`rounded-2xl bg-gradient-to-br ${METRIC_CARD_THEME[card.key]} p-4 text-white shadow-lg ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:shadow-2xl`}
            >
              <div className="mb-6 flex items-start justify-between">
                <p className="text-sm font-medium text-white/80">{card.label}</p>
                <span className="rounded-lg bg-white/15 p-2 backdrop-blur">
                  <Icon size={16} />
                </span>
              </div>
              <div className="flex items-end justify-between">
                <p className="text-3xl font-bold tracking-tight">{card.value ?? 0}</p>
                <p className="text-xs text-white/70">Live workforce signal</p>
              </div>
            </article>
          );
        })}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-8">
          <input
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            placeholder="Search employee"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm lg:col-span-2"
          />
          <select
            value={filters.departmentId}
            onChange={(event) => setFilters((prev) => ({ ...prev, departmentId: event.target.value }))}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All Departments</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
          <select
            value={filters.teamId}
            onChange={(event) => setFilters((prev) => ({ ...prev, teamId: event.target.value }))}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All Teams</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <select
            value={filters.role}
            onChange={(event) => setFilters((prev) => ({ ...prev, role: event.target.value }))}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "ALL" ? "All Roles" : labelize(option)}
              </option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "ALL" ? "All Performance" : option}
              </option>
            ))}
          </select>
          <select
            value={filters.workload}
            onChange={(event) => setFilters((prev) => ({ ...prev, workload: event.target.value }))}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            {WORKLOAD_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "ALL" ? "Any Workload" : labelize(option)}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <select
              value={filters.sortBy}
              onChange={(event) => setFilters((prev) => ({ ...prev, sortBy: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  Sort: {option.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setFilters((prev) => ({ ...prev, sortDir: prev.sortDir === "asc" ? "desc" : "asc" }))}
              className="rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-700"
            >
              {filters.sortDir.toUpperCase()}
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-slate-500">{employees.length} artists match current filters</p>
          <button
            onClick={() =>
              setFilters({
                search: "",
                departmentId: "",
                teamId: "",
                role: "ALL",
                status: "ALL",
                availability: "ALL",
                workload: "ALL",
                sortBy: "workload",
                sortDir: "asc"
              })
            }
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700"
          >
            Clear Filters
          </button>
        </div>
      </section>

      {error ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-6 py-12 text-rose-700">
          <AlertCircle className="mb-3 h-8 w-8" />
          <p className="text-sm">{error}</p>
          <button
            onClick={loadWorkforce}
            className="mt-3 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      ) : !employees.length ? (
        <EmptyState title="No employees found" description="Try changing filters or adding more artists to the studio." />
      ) : (
        <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {employees.map((employee) => (
            <article
              key={employee.id}
              role="button"
              tabIndex={0}
              onClick={() => openProfile(employee.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openProfile(employee.id);
                }
              }}
              className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
            >
              <header className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                    {initials(employee.name)}
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
                        employee.availabilityStatus === "AVAILABLE" ? "bg-emerald-500" : employee.availabilityStatus === "OVERLOADED" ? "bg-red-500" : "bg-amber-500"
                      }`}
                    />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{employee.name}</p>
                    <p className="text-xs text-slate-500">{labelize(employee.role)}</p>
                  </div>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${performanceTone(employee.performance)}`}>
                  {employee.performance}
                </span>
              </header>

              <div className="space-y-2 text-xs text-slate-600">
                <p className="flex items-center justify-between gap-2">
                  <span>{employee.departmentName || "Unassigned"}</span>
                  {employee.team?.name ? <span className="rounded-full bg-slate-100 px-2 py-0.5">{employee.team.name}</span> : <span className="text-slate-400">No team</span>}
                </p>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${employee.employmentType === "FREELANCE" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {employee.employmentType === "FREELANCE" ? "Freelance" : "In-house"}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${availabilityTone(employee.availabilityStatus)}`}>
                    {labelize(employee.availabilityStatus)}
                  </span>
                </div>
              </div>

              <div className="mt-4 rounded-xl bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between text-xs text-slate-600">
                  <span>{employee.activeTaskCount} Active Tasks</span>
                  <span>{employee.activeProjectCount} Projects</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200">
                  <div
                    className={`h-2 rounded-full transition-all ${utilizationTone(employee.capacityPercent)}`}
                    style={{ width: `${Math.max(3, employee.capacityPercent)}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] font-semibold text-slate-700">{employee.capacityPercent}% Capacity</p>
              </div>

              <div className="mt-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Current Projects</p>
                <div className="flex flex-wrap gap-1">
                  {employee.currentProjects.slice(0, 3).map((project) => (
                    <span key={project} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                      {project}
                    </span>
                  ))}
                  {!employee.currentProjects.length && <span className="text-[11px] text-slate-400">No active projects</span>}
                </div>
              </div>

              <footer className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    openProfile(employee.id);
                  }}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700"
                >
                  View Profile
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    navigate(`/assignments?employeeId=${employee.id}`);
                  }}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700"
                >
                  Assign Work
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    openMoveTeam(employee);
                  }}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700"
                >
                  Move Team
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    window.location.href = `mailto:${employee.email}`;
                  }}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700"
                >
                  Message
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    deactivateEmployee(employee);
                  }}
                  disabled={deactivatingId === employee.id}
                  className="rounded-lg border border-rose-300 px-2 py-1 text-[11px] font-semibold text-rose-600 disabled:opacity-60"
                >
                  Deactivate
                </button>
              </footer>
            </article>
          ))}
        </section>
      )}

      <ProfileDrawer open={Boolean(selectedEmployeeId)} onClose={closeProfile} loading={profileLoading} profile={selectedProfile} />

      <Modal open={moveOpen} onClose={() => setMoveOpen(false)} title="Move Employee To Team">
        {!movingEmployee ? null : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Move <span className="font-semibold text-slate-900">{movingEmployee.name}</span> to another team.
            </p>
            <select
              value={teamTarget}
              onChange={(event) => setTeamTarget(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">No team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setMoveOpen(false)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button onClick={moveToTeam} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
                Save Team
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function ProfileDrawer({ open, onClose, loading, profile }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="h-full w-full max-w-[480px] overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Employee Profile</p>
            <h3 className="text-lg font-bold text-slate-900">{profile?.name || "Loading..."}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50" aria-label="Close profile drawer">
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <Loader label="Loading profile..." compact />
        ) : !profile ? (
          <EmptyState title="Profile unavailable" description="Could not load selected employee profile." />
        ) : (
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">{initials(profile.name)}</span>
                <div>
                  <p className="text-sm font-bold text-slate-900">{profile.name}</p>
                  <p className="text-xs text-slate-500">{labelize(profile.role)}</p>
                </div>
              </div>
              <div className="space-y-1 text-xs text-slate-600">
                <p className="flex items-center gap-2"><Mail size={13} /> {profile.email}</p>
                <p className="flex items-center gap-2"><Phone size={13} /> {profile.phone || "Not provided"}</p>
                <p className="flex items-center gap-2"><CalendarClock size={13} /> Joined {formatDate(profile.joinedAt)}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${profile.employmentType === "FREELANCE" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {profile.employmentType === "FREELANCE" ? "Freelance" : "In-house"}
                </span>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{labelize(profile.availabilityStatus || "AVAILABLE")}</span>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 p-4">
              <h4 className="mb-2 text-sm font-bold text-slate-900">Team Info</h4>
              <p className="text-sm text-slate-700">Department: {profile.department?.name || "Unassigned"}</p>
              <p className="text-sm text-slate-700">Team: {profile.team?.name || "No team"}</p>
              <p className="text-sm text-slate-700">Team Lead: {profile.team?.lead?.name || "Not set"}</p>
            </section>

            <section className="rounded-2xl border border-slate-200 p-4">
              <h4 className="mb-3 text-sm font-bold text-slate-900">Production Stats</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <StatCell label="Active Projects" value={profile.stats?.activeProjects || 0} />
                <StatCell label="Active Stages" value={profile.stats?.activeStages || 0} />
                <StatCell label="Completed" value={profile.stats?.completedStages || 0} />
                <StatCell label="Rejected" value={profile.stats?.rejectedCount || 0} />
                <StatCell label="Delayed" value={profile.stats?.delayedCount || 0} />
                <StatCell label="Productivity" value={`${profile.stats?.productivityScore || 0}%`} />
              </div>
              <div className="mt-3 h-2 rounded-full bg-slate-200">
                <div className={`h-2 rounded-full ${utilizationTone(profile.stats?.capacityPercent || 0)}`} style={{ width: `${Math.max(3, profile.stats?.capacityPercent || 0)}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-600">Capacity {profile.stats?.capacityPercent || 0}%</p>
            </section>

            <section className="rounded-2xl border border-slate-200 p-4">
              <h4 className="mb-2 text-sm font-bold text-slate-900">Skill Tags</h4>
              <div className="flex flex-wrap gap-1.5">
                {(profile.skills || []).length ? (
                  profile.skills.map((skill) => (
                    <span key={skill} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {skill}
                    </span>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">No skills added yet.</p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 p-4">
              <h4 className="mb-2 text-sm font-bold text-slate-900">Current Assignments</h4>
              <div className="space-y-2">
                {(profile.assignments || []).slice(0, 8).map((stage) => (
                  <div key={stage.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                    <p className="text-xs font-semibold text-slate-800">{stage.project?.name}</p>
                    <p className="text-xs text-slate-600">{stage.customName || stage.stageTemplate?.name || labelize(stage.stageName)}</p>
                    <p className="text-[11px] text-slate-500">Deadline: {formatDate(stage.deadline)}</p>
                  </div>
                ))}
                {!profile.assignments?.length && <p className="text-xs text-slate-500">No active assignments</p>}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 p-4">
              <h4 className="mb-2 text-sm font-bold text-slate-900">Timeline Activity</h4>
              <div className="space-y-2 text-xs text-slate-600">
                {(profile.assignments || []).slice(0, 6).map((stage) => (
                  <p key={`timeline-${stage.id}`} className="flex items-start gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
                    <ArrowUpRight size={12} className="mt-0.5 text-slate-400" />
                    Assigned to {stage.project?.name} · {stage.customName || stage.stageTemplate?.name || labelize(stage.stageName)} · {labelize(stage.status)}
                  </p>
                ))}
                {!profile.assignments?.length && <p className="text-slate-500">No recent activity yet.</p>}
              </div>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

function StatCell({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
