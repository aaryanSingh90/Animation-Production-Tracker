import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  MessageCircle,
  NotebookPen,
  Plus,
  Search,
  Trash2
} from "lucide-react";
import api from "../lib/api";
import EmptyState from "./EmptyState";
import FlexibleAssignmentField from "./FlexibleAssignmentField";
import Loader from "./Loader";
import Modal from "./Modal";
import StageCommentThread from "./StageCommentThread";
import StatusBadge from "./StatusBadge";
import { formatDateTimeInput, formatDurationMinutes, initials } from "../utils/format";
import {
  STAGE_STATUSES,
  getStatusMeta,
  getStatusOptionLabel,
  isApprovedStatus,
  isLateStatus,
  isRetakeStatus
} from "../utils/constants";
import { getLeadAssignment, normalizeAssignmentList } from "../utils/assignments";

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const SHOT_STAGE_CODES = ["ANIMATICS", "ANIMATION", "FX", "LIGHTING", "COMPOSITING", "EDITING"];
const COMPLETE_SHOT_STATUSES = new Set(["DONE", "APPROVED", "FINAL"]);
const REVIEW_ACTIONS = [
  { label: "Lead Approve", status: "APPROVED" },
  { label: "Lead Retake", status: "RTK" },
  { label: "Final Approve", status: "FINAL" }
];
const EDITORIAL_AUDIO_STATUS_OPTIONS = [
  { value: "RECV", label: "RECV • Received" },
  { value: "IP", label: "IP • In Progress" },
  { value: "YTS", label: "YTS • Yet To Start" },
  { value: "FINAL", label: "FINAL • Final Approval" },
  { value: "RTK", label: "RTK • Retake" },
  { value: "DONE", label: "DONE • Audio Done Inhouse" },
  { value: "WIP", label: "WIP • Audio In Progress Inhouse" },
  { value: "APPROVED", label: "APPROVED • Audio Approved Inhouse" }
];

function parseFrameRange(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (!match) return null;

  const frameStart = Number(match[1]);
  const frameEnd = Number(match[2]);
  if (!Number.isFinite(frameStart) || !Number.isFinite(frameEnd) || frameEnd < frameStart) return null;

  return { frameStart, frameEnd };
}

function resolveSeconds(frameStart, frameEnd) {
  const start = Number(frameStart);
  const end = Number(frameEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Number(((end - start + 1) / 24).toFixed(2));
}

function resolveStageStart(stage) {
  return stage?.startedAt || stage?.actualStartedAt || stage?.startDate || null;
}

function resolveStageEnd(stage) {
  return stage?.endedAt || stage?.actualDoneAt || stage?.endDate || null;
}

function resolveDurationMinutes(stage, nowTick) {
  const explicit = stage?.durationMinutes ?? stage?.timeConsumedMin;
  if (Number.isFinite(Number(explicit)) && Number(explicit) > 0) return Number(explicit);

  const startedAt = resolveStageStart(stage);
  if (!startedAt) return null;

  const startedAtMs = new Date(startedAt).getTime();
  const endValue = resolveStageEnd(stage);
  const endAtMs = endValue ? new Date(endValue).getTime() : stage?.isTimerRunning ? nowTick : null;
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endAtMs) || endAtMs <= startedAtMs) return null;

  return Math.max(1, Math.round((endAtMs - startedAtMs) / 60000));
}

function getDurationTone(minutes) {
  if (!minutes) return "border-slate-200 bg-slate-100 text-slate-600";
  if (minutes < 60) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (minutes < 480) return "border-sky-200 bg-sky-50 text-sky-700";
  if (minutes < 1440) return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function DurationPill({ minutes }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getDurationTone(minutes)}`}>
      {formatDurationMinutes(minutes)}
    </span>
  );
}

function PriorityPill({ priority }) {
  const level = Number(priority || 3);
  const tone =
    level <= 2
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : level === 3
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-100 text-slate-600";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone}`}>P{level}</span>;
}

function WorkspaceMetric({ label, value, caption, tone = "text-slate-900" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-200/40">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
      {caption ? <p className="mt-1 text-xs text-slate-500">{caption}</p> : null}
    </div>
  );
}

function SectionCard({ eyebrow, title, description, action, children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/30 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{eyebrow}</p> : null}
          <h4 className="mt-1 text-base font-semibold text-slate-900">{title}</h4>
          {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function buildCreateForm() {
  return {
    name: "",
    shotNumber: "",
    frameRange: "101-124",
    assignments: [],
    status: "YTS",
    priority: "3",
    startedAt: "",
    endedAt: "",
    notes: ""
  };
}

function buildOutputForm(shot) {
  return {
    audioWorkflowStatus: shot?.audioWorkflowStatus || shot?.audioStatus || "",
    finalOutputName: shot?.finalOutputName || shot?.finalOutput || "",
    finalOutputVersion: shot?.finalOutputVersion || "",
    finalOutputApprovalStatus: shot?.finalOutputApprovalStatus || "",
    finalOutputDeliveryDate: formatDateTimeInput(shot?.finalOutputDeliveryDate),
    finalOutputClientReview: shot?.finalOutputClientReview || "",
    finalOutputNotes: shot?.finalOutputNotes || ""
  };
}

function deriveShotLabel(shot) {
  return shot?.label || shot?.name || `Shot ${String(shot?.shotNumber || "").padStart(3, "0")}`;
}

function deriveSequence(shot) {
  const token = String(shot?.label || shot?.name || "").trim();
  if (!token) return "MAIN";
  const match = token.match(/^([A-Za-z0-9]+)[_-]SH\d+/i);
  if (match?.[1]) return match[1].toUpperCase();
  if (token.includes("_")) return token.split("_")[0].toUpperCase();
  if (token.includes("-")) return token.split("-")[0].toUpperCase();
  return "MAIN";
}

function mapStageRow(entry) {
  return {
    id: entry.id,
    shotId: entry.shotId,
    stageId: entry.id,
    stageStatus: entry.status,
    assignedUser: entry.assignedUser,
    taskAssignments: entry.taskAssignments || [],
    deadline: entry.deadline,
    submittedAt: entry.submittedAt,
    approvedAt: entry.approvedAt,
    notes: entry.notes,
    feedback: entry.feedback,
    startDate: entry.startDate,
    endDate: entry.endDate,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    durationMinutes: entry.durationMinutes,
    timeConsumedMin: entry.timeConsumedMin,
    isTimerRunning: entry.isTimerRunning,
    shot: entry.shot,
    sequence: deriveSequence(entry.shot),
    raw: entry
  };
}

function getStageAssignments(stage) {
  return stage?.taskAssignments?.length ? stage.taskAssignments : normalizeAssignmentList(stage);
}

function formatWorkspaceDateTime(value) {
  if (!value) return "--";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return "--";
  }
}

function buildHistoryItems(row) {
  return [
    { label: "Started", value: resolveStageStart(row) },
    { label: "Submitted", value: row.submittedAt },
    { label: "Approved", value: row.approvedAt },
    { label: "Completed", value: resolveStageEnd(row) }
  ].filter((item) => item.value);
}

function summarizeAssignment(row, activeUsers) {
  const assignments = getStageAssignments(row);
  const lead = getLeadAssignment(assignments, row.assignedUser);
  const supportCount = Math.max(assignments.length - 1, 0);
  const leadUser = lead?.employee || row.assignedUser || activeUsers.find((user) => user.id === lead?.employeeId) || null;
  return {
    assignments,
    leadUser,
    supportCount,
    totalArtists: assignments.length
  };
}

function buildOptimisticStatusPatch(row, nextStatus) {
  const patch = { stageStatus: nextStatus };
  const now = new Date().toISOString();

  if (nextStatus === "IP") {
    if (!resolveStageStart(row)) {
      patch.startedAt = now;
      patch.startDate = now;
    }
    patch.isTimerRunning = true;
  }

  if (COMPLETE_SHOT_STATUSES.has(nextStatus)) {
    if (!resolveStageEnd(row)) {
      patch.endedAt = now;
      patch.endDate = now;
    }
    patch.isTimerRunning = false;
  }

  return patch;
}

function RowHeaderLabel({ label }) {
  return <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>;
}

export default function ShotPipelineWorkspace({
  projectId,
  overview,
  stageSummary,
  users = [],
  recommendedDepartment,
  showToast,
  stageCode,
  stageLabel,
  currentUser
}) {
  const activeUsers = useMemo(() => users.filter((user) => user?.isActive !== false), [users]);
  const normalizedStageCode = String(stageCode || "").toUpperCase();
  const displayStageLabel = stageLabel || normalizedStageCode;
  const isEditingStage = normalizedStageCode === "EDITING";
  const canReview = currentUser?.role && currentUser.role !== "EMPLOYEE";

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    artistId: "",
    overdueOnly: false,
    sortBy: "shotNumber",
    sortDir: "asc",
    page: 1,
    pageSize: 25
  });
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkDraft, setBulkDraft] = useState({ assignments: [], status: "" });
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState(buildCreateForm());
  const [deleteState, setDeleteState] = useState({ open: false, shot: null, many: [] });
  const [outputEditor, setOutputEditor] = useState({ open: false, shot: null, form: buildOutputForm(null) });
  const [commentOpenByStageId, setCommentOpenByStageId] = useState({});
  const [commentCountsByStageId, setCommentCountsByStageId] = useState({});
  const [expandedRows, setExpandedRows] = useState({});
  const [collapsedSequences, setCollapsedSequences] = useState({});
  const [groupBySequence, setGroupBySequence] = useState(true);
  const [error, setError] = useState("");
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowTick(Date.now()), 30 * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    loadRows();
  }, [projectId, normalizedStageCode]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadRows(false);
    }, 180);
    return () => window.clearTimeout(timeoutId);
  }, [filters.search, filters.status, filters.artistId, filters.overdueOnly, filters.sortBy, filters.sortDir, filters.page, filters.pageSize]);

  async function loadRows(withLoader = true) {
    if (!SHOT_STAGE_CODES.includes(normalizedStageCode)) return;
    if (withLoader) setLoading(true);
    setError("");
    try {
      const { data } = await api.get(`/projects/${projectId}/stages/${normalizedStageCode}/shots`, {
        params: {
          page: filters.page,
          pageSize: filters.pageSize,
          search: filters.search || undefined,
          status: filters.status || undefined,
          artistId: filters.artistId || undefined,
          overdue: filters.overdueOnly || undefined,
          sortBy: filters.sortBy,
          sortDir: filters.sortDir
        }
      });

      setRows((data.items || []).map(mapStageRow));
      setPagination(data.pagination || { page: 1, pageSize: 25, total: 0, totalPages: 1 });
      setSelectedIds((prev) => prev.filter((id) => (data.items || []).some((item) => item.id === id)));
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || `Failed to load ${displayStageLabel.toLowerCase()} workspace`);
      setRows([]);
      setPagination({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
    } finally {
      if (withLoader) setLoading(false);
    }
  }

  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const allVisibleSelected = Boolean(rowIds.length) && rowIds.every((id) => selectedIds.includes(id));
  const selectedRows = useMemo(() => rows.filter((row) => selectedIds.includes(row.id)), [rows, selectedIds]);

  const headerStats = useMemo(() => {
    const totalRows = stageSummary?.total || pagination.total || rows.length;
    const visibleDuration = rows.reduce((sum, row) => sum + (resolveDurationMinutes(row, nowTick) || 0), 0);
    const assignedArtists = new Set(
      rows.flatMap((row) => getStageAssignments(row).map((assignment) => Number(assignment.employeeId || assignment.employee?.id || 0)).filter(Boolean))
    ).size;
    return {
      total: totalRows,
      inProgress: stageSummary?.inProgress || rows.filter((row) => row.stageStatus === "IP").length,
      final: rows.filter((row) => row.stageStatus === "FINAL").length,
      overdue: stageSummary?.delayed || rows.filter((row) => isLateStatus(row.stageStatus, row.deadline || row.endDate)).length,
      completion: stageSummary?.completionPercent || 0,
      assignedArtists,
      visibleDuration
    };
  }, [stageSummary, pagination.total, rows, nowTick]);

  const groupedRows = useMemo(() => {
    if (!groupBySequence) {
      return [{ key: "ALL", label: "All Shots", rows }];
    }

    const groups = new Map();
    for (const row of rows) {
      const sequence = row.sequence || "MAIN";
      if (!groups.has(sequence)) groups.set(sequence, []);
      groups.get(sequence).push(row);
    }

    return Array.from(groups.entries()).map(([key, items]) => ({ key, label: key, rows: items }));
  }, [groupBySequence, rows]);

  function patchStageRow(stageId, patch) {
    setRows((prev) => prev.map((row) => (row.stageId === stageId ? { ...row, ...patch } : row)));
  }

  function patchShot(shotId, patch) {
    setRows((prev) =>
      prev.map((row) =>
        row.shotId === shotId
          ? {
              ...row,
              sequence: deriveSequence({
                ...row.shot,
                ...patch
              }),
              shot: {
                ...row.shot,
                ...patch
              }
            }
          : row
      )
    );
  }

  async function updateStage(stageId, payload, optimisticPatch = null, successMessage = "Shot stage updated") {
    if (optimisticPatch) patchStageRow(stageId, optimisticPatch);
    setBusy(true);
    try {
      const { data } = await api.put(`/shot-stages/${stageId}`, payload);
      patchStageRow(stageId, {
        stageStatus: data.status,
        assignedUser: data.assignedUser || null,
        taskAssignments: data.taskAssignments || [],
        deadline: data.deadline,
        submittedAt: data.submittedAt,
        approvedAt: data.approvedAt,
        notes: data.notes,
        feedback: data.feedback,
        startDate: data.startDate,
        endDate: data.endDate,
        startedAt: data.startedAt,
        endedAt: data.endedAt,
        durationMinutes: data.durationMinutes,
        timeConsumedMin: data.timeConsumedMin,
        isTimerRunning: data.isTimerRunning,
        raw: data
      });
      showToast("success", successMessage);
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to update shot stage");
      await loadRows(false);
    } finally {
      setBusy(false);
    }
  }

  async function updateShot(shotId, payload, optimisticPatch = null, successMessage = "Shot updated") {
    if (optimisticPatch) patchShot(shotId, optimisticPatch);
    setBusy(true);
    try {
      const { data } = await api.put(`/shots/${shotId}`, payload);
      patchShot(shotId, data);
      if (outputEditor.open && outputEditor.shot?.id === shotId) {
        setOutputEditor((prev) => ({ ...prev, shot: data, form: buildOutputForm(data) }));
      }
      showToast("success", successMessage);
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to update shot");
      await loadRows(false);
    } finally {
      setBusy(false);
    }
  }

  async function createShot(event) {
    event?.preventDefault?.();
    const range = parseFrameRange(createForm.frameRange);
    if (!range) {
      showToast("error", "Enter frame range like 101-148");
      return;
    }

    setBusy(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/shots`, {
        shotNumber: createForm.shotNumber ? Number(createForm.shotNumber) : undefined,
        frameStart: range.frameStart,
        frameEnd: range.frameEnd,
        name: createForm.name || undefined,
        priority: Number(createForm.priority || 3),
        status: createForm.status
      });

      const stageRow = (data.stages || []).find((stage) => String(stage.stageDefinition?.code || "").toUpperCase() === normalizedStageCode);
      if (stageRow) {
        const lead = getLeadAssignment(createForm.assignments || []);
        await api.put(`/shot-stages/${stageRow.id}`, {
          assignedUserId: lead?.employeeId || null,
          assignments: createForm.assignments || [],
          status: createForm.status,
          startedAt: createForm.startedAt || null,
          startDate: createForm.startedAt || null,
          endedAt: createForm.endedAt || null,
          endDate: createForm.endedAt || null,
          notes: createForm.notes || null
        });
      }

      showToast("success", `${displayStageLabel} shot created`);
      setCreateModalOpen(false);
      setCreateForm(buildCreateForm());
      await loadRows(false);
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to create shot");
    } finally {
      setBusy(false);
    }
  }

  async function duplicateShot(row) {
    setBusy(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/shots`, {
        frameStart: row.shot?.frameStart || 101,
        frameEnd: row.shot?.frameEnd || 124,
        name: row.shot?.name || row.shot?.label || undefined,
        priority: Number(row.shot?.priority || 3),
        status: row.shot?.status || "YTS"
      });

      const stageRow = (data.stages || []).find((stage) => String(stage.stageDefinition?.code || "").toUpperCase() === normalizedStageCode);
      if (stageRow) {
        const duplicatedAssignments = getStageAssignments(row);
        const lead = getLeadAssignment(duplicatedAssignments);
        await api.put(`/shot-stages/${stageRow.id}`, {
          assignedUserId: lead?.employeeId || null,
          assignments: duplicatedAssignments,
          status: row.stageStatus,
          startedAt: resolveStageStart(row) || null,
          startDate: resolveStageStart(row) || null,
          endedAt: resolveStageEnd(row) || null,
          endDate: resolveStageEnd(row) || null,
          notes: row.notes || null
        });
      }

      await api.put(`/shots/${data.id}`, {
        description: row.shot?.description || null,
        priority: Number(row.shot?.priority || 3),
        audioWorkflowStatus: row.shot?.audioWorkflowStatus || null,
        finalOutputName: row.shot?.finalOutputName || row.shot?.finalOutput || null,
        finalOutput: row.shot?.finalOutputName || row.shot?.finalOutput || null,
        finalOutputVersion: row.shot?.finalOutputVersion || null,
        finalOutputApprovalStatus: row.shot?.finalOutputApprovalStatus || null,
        finalOutputDeliveryDate: row.shot?.finalOutputDeliveryDate || null,
        finalOutputClientReview: row.shot?.finalOutputClientReview || null,
        finalOutputNotes: row.shot?.finalOutputNotes || null
      });

      showToast("success", "Shot duplicated");
      await loadRows(false);
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to duplicate shot");
    } finally {
      setBusy(false);
    }
  }

  async function moveShot(row, delta) {
    const currentIndex = rows.findIndex((item) => item.shotId === row.shotId);
    const target = rows[currentIndex + delta];
    if (currentIndex < 0 || !target) return;

    setBusy(true);
    try {
      await Promise.all([
        api.put(`/shots/${row.shotId}`, { order: target.shot?.order || target.shot?.shotNumber || 1 }),
        api.put(`/shots/${target.shotId}`, { order: row.shot?.order || row.shot?.shotNumber || 1 })
      ]);
      showToast("success", "Shot order updated");
      await loadRows(false);
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to reorder shots");
    } finally {
      setBusy(false);
    }
  }

  async function deleteShots(shotIds) {
    if (!shotIds.length) return;
    setBusy(true);
    try {
      await Promise.all(shotIds.map((shotId) => api.delete(`/shots/${shotId}`)));
      showToast("success", shotIds.length === 1 ? "Shot deleted" : `${shotIds.length} shots deleted`);
      setDeleteState({ open: false, shot: null, many: [] });
      setSelectedIds([]);
      await loadRows(false);
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to delete shots");
    } finally {
      setBusy(false);
    }
  }

  async function applyBulkAssign() {
    if (!bulkDraft.assignments?.length || !selectedIds.length) return;
    const lead = getLeadAssignment(bulkDraft.assignments || []);
    setBusy(true);
    try {
      await api.post(`/shots/bulk-assign`, {
        shotStageIds: selectedIds,
        userId: lead?.employeeId || null
      });
      showToast("success", "Artist assignment updated");
      await loadRows(false);
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to bulk assign shots");
    } finally {
      setBusy(false);
    }
  }

  async function applyBulkStatus() {
    if (!bulkDraft.status || !selectedIds.length) return;
    setBusy(true);
    try {
      await api.post(`/shots/bulk-update`, {
        shotStageIds: selectedIds,
        status: bulkDraft.status
      });
      showToast("success", "Statuses updated");
      await loadRows(false);
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to bulk update status");
    } finally {
      setBusy(false);
    }
  }

  function openOutputEditor(shot) {
    setOutputEditor({ open: true, shot, form: buildOutputForm(shot) });
  }

  async function saveOutputEditor() {
    if (!outputEditor.shot?.id) return;
    await updateShot(
      outputEditor.shot.id,
      {
        audioWorkflowStatus: outputEditor.form.audioWorkflowStatus || null,
        finalOutputName: outputEditor.form.finalOutputName || null,
        finalOutput: outputEditor.form.finalOutputName || null,
        finalOutputVersion: outputEditor.form.finalOutputVersion || null,
        finalOutputApprovalStatus: outputEditor.form.finalOutputApprovalStatus || null,
        finalOutputDeliveryDate: outputEditor.form.finalOutputDeliveryDate || null,
        finalOutputClientReview: outputEditor.form.finalOutputClientReview || null,
        finalOutputNotes: outputEditor.form.finalOutputNotes || null
      },
      {
        audioWorkflowStatus: outputEditor.form.audioWorkflowStatus || null,
        finalOutputName: outputEditor.form.finalOutputName || null,
        finalOutput: outputEditor.form.finalOutputName || null,
        finalOutputVersion: outputEditor.form.finalOutputVersion || null,
        finalOutputApprovalStatus: outputEditor.form.finalOutputApprovalStatus || null,
        finalOutputDeliveryDate: outputEditor.form.finalOutputDeliveryDate || null,
        finalOutputClientReview: outputEditor.form.finalOutputClientReview || null,
        finalOutputNotes: outputEditor.form.finalOutputNotes || null
      },
      "Editorial output updated"
    );
    setOutputEditor((prev) => ({ ...prev, open: false }));
  }

  function toggleExpanded(stageId) {
    setExpandedRows((prev) => ({ ...prev, [stageId]: !prev[stageId] }));
  }

  function toggleComments(stageId) {
    setExpandedRows((prev) => ({ ...prev, [stageId]: true }));
    setCommentOpenByStageId((prev) => ({ ...prev, [stageId]: !prev[stageId] }));
  }

  function toggleSequence(sequence) {
    setCollapsedSequences((prev) => ({ ...prev, [sequence]: !prev[sequence] }));
  }

  async function handleFrameRangeBlur(row, value) {
    const parsed = parseFrameRange(value);
    if (!parsed) {
      showToast("error", "Enter frame range like 101-148");
      await loadRows(false);
      return;
    }

    if (parsed.frameStart === row.shot?.frameStart && parsed.frameEnd === row.shot?.frameEnd) return;

    await updateShot(
      row.shotId,
      { frameStart: parsed.frameStart, frameEnd: parsed.frameEnd },
      { frameStart: parsed.frameStart, frameEnd: parsed.frameEnd },
      "Frame range updated"
    );
  }

  async function handleStatusChange(row, nextStatus, successMessage = "Status updated") {
    await updateStage(row.stageId, { status: nextStatus }, buildOptimisticStatusPatch(row, nextStatus), successMessage);
  }

  if (loading && !rows.length) {
    return <Loader label={`Loading ${displayStageLabel.toLowerCase()} workspace...`} />;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{displayStageLabel} Workspace</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">{overview?.project?.name || "Project"}</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              Shot-first production tracker built for high-volume studio workflows. Frame math, timing, review, and staffing all stay visible without forcing managers through giant cards.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setGroupBySequence((prev) => !prev)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {groupBySequence ? "Flat View" : "Sequence Group"}
            </button>
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
            >
              <Plus className="h-4 w-4" /> Create Shot
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <WorkspaceMetric label="Total Shots" value={headerStats.total} caption={groupBySequence ? `${groupedRows.length} sequence groups` : "Flat workspace view"} />
          <WorkspaceMetric label="In Progress" value={headerStats.inProgress} tone="text-sky-700" />
          <WorkspaceMetric label="Final" value={headerStats.final} tone="text-emerald-700" />
          <WorkspaceMetric label="Delayed" value={headerStats.overdue} tone="text-rose-700" />
          <WorkspaceMetric label="Assigned Artists" value={headerStats.assignedArtists} tone="text-violet-700" />
          <WorkspaceMetric label="Completion" value={`${headerStats.completion}%`} caption={formatDurationMinutes(headerStats.visibleDuration)} tone="text-amber-700" />
        </div>
      </section>

      <section className="space-y-3 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Quick action bar</p>
            <h3 className="text-lg font-bold text-slate-900">Search, filter, assign, and update hundreds of shots quickly</h3>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-600">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">24 fps auto-seconds</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">{pagination.total} total rows</span>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_220px_220px_160px_170px_auto_auto]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value, page: 1 }))}
              placeholder="Search shot label, sequence, or output"
              className="w-full rounded-xl border border-slate-300 px-10 py-2.5 text-sm"
            />
          </label>
          <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value, page: 1 }))} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
            <option value="">All statuses</option>
            {STAGE_STATUSES.map((status) => (
              <option key={status} value={status}>{getStatusOptionLabel(status)}</option>
            ))}
          </select>
          <select value={filters.artistId} onChange={(event) => setFilters((prev) => ({ ...prev, artistId: event.target.value, page: 1 }))} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
            <option value="">All artists</option>
            {activeUsers.map((artist) => (
              <option key={artist.id} value={artist.id}>{artist.name}</option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-700">
            <input type="checkbox" checked={filters.overdueOnly} onChange={(event) => setFilters((prev) => ({ ...prev, overdueOnly: event.target.checked, page: 1 }))} />
            Delayed only
          </label>
          <select value={filters.sortBy} onChange={(event) => setFilters((prev) => ({ ...prev, sortBy: event.target.value, page: 1 }))} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
            <option value="shotNumber">Sort: Shot</option>
            <option value="artist">Sort: Artist</option>
            <option value="status">Sort: Status</option>
            <option value="deadline">Sort: Deadline</option>
            <option value="duration">Sort: Duration</option>
            <option value="latest">Sort: Latest</option>
            <option value="priority">Sort: Priority</option>
          </select>
          <button type="button" onClick={() => setFilters((prev) => ({ ...prev, sortDir: prev.sortDir === "asc" ? "desc" : "asc", page: 1 }))} className="rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-semibold text-slate-700">
            {String(filters.sortDir).toUpperCase()}
          </button>
          <button type="button" onClick={() => setSelectedIds(allVisibleSelected ? [] : rowIds)} className="rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-semibold text-slate-700">
            {allVisibleSelected ? "Clear Selection" : `Select ${rowIds.length}`}
          </button>
        </div>

        {selectedIds.length > 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <span>{selectedIds.length} selected</span>
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold tracking-normal text-slate-700">Bulk actions</span>
            </div>
            <div className="grid gap-2 xl:grid-cols-[minmax(0,1.65fr)_220px_auto_auto_auto]">
              <FlexibleAssignmentField
                users={activeUsers}
                recommendedDepartment={recommendedDepartment}
                assignments={bulkDraft.assignments}
                onChange={(assignments) => setBulkDraft((prev) => ({ ...prev, assignments }))}
                allowMultiple={false}
                disabled={busy}
              />
              <select value={bulkDraft.status} onChange={(event) => setBulkDraft((prev) => ({ ...prev, status: event.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm" disabled={busy}>
                <option value="">Choose status</option>
                {STAGE_STATUSES.map((status) => (
                  <option key={status} value={status}>{getStatusOptionLabel(status)}</option>
                ))}
              </select>
              <button type="button" onClick={applyBulkAssign} disabled={!bulkDraft.assignments?.length || busy} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40">Bulk Assign</button>
              <button type="button" onClick={applyBulkStatus} disabled={!bulkDraft.status || busy} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40">Bulk Status</button>
              <button type="button" onClick={() => setDeleteState({ open: true, shot: null, many: selectedRows.map((row) => row.shotId) })} disabled={busy} className="rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Bulk Delete</button>
            </div>
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : !rows.length ? (
        <EmptyState title={`No ${displayStageLabel} Shots Yet`} description="Start by creating the first production row for this workspace." actionLabel="Create First Shot" onAction={() => setCreateModalOpen(true)} />
      ) : (
        <>
          {groupedRows.map((group) => {
            const sequenceStats = {
              total: group.rows.length,
              inProgress: group.rows.filter((row) => row.stageStatus === "IP").length,
              final: group.rows.filter((row) => row.stageStatus === "FINAL").length,
              delayed: group.rows.filter((row) => isLateStatus(row.stageStatus, row.deadline || row.endDate)).length
            };
            const collapsed = groupBySequence ? Boolean(collapsedSequences[group.key]) : false;

            return (
              <section key={group.key} className="rounded-[28px] border border-slate-200 bg-white shadow-sm shadow-slate-200/40">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
                  <div className="flex items-center gap-3">
                    {groupBySequence ? (
                      <button
                        type="button"
                        onClick={() => toggleSequence(group.key)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50"
                        aria-label={collapsed ? `Expand ${group.label}` : `Collapse ${group.label}`}
                      >
                        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    ) : null}
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{groupBySequence ? "Sequence group" : "Workspace rows"}</p>
                      <h3 className="text-lg font-bold text-slate-900">{group.label}</h3>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">{sequenceStats.total} shots</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">{sequenceStats.inProgress} IP</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">{sequenceStats.final} final</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">{sequenceStats.delayed} delayed</span>
                  </div>
                </div>

                {!collapsed ? (
                  <div className="p-3">
                    <div className="hidden rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-white lg:grid lg:grid-cols-[36px_minmax(0,1.2fr)_140px_100px_170px_220px_150px_150px_120px_auto] lg:gap-3">
                      <RowHeaderLabel label="Select" />
                      <RowHeaderLabel label="Shot No" />
                      <RowHeaderLabel label="Frame Range" />
                      <RowHeaderLabel label="Seconds" />
                      <RowHeaderLabel label="Status" />
                      <RowHeaderLabel label="Artist" />
                      <RowHeaderLabel label="Start Date" />
                      <RowHeaderLabel label="End Date" />
                      <RowHeaderLabel label="Time" />
                      <RowHeaderLabel label="Actions" />
                    </div>

                    <div className="mt-3 space-y-3">
                      {group.rows.map((row) => {
                        const duration = resolveDurationMinutes(row, nowTick);
                        const commentCount = commentCountsByStageId[row.stageId] || 0;
                        const commentsOpen = Boolean(commentOpenByStageId[row.stageId]);
                        const expanded = Boolean(expandedRows[row.stageId]);
                        const statusMeta = getStatusMeta(row.stageStatus);
                        const assignmentSummary = summarizeAssignment(row, activeUsers);
                        const historyItems = buildHistoryItems(row);
                        const frameRangeLabel = `${row.shot?.frameStart || 101}-${row.shot?.frameEnd || "--"}`;
                        const seconds = resolveSeconds(row.shot?.frameStart, row.shot?.frameEnd);
                        const isDelayed = isLateStatus(row.stageStatus, row.deadline || row.endDate);

                        return (
                          <article key={row.id} className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm shadow-slate-200/30" style={{ boxShadow: `inset 4px 0 0 ${statusMeta.border}` }}>
                            <div className="grid gap-3 px-4 py-4 lg:grid-cols-[36px_minmax(0,1.2fr)_140px_100px_170px_220px_150px_150px_120px_auto] lg:items-center">
                              <div className="flex items-center justify-between lg:block">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.includes(row.id)}
                                  onChange={() => setSelectedIds((prev) => (prev.includes(row.id) ? prev.filter((id) => id !== row.id) : [...prev, row.id]))}
                                />
                              </div>

                              <div className="min-w-0 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-base font-bold text-slate-950">{deriveShotLabel(row.shot)}</p>
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{row.sequence || "MAIN"}</span>
                                  <PriorityPill priority={row.shot?.priority} />
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                  <span>Shot #{row.shot?.shotNumber || "--"}</span>
                                  <span>•</span>
                                  <span>{seconds ? `${seconds} sec at 24 fps` : "Frame range pending"}</span>
                                  {commentCount > 0 ? (
                                    <>
                                      <span>•</span>
                                      <span>{commentCount} comment{commentCount > 1 ? "s" : ""}</span>
                                    </>
                                  ) : null}
                                </div>
                              </div>

                              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Frames</p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">{frameRangeLabel}</p>
                              </div>

                              <div className="rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">Seconds</p>
                                <p className="mt-1 text-sm font-semibold text-violet-900">{seconds ? `${seconds} sec` : "--"}</p>
                              </div>

                              <div className="space-y-2">
                                <StatusBadge status={row.stageStatus} />
                                {isDelayed ? <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-700">Delayed</span> : null}
                              </div>

                              <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                                {assignmentSummary.leadUser ? (
                                  <div className="flex items-center gap-3">
                                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-[11px] font-bold text-white">
                                      {initials(assignmentSummary.leadUser.name || "U")}
                                    </span>
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-slate-900">{assignmentSummary.leadUser.name}</p>
                                      <p className="truncate text-[11px] text-slate-500">
                                        {assignmentSummary.supportCount > 0 ? `${assignmentSummary.supportCount} support artist${assignmentSummary.supportCount > 1 ? "s" : ""}` : "Lead artist"}
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <p className="text-sm font-semibold text-amber-700">Unassigned</p>
                                    <p className="text-[11px] text-slate-500">Choose a department and artist in the detail panel.</p>
                                  </div>
                                )}
                              </div>

                              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Start</p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">{formatWorkspaceDateTime(resolveStageStart(row))}</p>
                              </div>

                              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">End</p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">{formatWorkspaceDateTime(resolveStageEnd(row))}</p>
                              </div>

                              <div>
                                <DurationPill minutes={duration} />
                              </div>

                              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                <button type="button" onClick={() => moveShot(row, -1)} className="rounded-xl border border-slate-300 p-2 text-slate-600 hover:bg-slate-50" disabled={busy} title="Move up">
                                  <ArrowUp className="h-4 w-4" />
                                </button>
                                <button type="button" onClick={() => moveShot(row, 1)} className="rounded-xl border border-slate-300 p-2 text-slate-600 hover:bg-slate-50" disabled={busy} title="Move down">
                                  <ArrowDown className="h-4 w-4" />
                                </button>
                                <button type="button" onClick={() => duplicateShot(row)} className="rounded-xl border border-slate-300 p-2 text-slate-600 hover:bg-slate-50" disabled={busy} title="Duplicate">
                                  <Copy className="h-4 w-4" />
                                </button>
                                <button type="button" onClick={() => setDeleteState({ open: true, shot: row, many: [] })} className="rounded-xl border border-rose-200 p-2 text-rose-600 hover:bg-rose-50" disabled={busy} title="Delete">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleExpanded(row.stageId)}
                                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  {expanded ? "Collapse" : "Expand"}
                                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </button>
                              </div>
                            </div>

                            {expanded ? (
                              <div className="border-t border-slate-200 bg-slate-50/80 px-4 py-4">
                                <div className="mb-4 flex flex-wrap gap-2">
                                  <button type="button" onClick={() => handleStatusChange(row, "TEST", "Shot marked as test")} className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-100" disabled={busy}>Mark Test</button>
                                  {canReview
                                    ? REVIEW_ACTIONS.map((action) => (
                                        <button
                                          key={action.status}
                                          type="button"
                                          onClick={() => handleStatusChange(row, action.status, `${action.label} applied`)}
                                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold hover:brightness-95 ${
                                            action.status === "APPROVED"
                                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                              : action.status === "FINAL"
                                                ? "border-amber-200 bg-amber-50 text-amber-800"
                                                : "border-orange-200 bg-orange-50 text-orange-700"
                                          }`}
                                          disabled={busy}
                                        >
                                          {action.label}
                                        </button>
                                      ))
                                    : null}
                                  <button type="button" onClick={() => toggleComments(row.stageId)} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                                    {commentsOpen ? "Hide Comments" : commentCount > 0 ? `Comments (${commentCount})` : "Comments"}
                                  </button>
                                  {isEditingStage ? (
                                    <button type="button" onClick={() => openOutputEditor(row.shot)} className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                                      <NotebookPen className="h-4 w-4" /> Output Details
                                    </button>
                                  ) : null}
                                </div>

                                <div className="grid gap-4 xl:grid-cols-12">
                                  <SectionCard eyebrow="Shot info" title="Frames, numbering, and grouping" description="Use the production label to drive sequence grouping automatically." className="xl:col-span-4">
                                    <div className="grid gap-3 md:grid-cols-2">
                                      <label className="space-y-1 md:col-span-2">
                                        <span className="text-sm font-medium text-slate-700">Shot Number / Label</span>
                                        <input
                                          defaultValue={deriveShotLabel(row.shot)}
                                          onBlur={(event) => {
                                            const nextName = event.target.value.trim();
                                            if (nextName && nextName !== deriveShotLabel(row.shot)) {
                                              updateShot(row.shotId, { name: nextName, label: nextName }, { name: nextName, label: nextName }, "Shot label updated");
                                            }
                                          }}
                                          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-900"
                                        />
                                      </label>
                                      <label className="space-y-1">
                                        <span className="text-sm font-medium text-slate-700">Shot Number</span>
                                        <input
                                          type="number"
                                          min="1"
                                          defaultValue={row.shot?.shotNumber || ""}
                                          onBlur={(event) => {
                                            const nextValue = Number(event.target.value || 0);
                                            if (Number.isInteger(nextValue) && nextValue > 0 && nextValue !== row.shot?.shotNumber) {
                                              updateShot(row.shotId, { shotNumber: nextValue }, { shotNumber: nextValue }, "Shot number updated");
                                            }
                                          }}
                                          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                                        />
                                      </label>
                                      <label className="space-y-1">
                                        <span className="text-sm font-medium text-slate-700">Priority</span>
                                        <select
                                          value={String(row.shot?.priority || 3)}
                                          onChange={(event) => updateShot(row.shotId, { priority: Number(event.target.value) }, { priority: Number(event.target.value) }, "Priority updated")}
                                          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                                        >
                                          {[1, 2, 3, 4, 5].map((priority) => (
                                            <option key={priority} value={priority}>P{priority}</option>
                                          ))}
                                        </select>
                                      </label>
                                      <label className="space-y-1 md:col-span-2">
                                        <span className="text-sm font-medium text-slate-700">Frame Range</span>
                                        <input
                                          defaultValue={frameRangeLabel}
                                          onBlur={(event) => handleFrameRangeBlur(row, event.target.value)}
                                          placeholder="101-148"
                                          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                                        />
                                      </label>
                                      <div className="rounded-2xl border border-violet-200 bg-violet-50 px-3 py-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">Auto Seconds</p>
                                        <p className="mt-1 text-base font-bold text-violet-950">{seconds ? `${seconds} sec` : "--"}</p>
                                        <p className="mt-1 text-xs text-violet-700">(end - start + 1) / 24</p>
                                      </div>
                                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sequence</p>
                                        <p className="mt-1 text-base font-bold text-slate-900">{row.sequence || "MAIN"}</p>
                                        <p className="mt-1 text-xs text-slate-500">Prefix labels like SEQ_A_SH010 to regroup automatically.</p>
                                      </div>
                                    </div>
                                  </SectionCard>

                                  <SectionCard eyebrow="Assignment" title="Flexible staffing" description="Recommended department comes first, but managers can override and assign support artists as needed." className="xl:col-span-4">
                                    <div className="space-y-3">
                                      <FlexibleAssignmentField
                                        users={activeUsers}
                                        recommendedDepartment={recommendedDepartment}
                                        assignments={assignmentSummary.assignments}
                                        onChange={(assignments) => {
                                          const lead = getLeadAssignment(assignments);
                                          updateStage(
                                            row.stageId,
                                            { assignedUserId: lead?.employeeId || null, assignments },
                                            {
                                              assignedUser: lead?.employee || activeUsers.find((user) => user.id === lead?.employeeId) || null,
                                              taskAssignments: assignments.map((assignment) => ({
                                                ...assignment,
                                                employee: activeUsers.find((user) => user.id === assignment.employeeId) || assignment.employee || null
                                              }))
                                            },
                                            lead?.employeeId ? "Artist assignment updated" : "Artists unassigned"
                                          );
                                        }}
                                        disabled={busy}
                                      />
                                      <div className="grid gap-2 md:grid-cols-3">
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Lead Artist</p>
                                          <p className="mt-1 text-sm font-semibold text-slate-900">{assignmentSummary.leadUser?.name || "Unassigned"}</p>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Support Artists</p>
                                          <p className="mt-1 text-sm font-semibold text-slate-900">{assignmentSummary.supportCount}</p>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Total Crew</p>
                                          <p className="mt-1 text-sm font-semibold text-slate-900">{assignmentSummary.totalArtists}</p>
                                        </div>
                                      </div>
                                    </div>
                                  </SectionCard>

                                  <SectionCard eyebrow="Status" title="Timing, delivery, and review state" description="Status drives review flow and timer behavior. Timer begins when a shot moves to IP and stops on done or approval." className="xl:col-span-4">
                                    <div className="space-y-3">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <StatusBadge status={row.stageStatus} />
                                        <DurationPill minutes={duration} />
                                        {isDelayed ? <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-700">LATE</span> : null}
                                      </div>
                                      <select
                                        value={row.stageStatus || "YTS"}
                                        onChange={(event) => handleStatusChange(row, event.target.value)}
                                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                                        disabled={busy}
                                      >
                                        {STAGE_STATUSES.map((status) => (
                                          <option key={status} value={status}>{getStatusOptionLabel(status)}</option>
                                        ))}
                                      </select>
                                      <div className="grid gap-3 md:grid-cols-2">
                                        <label className="space-y-1">
                                          <span className="text-sm font-medium text-slate-700">Start Date & Time</span>
                                          <input
                                            type="datetime-local"
                                            value={formatDateTimeInput(resolveStageStart(row))}
                                            onChange={(event) => updateStage(row.stageId, { startedAt: event.target.value || null, startDate: event.target.value || null }, { startedAt: event.target.value || null, startDate: event.target.value || null }, "Start time updated")}
                                            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                                            disabled={busy}
                                          />
                                        </label>
                                        <label className="space-y-1">
                                          <span className="text-sm font-medium text-slate-700">End Date & Time</span>
                                          <input
                                            type="datetime-local"
                                            value={formatDateTimeInput(resolveStageEnd(row))}
                                            onChange={(event) => updateStage(row.stageId, { endedAt: event.target.value || null, endDate: event.target.value || null }, { endedAt: event.target.value || null, endDate: event.target.value || null }, "End time updated")}
                                            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                                            disabled={busy}
                                          />
                                        </label>
                                      </div>
                                      <div className="grid gap-2 md:grid-cols-3">
                                        <button type="button" onClick={() => handleStatusChange(row, "IP", "Shot moved to In Progress")} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100" disabled={busy}>IP</button>
                                        <button type="button" onClick={() => handleStatusChange(row, "DONE", "Shot marked done")} className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100" disabled={busy}>Done</button>
                                        <button type="button" onClick={() => handleStatusChange(row, "TEST", "Test shot submitted")} className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800 hover:bg-cyan-100" disabled={busy}>Test Shot</button>
                                      </div>
                                    </div>
                                  </SectionCard>

                                  <SectionCard eyebrow="Review" title="Notes, feedback, and history" description="Keep manager notes close to the row so artists and leads have a clean handoff trail." className="xl:col-span-5">
                                    <div className="space-y-3">
                                      <label className="space-y-1">
                                        <span className="text-sm font-medium text-slate-700">Notes</span>
                                        <textarea
                                          defaultValue={row.notes || ""}
                                          rows={4}
                                          onBlur={(event) => {
                                            const nextValue = event.target.value.trim();
                                            if ((row.notes || "") !== nextValue) {
                                              updateStage(row.stageId, { notes: nextValue || null }, { notes: nextValue || null }, "Notes updated");
                                            }
                                          }}
                                          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                                          placeholder="Blocking notes, acting direction, technical reminders, or delivery instructions"
                                        />
                                      </label>
                                      {row.feedback ? (
                                        <div className="rounded-2xl border border-orange-200 bg-orange-50 px-3 py-3 text-sm text-orange-900">
                                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-600">Lead Feedback</p>
                                          <p className="mt-1 whitespace-pre-wrap">{row.feedback}</p>
                                        </div>
                                      ) : null}
                                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">History</p>
                                        {historyItems.length ? (
                                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                                            {historyItems.map((item) => (
                                              <div key={item.label} className="rounded-xl bg-white px-3 py-2 text-sm text-slate-700">
                                                <span className="font-semibold text-slate-900">{item.label}:</span> {formatWorkspaceDateTime(item.value)}
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <p className="mt-2 text-sm text-slate-500">No history stamped yet for this shot.</p>
                                        )}
                                      </div>
                                    </div>
                                  </SectionCard>

                                  <SectionCard
                                    eyebrow="Comments"
                                    title="Review thread"
                                    description="Timestamped comments stay inside the shot row so production feedback doesn’t disappear into chat tools."
                                    action={
                                      <button
                                        type="button"
                                        onClick={() => toggleComments(row.stageId)}
                                        className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                      >
                                        {commentsOpen ? "Hide Thread" : commentCount > 0 ? `Open Thread (${commentCount})` : "Open Thread"}
                                      </button>
                                    }
                                    className={isEditingStage ? "xl:col-span-4" : "xl:col-span-7"}
                                  >
                                    {commentsOpen ? (
                                      <StageCommentThread
                                        stageId={row.stageId}
                                        currentUser={currentUser}
                                        isManager
                                        resource="shot"
                                        onCountChange={(count) => setCommentCountsByStageId((prev) => ({ ...prev, [row.stageId]: count }))}
                                      />
                                    ) : (
                                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                                        Open the thread to review manager feedback, artist replies, and revision notes without leaving the workspace.
                                      </div>
                                    )}
                                  </SectionCard>

                                  {isEditingStage ? (
                                    <SectionCard eyebrow="Editorial" title="Audio review and final output" description="Editing keeps shot-level audio approval and final delivery metadata together." className="xl:col-span-3">
                                      <div className="space-y-3">
                                        <label className="space-y-1">
                                          <span className="text-sm font-medium text-slate-700">Audio Approval</span>
                                          <select
                                            value={row.shot?.audioWorkflowStatus || row.shot?.audioStatus || ""}
                                            onChange={(event) => updateShot(row.shotId, { audioWorkflowStatus: event.target.value || null }, { audioWorkflowStatus: event.target.value || null }, "Audio review updated")}
                                            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                                            disabled={busy}
                                          >
                                            <option value="">Audio workflow</option>
                                            {EDITORIAL_AUDIO_STATUS_OPTIONS.map((option) => (
                                              <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                          </select>
                                        </label>
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Final Output</p>
                                          <p className="mt-1 text-sm font-semibold text-slate-900">{row.shot?.finalOutputName || row.shot?.finalOutput || "No output logged"}</p>
                                          <p className="mt-1 text-xs text-slate-500">{row.shot?.finalOutputVersion ? `Version ${row.shot.finalOutputVersion}` : "Version pending"}</p>
                                          {row.shot?.finalOutputApprovalStatus ? <div className="mt-2"><StatusBadge status={row.shot.finalOutputApprovalStatus} /></div> : null}
                                        </div>
                                        <button type="button" onClick={() => openOutputEditor(row.shot)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                          <NotebookPen className="h-4 w-4" /> Manage Output
                                        </button>
                                      </div>
                                    </SectionCard>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })}

          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm shadow-slate-200/30">
            <div className="flex items-center gap-3">
              <span>Page {pagination.page} of {pagination.totalPages}</span>
              <span>{pagination.total} rows</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={filters.pageSize} onChange={(event) => setFilters((prev) => ({ ...prev, pageSize: Number(event.target.value), page: 1 }))} className="rounded-lg border border-slate-300 px-2.5 py-2 text-sm">
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option} / page</option>
                ))}
              </select>
              <button type="button" onClick={() => setFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))} disabled={pagination.page <= 1} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-700 disabled:opacity-40">Prev</button>
              <button type="button" onClick={() => setFilters((prev) => ({ ...prev, page: Math.min(pagination.totalPages, prev.page + 1) }))} disabled={pagination.page >= pagination.totalPages} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-700 disabled:opacity-40">Next</button>
            </div>
          </section>
        </>
      )}

      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title={`Create ${displayStageLabel} Shot`} size="max-w-2xl">
        <form onSubmit={createShot} className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Sequence grouping is driven by the shot label. Use naming like <span className="font-semibold text-slate-900">SEQ_A_SH010</span> or <span className="font-semibold text-slate-900">INTRO_SH001</span> for clean production lanes.
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Shot Label</span>
              <input value={createForm.name} onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="SEQ_A_SH010" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Shot Number</span>
              <input type="number" min="1" value={createForm.shotNumber} onChange={(event) => setCreateForm((prev) => ({ ...prev, shotNumber: event.target.value }))} placeholder="Optional" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Frame Range</span>
              <input value={createForm.frameRange} onChange={(event) => setCreateForm((prev) => ({ ...prev, frameRange: event.target.value }))} placeholder="101-148" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-700">
              Seconds preview: <strong className="text-violet-950">{(() => {
                const parsed = parseFrameRange(createForm.frameRange);
                return parsed ? `${resolveSeconds(parsed.frameStart, parsed.frameEnd)} sec` : "--";
              })()}</strong>
            </div>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Assignment</span>
              <FlexibleAssignmentField
                users={activeUsers}
                recommendedDepartment={recommendedDepartment}
                assignments={createForm.assignments}
                onChange={(assignments) => setCreateForm((prev) => ({ ...prev, assignments }))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Status</span>
              <select value={createForm.status} onChange={(event) => setCreateForm((prev) => ({ ...prev, status: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                {STAGE_STATUSES.map((status) => (
                  <option key={status} value={status}>{getStatusOptionLabel(status)}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Priority</span>
              <select value={createForm.priority} onChange={(event) => setCreateForm((prev) => ({ ...prev, priority: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                {[1, 2, 3, 4, 5].map((priority) => <option key={priority} value={priority}>P{priority}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Start Date & Time</span>
              <input type="datetime-local" value={createForm.startedAt} onChange={(event) => setCreateForm((prev) => ({ ...prev, startedAt: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">End Date & Time</span>
              <input type="datetime-local" value={createForm.endedAt} onChange={(event) => setCreateForm((prev) => ({ ...prev, endedAt: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Notes</span>
            <textarea value={createForm.notes} onChange={(event) => setCreateForm((prev) => ({ ...prev, notes: event.target.value }))} rows={3} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Production notes, blockers, acting notes, or handoff details" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreateModalOpen(false)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button>
            <button type="submit" disabled={busy} className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Create Shot</button>
          </div>
        </form>
      </Modal>

      <Modal open={outputEditor.open} onClose={() => setOutputEditor((prev) => ({ ...prev, open: false }))} title="Editorial Output Details" size="max-w-2xl">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">{deriveShotLabel(outputEditor.shot)}</p>
            <p className="mt-1 text-xs text-slate-500">Manage audio review and final delivery data for this shot.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Audio Approval Status</span>
              <select value={outputEditor.form.audioWorkflowStatus} onChange={(event) => setOutputEditor((prev) => ({ ...prev, form: { ...prev.form, audioWorkflowStatus: event.target.value } }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option value="">None</option>
                {EDITORIAL_AUDIO_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Output Name</span>
              <input value={outputEditor.form.finalOutputName} onChange={(event) => setOutputEditor((prev) => ({ ...prev, form: { ...prev.form, finalOutputName: event.target.value } }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Final cut / delivery file" />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Version</span>
              <input value={outputEditor.form.finalOutputVersion} onChange={(event) => setOutputEditor((prev) => ({ ...prev, form: { ...prev.form, finalOutputVersion: event.target.value } }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="v03" />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Approval Status</span>
              <select value={outputEditor.form.finalOutputApprovalStatus} onChange={(event) => setOutputEditor((prev) => ({ ...prev, form: { ...prev.form, finalOutputApprovalStatus: event.target.value } }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option value="">None</option>
                {STAGE_STATUSES.map((status) => (
                  <option key={status} value={status}>{getStatusOptionLabel(status)}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Delivery Date</span>
              <input type="datetime-local" value={outputEditor.form.finalOutputDeliveryDate} onChange={(event) => setOutputEditor((prev) => ({ ...prev, form: { ...prev.form, finalOutputDeliveryDate: event.target.value } }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Client Review</span>
              <textarea value={outputEditor.form.finalOutputClientReview} onChange={(event) => setOutputEditor((prev) => ({ ...prev, form: { ...prev.form, finalOutputClientReview: event.target.value } }))} rows={2} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Client review summary" />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Notes</span>
              <textarea value={outputEditor.form.finalOutputNotes} onChange={(event) => setOutputEditor((prev) => ({ ...prev, form: { ...prev.form, finalOutputNotes: event.target.value } }))} rows={3} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Delivery, export, or editorial notes" />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOutputEditor((prev) => ({ ...prev, open: false }))} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button>
            <button type="button" onClick={saveOutputEditor} disabled={busy} className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Save Output</button>
          </div>
        </div>
      </Modal>

      <Modal open={deleteState.open} onClose={() => setDeleteState({ open: false, shot: null, many: [] })} title="Delete Shot" size="max-w-md">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {deleteState.many.length > 0
              ? `Delete ${deleteState.many.length} selected shots? This removes the shot from all shot-based stages.`
              : `Delete ${deleteState.shot ? deriveShotLabel(deleteState.shot.shot) : "this shot"}? This removes the shot from all shot-based stages.`}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDeleteState({ open: false, shot: null, many: [] })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button>
            <button type="button" onClick={() => deleteShots(deleteState.many.length ? deleteState.many : [deleteState.shot?.shotId].filter(Boolean))} disabled={busy} className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Delete</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
