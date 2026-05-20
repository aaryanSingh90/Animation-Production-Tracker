import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, Trash2, AlertTriangle } from "lucide-react";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import CreateProjectWizardModal from "../components/CreateProjectWizardModal";
import { STATUS_COLORS, isLateStatus, normalizeStatus } from "../utils/constants";
import { formatDate, formatDateInput, getStageDisplayName, labelize, initials } from "../utils/format";
import { useToastStore } from "../store/toastStore";

function nearestDeadline(stages) {
  const values = (stages || [])
    .filter((stage) => stage.isActive !== false && stage.deadline)
    .map((stage) => new Date(stage.deadline))
    .sort((a, b) => a.getTime() - b.getTime());
  return values[0] || null;
}

function projectHasIssue(project) {
  return project.stages?.some((stage) => stage.isActive !== false && (isLateStatus(stage.status, stage.deadline) || stage.isDeadlineMissed));
}

function projectIsDelayed(project) {
  return project.stages?.some((stage) => stage.isActive !== false && isLateStatus(stage.status, stage.deadline));
}

function progressTone(value) {
  if (value > 75) return "bg-emerald-500";
  if (value >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function stageAbbr(label) {
  return String(label || "")
    .split(" ")
    .map((part) => part[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const initialForm = {
  name: "",
  priority: 1,
  audioReceivedDate: "",
  description: ""
};

export default function ProjectsPage() {
  const navigate = useNavigate();
  const showToast = useToastStore((state) => state.showToast);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [stageTemplates, setStageTemplates] = useState([]);
  const [pipelineTemplates, setPipelineTemplates] = useState([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("priority");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  async function fetchProjects() {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/projects");
      setProjects(data);
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || "Failed to load projects.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchStageTemplates() {
    try {
      const [templatesRes, clientsRes] = await Promise.allSettled([api.get("/stage-templates"), api.get("/clients")]);

      if (templatesRes.status !== "fulfilled") {
        throw templatesRes.reason;
      }

      const data = templatesRes.value.data;
      setStageTemplates(data.templates || []);
      setPipelineTemplates(data.pipelineTemplates || []);
      setClients(clientsRes.status === "fulfilled" ? clientsRes.value.data || [] : []);
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Failed to load stage templates");
    }
  }

  useEffect(() => {
    fetchProjects();
    fetchStageTemplates();
  }, []);

  const filtered = useMemo(() => {
    const copy = [...projects].filter((project) => {
      const bySearch = !search || project.name.toLowerCase().includes(search.toLowerCase());

      let byStatus = true;
      if (statusFilter === "on-track") byStatus = !projectIsDelayed(project) && !projectHasIssue(project);
      if (statusFilter === "delayed") byStatus = projectIsDelayed(project);
      if (statusFilter === "completed") byStatus = Number(project.progressPercent) === 100;
      if (statusFilter === "issues") byStatus = projectHasIssue(project);

      return bySearch && byStatus;
    });

    copy.sort((a, b) => {
      if (sortBy === "priority") return a.priority - b.priority;
      if (sortBy === "progress") return Number(b.progressPercent) - Number(a.progressPercent);
      if (sortBy === "deadline") {
        const ad = nearestDeadline(a.stages);
        const bd = nearestDeadline(b.stages);
        if (!ad && !bd) return 0;
        if (!ad) return 1;
        if (!bd) return -1;
        return ad.getTime() - bd.getTime();
      }
      return a.name.localeCompare(b.name);
    });

    return copy;
  }, [projects, search, statusFilter, sortBy]);

  function openCreateModal() {
    setEditingProject(null);
    setCreateOpen(true);
  }

  function openEditModal(project) {
    setEditingProject(project);
    setForm({
      name: project.name || "",
      priority: project.priority || 1,
      audioReceivedDate: formatDateInput(project.audioReceivedDate),
      description: project.description || ""
    });
    setEditOpen(true);
  }

  async function createProject(payload) {
    setSaving(true);
    try {
      await api.post("/projects", payload);
      showToast("success", "Project created successfully");
      setCreateOpen(false);
      setForm(initialForm);
      setEditingProject(null);
      await fetchProjects();
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to create project");
    } finally {
      setSaving(false);
    }
  }

  async function saveEditedProject(event) {
    event.preventDefault();
    if (!editingProject) return;

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        priority: Number(form.priority),
        description: form.description || ""
      };
      if (form.audioReceivedDate) {
        payload.audioReceivedDate = form.audioReceivedDate;
      }
      await api.put(`/projects/${editingProject.id}`, payload);
      showToast("success", "Project updated successfully");
      setEditOpen(false);
      setEditingProject(null);
      setForm(initialForm);
      await fetchProjects();
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to save project");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProject(project) {
    const confirmed = window.confirm(`Are you sure you want to delete ${project.name}? This cannot be undone.`);
    if (!confirmed) return;

    try {
      await api.delete(`/projects/${project.id}`);
      showToast("success", "Project deleted successfully");
      await fetchProjects();
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to delete project");
    }
  }

  if (loading) return <Loader label="Loading projects..." />;

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50">
        <p className="text-red-600">{error}</p>
        <button onClick={fetchProjects} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="grid min-w-[680px] flex-1 grid-cols-3 gap-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by project name"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
              <option value="all">All statuses</option>
              <option value="on-track">On Track</option>
              <option value="delayed">Delayed</option>
              <option value="completed">Completed</option>
              <option value="issues">Has Issues</option>
            </select>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
              <option value="priority">Sort by priority</option>
              <option value="deadline">Sort by nearest deadline</option>
              <option value="progress">Sort by progress</option>
              <option value="name">Sort by name</option>
            </select>
          </div>
          <button onClick={openCreateModal} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            Create Project
          </button>
        </div>

        {!filtered.length ? (
          <EmptyState title="No projects" description="Create a project to start tracking production stages." />
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {filtered.map((project) => {
              const activeStages = (project.stages || [])
                .filter((stage) => stage.isActive !== false)
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
              const artists = Array.from(
                new Map(
                  activeStages
                    .flatMap((stage) => {
                      const assignmentUsers = (stage.assignments || []).map((assignment) => assignment.user);
                      return stage.assignedUser ? [stage.assignedUser, ...assignmentUsers] : assignmentUsers;
                    })
                    .filter(Boolean)
                    .map((artist) => [artist.id, artist])
              ).values()
              );
              const deadline = nearestDeadline(activeStages);
              const hasIssues = projectHasIssue(project);
              const progress = Number(project.progressPercent || 0);

              return (
                <div
                  key={project.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/projects/${project.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/projects/${project.id}`);
                    }
                  }}
                  className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-slate-900 hover:text-emerald-600">{project.name}</p>
                      <p className="mt-1 text-xs text-slate-500">Priority {project.priority} · Audio: {formatDate(project.audioReceivedDate)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasIssues && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-600">
                          <AlertTriangle size={12} />
                          Has Issues
                        </span>
                      )}
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditModal(project);
                        }}
                        className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50"
                        title="Edit project"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteProject(project);
                        }}
                        className="rounded-lg border border-red-300 p-1.5 text-red-600 hover:bg-red-50"
                        title="Delete project"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600">
                      <span>Progress</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className={`h-full ${progressTone(progress)}`} style={{ width: `${Math.min(progress, 100)}%` }} />
                    </div>
                  </div>

                  {!!activeStages.length && (
                    <>
                      <div className="mb-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${activeStages.length}, minmax(0, 1fr))` }}>
                        {activeStages.map((stage) => {
                          const status = normalizeStatus(stage?.status || "YTS");
                          const tooltip = `${getStageDisplayName(stage)} · ${labelize(status)}${stage?.deadline ? ` · ${formatDate(stage.deadline)}` : ""}`;
                          return (
                            <div
                              key={`${project.id}-${stage.id}`}
                              title={tooltip}
                              className="h-3 rounded"
                              style={{ backgroundColor: STATUS_COLORS[status] }}
                            />
                          );
                        })}
                      </div>

                      <div className="mb-3 grid gap-1 text-[10px] text-slate-500" style={{ gridTemplateColumns: `repeat(${activeStages.length}, minmax(0, 1fr))` }}>
                        {activeStages.map((stage) => (
                          <div key={`${project.id}-${stage.id}-abbr`} className="text-center">
                            {stageAbbr(getStageDisplayName(stage))}
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {artists.slice(0, 4).map((artist) => (
                        <span
                          key={artist.id}
                          title={artist.name}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700"
                        >
                          {initials(artist.name)}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500">Due: {deadline ? formatDate(deadline) : "No deadline"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <CreateProjectWizardModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={createProject}
        stageTemplates={stageTemplates}
        pipelineTemplates={pipelineTemplates}
        clients={clients}
        saving={saving}
      />

      <Modal
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditingProject(null);
          setForm(initialForm);
        }}
        title="Edit Project"
        size="max-w-lg"
      >
        <form onSubmit={saveEditedProject} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Project Name</label>
            <input
              required
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Priority (1 = Highest Priority)</label>
            <input
              required
              min="1"
              max="20"
              type="number"
              value={form.priority}
              onChange={(event) => setForm((prev) => ({ ...prev, priority: Number(event.target.value) }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Audio Received Date</label>
            <input
              type="date"
              value={form.audioReceivedDate}
              onChange={(event) => setForm((prev) => ({ ...prev, audioReceivedDate: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditOpen(false);
                setEditingProject(null);
                setForm(initialForm);
              }}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
