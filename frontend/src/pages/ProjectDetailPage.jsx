import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import Loader from "../components/Loader";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import IssueModal from "../components/IssueModal";
import Modal from "../components/Modal";
import ProgressBar from "../components/ProgressBar";
import StageCommentThread from "../components/StageCommentThread";
import { formatDate, formatDateInput, getDepartmentLabel, getStageDisplayName, labelize } from "../utils/format";
import { STAGE_STATUSES } from "../utils/constants";
import { useToastStore } from "../store/toastStore";
import { useAuthStore } from "../store/authStore";
import { stageSlugFromCode } from "../utils/stageRouting";

function resolveStageCode(stage) {
  const fromDefinition = stage?.stageDefinition?.code;
  if (fromDefinition) return String(fromDefinition).toUpperCase();

  const stageName = String(stage?.stageName || "").toUpperCase();
  if (stageName === "RENDER") return "RENDERING";
  return stageName || null;
}

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const id = projectId;
  const navigate = useNavigate();
  const showToast = useToastStore((state) => state.showToast);
  const currentUser = useAuthStore((state) => state.user);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [project, setProject] = useState(null);
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [stageTemplates, setStageTemplates] = useState([]);

  const [issueStage, setIssueStage] = useState(null);
  const [rejectStage, setRejectStage] = useState(null);
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [extendStage, setExtendStage] = useState(null);
  const [extendDeadline, setExtendDeadline] = useState("");
  const [extendReason, setExtendReason] = useState("");
  const [artistPickerStageId, setArtistPickerStageId] = useState(null);
  const [artistToAdd, setArtistToAdd] = useState("");
  const [departmentPickerStageId, setDepartmentPickerStageId] = useState(null);
  const [departmentToAssign, setDepartmentToAssign] = useState("");
  const [openCommentsByStage, setOpenCommentsByStage] = useState({});
  const [stageCommentCounts, setStageCommentCounts] = useState({});

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
      const [projectRes, overviewRes, usersRes, charsRes, departmentsRes, stageTemplatesRes] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/projects/${id}/overview`),
        api.get("/users"),
        api.get("/characters"),
        api.get("/departments"),
        api.get("/stage-templates")
      ]);
      setProject(projectRes.data);
      setOverview(overviewRes.data);
      setStageCommentCounts(
        Object.fromEntries((projectRes.data.stages || []).map((stage) => [stage.id, stage._count?.comments || 0]))
      );
      setOpenCommentsByStage((prev) => {
        const next = {};
        for (const stage of projectRes.data.stages || []) {
          if (Object.prototype.hasOwnProperty.call(prev, stage.id)) {
            next[stage.id] = prev[stage.id];
          } else {
            next[stage.id] = stage.status === "REJECTED";
          }
        }
        return next;
      });
      setUsers(usersRes.data.filter((user) => user.role === "EMPLOYEE"));
      setCharacters(charsRes.data);
      setDepartments(departmentsRes.data);
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
        const nameA = String(a.stageName || "");
        const nameB = String(b.stageName || "");
        return nameA.localeCompare(nameB);
      });
  }, [overview]);

  const updateStage = async (stageId, payload, successMessage = "Stage updated") => {
    setSaving(true);
    try {
      await api.put(`/stages/${stageId}`, payload);
      showToast("success", successMessage);
      await fetchData();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to update stage");
    } finally {
      setSaving(false);
    }
  };

  const approveStage = async (stageId) => {
    setSaving(true);
    try {
      await api.post(`/stages/${stageId}/approve`);
      showToast("success", "Stage approved");
      await fetchData();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to approve stage");
    } finally {
      setSaving(false);
    }
  };

  const submitRejection = async () => {
    if (!rejectStage) return;

    setSaving(true);
    try {
      await api.post(`/stages/${rejectStage.id}/reject`, { feedback: rejectFeedback });
      setRejectStage(null);
      setRejectFeedback("");
      showToast("success", "Stage rejected");
      await fetchData();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to reject stage");
    } finally {
      setSaving(false);
    }
  };

  const submitIssue = async (payload) => {
    if (!issueStage) return;
    setSaving(true);
    try {
      await api.post(`/stages/${issueStage.id}/issue`, payload);
      showToast("success", "Issue logged");
      setIssueStage(null);
      await fetchData();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to log issue");
    } finally {
      setSaving(false);
    }
  };

  const submitExtension = async () => {
    if (!extendStage) return;

    setSaving(true);
    try {
      await api.post(`/stages/${extendStage.id}/extend-deadline`, {
        newDeadline: extendDeadline,
        reason: extendReason
      });
      showToast("success", "Deadline extended");
      setExtendStage(null);
      setExtendDeadline("");
      setExtendReason("");
      await fetchData();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to extend deadline");
    } finally {
      setSaving(false);
    }
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

  const assignArtistToStage = async (stageId) => {
    if (!artistToAdd) return;
    setSaving(true);
    try {
      await api.post(`/stages/${stageId}/assign-artist`, { userId: Number(artistToAdd) });
      showToast("success", "Artist assigned");
      setArtistPickerStageId(null);
      setArtistToAdd("");
      await fetchData();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to assign artist");
    } finally {
      setSaving(false);
    }
  };

  const removeArtistFromStage = async (stageId, userId) => {
    const confirmed = window.confirm("Remove this artist from this stage?");
    if (!confirmed) return;
    setSaving(true);
    try {
      await api.delete(`/stages/${stageId}/assign-artist/${userId}`);
      showToast("success", "Artist removed");
      await fetchData();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to remove artist");
    } finally {
      setSaving(false);
    }
  };

  const assignDepartmentToStage = async (stageId) => {
    if (!departmentToAssign) return;
    setSaving(true);
    try {
      const { data } = await api.post(`/stages/${stageId}/assign-department`, { departmentId: departmentToAssign });
      showToast("success", `${data.department} (${data.assigned} artists) assigned`);
      setDepartmentPickerStageId(null);
      setDepartmentToAssign("");
      await fetchData();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to assign department");
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

  const deactivateStage = async (stage) => {
    const confirmed = window.confirm(`Remove ${getStageDisplayName(stage)} from this project's active pipeline?`);
    if (!confirmed) return;
    setSaving(true);
    try {
      await api.delete(`/project-stages/${stage.id}`);
      showToast("success", "Stage removed from active pipeline");
      await fetchData();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to remove stage");
    } finally {
      setSaving(false);
    }
  };

  const moveStage = async (stageId, direction) => {
    const index = orderedStages.findIndex((stage) => stage.id === stageId);
    if (index < 0) return;
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= orderedStages.length) return;

    const current = orderedStages[index];
    const target = orderedStages[swapIndex];

    setSaving(true);
    try {
      await Promise.all([
        api.patch(`/project-stages/${current.id}`, { order: target.order }),
        api.patch(`/project-stages/${target.id}`, { order: current.order })
      ]);
      await fetchData();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to reorder stages");
    } finally {
      setSaving(false);
    }
  };

  const removeDepartmentFromStage = async (stageId, departmentId) => {
    const confirmed = window.confirm("Remove this department and its members from the stage?");
    if (!confirmed) return;
    setSaving(true);
    try {
      await api.delete(`/stages/${stageId}/assign-department/${departmentId}`);
      showToast("success", "Department removed from stage");
      await fetchData();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to remove department");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader label="Loading project detail..." />;
  if (!project) return <EmptyState title="Project not found" description="This project may have been deleted." />;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-slate-900">{project.name}</h3>
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold">Priority {project.priority}</span>
              <span>Audio received: {formatDate(project.audioReceivedDate)}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${overallBadge.tone}`}>{overallBadge.label}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditingProject(true)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Edit Project
            </button>
            <button onClick={deleteProject} className="rounded-xl bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600">
              Delete
            </button>
          </div>
        </div>
        <div className="mt-4 max-w-lg">
          <ProgressBar value={project.progressPercent} />
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
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {stageWorkspaceSummaries.map((summary) => {
              const completion = Number(summary.completionPercent || 0);
              const card = (
                <div className="rounded-xl border border-slate-200 p-3 hover:border-emerald-300 hover:shadow-sm">
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

              if (!summary.stageSlug) {
                return <div key={summary.stageCode}>{card}</div>;
              }

              return (
                <Link key={summary.stageCode} to={`/projects/${project.id}/${summary.stageSlug}`}>
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

        {orderedStages.map((stage, stageIndex) => {
          const assignedUsers = stage.assignments || [];
          const assignedDepartments = stage.departmentAssignments || [];
          const availableUsers = users.filter((user) => !assignedUsers.some((assignment) => assignment.userId === user.id));
          const availableDepartments = departments.filter(
            (department) =>
              !assignedDepartments.some((assignment) => (assignment.departmentId || assignment.department?.id) === department.id)
          );
          const commentCount = stageCommentCounts[stage.id] ?? stage._count?.comments ?? 0;
          const commentsOpen = Boolean(openCommentsByStage[stage.id]);
          const stageCode = resolveStageCode(stage);
          const stageSlug = stageCode ? stageSlugFromCode(stageCode) : null;
          const stageWorkspaceHref = stageSlug ? `/projects/${project.id}/${stageSlug}` : null;

          return (
            <div key={stage.id} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between gap-4">
                <div>
                  {stageWorkspaceHref ? (
                    <Link to={stageWorkspaceHref} className="text-sm font-semibold uppercase tracking-wide text-slate-800 hover:text-emerald-600">
                      {getStageDisplayName(stage)}
                    </Link>
                  ) : (
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-800">{getStageDisplayName(stage)}</p>
                  )}
                  <p className="text-xs text-slate-500">{stage.departmentName || "Department not set"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {stageWorkspaceHref && (
                    <Link
                      to={stageWorkspaceHref}
                      className="rounded border border-emerald-300 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                    >
                      Open Workspace
                    </Link>
                  )}
                  <button
                    onClick={() => moveStage(stage.id, "up")}
                    disabled={stageIndex === 0 || saving}
                    className="rounded border border-slate-300 px-1.5 py-0.5 text-xs disabled:opacity-50"
                    title="Move stage up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveStage(stage.id, "down")}
                    disabled={stageIndex === orderedStages.length - 1 || saving}
                    className="rounded border border-slate-300 px-1.5 py-0.5 text-xs disabled:opacity-50"
                    title="Move stage down"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => deactivateStage(stage)}
                    disabled={saving}
                    className="rounded border border-red-300 px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50"
                    title="Remove stage"
                  >
                    Remove
                  </button>
                  <StatusBadge status={stage.status} />
                  <select
                    value={stage.status}
                    onChange={(event) => updateStage(stage.id, { status: event.target.value })}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  >
                    {STAGE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {labelize(status)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    defaultValue={formatDateInput(stage.deadline)}
                    onBlur={(event) => updateStage(stage.id, { deadline: event.target.value || null }, "Deadline updated")}
                    className={`rounded-lg border px-2 py-1.5 text-sm ${
                      stage.isDeadlineMissed ? "border-red-400 bg-red-50 text-red-700" : "border-slate-300"
                    }`}
                  />
                  <button
                    onClick={() =>
                      setOpenCommentsByStage((prev) => ({
                        ...prev,
                        [stage.id]: !prev[stage.id]
                      }))
                    }
                    className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                      commentsOpen
                        ? "border-sky-300 bg-sky-50 text-sky-700"
                        : "border-slate-300 text-slate-600 hover:border-slate-400"
                    }`}
                  >
                    {commentCount > 0 ? `${commentCount} comment${commentCount > 1 ? "s" : ""}` : "Comment"}
                  </button>
                </div>
              </div>

              <div className="mb-3">
                <p className="mb-2 text-xs font-semibold text-slate-500">ASSIGNED DEPARTMENTS</p>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {assignedDepartments.map((assignment) => {
                    const dept = assignment.department;
                    const memberCount = assignedUsers.filter((artist) => artist.user.departmentId === dept?.id).length;
                    return (
                      <div key={assignment.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dept?.color || "#10B981" }} />
                        <div>
                          <p className="text-sm font-medium text-slate-800">{dept?.name || "Department"}</p>
                          <p className="text-[11px] text-slate-500">{memberCount} members assigned</p>
                        </div>
                        <button
                          onClick={() => removeDepartmentFromStage(stage.id, dept?.id)}
                          className="text-xs text-slate-400 hover:text-red-500"
                          disabled={saving}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}

                  {departmentPickerStageId !== stage.id ? (
                    <button
                      onClick={() => {
                        setDepartmentPickerStageId(stage.id);
                        setDepartmentToAssign("");
                      }}
                      className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-emerald-500 hover:text-emerald-600"
                    >
                      Assign Department
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-2 py-1.5">
                      <select
                        value={departmentToAssign}
                        onChange={(event) => setDepartmentToAssign(event.target.value)}
                        className="rounded border border-slate-300 px-2 py-1 text-sm"
                        autoFocus
                      >
                        <option value="">Select department...</option>
                        {availableDepartments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name} ({department.memberCount} members)
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => assignDepartmentToStage(stage.id)}
                        disabled={!departmentToAssign || saving}
                        className="rounded bg-emerald-500 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        Assign
                      </button>
                      <button
                        onClick={() => {
                          setDepartmentPickerStageId(null);
                          setDepartmentToAssign("");
                        }}
                        className="text-xs text-slate-500"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                <p className="mb-2 text-xs font-semibold text-slate-500">ASSIGNED ARTISTS</p>
                <div className="flex flex-wrap items-center gap-2">
                  {assignedUsers.map((assignment) => (
                    <div key={assignment.userId} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
                        {assignment.user.name.charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{assignment.user.name}</p>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                            assignment.user.employmentType === "FREELANCE"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {assignment.user.employmentType === "FREELANCE" ? "Freelance" : "In-house"}
                        </span>
                      </div>
                      <button
                        onClick={() => removeArtistFromStage(stage.id, assignment.userId)}
                        className="text-xs text-slate-400 hover:text-red-500"
                        title="Remove from stage"
                        disabled={saving}
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  {artistPickerStageId !== stage.id ? (
                    <button
                      onClick={() => {
                        setArtistPickerStageId(stage.id);
                        setArtistToAdd("");
                      }}
                      className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-emerald-500 hover:text-emerald-600"
                    >
                      + Add Artist
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-2 py-1.5">
                      <select
                        value={artistToAdd}
                        onChange={(event) => setArtistToAdd(event.target.value)}
                        className="rounded border border-slate-300 px-2 py-1 text-sm"
                        autoFocus
                      >
                        <option value="">Select artist...</option>
                        {availableUsers.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name} — {user.employmentType === "FREELANCE" ? "Freelance" : "In-house"} — {getDepartmentLabel(user)}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => assignArtistToStage(stage.id)}
                        disabled={!artistToAdd || saving}
                        className="rounded bg-emerald-500 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        Assign
                      </button>
                      <button
                        onClick={() => {
                          setArtistPickerStageId(null);
                          setArtistToAdd("");
                        }}
                        className="text-xs text-slate-500"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="text-xs text-slate-500">
                  <p>Submitted: {formatDate(stage.submittedAt)}</p>
                  <p>Approved: {formatDate(stage.approvedAt)}</p>
                </div>

                <textarea
                  rows={2}
                  defaultValue={stage.notes || ""}
                  onBlur={(event) => updateStage(stage.id, { notes: event.target.value }, "Notes updated")}
                  className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                  placeholder="Notes..."
                />

                <div className="flex flex-col gap-1.5">
                  {stage.status === "SUBMITTED" && (
                    <>
                      <button
                        disabled={saving}
                        onClick={() => approveStage(stage.id)}
                        className="rounded-lg bg-emerald-500 px-2 py-1 text-xs font-semibold text-white"
                      >
                        Approve
                      </button>
                      <button
                        disabled={saving}
                        onClick={() => {
                          setRejectStage(stage);
                          setRejectFeedback(stage.feedback || "");
                        }}
                        className="rounded-lg bg-red-500 px-2 py-1 text-xs font-semibold text-white"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  <button
                    disabled={saving}
                    onClick={() => setIssueStage(stage)}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                  >
                    Log Issue
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => {
                      setExtendStage(stage);
                      setExtendDeadline(formatDateInput(stage.deadline));
                      setExtendReason("");
                    }}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                  >
                    Extend
                  </button>
                </div>
              </div>

              {commentsOpen && (
                <StageCommentThread
                  stageId={stage.id}
                  currentUser={currentUser}
                  isManager
                  onCountChange={(count) =>
                    setStageCommentCounts((prev) => ({
                      ...prev,
                      [stage.id]: count
                    }))
                  }
                />
              )}
            </div>
          );
        })}
      </section>

      <section className="grid grid-cols-2 gap-6">
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

      <IssueModal
        open={Boolean(issueStage)}
        onClose={() => setIssueStage(null)}
        onSubmit={submitIssue}
        stageDeadline={formatDateInput(issueStage?.deadline)}
        loading={saving}
      />

      <Modal open={Boolean(rejectStage)} onClose={() => setRejectStage(null)} title="Reject Stage">
        <div className="space-y-4">
          <textarea
            value={rejectFeedback}
            onChange={(event) => setRejectFeedback(event.target.value)}
            rows={4}
            placeholder="Write rejection feedback"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setRejectStage(null)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
              Cancel
            </button>
            <button
              disabled={!rejectFeedback.trim() || saving}
              onClick={submitRejection}
              className="rounded-xl bg-red-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Reject
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(extendStage)} onClose={() => setExtendStage(null)} title="Extend Deadline">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">New Deadline</label>
            <input
              type="date"
              value={extendDeadline}
              onChange={(event) => setExtendDeadline(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Reason</label>
            <textarea
              rows={3}
              value={extendReason}
              onChange={(event) => setExtendReason(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setExtendStage(null)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
              Cancel
            </button>
            <button
              disabled={!extendDeadline || !extendReason.trim() || saving}
              onClick={submitExtension}
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Save Extension
            </button>
          </div>
        </div>
      </Modal>

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
