import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import Loader from "../components/Loader";
import ProgressBar from "../components/ProgressBar";
import EmptyState from "../components/EmptyState";
import { formatDate } from "../utils/format";

function nearestDeadline(stages) {
  const values = (stages || [])
    .filter((stage) => stage.deadline)
    .map((stage) => new Date(stage.deadline))
    .sort((a, b) => a.getTime() - b.getTime());
  return values[0] || null;
}

export default function ProjectsPage() {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [sortBy, setSortBy] = useState("priority");
  const [sortDirection, setSortDirection] = useState("asc");

  useEffect(() => {
    let cancelled = false;

    async function fetchProjects() {
      setLoading(true);
      try {
        const { data } = await api.get("/projects");
        if (!cancelled) setProjects(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchProjects();

    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(() => {
    const copy = [...projects];
    copy.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "progress") return a.progressPercent - b.progressPercent;
      if (sortBy === "deadline") {
        const ad = nearestDeadline(a.stages);
        const bd = nearestDeadline(b.stages);
        if (!ad && !bd) return 0;
        if (!ad) return 1;
        if (!bd) return -1;
        return ad.getTime() - bd.getTime();
      }
      return a.priority - b.priority;
    });

    if (sortDirection === "desc") copy.reverse();
    return copy;
  }, [projects, sortBy, sortDirection]);

  if (loading) return <Loader label="Loading projects..." />;

  if (!sorted.length) {
    return <EmptyState title="No projects" description="Create a project to start tracking production stages." />;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900">Project List</h3>
        <div className="flex items-center gap-2">
          <select className="rounded-xl border border-slate-300 px-3 py-2 text-sm" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="priority">Sort by priority</option>
            <option value="deadline">Sort by nearest deadline</option>
            <option value="progress">Sort by progress</option>
            <option value="name">Sort by name</option>
          </select>
          <button
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold"
            onClick={() => setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}
          >
            {sortDirection.toUpperCase()}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-3">Project</th>
              <th className="py-3">Priority</th>
              <th className="py-3">Audio Received</th>
              <th className="py-3">Nearest Deadline</th>
              <th className="py-3">Progress</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((project) => {
              const deadline = nearestDeadline(project.stages);
              return (
                <tr key={project.id} className="border-b border-slate-100">
                  <td className="py-3 font-semibold text-slate-800">
                    <Link to={`/projects/${project.id}`} className="hover:text-emerald-600">
                      {project.name}
                    </Link>
                  </td>
                  <td className="py-3">{project.priority}</td>
                  <td className="py-3">{formatDate(project.audioReceivedDate)}</td>
                  <td className="py-3">{deadline ? formatDate(deadline) : "-"}</td>
                  <td className="w-[260px] py-3">
                    <ProgressBar value={project.progressPercent} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
