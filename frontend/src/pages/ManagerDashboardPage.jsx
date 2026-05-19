import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Clock } from "lucide-react";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import ProgressBar from "../components/ProgressBar";
import StageStrip from "../components/StageStrip";
import { formatDate, initials } from "../utils/format";

function nearestDeadline(stages) {
  const valid = (stages || [])
    .filter((stage) => stage.deadline)
    .map((stage) => new Date(stage.deadline))
    .sort((a, b) => a.getTime() - b.getTime());
  return valid[0] || null;
}

export default function ManagerDashboardPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [artistFilter, setArtistFilter] = useState("all");
  const [sortBy, setSortBy] = useState("deadline");

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      try {
        const [projectsRes, approvalsRes, usersRes] = await Promise.all([
          api.get("/projects"),
          api.get("/approvals"),
          api.get("/users"),
        ]);

        if (!cancelled) {
          setProjects(projectsRes.data);
          setPendingApprovals(approvalsRes.data.length);
          setUsers(usersRes.data.filter((item) => item.role === "EMPLOYEE"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const copy = [...projects];

    const matches = copy.filter((project) => {
      const bySearch = !search || project.name.toLowerCase().includes(search.toLowerCase());
      const byArtist =
        artistFilter === "all" ||
        project.stages.some(
          (stage) =>
            String(stage.assignedUserId) === artistFilter ||
            stage.assignments?.some((assignment) => String(assignment.userId) === artistFilter)
        );

      let byStatus = true;
      if (statusFilter === "on-track") {
        byStatus = !project.stages.some((stage) => stage.isDeadlineMissed);
      } else if (statusFilter === "delayed") {
        byStatus = project.stages.some((stage) => stage.isDeadlineMissed);
      } else if (statusFilter === "completed") {
        byStatus = Number(project.progressPercent) === 100;
      } else if (statusFilter === "issues") {
        byStatus = project.stages.some((stage) => stage.status === "ISSUE" || stage.status === "EXTENDED");
      }

      return bySearch && byArtist && byStatus;
    });

    matches.sort((a, b) => {
      if (sortBy === "priority") return a.priority - b.priority;
      if (sortBy === "progress") return b.progressPercent - a.progressPercent;
      const ad = nearestDeadline(a.stages);
      const bd = nearestDeadline(b.stages);
      if (!ad && !bd) return 0;
      if (!ad) return 1;
      if (!bd) return -1;
      return ad.getTime() - bd.getTime();
    });

    return matches;
  }, [projects, search, statusFilter, artistFilter, sortBy]);

  if (loading) {
    return <Loader label="Loading dashboard..." />;
  }

  const totalProjects = projects.length;
  const onTrackProjects = projects.filter((project) => project.progressPercent >= 50 && !project.stages?.some((stage) => stage.status === "ISSUE" || stage.isDeadlineMissed)).length;
  const delayedProjects = projects.filter((project) =>
    project.stages?.some((stage) => stage.deadline && new Date(stage.deadline) < new Date() && stage.status !== "APPROVED")
  ).length;
  const onTrackPercent = totalProjects ? Math.round((onTrackProjects / totalProjects) * 100) : 0;
  const delayedPercent = totalProjects ? Math.round((delayedProjects / totalProjects) * 100) : 0;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-4 gap-4">
        <StatCard label="Total Projects" value={totalProjects} tone="bg-slate-900" />
        <StatCard label="Projects On Track" value={`${onTrackPercent}%`} tone="bg-emerald-600" />
        <StatCard label="Projects Delayed" value={`${delayedPercent}%`} tone="bg-red-500" />
        <StatCard label="Pending Approvals" value={pendingApprovals} tone="bg-sky-600" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-4 gap-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by project name"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="on-track">On Track</option>
            <option value="delayed">Delayed</option>
            <option value="completed">Completed</option>
            <option value="issues">Has Issues</option>
          </select>
          <select
            value={artistFilter}
            onChange={(event) => setArtistFilter(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">All Artists</option>
            {users.map((artist) => (
              <option key={artist.id} value={artist.id}>
                {artist.name}
              </option>
            ))}
          </select>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
            <option value="deadline">Sort: nearest deadline</option>
            <option value="priority">Sort: priority</option>
            <option value="progress">Sort: progress</option>
          </select>
        </div>
      </section>

      {!filtered.length ? (
        <EmptyState title="No projects found" description="Try changing the filters or search query." />
      ) : (
        <section className="grid grid-cols-2 gap-4">
          {filtered.map((project) => {
            const artists = Array.from(
              new Map(
                project.stages
                  .flatMap((stage) => {
                    const assignmentUsers = (stage.assignments || []).map((assignment) => assignment.user);
                    return stage.assignedUser ? [stage.assignedUser, ...assignmentUsers] : assignmentUsers;
                  })
                  .filter(Boolean)
                  .map((artist) => [artist.id, artist])
              ).values()
            );
            const deadline = nearestDeadline(project.stages);
            const hasIssue = project.stages.some((stage) => stage.status === "ISSUE" || stage.status === "EXTENDED");

            return (
              <button
                key={project.id}
                onClick={() => navigate(`/projects/${project.id}`)}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:shadow-md"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{project.name}</h3>
                    <p className="mt-1 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      Priority {project.priority}
                    </p>
                  </div>
                  {hasIssue && <AlertTriangle size={18} className="text-red-500" />}
                </div>

                <div className="space-y-3">
                  <ProgressBar value={project.progressPercent} />
                  <StageStrip stages={project.stages} />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {artists.slice(0, 4).map((artist) => (
                        <span
                          key={artist.id}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700"
                          title={artist.name}
                        >
                          {initials(artist.name)}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Clock size={14} />
                      <span>{deadline ? formatDate(deadline) : "No deadline"}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </section>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }) {
  return (
    <div className={`${tone} rounded-2xl p-4 text-white shadow-sm`}>
      <p className="text-xs uppercase tracking-wide text-white/80">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}
