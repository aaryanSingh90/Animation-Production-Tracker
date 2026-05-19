import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import Loader from "../components/Loader";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import ProgressBar from "../components/ProgressBar";
import { formatDate, formatDateInput, getStageDisplayName, labelize } from "../utils/format";
import { useToastStore } from "../store/toastStore";
import { stageSlugFromCode } from "../utils/stageRouting";
import { stageDepartmentFromCode } from "../utils/stageDepartmentMap";

const TRACKING_GROUP_ORDER = ["PROJECT", "SHOT", "ASSET"];
const TRACKING_GROUP_LABEL = {
  PROJECT: "Project Stages",
  SHOT: "Shot Stages",
  ASSET: "Asset Stages"
};

const STAGE_GROUP_BY_CODE = {
  AUDIO: "PROJECT",
  ANIMATICS: "SHOT",
  CHARACTER_MODELLING: "ASSET",
  BLENDSHAPES: "ASSET",
  BG_MODELLING: "ASSET",
  RIGGING: "ASSET",
  TEXTURING: "SHOT",
  ANIMATION: "SHOT",
  COMPOSITING: "PROJECT",
  EDITING: "PROJECT"
};

const PIPELINE_STAGE_ORDER = [
  "AUDIO",
  "ANIMATICS",
  "CHARACTER_MODELLING",
  "BLENDSHAPES",
  "BG_MODELLING",
  "RIGGING",
  "TEXTURING",
  "ANIMATION",
  "LIGHTING",
  "RENDERING",
  "COMPOSITING",
  "EDITING"
];

function resolveStageCode(stage) {
  const fromDefinition = stage?.stageDefinition?.code;
  if (fromDefinition) return String(fromDefinition).toUpperCase();

  const stageName = String(stage?.stageName || "").toUpperCase();
  if (stageName === "RENDER") return "RENDERING";
  return stageName || null;
}

function normalizeTrackingGroup(value) {
  const normalized = String(value || "").toUpperCase();
  if (TRACKING_GROUP_ORDER.includes(normalized)) return normalized;
  return "PROJECT";
}

function resolveSummaryTrackingGroup(summary) {
  const stageCode = String(summary?.stageCode || "").toUpperCase();
  const trackingMode = normalizeTrackingGroup(summary?.trackingMode);
  if (stageCode === "LIGHTING" || stageCode === "RENDERING") {
    return trackingMode === "SHOT" ? "SHOT" : "PROJECT";
  }
  return STAGE_GROUP_BY_CODE[stageCode] || trackingMode;
}

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const id = projectId;
  const navigate = useNavigate();
  const showToast = useToastStore((state) => state.showToast);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [project, setProject] = useState(null);
  const [overview, setOverview] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [stageTemplates, setStageTemplates] = useState([]);

  const [workspaceDrawer, setWorkspaceDrawer] = useState({
    open: false,
    loading: false,
    error: "",
    summary: null,
    items: []
  });

  const [editingProject, setEditingProject] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: "", priority: 1, audioReceivedDate: "" });

  const [characterId, setCharacterId] = useState("");
  const [addingStage, setAddingStage] = useState(false);
  const [stageForm, setStageForm] = useState({
    stageTemplateId: "",
    useCustomName: false,
    customName: ""
  });

  async function fetchData() {
    setLoading(true);
    try {
      const [projectRes, overviewRes, charsRes, stageTemplatesRes] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/projects/${id}/overview`),
        api.get("/characters"),
        api.get("/stage-templates")
      ]);
      setProject(projectRes.data);
      setOverview(overviewRes.data);
      setCharacters(charsRes.data);
      setStageTemplates(stageTemplatesRes.data?.templates || []);
      setProjectForm({
        name: projectRes.data.name,
        priority: projectRes.data.priority,
        audioReceivedDate: formatDateInput(projectRes.data.audioReceivedDate)
      });
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Failed to load project details");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [id]);

  const linkedCharacterIds = useMemo(() => new Set((project?.projectCharacters || []).map((item) => item.character.id)), [project]);
  const orderedStages = useMemo(
    () => (project?.stages || []).filter((stage) => stage.isActive !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [project]
  );
  const overallBadge = useMemo(() => {
    if (!project) return { label: "On Track", tone: "bg-emerald-50 text-emerald-700" };
    if (Number(project.progressPercent) === 100) return { label: "Complete", tone: "bg-sky-50 text-sky-700" };
    const delayed = project.stages?.some((stage) => stage.deadline && new Date(stage.deadline) < new Date() && stage.status !== "APPROVED");
    const hasIssues = project.stages?.some((stage) => stage.status === "ISSUE" || stage.status === "EXTENDED");
    if (hasIssues) return { label: "Has Issues", tone: "bg-amber-50 text-amber-700" };
    if (delayed) return { label: "Delayed", tone: "bg-red-50 text-red-700" };
    return { label: "On Track", tone: "bg-emerald-50 text-emerald-700" };
  }, [project]);

  const stageWorkspaceSummaries = useMemo(() => {
    const stageOrder = new Map(PIPELINE_STAGE_ORDER.map((code, index) => [code, index]));

    return (overview?.stageSummaries || [])
      .map((summary) => {
        const stageCode = String(summary.stageCode || "").toUpperCase();
        const stageSlug = stageSlugFromCode(stageCode);
        return {
          ...summary,
          stageCode,
          stageSlug
        };
      })
      .sort((a, b) => {
        const orderA = stageOrder.get(a.stageCode) ?? Number.MAX_SAFE_INTEGER;
        const orderB = stageOrder.get(b.stageCode) ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return String(a.stageName || "").localeCompare(String(b.stageName || ""));
      });
  }, [overview]);

  const trackingModeByCode = useMemo(() => {
    const map = new Map();
    for (const summary of stageWorkspaceSummaries) {
      map.set(summary.stageCode, summary.trackingMode);
    }
    return map;
  }, [stageWorkspaceSummaries]);

  const groupedSummaries = useMemo(() => {
    const groups = {
      PROJECT: [],
      SHOT: [],
      ASSET: []
    };
    for (const summary of stageWorkspaceSummaries) {
      const group = resolveSummaryTrackingGroup(summary);
      groups[group].push(summary);
    }
    return groups;
  }, [stageWorkspaceSummaries]);

  const stageGroupByCode = useMemo(() => {
    const map = new Map();
    for (const summary of stageWorkspaceSummaries) {
      const group = resolveSummaryTrackingGroup(summary);
      map.set(summary.stageCode, group);
    }
    return map;
  }, [stageWorkspaceSummaries]);

  const groupedDetailedStages = useMemo(() => {
    const groups = {
      PROJECT: [],
      SHOT: [],
      ASSET: []
    };
    for (const stage of orderedStages) {
      const stageCode = resolveStageCode(stage);
      const trackingGroup =
        stageGroupByCode.get(stageCode) ||
        normalizeTrackingGroup(trackingModeByCode.get(stageCode) || stage.trackingMode || "PROJECT");
      groups[trackingGroup].push(stage);
    }
    return groups;
  }, [orderedStages, trackingModeByCode, stageGroupByCode]);

  const stageInsightsByCode = useMemo(() => {
    const insights = new Map();
    const ensure = (code) => {
      const normalizedCode = String(code || "").toUpperCase();
      if (!normalizedCode) return null;
      if (!insights.has(normalizedCode)) {
        insights.set(normalizedCode, {
          assignedUserIds: new Set(),
          nearestDeadline: null,
          overdueCount: 0
        });
      }
      return insights.get(normalizedCode);
    };

    const registerDeadline = (bucket, deadline, status) => {
      if (!deadline) return;
      const date = new Date(deadline);
      if (Number.isNaN(date.getTime())) return;
      if (!bucket.nearestDeadline || date.getTime() < bucket.nearestDeadline.getTime()) {
        bucket.nearestDeadline = date;
      }
      if (date < new Date() && status !== "APPROVED") {
        bucket.overdueCount += 1;
      }
    };

    for (const stage of project?.stages || []) {
      const code = resolveStageCode(stage);
      const bucket = ensure(code);
      if (!bucket) continue;
      if (stage.assignedUserId) bucket.assignedUserIds.add(stage.assignedUserId);
      for (const assignment of stage.assignments || []) {
        if (assignment.userId) bucket.assignedUserIds.add(assignment.userId);
      }
      registerDeadline(bucket, stage.deadline, stage.status);
    }

    for (const shot of project?.shots || []) {
      for (const stage of shot.stages || []) {
        const code = resolveStageCode(stage);
        const bucket = ensure(code);
        if (!bucket) continue;
        if (stage.assignedUserId) bucket.assignedUserIds.add(stage.assignedUserId);
        registerDeadline(bucket, stage.deadline, stage.status);
      }
    }

    for (const asset of project?.assets || []) {
      for (const stage of asset.stages || []) {
        const code = resolveStageCode(stage);
        const bucket = ensure(code);
        if (!bucket) continue;
        if (stage.assignedUserId) bucket.assignedUserIds.add(stage.assignedUserId);
        registerDeadline(bucket, stage.deadline, stage.status);
      }
    }

    return insights;
  }, [project]);

  const openWorkspaceDrawer = async (summary) => {
    if (!summary?.stageCode) return;

    setWorkspaceDrawer({
      open: true,
      loading: true,
      error: "",
      summary,
      items: []
    });

    try {
      const params = summary.trackingMode === "PROJECT" ? undefined : { page: 1, pageSize: 12 };
      const endpoint =
        summary.trackingMode === "SHOT"
          ? `/projects/${id}/stages/${summary.stageCode}/shots`
          : summary.trackingMode === "ASSET"
            ? `/projects/${id}/stages/${summary.stageCode}/assets`
            : `/projects/${id}/stages/${summary.stageCode}/project`;

      const { data } = await api.get(endpoint, { params });
      const normalizedItems =
        summary.trackingMode === "SHOT"
          ? (data.items || []).map((item) => ({
              id: item.id,
              title: item.shot?.name || `Shot ${item.shot?.shotNumber || "-"}`,
              subtitle: `Shot #${item.shot?.shotNumber || "-"}`,
              status: item.status,
              deadline: item.deadline,
              assignedUser: item.assignedUser?.name || "Unassigned",
              assignedUserId: item.assignedUser?.id || null
            }))
          : summary.trackingMode === "ASSET"
            ? (data.items || []).map((item) => ({
                id: item.id,
                title: item.asset?.name || "Asset",
                subtitle: labelize(item.asset?.type || "ASSET"),
                status: item.status,
                deadline: item.deadline,
                assignedUser: item.assignedUser?.name || "Unassigned",
                assignedUserId: item.assignedUser?.id || null
              }))
            : (data.items || []).map((item) => ({
                id: item.id,
                title: getStageDisplayName(item),
                subtitle: project?.name || "Project Stage",
                status: item.status,
                deadline: item.deadline,
                assignedUser: item.assignedUser?.name || "Unassigned",
                assignedUserId: item.assignedUser?.id || null
              }));

      setWorkspaceDrawer({
        open: true,
        loading: false,
        error: "",
        summary,
        items: normalizedItems
      });
    } catch (error) {
      setWorkspaceDrawer({
        open: true,
        loading: false,
        error: error.userMessage || error.response?.data?.message || "Failed to load workspace preview",
        summary,
        items: []
      });
    }
  };

  const closeWorkspaceDrawer = () => {
    setWorkspaceDrawer((prev) => ({
      ...prev,
      open: false
    }));
  };

  const saveProject = async () => {
    setSaving(true);
    try {
      await api.put(`/projects/${id}`, projectForm);
      showToast("success", "Project updated");
      setEditingProject(false);
      await fetchData();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to update project");
    } finally {
      setSaving(false);
    }
  };

  const deleteProject = async () => {
    if (!project) return;
    const confirmed = window.confirm(`Are you sure you want to delete ${project.name}? This cannot be undone.`);
    if (!confirmed) return;

    setSaving(true);
    try {
      await api.delete(`/projects/${project.id}`);
      showToast("success", "Project deleted");
      navigate("/projects", { replace: true });
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to delete project");
    } finally {
      setSaving(false);
    }
  };

  const linkCharacter = async () => {
    if (!characterId) return;

    setSaving(true);
    try {
      await api.post(`/projects/${id}/characters`, { characterId: Number(characterId) });
      showToast("success", "Character linked to project");
      setCharacterId("");
      await fetchData();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to link character");
    } finally {
      setSaving(false);
    }
  };

  const addStageToProject = async () => {
    const customName = stageForm.customName.trim();
    if (stageForm.useCustomName && !customName) {
      showToast("error", "Custom stage name is required");
      return;
    }
    if (!stageForm.useCustomName && !stageForm.stageTemplateId) {
      showToast("error", "Select a stage template");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        order: orderedStages.length + 1,
        isActive: true,
        status: "NOT_STARTED"
      };
      if (stageForm.useCustomName) {
        payload.stageName = "CUSTOM";
        payload.customName = customName;
      } else {
        const template = stageTemplates.find((item) => item.id === stageForm.stageTemplateId);
        payload.stageTemplateId = stageForm.stageTemplateId;
        payload.stageName = template?.legacyStageName || "CUSTOM";
        if (payload.stageName === "CUSTOM" && template?.name) {
          payload.customName = template.name;
        }
      }
      await api.post(`/projects/${id}/stages`, payload);
      showToast("success", "Stage added to project");
      setAddingStage(false);
      setStageForm({
        stageTemplateId: "",
        useCustomName: false,
        customName: ""
      });
      await fetchData();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to add stage");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader label="Loading project detail..." />;
  if (!project) return <EmptyState title="Project not found" description="This project may have been deleted." />;

  return (
    <div className="space-y-6">
      <section className="sticky top-3 z-20 rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h3 className="text-2xl font-bold tracking-tight text-slate-900">{project.name}</h3>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold">Priority {project.priority}</span>
              <span>Audio: {formatDate(project.audioReceivedDate)}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${overallBadge.tone}`}>{overallBadge.label}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setEditingProject(true)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Edit Project
            </button>
            <button onClick={deleteProject} className="rounded-xl bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600">
              Delete
            </button>
          </div>
        </div>

        <div className="mt-3">
          <ProgressBar value={project.progressPercent} />
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Overall</p>
            <p className="text-sm font-semibold text-slate-900">{project.progressPercent}% complete</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Shots</p>
            <p className="text-sm font-semibold text-slate-900">{overview?.project?.totalShots || 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Assets</p>
            <p className="text-sm font-semibold text-slate-900">{overview?.project?.totalAssets || 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Pending Approvals</p>
            <p className="text-sm font-semibold text-slate-900">{overview?.pendingApprovalsCount || 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Delayed Tasks</p>
            <p className="text-sm font-semibold text-rose-700">{overview?.delayedTasksCount || 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Due Date</p>
            <p className="text-sm font-semibold text-slate-900">{formatDate(project.dueDate)}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
            Project: {overview?.progress?.projectStageProgress || 0}%
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
            Shot: {overview?.progress?.shotStageProgress || 0}%
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
            Asset: {overview?.progress?.assetStageProgress || 0}%
          </span>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-lg font-bold text-slate-900">Pipeline Workspaces</h4>
          <p className="text-xs text-slate-500">Project / Shot / Asset tracking</p>
        </div>
        {!stageWorkspaceSummaries.length ? (
          <p className="text-sm text-slate-500">No active stage summaries yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {stageWorkspaceSummaries.map((summary) => {
              const completion = Number(summary.completionPercent || 0);
              const card = (
                <div className="rounded-xl border border-slate-200 p-3 transition hover:border-emerald-300 hover:shadow-sm">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{summary.stageName}</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {summary.trackingMode}
                    </span>
                  </div>
                  <p className="mb-2 text-xs text-slate-500">
                    {summary.approved}/{summary.total} approved
                  </p>
                  <div className="h-2 rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, completion)}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {completion}% complete {summary.delayed ? `· ${summary.delayed} delayed` : ""}
                  </p>
                </div>
              );

              const summaryKey = `${summary.stageCode}-${summary.trackingMode || "PROJECT"}`;
              if (!summary.stageSlug) {
                return <div key={summaryKey}>{card}</div>;
              }

              return (
                <Link key={summaryKey} to={`/projects/${project.id}/${summary.stageSlug}`}>
                  {card}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-bold text-slate-900">Pipeline Stages</h4>
          <button
            onClick={() => setAddingStage(true)}
            className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Add Stage
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {TRACKING_GROUP_ORDER.map((groupKey) => {
            const summaries = groupedSummaries[groupKey] || [];
            const detailedStages = groupedDetailedStages[groupKey] || [];

            return (
              <div key={groupKey} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h5 className="text-sm font-bold text-slate-800">{TRACKING_GROUP_LABEL[groupKey] || groupKey}</h5>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                    {summaries.length} stages
                  </span>
                </div>

                <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
                  {summaries.map((summary) => {
                    const insights = stageInsightsByCode.get(summary.stageCode);
                    const assignedCount = insights?.assignedUserIds?.size || 0;
                    const nearestDeadline = insights?.nearestDeadline;
                    const overdueCount = insights?.overdueCount || 0;
                    const stageHref = summary.stageSlug ? `/projects/${project.id}/${summary.stageSlug}` : null;
                    const completion = Number(summary.completionPercent || 0);
                    const relatedRows = detailedStages.filter((item) => resolveStageCode(item) === summary.stageCode);
                    const stageDepartment = stageDepartmentFromCode(summary.stageCode);

                    return (
                      <div key={`${groupKey}-${summary.stageCode}`} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{summary.stageName}</p>
                            <p className="text-[11px] text-slate-500">{stageDepartment || "Cross-functional"}</p>
                          </div>
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                            {summary.trackingMode}
                          </span>
                        </div>

                        <div className="mb-2 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                          <span>{summary.approved}/{summary.total} approved</span>
                          <span className="text-right">{assignedCount} artists</span>
                          <span>{summary.submitted || 0} submitted</span>
                          <span className={`text-right ${overdueCount ? "font-semibold text-rose-600" : ""}`}>
                            {overdueCount ? `${overdueCount} overdue` : "On schedule"}
                          </span>
                        </div>

                        <div className="h-2 rounded-full bg-slate-200">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, completion)}%` }} />
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {completion}% complete
                          {nearestDeadline ? ` · Due ${formatDate(nearestDeadline)}` : " · No deadline"}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <button
                            onClick={() => openWorkspaceDrawer(summary)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-slate-400"
                          >
                            Preview
                          </button>
                          {stageHref && (
                            <Link
                              to={stageHref}
                              className="rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-800"
                            >
                              Open Workspace
                            </Link>
                          )}
                          {!!relatedRows.length && (
                            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                              {relatedRows.length} project row{relatedRows.length > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!summaries.length && (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">
                      No active stages in this group.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {workspaceDrawer.open && (
        <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={closeWorkspaceDrawer}>
          <div
            className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Workspace Preview</p>
                  <h4 className="text-lg font-bold text-slate-900">{workspaceDrawer.summary?.stageName}</h4>
                  <p className="text-sm text-slate-500">{workspaceDrawer.summary?.trackingMode} tracking</p>
                </div>
                <button
                  onClick={closeWorkspaceDrawer}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                {workspaceDrawer.summary?.stageSlug && (
                  <Link
                    to={`/projects/${project.id}/${workspaceDrawer.summary.stageSlug}`}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Open Full Workspace
                  </Link>
                )}
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                  {workspaceDrawer.summary?.approved || 0}/{workspaceDrawer.summary?.total || 0} approved
                </span>
              </div>
            </div>

            <div className="space-y-3 px-5 py-4">
              {workspaceDrawer.loading ? (
                <Loader label="Loading workspace preview..." />
              ) : workspaceDrawer.error ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{workspaceDrawer.error}</div>
              ) : !workspaceDrawer.items.length ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  No rows available for this stage yet.
                </div>
              ) : (
                workspaceDrawer.items.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                        <p className="text-xs text-slate-500">{item.subtitle}</p>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
                      <span>
                        Artist:{" "}
                        {item.assignedUserId ? (
                          <Link to={`/employees?userId=${item.assignedUserId}`} className="font-semibold text-emerald-700 hover:underline">
                            {item.assignedUser}
                          </Link>
                        ) : (
                          <strong className="text-slate-800">{item.assignedUser}</strong>
                        )}
                      </span>
                      <span>
                        Deadline: <strong className="text-slate-800">{formatDate(item.deadline)}</strong>
                      </span>
                      <span>
                        Status: <strong className="text-slate-800">{labelize(item.status)}</strong>
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-lg font-bold text-slate-900">Issue Logs</h4>
          </div>
          {!project.issueLogs?.length ? (
            <p className="text-sm text-slate-500">No issues logged for this project.</p>
          ) : (
            <div className="space-y-3">
              {project.issueLogs.map((issue) => (
                <details key={issue.id} className="rounded-xl border border-slate-200 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                    {labelize(issue.issueType)} · {issue.stageDisplayName || labelize(issue.stageName)}
                  </summary>
                  <div className="mt-2 space-y-1 text-xs text-slate-600">
                    <p>{issue.description}</p>
                    <p>Original deadline: {formatDate(issue.originalDeadline)}</p>
                    <p>New deadline: {formatDate(issue.newDeadline)}</p>
                    <p>Reason: {issue.extensionReason || "-"}</p>
                    <p>Logged by: {issue.loggedBy?.name || "-"}</p>
                    <p>Date: {formatDate(issue.createdAt)}</p>
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-lg font-bold text-slate-900">Characters Used</h4>
              <div className="flex items-center gap-2">
                <select value={characterId} onChange={(event) => setCharacterId(event.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
                  <option value="">Select character</option>
                  {characters
                    .filter((character) => !linkedCharacterIds.has(character.id))
                    .map((character) => (
                      <option key={character.id} value={character.id}>
                        {character.name}
                      </option>
                    ))}
                </select>
                <button onClick={linkCharacter} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                  Link
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {(project.projectCharacters || []).map((entry) => (
                <div key={entry.character.id} className="rounded-xl border border-slate-200 p-2">
                  <p className="text-sm font-semibold text-slate-800">{entry.character.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(entry.character.stages || []).map((stage) => (
                      <span key={stage.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                        {labelize(stage.stageName)}: {labelize(stage.status)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {!project.projectCharacters?.length && <p className="text-sm text-slate-500">No characters linked yet.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h4 className="mb-3 text-lg font-bold text-slate-900">Activity Timeline</h4>
            <div className="max-h-[260px] space-y-2 overflow-auto">
              {(project.activityLogs || []).map((activity) => (
                <div key={activity.id} className="rounded-xl border border-slate-200 p-2">
                  <p className="text-sm text-slate-800">{activity.message}</p>
                  <p className="text-xs text-slate-500">{formatDate(activity.createdAt)} · {activity.actor?.name || "System"}</p>
                </div>
              ))}
              {!project.activityLogs?.length && <p className="text-sm text-slate-500">No recent activity.</p>}
            </div>
          </div>
        </div>
      </section>

      <Modal open={editingProject} onClose={() => setEditingProject(false)} title="Edit Project">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Project Name</label>
            <input
              value={projectForm.name}
              onChange={(event) => setProjectForm((prev) => ({ ...prev, name: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Priority</label>
            <input
              type="number"
              min="1"
              max="20"
              value={projectForm.priority}
              onChange={(event) => setProjectForm((prev) => ({ ...prev, priority: Number(event.target.value) }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Audio Received Date</label>
            <input
              type="date"
              value={projectForm.audioReceivedDate}
              onChange={(event) => setProjectForm((prev) => ({ ...prev, audioReceivedDate: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditingProject(false)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
              Cancel
            </button>
            <button onClick={saveProject} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white" disabled={saving}>
              Save
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={addingStage} onClose={() => setAddingStage(false)} title="Add Stage To Project" size="max-w-md">
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={stageForm.useCustomName}
              onChange={(event) =>
                setStageForm((prev) => ({
                  ...prev,
                  useCustomName: event.target.checked
                }))
              }
            />
            Use a custom stage name
          </label>

          {stageForm.useCustomName ? (
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Custom Stage Name</label>
              <input
                value={stageForm.customName}
                onChange={(event) => setStageForm((prev) => ({ ...prev, customName: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                placeholder="Example: Final QC"
              />
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Stage Template</label>
              <select
                value={stageForm.stageTemplateId}
                onChange={(event) => setStageForm((prev) => ({ ...prev, stageTemplateId: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select stage template</option>
                {stageTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={() => setAddingStage(false)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
              Cancel
            </button>
            <button
              onClick={addStageToProject}
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={saving}
            >
              Add Stage
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
