import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, Clapperboard, FolderKanban, Grid2X2, ListTree, Package, Pencil, Plus, RadioTower, Trash2, UsersRound, Workflow } from "lucide-react";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import PipelineQuickStageBar, { PIPELINE_STAGE_ITEMS } from "../components/PipelineQuickStageBar";
import ProgressBar from "../components/ProgressBar";
import { formatDateInput, labelize } from "../utils/format";
import { buildStageWorkspacePath, stageSlugFromCode } from "../utils/stageRouting";
import { isCompleteStatus, isLateStatus, isPendingReviewStatus } from "../utils/constants";
import { useToastStore } from "../store/toastStore";

const STAGE_META_BY_CODE = new Map(PIPELINE_STAGE_ITEMS.map((stage) => [stage.code, stage]));
const WORKSPACE_VIEW_STORAGE_PREFIX = "projectWorkspaceView";

const STATUS_TONE = {
  healthy: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-rose-50 text-rose-700 border-rose-200",
  neutral: "bg-slate-100 text-slate-700 border-slate-200"
};

const PROJECT_STATUS_META = {
  ON_TRACK: { label: "On Track", tone: STATUS_TONE.healthy },
  DELAYED: { label: "Delayed", tone: STATUS_TONE.danger },
  COMPLETED: { label: "Completed", tone: STATUS_TONE.healthy },
  HAS_ISSUES: { label: "Has Issues", tone: STATUS_TONE.warning }
};

const initialProjectForm = {
  name: "",
  priority: 1,
  audioReceivedDate: "",
  dueDate: "",
  description: ""
};

function resolveStageCode(stage) {
  const definitionCode = stage?.stageDefinition?.code;
  if (definitionCode) return String(definitionCode).toUpperCase();

  const stageName = String(stage?.stageName || "").toUpperCase();
  if (stageName === "RENDER") return "RENDERING";
  if (stageName === "COMPING") return "COMPOSITING";
  return stageName || null;
}

function normalizeStageCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "RENDER") return "RENDERING";
  if (normalized === "COMPING" || normalized === "COMPOSITE") return "COMPOSITING";
  return normalized;
}

function formatStageLabel(code, fallback) {
  if (fallback) return fallback;
  if (code === "RENDERING") return "Final Output";
  return labelize(code);
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function deriveProjectStatus(project, overview) {
  if (Number(overview?.progress?.overallProgress || project?.progressPercent || 0) >= 100) {
    return PROJECT_STATUS_META.COMPLETED;
  }
  if ((overview?.delayedTasksCount || 0) > 0) {
    return PROJECT_STATUS_META.DELAYED;
  }
  if ((overview?.pendingApprovalsCount || 0) > 0) {
    return { label: "In Review", tone: STATUS_TONE.warning };
  }
  return PROJECT_STATUS_META[project?.overallStatus] || PROJECT_STATUS_META.ON_TRACK;
}

function deriveStageState(metrics) {
  if (!metrics.total && !metrics.milestoneValue) {
    return { label: "Not configured", tone: STATUS_TONE.neutral };
  }
  if (metrics.delayedCount > 0) {
    return { label: "Delayed", tone: STATUS_TONE.danger };
  }
  if (metrics.pendingApprovals > 0) {
    return { label: "Pending Approval", tone: STATUS_TONE.warning };
  }
  if (metrics.progress >= 100 && metrics.total > 0) {
    return { label: "Approved", tone: STATUS_TONE.healthy };
  }
  if (metrics.inProgress > 0) {
    return { label: "In Progress", tone: STATUS_TONE.warning };
  }
  if (metrics.approved > 0) {
    return { label: "Partially Complete", tone: STATUS_TONE.healthy };
  }
  if (metrics.milestoneValue > 0) {
    return { label: "Ready", tone: STATUS_TONE.healthy };
  }
  return { label: "Queued", tone: STATUS_TONE.neutral };
}

function HeaderMetric({ label, value, caption, icon: Icon, tone = "text-slate-900" }) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white/80 px-4 py-3 shadow-sm shadow-slate-200/35 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
          <p className={`mt-1 text-xl font-semibold tracking-tight ${tone}`}>{value}</p>
          {caption ? <p className="mt-1 text-xs text-slate-500">{caption}</p> : null}
        </div>
        {Icon ? <Icon size={18} className="mt-1 text-slate-400" /> : null}
      </div>
    </div>
  );
}

function TrackingBadge({ tracking, modeLabel }) {
  const tone = {
    PROJECT: "bg-slate-900 text-white",
    SHOT: "bg-sky-600 text-white",
    ASSET: "bg-fuchsia-600 text-white",
    HYBRID: "bg-amber-500 text-white"
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${tone[tracking] || tone.PROJECT}`}>
        {tracking}
      </span>
      {modeLabel ? <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">{modeLabel}</span> : null}
    </div>
  );
}

function StageHealthBadge({ badge }) {
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badge.tone}`}>{badge.label}</span>;
}

function FlowNode({ node, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex w-full items-start gap-4 text-left"
      aria-label={`Open ${node.label} workspace`}
    >
      <div className="relative z-10 mt-5 flex h-4 w-4 items-center justify-center rounded-full border-4 border-white shadow-sm" style={{ backgroundColor: node.color }} />
      <div className="flex-1 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm shadow-slate-200/40 transition duration-200 group-hover:-translate-y-0.5 group-hover:border-slate-300 group-hover:shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold tracking-tight text-slate-950">{node.label}</p>
            <p className="mt-1 text-sm text-slate-500">{node.summaryText}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <TrackingBadge tracking={node.tracking} modeLabel={node.modeLabel} />
            <StageHealthBadge badge={node.stateBadge} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_auto]">
          <div>
            <ProgressBar value={node.progress} />
          </div>
          <div className="grid min-w-[240px] gap-2 text-xs text-slate-600 sm:grid-cols-2">
            <span className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">Tasks: <strong className="text-slate-900">{node.total}</strong></span>
            <span className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">IP: <strong className="text-slate-900">{node.inProgress}</strong></span>
            <span className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">Delayed: <strong className="text-slate-900">{node.delayedCount}</strong></span>
            <span className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">Done: <strong className="text-slate-900">{node.approved}</strong></span>
          </div>
        </div>

        <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-slate-900">
          {node.actionLabel} <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </button>
  );
}

function WorkspaceCard({ node, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group rounded-2xl border border-slate-200/80 bg-white/90 p-3 text-left shadow-sm shadow-slate-200/40 transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ backgroundColor: node.color }}>
            {node.label
              .split(" ")
              .map((part) => part[0] || "")
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <h3 className="mt-2 truncate text-base font-semibold tracking-tight text-slate-950">{node.label}</h3>
          <p className="mt-1 text-xs text-slate-500">{node.summaryText}</p>
        </div>
        <TrackingBadge tracking={node.tracking} modeLabel={node.modeLabel} />
      </div>

      <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
        <span className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">Tasks: <strong className="text-slate-900">{node.total}</strong></span>
        <span className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">IP: <strong className="text-slate-900">{node.inProgress}</strong></span>
        <span className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">Delayed: <strong className="text-slate-900">{node.delayedCount}</strong></span>
        <span className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">Complete: <strong className="text-slate-900">{node.progress}%</strong></span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <StageHealthBadge badge={node.stateBadge} />
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-900">
          Open Workspace <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </button>
  );
}

function collectStageMetrics(project, overview, node, stageSummaryMap, recordBuckets) {
  if (node.milestone) {
    const totalShots = project?.shots?.length || overview?.project?.totalShots || 0;
    const progress = totalShots > 0 ? 100 : 0;
    const metrics = {
      total: totalShots,
      approved: totalShots,
      submitted: 0,
      inProgress: 0,
      delayedCount: 0,
      pendingApprovals: 0,
      assignedArtists: 0,
      remainingWork: totalShots,
      progress,
      milestoneValue: totalShots,
      nearestDeadline: null
    };

    return {
      ...metrics,
      summaryText: totalShots ? `${pluralize(totalShots, "shot")} prepared for downstream work` : "Create the project cut list to unlock shot workspaces",
      stateBadge: deriveStageState(metrics),
      actionLabel: totalShots ? "Manage shot list" : "Create shots"
    };
  }

  let records = recordBuckets.get(node.stageCode) || [];
  if (node.assetSubCategory) {
    records = records.filter((record) => record.asset?.subCategory === node.assetSubCategory);
  }

  const fallbackSummary = stageSummaryMap.get(node.stageCode);
  const assignedUserIds = new Set();
  let nearestDeadline = null;

  for (const record of records) {
    if (record.assignedUserId) assignedUserIds.add(record.assignedUserId);
    for (const assignment of record.assignments || []) {
      if (assignment.userId) assignedUserIds.add(assignment.userId);
    }

    if (record.deadline) {
      const deadline = new Date(record.deadline);
      if (!Number.isNaN(deadline.getTime()) && (!nearestDeadline || deadline.getTime() < nearestDeadline.getTime())) {
        nearestDeadline = deadline;
      }
    }
  }

  const total = records.length || fallbackSummary?.total || 0;
  const approved = records.length
    ? records.filter((record) => isCompleteStatus(record.status)).length
    : fallbackSummary?.approved || 0;
  const submitted = records.length
    ? records.filter((record) => isPendingReviewStatus(record.status)).length
    : fallbackSummary?.submitted || 0;
  const inProgress = records.length
    ? records.filter((record) => record.status === "IP").length
    : fallbackSummary?.inProgress || 0;
  const delayedCount = records.length
    ? records.filter((record) => isLateStatus(record.status, record.deadline)).length
    : fallbackSummary?.delayed || 0;
  const progress = total ? Math.round((approved / total) * 100) : fallbackSummary?.completionPercent || 0;
  const pendingApprovals = submitted;
  const remainingWork = Math.max(total - approved, 0);
  const assignedArtists = assignedUserIds.size || fallbackSummary?.assignedArtists || 0;
  const metrics = {
    total,
    approved,
    submitted,
    inProgress,
    delayedCount,
    pendingApprovals,
    assignedArtists,
    remainingWork,
    progress,
    milestoneValue: 0,
    nearestDeadline
  };

  const trackingLabel = node.assetSubCategory
    ? `${pluralize(total, "asset")} in this lane`
    : node.tracking === "SHOT"
      ? `${pluralize(total, "shot")} tracked`
      : node.tracking === "ASSET"
        ? `${pluralize(total, "asset")} tracked`
        : `${pluralize(total, "project task", "project tasks")}`;

  return {
    ...metrics,
    summaryText: trackingLabel,
    stateBadge: deriveStageState(metrics),
    actionLabel: "Open workspace"
  };
}

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const id = projectId;
  const location = useLocation();
  const navigate = useNavigate();
  const showToast = useToastStore((state) => state.showToast);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [project, setProject] = useState(null);
  const [overview, setOverview] = useState(null);
  const [editingProject, setEditingProject] = useState(false);
  const [projectForm, setProjectForm] = useState(initialProjectForm);
  const [workspaceView, setWorkspaceView] = useState("flow");

  useEffect(() => {
    const savedView = window.localStorage.getItem(`${WORKSPACE_VIEW_STORAGE_PREFIX}:${id}`);
    if (savedView === "flow" || savedView === "grid") {
      setWorkspaceView(savedView);
    } else {
      setWorkspaceView("flow");
    }
  }, [id]);

  function updateWorkspaceView(view) {
    setWorkspaceView(view);
    window.localStorage.setItem(`${WORKSPACE_VIEW_STORAGE_PREFIX}:${id}`, view);
  }

  async function fetchData() {
    setLoading(true);
    setError("");
    try {
      const [projectRes, overviewRes] = await Promise.all([api.get(`/projects/${id}`), api.get(`/projects/${id}/overview`)]);
      setProject(projectRes.data);
      setOverview(overviewRes.data);
      setProjectForm({
        name: projectRes.data.name || "",
        priority: projectRes.data.priority || 1,
        audioReceivedDate: formatDateInput(projectRes.data.audioReceivedDate),
        dueDate: formatDateInput(projectRes.data.dueDate),
        description: projectRes.data.description || ""
      });
    } catch (fetchError) {
      setError(fetchError.userMessage || fetchError.response?.data?.message || "Failed to load project details");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [id]);

  const breadcrumbState = useMemo(
    () => ({
      breadcrumbClientId: project?.clientId || location.state?.breadcrumbClientId,
      breadcrumbClientName: project?.client || location.state?.breadcrumbClientName,
      breadcrumbProjectName: project?.name || location.state?.breadcrumbProjectName
    }),
    [project, location.state]
  );

  const stageSummaryMap = useMemo(() => {
    const map = new Map();
    for (const summary of overview?.stageSummaries || []) {
      map.set(normalizeStageCode(summary.stageCode), summary);
    }
    return map;
  }, [overview]);

  const recordBuckets = useMemo(() => {
    const buckets = new Map();
    const pushRecord = (code, record) => {
      const normalizedCode = normalizeStageCode(code);
      if (!normalizedCode) return;
      if (!buckets.has(normalizedCode)) buckets.set(normalizedCode, []);
      buckets.get(normalizedCode).push(record);
    };

    for (const stage of project?.stages || []) {
      if (stage.isActive === false) continue;
      pushRecord(resolveStageCode(stage), stage);
    }

    for (const shot of project?.shots || []) {
      for (const stage of shot.stages || []) {
        pushRecord(resolveStageCode(stage), {
          ...stage,
          shot,
          scope: "SHOT"
        });
      }
    }

    for (const asset of project?.assets || []) {
      for (const stage of asset.stages || []) {
        pushRecord(resolveStageCode(stage), {
          ...stage,
          asset,
          scope: "ASSET"
        });
      }
    }

    return buckets;
  }, [project]);

  const pipelineNodes = useMemo(() => {
    const configuredCodes = Array.isArray(overview?.project?.activeStageCodes)
      ? overview.project.activeStageCodes.map((code) => normalizeStageCode(code)).filter(Boolean)
      : [];
    const summaryCodes = (overview?.stageSummaries || []).map((summary) => normalizeStageCode(summary.stageCode)).filter(Boolean);
    const stageCodes = Array.from(new Set(configuredCodes.length ? configuredCodes : summaryCodes));

    return stageCodes.map((code) => {
      const summary = stageSummaryMap.get(code) || (code === "RENDERING" ? stageSummaryMap.get("RENDER") : null);
      const meta = STAGE_META_BY_CODE.get(code) || {};
      const node = {
        id: code.toLowerCase(),
        label: formatStageLabel(code, summary?.stageName || meta.label),
        stageCode: code,
        workspaceSlug: meta.slug || stageSlugFromCode(code) || code.toLowerCase().replaceAll("_", "-"),
        tracking: summary?.trackingMode || "PROJECT",
        color: meta.color || "#64748B"
      };
      const metrics = collectStageMetrics(project, overview, node, stageSummaryMap, recordBuckets);

      return {
        ...node,
        ...metrics,
        modeLabel: null,
        path: buildStageWorkspacePath(project?.id, node.workspaceSlug)
      };
    });
  }, [project, overview, recordBuckets, stageSummaryMap]);

  const productionMetrics = useMemo(() => {
    const apiMetrics = overview?.productionMetrics || {};
    const totalTasks = Number(apiMetrics.totalTasks ?? pipelineNodes.reduce((sum, node) => sum + Number(node.total || 0), 0));
    const completedTasks = Number(apiMetrics.completedTasks ?? pipelineNodes.reduce((sum, node) => sum + Number(node.approved || 0), 0));
    return {
      completion: overview?.progress?.overallProgress ?? project?.progressPercent ?? 0,
      totalStages: Number(apiMetrics.totalStages ?? pipelineNodes.length),
      activeStages: Number(apiMetrics.activeStages ?? pipelineNodes.filter((node) => node.total > 0 && node.approved < node.total).length),
      totalTasks,
      completedTasks,
      activeTasks: Number(apiMetrics.activeTasks ?? Math.max(totalTasks - completedTasks, 0)),
      delayedTasks: Number(apiMetrics.delayedTasks ?? overview?.delayedTasksCount ?? 0),
      activeArtists: Number(apiMetrics.activeArtists ?? pipelineNodes.reduce((sum, node) => sum + Number(node.assignedArtists || 0), 0)),
      totalProductionUnits: Number(
        apiMetrics.totalProductionUnits ??
          (Number(overview?.project?.totalShots ?? project?.shots?.length ?? 0) +
            Number(overview?.project?.totalAssets ?? project?.assets?.length ?? 0) +
            Number(overview?.project?.totalAudioTasks ?? 0))
      )
    };
  }, [overview, pipelineNodes, project]);

  const quickActionTargets = useMemo(() => {
    const shotNode = pipelineNodes.find((node) => node.stageCode === "ANIMATICS") || pipelineNodes.find((node) => node.tracking === "SHOT");
    const assetNode = pipelineNodes.find((node) => node.stageCode === "MODELLING") || pipelineNodes.find((node) => node.tracking === "ASSET");
    const audioNode = pipelineNodes.find((node) => node.stageCode === "AUDIO");

    return {
      shot: shotNode?.path || null,
      asset: assetNode?.path || null,
      audio: audioNode?.path || null
    };
  }, [pipelineNodes]);

  const projectStatus = useMemo(() => deriveProjectStatus(project, overview), [project, overview]);

  async function saveProject(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.put(`/projects/${id}`, {
        name: projectForm.name,
        priority: Number(projectForm.priority),
        audioReceivedDate: projectForm.audioReceivedDate || null,
        dueDate: projectForm.dueDate || null,
        description: projectForm.description || null
      });
      showToast("success", "Project updated");
      setEditingProject(false);
      await fetchData();
    } catch (saveError) {
      showToast("error", saveError.userMessage || saveError.response?.data?.message || "Unable to update project");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProject() {
    if (!project) return;
    const confirmed = window.confirm(`Are you sure you want to delete ${project.name}? This cannot be undone.`);
    if (!confirmed) return;

    setSaving(true);
    try {
      await api.delete(`/projects/${project.id}`);
      showToast("success", "Project deleted");
      navigate(project.clientId ? `/clients/${project.clientId}` : "/clients", { replace: true });
    } catch (deleteError) {
      showToast("error", deleteError.userMessage || deleteError.response?.data?.message || "Unable to delete project");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loader label="Loading production pipeline..." />;
  if (error) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 px-6 py-8 text-center">
        <p className="text-sm font-medium text-rose-700">{error}</p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <button onClick={fetchData} className="rounded-xl border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700">
            Retry
          </button>
          <Link to="/clients" className="rounded-xl border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700">
            Back To Clients
          </Link>
        </div>
      </div>
    );
  }
  if (!project) return <EmptyState title="Project not found" description="This project may have been removed." />;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[32px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.94))] shadow-sm shadow-slate-200/50">
        <div className="border-b border-slate-200/80 px-5 py-5 lg:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                <Link to="/clients" className="hover:text-slate-700">Clients</Link>
                {" / "}
                {project.clientId ? (
                  <Link to={`/clients/${project.clientId}`} className="hover:text-slate-700">
                    {breadcrumbState.breadcrumbClientName || project.client || `Client #${project.clientId}`}
                  </Link>
                ) : (
                  <span className="text-slate-600">Unassigned Client</span>
                )}
              </p>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{project.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 font-semibold">
                    <Building2 size={14} /> {project.client || "No client assigned"}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 font-semibold">
                    <FolderKanban size={14} /> Priority {project.priority}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-semibold ${projectStatus.tone}`}>
                    <Workflow size={14} /> {projectStatus.label}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {quickActionTargets.shot ? (
                <button
                  onClick={() => navigate(quickActionTargets.shot, { state: breadcrumbState })}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white/90 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Plus size={15} /> Add Shot
                </button>
              ) : null}
              {quickActionTargets.asset ? (
                <button
                  onClick={() => navigate(quickActionTargets.asset, { state: breadcrumbState })}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white/90 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Plus size={15} /> Add Asset
                </button>
              ) : null}
              {quickActionTargets.audio ? (
                <button
                  onClick={() => navigate(quickActionTargets.audio, { state: breadcrumbState })}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white/90 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Plus size={15} /> Add Audio
                </button>
              ) : null}
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white/90 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <RadioTower size={15} /> Dashboard
              </Link>
              <button
                onClick={() => setEditingProject(true)}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white/90 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Pencil size={15} /> Edit
              </button>
              <button
                onClick={deleteProject}
                className="inline-flex items-center gap-2 rounded-2xl bg-rose-500 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-600"
              >
                <Trash2 size={15} /> Delete
              </button>
            </div>
          </div>

          <div className="mt-5">
            <ProgressBar value={overview?.progress?.overallProgress ?? project.progressPercent ?? 0} />
          </div>
        </div>

        <div className="grid gap-3 px-5 py-5 md:grid-cols-2 xl:grid-cols-7 lg:px-6">
          <HeaderMetric label="Complete" value={`${productionMetrics.completion}%`} caption="Project completion" icon={Workflow} />
          <HeaderMetric label="Stages" value={productionMetrics.totalStages} caption={`${productionMetrics.activeStages} active`} icon={ListTree} />
          <HeaderMetric label="Active Tasks" value={productionMetrics.activeTasks} caption={`${productionMetrics.totalTasks} total tasks`} icon={Clapperboard} />
          <HeaderMetric label="Completed" value={productionMetrics.completedTasks} caption="Done tasks" icon={CheckCircle2} tone="text-emerald-700" />
          <HeaderMetric label="Delayed" value={productionMetrics.delayedTasks} caption="Overdue tasks" icon={AlertTriangle} tone={productionMetrics.delayedTasks > 0 ? "text-rose-700" : "text-slate-900"} />
          <HeaderMetric label="Artists" value={productionMetrics.activeArtists} caption="Assigned artists" icon={UsersRound} />
          <HeaderMetric label="Units" value={productionMetrics.totalProductionUnits} caption="Shots, assets, audio" icon={Package} />
        </div>
      </section>

      <PipelineQuickStageBar
        projectId={project.id}
        overview={overview}
        navigationState={breadcrumbState}
        sticky
      />

      <section className="rounded-[30px] border border-slate-200/80 bg-white/88 p-5 shadow-sm shadow-slate-200/40 backdrop-blur lg:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Project Workspace</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              {workspaceView === "flow" ? "Pipeline Flow" : "Stage Grid"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {pipelineNodes.length} configured stage{pipelineNodes.length === 1 ? "" : "s"} from this project pipeline.
            </p>
          </div>
          <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => updateWorkspaceView("flow")}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                workspaceView === "flow" ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-white"
              }`}
            >
              <ListTree size={15} /> Flow View
            </button>
            <button
              type="button"
              onClick={() => updateWorkspaceView("grid")}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                workspaceView === "grid" ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-white"
              }`}
            >
              <Grid2X2 size={15} /> Grid View
            </button>
          </div>
        </div>

        {workspaceView === "flow" ? (
          <div className="relative pl-1 md:pl-2">
            <div className="absolute bottom-4 left-[7px] top-6 w-px bg-gradient-to-b from-slate-200 via-slate-300 to-slate-200 md:left-[10px]" />
            <div className="space-y-3">
              {pipelineNodes.map((node) => (
                <FlowNode
                  key={node.id}
                  node={node}
                  onOpen={() => navigate(node.path, { state: breadcrumbState })}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {pipelineNodes.map((node) => (
              <WorkspaceCard
                key={node.id}
                node={node}
                onOpen={() => navigate(node.path, { state: breadcrumbState })}
              />
            ))}
          </div>
        )}

        {!pipelineNodes.length ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
            <p className="text-sm font-semibold text-slate-800">No configured stages</p>
            <p className="mt-1 text-xs text-slate-500">This project has no active pipeline stages.</p>
          </div>
        ) : null}
      </section>

      <Modal open={editingProject} onClose={() => setEditingProject(false)} title="Edit Project" size="max-w-2xl">
        <form className="space-y-4" onSubmit={saveProject}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>Project Name</span>
              <input
                value={projectForm.name}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, name: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>Priority</span>
              <input
                type="number"
                min="1"
                max="20"
                value={projectForm.priority}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, priority: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>Audio Received Date</span>
              <input
                type="date"
                value={projectForm.audioReceivedDate}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, audioReceivedDate: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>Due Date</span>
              <input
                type="date"
                value={projectForm.dueDate}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            <span>Description</span>
            <textarea
              rows={4}
              value={projectForm.description}
              onChange={(event) => setProjectForm((prev) => ({ ...prev, description: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditingProject(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
