import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import Loader from "../components/Loader";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import IssueModal from "../components/IssueModal";
import Modal from "../components/Modal";
import ProgressBar from "../components/ProgressBar";
import { formatDate, formatDateInput, labelize } from "../utils/format";
import { STAGE_STATUSES } from "../utils/constants";
import { useToastStore } from "../store/toastStore";

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const id = projectId;
  const navigate = useNavigate();
  const showToast = useToastStore((state) => state.showToast);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [project, setProject] = useState(null);
  const [users, setUsers] = useState([]);
  const [characters, setCharacters] = useState([]);

  const [issueStage, setIssueStage] = useState(null);
  const [rejectStage, setRejectStage] = useState(null);
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [extendStage, setExtendStage] = useState(null);
  const [extendDeadline, setExtendDeadline] = useState("");
  const [extendReason, setExtendReason] = useState("");

  const [editingProject, setEditingProject] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: "", priority: 1, audioReceivedDate: "" });

  const [characterId, setCharacterId] = useState("");

  async function fetchData() {
    setLoading(true);
    try {
      const [projectRes, usersRes, charsRes] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get("/users"),
        api.get("/characters")
      ]);
      setProject(projectRes.data);
      setUsers(usersRes.data.filter((user) => user.role === "EMPLOYEE"));
      setCharacters(charsRes.data);
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
  const overallBadge = useMemo(() => {
    if (!project) return { label: "On Track", tone: "bg-emerald-50 text-emerald-700" };
    if (Number(project.progressPercent) === 100) return { label: "Complete", tone: "bg-sky-50 text-sky-700" };
    const delayed = project.stages?.some((stage) => stage.deadline && new Date(stage.deadline) < new Date() && stage.status !== "APPROVED");
    const hasIssues = project.stages?.some((stage) => stage.status === "ISSUE" || stage.status === "EXTENDED");
    if (hasIssues) return { label: "Has Issues", tone: "bg-amber-50 text-amber-700" };
    if (delayed) return { label: "Delayed", tone: "bg-red-50 text-red-700" };
    return { label: "On Track", tone: "bg-emerald-50 text-emerald-700" };
  }, [project]);

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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1260px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2">Stage</th>
                <th className="py-2">Assigned Artist</th>
                <th className="py-2">Status</th>
                <th className="py-2">Deadline</th>
                <th className="py-2">Submitted / Approved</th>
                <th className="py-2">Notes</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {project.stages.map((stage) => (
                <tr key={stage.id} className="border-b border-slate-100 align-top">
                  <td className="py-2 font-semibold text-slate-800">{labelize(stage.stageName)}</td>
                  <td className="py-2">
                    <select
                      value={stage.assignedUserId || ""}
                      onChange={(event) =>
                        updateStage(stage.id, { assignedUserId: event.target.value ? Number(event.target.value) : null }, "Artist reassigned")
                      }
                      className="w-44 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">Unassigned</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">
                    <div className="space-y-2">
                      <StatusBadge status={stage.status} />
                      <select
                        value={stage.status}
                        onChange={(event) => updateStage(stage.id, { status: event.target.value })}
                        className="w-40 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                      >
                        {STAGE_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {labelize(status)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="py-2">
                    <input
                      type="date"
                      defaultValue={formatDateInput(stage.deadline)}
                      onBlur={(event) => updateStage(stage.id, { deadline: event.target.value || null }, "Deadline updated")}
                      className={`rounded-lg border px-2 py-1.5 text-sm ${
                        stage.isDeadlineMissed ? "border-red-400 bg-red-50 text-red-700" : "border-slate-300"
                      }`}
                    />
                    {stage.isDeadlineMissed && <p className="mt-1 text-xs font-semibold text-red-600">Deadline missed</p>}
                  </td>
                  <td className="py-2 text-xs text-slate-600">
                    <div>Submitted: {formatDate(stage.submittedAt)}</div>
                    <div>Approved: {formatDate(stage.approvedAt)}</div>
                  </td>
                  <td className="py-2">
                    <textarea
                      rows={2}
                      defaultValue={stage.notes || ""}
                      onBlur={(event) => updateStage(stage.id, { notes: event.target.value }, "Notes updated")}
                      className="w-48 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                    />
                  </td>
                  <td className="py-2">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                    {labelize(issue.issueType)} · {labelize(issue.stageName)}
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
    </div>
  );
}
