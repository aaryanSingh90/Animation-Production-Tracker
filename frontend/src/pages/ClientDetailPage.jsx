import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FolderKanban, Plus, Clapperboard, Package } from "lucide-react";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import CreateProjectWizardModal from "../components/CreateProjectWizardModal";
import { useToastStore } from "../store/toastStore";
import { formatDate, initials, labelize } from "../utils/format";
import { getStatusMeta, normalizeStatus } from "../utils/constants";

function colorFromName(name = "") {
  const palette = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#14B8A6", "#EC4899", "#6366F1"];
  const hash = name
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

function MetricCard({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        {Icon ? <Icon size={18} className="text-slate-400" /> : null}
      </div>
    </div>
  );
}

function StageMiniStrip({ stages = [] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {stages.slice(0, 8).map((stage) => {
        const meta = getStatusMeta(normalizeStatus(stage.status));
        return (
          <span
            key={stage.id}
            className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
            style={{ backgroundColor: meta.background, color: meta.text, borderColor: meta.border }}
          >
            {labelize(stage.stageName)}
          </span>
        );
      })}
      {stages.length > 8 ? <span className="text-[10px] text-slate-500">+{stages.length - 8}</span> : null}
    </div>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams();
  const clientId = Number(id);
  const navigate = useNavigate();
  const showToast = useToastStore((state) => state.showToast);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [client, setClient] = useState(null);
  const [stageTemplates, setStageTemplates] = useState([]);
  const [pipelineTemplates, setPipelineTemplates] = useState([]);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("priority");
  const [createOpen, setCreateOpen] = useState(false);

  async function fetchData() {
    setLoading(true);
    setError("");

    try {
      const [clientRes, templatesRes] = await Promise.all([api.get(`/clients/${clientId}`), api.get("/stage-templates")]);
      setClient(clientRes.data);
      setStageTemplates(templatesRes.data?.templates || []);
      setPipelineTemplates(templatesRes.data?.pipelineTemplates || []);
    } catch (fetchError) {
      setError(fetchError.userMessage || fetchError.response?.data?.message || "Failed to load client projects.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!clientId || Number.isNaN(clientId)) {
      setError("Invalid client id");
      setLoading(false);
      return;
    }
    fetchData();
  }, [clientId]);

  const projects = useMemo(() => {
    if (!client?.projects) return [];
    const search = query.trim().toLowerCase();

    const filtered = client.projects.filter((project) => {
      if (!search) return true;
      return project.name.toLowerCase().includes(search);
    });

    filtered.sort((a, b) => {
      if (sortBy === "priority") return (a.priority || 0) - (b.priority || 0);
      if (sortBy === "progress") return Number(b.progressPercent || 0) - Number(a.progressPercent || 0);
      if (sortBy === "recent") return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      return a.name.localeCompare(b.name);
    });

    return filtered;
  }, [client, query, sortBy]);

  async function createProject(payload) {
    if (!client) return;
    setSaving(true);
    try {
      await api.post("/projects", {
        ...payload,
        clientId: client.id,
        client: client.name
      });
      showToast("success", "Project created successfully");
      setCreateOpen(false);
      await fetchData();
    } catch (createError) {
      showToast("error", createError.userMessage || createError.response?.data?.message || "Unable to create project");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Loader label="Loading client workspace..." />;
  }

  if (error || !client) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center">
        <p className="text-sm font-medium text-red-700">{error || "Client not found"}</p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <button onClick={() => navigate("/clients")} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700">
            Back To Clients
          </button>
          <button onClick={fetchData} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const tint = colorFromName(client.name);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Link to="/clients" className="hover:text-slate-700">Clients</Link> / <span className="text-slate-700">{client.name}</span>
            </p>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-base font-bold text-white" style={{ backgroundColor: tint }}>
                {initials(client.name)}
              </span>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{client.name}</h2>
                <p className="text-sm text-slate-500">{client.companyName || "Studio client"}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/clients")} className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
              <ArrowLeft size={14} /> Clients
            </button>
            <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
              <Plus size={14} /> Create Project
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Projects" value={client.stats?.totalProjects || 0} icon={FolderKanban} />
          <MetricCard label="Active Projects" value={client.stats?.activeProjects || 0} icon={FolderKanban} />
          <MetricCard label="Total Shots" value={client.stats?.totalShots || 0} icon={Clapperboard} />
          <MetricCard label="Total Assets" value={client.stats?.totalAssets || 0} icon={Package} />
          <MetricCard label="Avg Progress" value={`${client.stats?.avgProgress || 0}%`} icon={FolderKanban} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Projects</h3>
            <p className="text-sm text-slate-500">All productions linked to this client account.</p>
          </div>
          <div className="flex w-full gap-2 md:w-auto">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm md:w-[240px]"
            />
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
              <option value="priority">Priority</option>
              <option value="progress">Progress</option>
              <option value="recent">Recently updated</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>

        {!projects.length ? (
          <EmptyState title="No projects for this client" description="Create a new project to start the production pipeline." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() =>
                  navigate(`/projects/${project.id}`, {
                    state: {
                      breadcrumbClientId: client.id,
                      breadcrumbClientName: client.name,
                      breadcrumbProjectName: project.name
                    }
                  })
                }
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-bold text-slate-900">{project.name}</p>
                    <p className="text-xs text-slate-500">Priority {project.priority || "-"}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    {Math.round(Number(project.progressPercent || 0))}%
                  </span>
                </div>

                <div className="mb-3 text-xs text-slate-600">
                  <p>Stages: <span className="font-semibold text-slate-800">{project.counts?.stages || 0}</span></p>
                  <p>Approved: <span className="font-semibold text-slate-800">{project.counts?.approvedStages || 0}</span></p>
                  <p>Shots: <span className="font-semibold text-slate-800">{project.counts?.shots || 0}</span> · Assets: <span className="font-semibold text-slate-800">{project.counts?.assets || 0}</span></p>
                </div>

                <StageMiniStrip stages={project.stages || []} />
                <p className="mt-3 text-[11px] text-slate-400">Updated {formatDate(project.updatedAt)}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      <CreateProjectWizardModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={createProject}
        stageTemplates={stageTemplates}
        pipelineTemplates={pipelineTemplates}
        clients={[client]}
        defaultClientId={client.id}
        saving={saving}
      />
    </div>
  );
}
