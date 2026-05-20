import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  NotebookPen,
  Plus,
  Search,
  Trash2
} from "lucide-react";
import api from "../lib/api";
import FlexibleAssignmentField from "./FlexibleAssignmentField";
import Loader from "./Loader";
import Modal from "./Modal";
import StageCommentThread from "./StageCommentThread";
import StatusBadge from "./StatusBadge";
import { formatDateTimeInput, formatDurationMinutes, getDepartmentLabel, initials } from "../utils/format";
import {
  STAGE_STATUSES,
  getStatusOptionLabel,
  isLateStatus
} from "../utils/constants";
import {
  buildDepartmentOptions,
  countUsersByDepartment,
  filterUsersByDepartment,
  getEmploymentBadgeClasses,
  getEmploymentLabel,
  getLeadAssignment,
  normalizeAssignmentList
} from "../utils/assignments";

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
const SHOT_STATUS_THEME = {
  YTS: "border-slate-300 bg-slate-100 text-slate-700",
  IP: "border-sky-500/30 bg-sky-500 text-white",
  TEST: "border-cyan-300 bg-cyan-200 text-cyan-950",
  DONE: "border-emerald-400/30 bg-emerald-500 text-white",
  APPROVED: "border-violet-500/30 bg-violet-500 text-white",
  RTK: "border-orange-500/30 bg-orange-500 text-white",
  FINAL: "border-emerald-700/30 bg-emerald-700 text-white",
  LATE: "border-rose-500/30 bg-rose-500 text-white"
};

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

function currentDateTimeInput() {
  return formatDateTimeInput(new Date());
}

function buildQuickCreateForm() {
  return {
    name: "",
    frameRange: "101-124",
    artistId: "",
    status: "YTS",
    startedAt: currentDateTimeInput()
  };
}

function getStatusTone(status) {
  return SHOT_STATUS_THEME[status] || SHOT_STATUS_THEME.YTS;
}

function StageStatusPill({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusTone(status)}`}>
      {getStatusOptionLabel(status)}
    </span>
  );
}

function WorkspaceStatChip({ label, value, accent = "text-white" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${accent}`}>{value}</p>
    </div>
  );
}

function SectionCard({ eyebrow, title, description, action, children, className = "" }) {
  return (
    <section className={`rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm shadow-slate-200/50 backdrop-blur ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          {eyebrow ? <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p> : null}
          <h4 className="mt-1 text-sm font-semibold text-slate-950 md:text-base">{title}</h4>
          {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function buildCreateForm(defaultDepartment = "") {
  return {
    name: "",
    frameRange: "101-124",
    assignments: [],
    status: "YTS",
    startedAt: currentDateTimeInput(),
    endedAt: "",
    notes: "",
    assignmentDepartment: defaultDepartment,
    assignmentSearch: ""
  };
}

function validateCreateForm(values) {
  const errors = {};
  if (!parseFrameRange(values.frameRange)) errors.frameRange = "Enter a valid frame range like 101-148.";
  if (!normalizeAssignmentList(values.assignments).length) errors.assignments = "Assign at least one artist.";
  if (!String(values.status || "").trim()) errors.status = "Status is required.";
  if (!String(values.startedAt || "").trim()) errors.startedAt = "Start date is required.";
  return errors;
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

function InlineError({ children }) {
  if (!children) return null;
  return <p className="mt-1 text-xs font-medium text-rose-600">{children}</p>;
}

function ensureSingleLead(assignments) {
  let sawLead = false;
  return assignments.map((assignment, index) => {
    const wantsLead = assignment.roleType === "LEAD";
    if (!sawLead && (wantsLead || index === 0)) {
      sawLead = true;
      return { ...assignment, roleType: "LEAD" };
    }
    return { ...assignment, roleType: "SUPPORT" };
  });
}

function resolvePreferredDepartment(users, recommendedDepartment) {
  if (recommendedDepartment && countUsersByDepartment(users, recommendedDepartment) > 0) return recommendedDepartment;
  return buildDepartmentOptions(users, recommendedDepartment)[0] || "";
}

function sortUsersForWorkspace(users, recommendedDepartment) {
  return [...users].sort((left, right) => {
    const leftRecommended = getDepartmentLabel(left) === recommendedDepartment ? 0 : 1;
    const rightRecommended = getDepartmentLabel(right) === recommendedDepartment ? 0 : 1;
    if (leftRecommended !== rightRecommended) return leftRecommended - rightRecommended;
    const leftType = left.employmentType === "INHOUSE" ? 0 : 1;
    const rightType = right.employmentType === "INHOUSE" ? 0 : 1;
    if (leftType !== rightType) return leftType - rightType;
    return String(left.name || "").localeCompare(String(right.name || ""));
  });
}

function CreateArtistCard({ user, assigned, shotCount, disabled, onAssign }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-sm font-bold text-white">
          {initials(user.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
          <p className="truncate text-xs text-slate-500">{getDepartmentLabel(user)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${getEmploymentBadgeClasses(user.employmentType)}`}>
              {user.employmentType === "FREELANCE" ? "FREELANCE" : "IN-HOUSE"}
            </span>
            <span className="text-[11px] text-slate-500">{shotCount} active shot{shotCount === 1 ? "" : "s"}</span>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onAssign(user)}
        disabled={disabled || assigned}
        className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
          assigned
            ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        } disabled:opacity-60`}
      >
        {assigned ? "Assigned" : "Assign"}
      </button>
    </div>
  );
}

function ShotCreateAssignmentPicker({
  users,
  rows,
  recommendedDepartment,
  assignments,
  department,
  search,
  disabled,
  onDepartmentChange,
  onSearchChange,
  onAssignmentsChange
}) {
  const normalizedAssignments = useMemo(() => normalizeAssignmentList(assignments), [assignments]);
  const departmentOptions = useMemo(() => buildDepartmentOptions(users, recommendedDepartment), [users, recommendedDepartment]);
  const activeShotCountByUserId = useMemo(() => {
    const counts = new Map();
    rows.forEach((row) => {
      if (COMPLETE_SHOT_STATUSES.has(row.stageStatus)) return;
      getStageAssignments(row).forEach((assignment) => {
        const employeeId = Number(assignment.employeeId || assignment.employee?.id || 0);
        if (!employeeId) return;
        counts.set(employeeId, (counts.get(employeeId) || 0) + 1);
      });
    });
    return counts;
  }, [rows]);

  const filteredUsers = useMemo(() => {
    const scoped = filterUsersByDepartment(users, department);
    const query = String(search || "").trim().toLowerCase();
    if (!query) return scoped;
    return scoped.filter((user) =>
      [user.name, user.email, getDepartmentLabel(user), getEmploymentLabel(user.employmentType)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [department, search, users]);

  function commit(nextAssignments) {
    onAssignmentsChange?.(ensureSingleLead(nextAssignments));
  }

  function handleAssign(user) {
    const employeeId = Number(user.id);
    if (normalizedAssignments.some((assignment) => assignment.employeeId === employeeId)) return;
    commit([
      ...normalizedAssignments,
      {
        employeeId,
        roleType: normalizedAssignments.length ? "SUPPORT" : "LEAD",
        departmentId: user.departmentId || null,
        employee: user,
        department: user.department || user.departmentInfo || null
      }
    ]);
  }

  function handleRemove(employeeId) {
    commit(normalizedAssignments.filter((assignment) => assignment.employeeId !== employeeId));
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Department</span>
          <select
            value={department}
            onChange={(event) => onDepartmentChange?.(event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            disabled={disabled}
          >
            <option value="">All departments</option>
            {departmentOptions.map((option) => (
              <option key={option} value={option}>
                {option}{option === recommendedDepartment ? " · Recommended" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Search Artist</span>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => onSearchChange?.(event.target.value)}
              placeholder="Search by name, department, email, or type"
              className="w-full rounded-xl border border-slate-300 bg-white px-10 py-2.5 text-sm"
              disabled={disabled}
            />
          </label>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredUsers.length ? (
          filteredUsers.map((user) => (
            <CreateArtistCard
              key={user.id}
              user={user}
              assigned={normalizedAssignments.some((assignment) => assignment.employeeId === Number(user.id))}
              shotCount={activeShotCountByUserId.get(Number(user.id)) || 0}
              disabled={disabled}
              onAssign={handleAssign}
            />
          ))
        ) : (
          <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
            <p>No employees found in this department.</p>
            <button
              type="button"
              onClick={() => onDepartmentChange?.("")}
              className="mt-2 font-semibold text-slate-700 underline-offset-2 hover:underline"
              disabled={disabled}
            >
              Select another department
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Assigned Artists</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {normalizedAssignments.length ? (
            normalizedAssignments.map((assignment) => {
              const employee = assignment.employee || users.find((user) => Number(user.id) === Number(assignment.employeeId)) || null;
              if (!employee) return null;
              return (
                <div key={assignment.employeeId} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                    {initials(employee.name)}
                  </span>
                  <span className="font-semibold text-slate-900">{employee.name}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getEmploymentBadgeClasses(employee.employmentType)}`}>
                    {employee.employmentType === "FREELANCE" ? "FREELANCE" : "IN-HOUSE"}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemove(assignment.employeeId)}
                    className="rounded-full p-1 text-slate-500 transition hover:bg-white hover:text-slate-900"
                    disabled={disabled}
                    aria-label={`Remove ${employee.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-500">
              No artists assigned yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
  const defaultCreateDepartment = useMemo(
    () => resolvePreferredDepartment(activeUsers, recommendedDepartment),
    [activeUsers, recommendedDepartment]
  );

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
  const [createForm, setCreateForm] = useState(() => buildCreateForm(defaultCreateDepartment));
  const [createErrors, setCreateErrors] = useState({});
  const [quickCreateForm, setQuickCreateForm] = useState(() => buildQuickCreateForm());
  const [quickCreateError, setQuickCreateError] = useState("");
  const [createAdvancedOpen, setCreateAdvancedOpen] = useState(false);
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

  const assignableUsers = useMemo(
    () => sortUsersForWorkspace(activeUsers, recommendedDepartment),
    [activeUsers, recommendedDepartment]
  );

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

  useEffect(() => {
    if (!createModalOpen) {
      setCreateForm((prev) => ({
        ...prev,
        assignmentDepartment: prev.assignmentDepartment || defaultCreateDepartment
      }));
    }
  }, [createModalOpen, defaultCreateDepartment]);

  const createSecondsPreview = useMemo(() => {
    const parsed = parseFrameRange(createForm.frameRange);
    return parsed ? `${resolveSeconds(parsed.frameStart, parsed.frameEnd)} sec` : "--";
  }, [createForm.frameRange]);

  const createCanSubmit = useMemo(
    () =>
      Boolean(parseFrameRange(createForm.frameRange)) &&
      Boolean(normalizeAssignmentList(createForm.assignments).length) &&
      Boolean(String(createForm.status || "").trim()) &&
      Boolean(String(createForm.startedAt || "").trim()),
    [createForm.assignments, createForm.frameRange, createForm.startedAt, createForm.status]
  );

  const quickCreateCanSubmit = useMemo(() => {
    return Boolean(parseFrameRange(quickCreateForm.frameRange)) && Boolean(quickCreateForm.artistId) && Boolean(quickCreateForm.status);
  }, [quickCreateForm.artistId, quickCreateForm.frameRange, quickCreateForm.status]);

  function openCreateModal() {
    setCreateErrors({});
    setCreateAdvancedOpen(false);
    setCreateForm((prev) => ({
      ...buildCreateForm(prev.assignmentDepartment || defaultCreateDepartment),
      assignmentDepartment: prev.assignmentDepartment || defaultCreateDepartment
    }));
    setCreateModalOpen(true);
  }

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

  async function submitShotCreate(values, successMessage) {
    const range = parseFrameRange(values.frameRange);
    const { data } = await api.post(`/projects/${projectId}/shots`, {
      frameStart: range.frameStart,
      frameEnd: range.frameEnd,
      name: values.name || undefined,
      status: values.status
    });

    const stageRow = (data.stages || []).find((stage) => String(stage.stageDefinition?.code || "").toUpperCase() === normalizedStageCode);
    if (stageRow) {
      const lead = getLeadAssignment(values.assignments || []);
      await api.put(`/shot-stages/${stageRow.id}`, {
        assignedUserId: lead?.employeeId || null,
        assignments: values.assignments || [],
        status: values.status,
        startedAt: values.startedAt || null,
        startDate: values.startedAt || null,
        endedAt: values.endedAt || null,
        endDate: values.endedAt || null,
        notes: values.notes || null
      });
    }

    showToast("success", successMessage);
    await loadRows(false);
  }

  async function createShot(event) {
    event?.preventDefault?.();
    const nextErrors = validateCreateForm(createForm);
    if (Object.keys(nextErrors).length) {
      setCreateErrors(nextErrors);
      showToast("error", "Complete the required shot fields");
      return;
    }

    setBusy(true);
    try {
      await submitShotCreate(createForm, `${displayStageLabel} shot created`);
      setCreateModalOpen(false);
      setCreateErrors({});
      setCreateAdvancedOpen(false);
      setCreateForm((prev) => ({
        ...buildCreateForm(prev.assignmentDepartment || defaultCreateDepartment),
        assignmentDepartment: prev.assignmentDepartment || defaultCreateDepartment
      }));
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to create shot");
    } finally {
      setBusy(false);
    }
  }

  async function createQuickShot(event) {
    event?.preventDefault?.();
    const artist = activeUsers.find((user) => String(user.id) === String(quickCreateForm.artistId));
    const quickDraft = {
      ...quickCreateForm,
      endedAt: "",
      notes: "",
      assignments: artist
        ? ensureSingleLead([
            {
              employeeId: Number(artist.id),
              roleType: "LEAD",
              departmentId: artist.departmentId || null,
              employee: artist,
              department: artist.department || artist.departmentInfo || null
            }
          ])
        : []
    };
    const nextErrors = validateCreateForm(quickDraft);
    if (Object.keys(nextErrors).length) {
      setQuickCreateError(nextErrors.frameRange || nextErrors.assignments || nextErrors.status || "Complete the quick create fields");
      showToast("error", "Complete the quick create fields");
      return;
    }

    setBusy(true);
    try {
      await submitShotCreate(quickDraft, `${displayStageLabel} shot created`);
      setQuickCreateError("");
      setQuickCreateForm((prev) => ({
        ...buildQuickCreateForm(),
        artistId: prev.artistId,
        status: "YTS",
        startedAt: currentDateTimeInput()
      }));
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
      <section className="sticky top-3 z-20 overflow-hidden rounded-[28px] border border-slate-900/90 bg-slate-950 text-white shadow-2xl shadow-slate-950/20 backdrop-blur">
        <div className="grid gap-4 border-b border-white/10 px-4 py-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)_auto] xl:items-start">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{displayStageLabel} Workspace</p>
            <h2 className="mt-1 truncate text-2xl font-semibold tracking-tight text-white">{overview?.project?.name || "Project"}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <WorkspaceStatChip label="Sequences" value={groupBySequence ? groupedRows.length : "Flat"} accent="text-slate-100" />
              <WorkspaceStatChip label="Shots" value={headerStats.total} accent="text-slate-100" />
              <WorkspaceStatChip label="Artists" value={headerStats.assignedArtists} accent="text-cyan-200" />
              <WorkspaceStatChip label="Timing" value={formatDurationMinutes(headerStats.visibleDuration)} accent="text-amber-200" />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.35fr)_170px_180px_150px]">
            <label className="relative sm:col-span-2 xl:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={filters.search}
                onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value, page: 1 }))}
                placeholder="Search shot, sequence, output, or artist"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-10 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
              />
            </label>
            <select
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value, page: 1 }))}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-sky-400 focus:outline-none"
            >
              <option value="" className="text-slate-900">All statuses</option>
              {STAGE_STATUSES.map((status) => (
                <option key={status} value={status} className="text-slate-900">{getStatusOptionLabel(status)}</option>
              ))}
            </select>
            <select
              value={filters.artistId}
              onChange={(event) => setFilters((prev) => ({ ...prev, artistId: event.target.value, page: 1 }))}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-sky-400 focus:outline-none"
            >
              <option value="" className="text-slate-900">All artists</option>
              {assignableUsers.map((artist) => (
                <option key={artist.id} value={artist.id} className="text-slate-900">
                  {artist.name}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-200">
              <input type="checkbox" checked={filters.overdueOnly} onChange={(event) => setFilters((prev) => ({ ...prev, overdueOnly: event.target.checked, page: 1 }))} className="rounded border-white/20 bg-slate-900" />
              Delayed
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
            <select
              value={filters.sortBy}
              onChange={(event) => setFilters((prev) => ({ ...prev, sortBy: event.target.value, page: 1 }))}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-sky-400 focus:outline-none"
            >
              <option value="shotNumber" className="text-slate-900">Sort: Shot</option>
              <option value="artist" className="text-slate-900">Sort: Artist</option>
              <option value="status" className="text-slate-900">Sort: Status</option>
              <option value="deadline" className="text-slate-900">Sort: Deadline</option>
              <option value="duration" className="text-slate-900">Sort: Duration</option>
              <option value="latest" className="text-slate-900">Sort: Latest</option>
            </select>
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, sortDir: prev.sortDir === "asc" ? "desc" : "asc", page: 1 }))}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-semibold tracking-[0.16em] text-slate-200 transition hover:bg-white/10"
            >
              {String(filters.sortDir).toUpperCase()}
            </button>
            <button
              type="button"
              onClick={() => setGroupBySequence((prev) => !prev)}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
            >
              {groupBySequence ? "Flat View" : "Sequence View"}
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
            >
              <Plus className="h-4 w-4" /> Create Shot
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 px-4 py-3 text-xs text-slate-300">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">24 fps auto-seconds</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{headerStats.inProgress} in progress</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{headerStats.final} final</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{headerStats.overdue} delayed</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{headerStats.completion}% completion</span>
          <button type="button" onClick={() => setSelectedIds(allVisibleSelected ? [] : rowIds)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-semibold text-slate-100 transition hover:bg-white/10">
            {allVisibleSelected ? "Clear Selection" : `Select ${rowIds.length}`}
          </button>
        </div>
      </section>

      {selectedIds.length > 0 ? (
        <section className="rounded-[26px] border border-slate-200 bg-white px-4 py-4 shadow-sm shadow-slate-200/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Bulk shot actions</p>
              <p className="mt-1 text-sm text-slate-600">{selectedIds.length} shot rows selected for assignment, status updates, or deletion.</p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">{selectedIds.length} selected</span>
          </div>
          <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_200px_auto_auto_auto]">
            <FlexibleAssignmentField
              users={activeUsers}
              recommendedDepartment={recommendedDepartment}
              assignments={bulkDraft.assignments}
              onChange={(assignments) => setBulkDraft((prev) => ({ ...prev, assignments }))}
              allowMultiple={false}
              disabled={busy}
            />
            <select value={bulkDraft.status} onChange={(event) => setBulkDraft((prev) => ({ ...prev, status: event.target.value }))} className="rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900" disabled={busy}>
              <option value="">Choose status</option>
              {STAGE_STATUSES.map((status) => (
                <option key={status} value={status}>{getStatusOptionLabel(status)}</option>
              ))}
            </select>
            <button type="button" onClick={applyBulkAssign} disabled={!bulkDraft.assignments?.length || busy} className="rounded-2xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40">Bulk Assign</button>
            <button type="button" onClick={applyBulkStatus} disabled={!bulkDraft.status || busy} className="rounded-2xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40">Bulk Status</button>
            <button type="button" onClick={() => setDeleteState({ open: true, shot: null, many: selectedRows.map((row) => row.shotId) })} disabled={busy} className="rounded-2xl bg-rose-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-40">Bulk Delete</button>
          </div>
        </section>
      ) : null}

      <section className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm shadow-slate-200/40">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Quick create</p>
            <h3 className="text-lg font-semibold text-slate-950">Add shots without opening the modal</h3>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-600">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">Defaults to current time</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">24 fps auto-seconds</span>
          </div>
        </div>

        <form onSubmit={createQuickShot} className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_260px_200px_auto]">
          <input
            value={quickCreateForm.name}
            onChange={(event) => setQuickCreateForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Shot label: INTRO or SEQ_A_SH010"
            className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400"
          />
          <input
            value={quickCreateForm.frameRange}
            onChange={(event) => {
              setQuickCreateForm((prev) => ({ ...prev, frameRange: event.target.value }));
              setQuickCreateError("");
            }}
            placeholder="101-148"
            className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400"
          />
          <select
            value={quickCreateForm.artistId}
            onChange={(event) => {
              setQuickCreateForm((prev) => ({ ...prev, artistId: event.target.value }));
              setQuickCreateError("");
            }}
            className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
          >
            <option value="">Assign lead artist</option>
            {assignableUsers.map((artist) => (
              <option key={artist.id} value={artist.id}>
                {artist.name} · {getDepartmentLabel(artist)} · {artist.employmentType === "FREELANCE" ? "Freelance" : "In-house"}
              </option>
            ))}
          </select>
          <select
            value={quickCreateForm.status}
            onChange={(event) => setQuickCreateForm((prev) => ({ ...prev, status: event.target.value }))}
            className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
          >
            {STAGE_STATUSES.map((status) => (
              <option key={status} value={status}>{getStatusOptionLabel(status)}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!quickCreateCanSubmit || busy}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Create
          </button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
            Auto preview: {parseFrameRange(quickCreateForm.frameRange) ? `${resolveSeconds(parseFrameRange(quickCreateForm.frameRange).frameStart, parseFrameRange(quickCreateForm.frameRange).frameEnd)} sec` : "--"}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">Start date: {formatWorkspaceDateTime(quickCreateForm.startedAt)}</span>
        </div>
        {quickCreateError ? <p className="mt-2 text-xs font-medium text-rose-600">{quickCreateError}</p> : null}
      </section>

      {error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : null}

      {!rows.length && !error ? (
        <section className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-10 text-center shadow-sm shadow-slate-200/30">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/20">
            <Plus className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-950">No {displayStageLabel} shots yet</h3>
          <p className="mt-1 text-sm text-slate-500">Create the first shot row to start staffing, timing, and review for this workspace.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={openCreateModal} className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Open Create Shot</button>
          </div>
        </section>
      ) : null}

      {rows.length ? (
        <>
          {groupedRows.map((group) => {
            const sequenceStats = {
              total: group.rows.length,
              inProgress: group.rows.filter((row) => row.stageStatus === "IP").length,
              final: group.rows.filter((row) => row.stageStatus === "FINAL").length,
              delayed: group.rows.filter((row) => isLateStatus(row.stageStatus, row.deadline || row.endDate)).length,
              duration: group.rows.reduce((sum, row) => sum + (resolveDurationMinutes(row, nowTick) || 0), 0)
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
                        className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-300 bg-slate-50 text-slate-700 transition hover:bg-slate-100"
                        aria-label={collapsed ? `Expand ${group.label}` : `Collapse ${group.label}`}
                      >
                        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    ) : null}
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{groupBySequence ? "Sequence group" : "All shots"}</p>
                      <h3 className="text-xl font-semibold tracking-tight text-slate-950">{group.label}</h3>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">{sequenceStats.total} shots</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">{sequenceStats.inProgress} IP</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">{sequenceStats.final} final</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">{sequenceStats.delayed} delayed</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">{formatDurationMinutes(sequenceStats.duration)}</span>
                  </div>
                </div>

                {!collapsed ? (
                  <div className="space-y-3 p-3">
                    {group.rows.map((row) => {
                      const duration = resolveDurationMinutes(row, nowTick);
                      const commentCount = commentCountsByStageId[row.stageId] || 0;
                      const commentsOpen = Boolean(commentOpenByStageId[row.stageId]);
                      const expanded = Boolean(expandedRows[row.stageId]);
                      const assignmentSummary = summarizeAssignment(row, activeUsers);
                      const historyItems = buildHistoryItems(row);
                      const frameRangeLabel = `${row.shot?.frameStart || 101}-${row.shot?.frameEnd || "--"}`;
                      const seconds = resolveSeconds(row.shot?.frameStart, row.shot?.frameEnd);
                      const frameCount =
                        Number.isFinite(Number(row.shot?.frameStart)) && Number.isFinite(Number(row.shot?.frameEnd))
                          ? Number(row.shot.frameEnd) - Number(row.shot.frameStart) + 1
                          : null;
                      const isDelayed = isLateStatus(row.stageStatus, row.deadline || row.endDate);
                      const leadDepartment = assignmentSummary.leadUser ? getDepartmentLabel(assignmentSummary.leadUser) : "No department";

                      return (
                        <article key={row.id} className="overflow-hidden rounded-[24px] border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50 shadow-sm shadow-slate-200/40 transition duration-200 hover:-translate-y-[1px] hover:shadow-md hover:shadow-slate-200/50">
                          <div className="grid gap-3 px-4 py-4 xl:grid-cols-[minmax(0,2.6fr)_minmax(0,1.55fr)_minmax(0,1.1fr)_auto] xl:items-center">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.includes(row.id)}
                                  onChange={() => setSelectedIds((prev) => (prev.includes(row.id) ? prev.filter((id) => id !== row.id) : [...prev, row.id]))}
                                  className="rounded border-slate-300"
                                />
                                <p className="truncate text-base font-semibold text-slate-950 md:text-lg">{deriveShotLabel(row.shot)}</p>
                                <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                                  {row.sequence || "MAIN"}
                                </span>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700">
                                  #{row.shot?.shotNumber || "--"}
                                </span>
                                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-900">
                                  {frameRangeLabel}
                                </span>
                                <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 font-semibold text-violet-800">
                                  {frameCount ? `${frameCount}f` : "--"} {seconds ? `→ ${seconds}s` : ""}
                                </span>
                                {commentCount > 0 ? (
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-600">
                                    {commentCount} comment{commentCount > 1 ? "s" : ""}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="min-w-0 space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <StageStatusPill status={row.stageStatus} />
                                {isDelayed ? <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">Late</span> : null}
                              </div>
                              {assignmentSummary.leadUser ? (
                                <div className="flex min-w-0 items-center gap-3">
                                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-[11px] font-bold text-white">
                                    {initials(assignmentSummary.leadUser.name || "U")}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-950">{assignmentSummary.leadUser.name}</p>
                                    <p className="truncate text-xs text-slate-500">
                                      {leadDepartment} · {assignmentSummary.supportCount > 0 ? `${assignmentSummary.supportCount} support` : "Lead artist"}
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                  Lead artist not assigned yet.
                                </div>
                              )}
                            </div>

                            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Start</p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">{formatWorkspaceDateTime(resolveStageStart(row))}</p>
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">End</p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">{formatWorkspaceDateTime(resolveStageEnd(row))}</p>
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Time</p>
                                <div className="mt-1"><DurationPill minutes={duration} /></div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                              <button type="button" onClick={() => moveShot(row, -1)} className="rounded-2xl border border-slate-300 p-2 text-slate-600 transition hover:bg-slate-100" disabled={busy} title="Move up">
                                <ArrowUp className="h-4 w-4" />
                              </button>
                              <button type="button" onClick={() => moveShot(row, 1)} className="rounded-2xl border border-slate-300 p-2 text-slate-600 transition hover:bg-slate-100" disabled={busy} title="Move down">
                                <ArrowDown className="h-4 w-4" />
                              </button>
                              <button type="button" onClick={() => duplicateShot(row)} className="rounded-2xl border border-slate-300 p-2 text-slate-600 transition hover:bg-slate-100" disabled={busy} title="Duplicate">
                                <Copy className="h-4 w-4" />
                              </button>
                              <button type="button" onClick={() => setDeleteState({ open: true, shot: row, many: [] })} className="rounded-2xl border border-rose-200 p-2 text-rose-600 transition hover:bg-rose-50" disabled={busy} title="Delete">
                                <Trash2 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleExpanded(row.stageId)}
                                className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                              >
                                {expanded ? "Collapse" : "Expand"}
                                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>

                          {expanded ? (
                            <div className="border-t border-slate-200 bg-slate-50/80 px-4 py-4">
                              <div className="mb-4 flex flex-wrap gap-2">
                                <button type="button" onClick={() => handleStatusChange(row, "TEST", "Shot marked as test")} className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100" disabled={busy}>Mark Test</button>
                                {canReview
                                  ? REVIEW_ACTIONS.map((action) => (
                                      <button
                                        key={action.status}
                                        type="button"
                                        onClick={() => handleStatusChange(row, action.status, `${action.label} applied`)}
                                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:brightness-95 ${
                                          action.status === "APPROVED"
                                            ? "border-violet-200 bg-violet-50 text-violet-700"
                                            : action.status === "FINAL"
                                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                              : "border-orange-200 bg-orange-50 text-orange-700"
                                        }`}
                                        disabled={busy}
                                      >
                                        {action.label}
                                      </button>
                                    ))
                                  : null}
                                <button type="button" onClick={() => toggleComments(row.stageId)} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100">
                                  {commentsOpen ? "Hide Comments" : commentCount > 0 ? `Comments (${commentCount})` : "Comments"}
                                </button>
                                {isEditingStage ? (
                                  <button type="button" onClick={() => openOutputEditor(row.shot)} className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100">
                                    <NotebookPen className="h-4 w-4" /> Output Details
                                  </button>
                                ) : null}
                              </div>

                              <div className="grid gap-4 xl:grid-cols-12">
                                <SectionCard eyebrow="Shot info" title="Frames, labels, and grouping" description="Keep shot naming clean so sequence grouping stays automatic." className="xl:col-span-4">
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Shot Number</p>
                                      <p className="mt-1 text-base font-semibold text-slate-950">#{row.shot?.shotNumber || "--"}</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Sequence</p>
                                      <p className="mt-1 text-base font-semibold text-slate-950">{row.sequence || "MAIN"}</p>
                                    </div>
                                    <label className="space-y-1 md:col-span-2">
                                      <span className="text-sm font-medium text-slate-700">Shot Label</span>
                                      <input
                                        defaultValue={deriveShotLabel(row.shot)}
                                        onBlur={(event) => {
                                          const nextName = event.target.value.trim();
                                          if (nextName && nextName !== deriveShotLabel(row.shot)) {
                                            updateShot(row.shotId, { name: nextName, label: nextName }, { name: nextName, label: nextName }, "Shot label updated");
                                          }
                                        }}
                                        className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900"
                                      />
                                    </label>
                                    <label className="space-y-1 md:col-span-2">
                                      <span className="text-sm font-medium text-slate-700">Frame Range</span>
                                      <input
                                        defaultValue={frameRangeLabel}
                                        onBlur={(event) => handleFrameRangeBlur(row, event.target.value)}
                                        placeholder="101-148"
                                        className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                                      />
                                    </label>
                                    <div className="rounded-2xl border border-violet-200 bg-violet-50 px-3 py-3">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-700">Frame Math</p>
                                      <p className="mt-1 text-base font-semibold text-violet-950">{frameCount ? `${frameCount}f` : "--"} {seconds ? `→ ${seconds}s` : ""}</p>
                                      <p className="mt-1 text-xs text-violet-700">(end - start + 1) / 24</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Live Timing</p>
                                      <div className="mt-1"><DurationPill minutes={duration} /></div>
                                    </div>
                                  </div>
                                </SectionCard>

                                <SectionCard eyebrow="Assignment" title="Lead and support crew" description="Recommended department appears first, but cross-department staffing remains flexible." className="xl:col-span-4">
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
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Lead Artist</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-950">{assignmentSummary.leadUser?.name || "Unassigned"}</p>
                                      </div>
                                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Support</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-950">{assignmentSummary.supportCount}</p>
                                      </div>
                                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Crew Size</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-950">{assignmentSummary.totalArtists}</p>
                                      </div>
                                    </div>
                                  </div>
                                </SectionCard>

                                <SectionCard eyebrow="Timing & Status" title="Production state" description="Status, start, end, and approval flow stay together for fast manager review." className="xl:col-span-4">
                                  <div className="space-y-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <StageStatusPill status={row.stageStatus} />
                                      <DurationPill minutes={duration} />
                                      {isDelayed ? <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">LATE</span> : null}
                                    </div>
                                    <select
                                      value={row.stageStatus || "YTS"}
                                      onChange={(event) => handleStatusChange(row, event.target.value)}
                                      className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
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
                                          className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                                          disabled={busy}
                                        />
                                      </label>
                                      <label className="space-y-1">
                                        <span className="text-sm font-medium text-slate-700">End Date & Time</span>
                                        <input
                                          type="datetime-local"
                                          value={formatDateTimeInput(resolveStageEnd(row))}
                                          onChange={(event) => updateStage(row.stageId, { endedAt: event.target.value || null, endDate: event.target.value || null }, { endedAt: event.target.value || null, endDate: event.target.value || null }, "End time updated")}
                                          className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                                          disabled={busy}
                                        />
                                      </label>
                                    </div>
                                  </div>
                                </SectionCard>

                                <SectionCard eyebrow="Notes & History" title="Manager context" description="Keep blockers, feedback, and production handoff visible without leaving the shot." className={isEditingStage ? "xl:col-span-5" : "xl:col-span-7"}>
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
                                        className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                                        placeholder="Blocking notes, acting direction, handoff details, or technical reminders"
                                      />
                                    </label>
                                    {row.feedback ? (
                                      <div className="rounded-2xl border border-orange-200 bg-orange-50 px-3 py-3 text-sm text-orange-900">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-700">Lead Feedback</p>
                                        <p className="mt-1 whitespace-pre-wrap">{row.feedback}</p>
                                      </div>
                                    ) : null}
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Timeline</p>
                                      {historyItems.length ? (
                                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                                          {historyItems.map((item) => (
                                            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                                              <span className="font-semibold text-slate-950">{item.label}:</span> {formatWorkspaceDateTime(item.value)}
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="mt-2 text-sm text-slate-500">No timeline stamps yet for this shot.</p>
                                      )}
                                    </div>
                                  </div>
                                </SectionCard>

                                <SectionCard
                                  eyebrow="Comments"
                                  title="Review thread"
                                  description="Timestamped discussion stays connected to the shot instead of disappearing into chat."
                                  action={
                                    <button
                                      type="button"
                                      onClick={() => toggleComments(row.stageId)}
                                      className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                                    >
                                      {commentsOpen ? "Hide Thread" : commentCount > 0 ? `Open Thread (${commentCount})` : "Open Thread"}
                                    </button>
                                  }
                                  className={isEditingStage ? "xl:col-span-4" : "xl:col-span-5"}
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
                                  <SectionCard eyebrow="Editorial" title="Audio review and final output" description="Editing keeps shot-level delivery information and audio approval close to the timeline." className="xl:col-span-3">
                                    <div className="space-y-3">
                                      <label className="space-y-1">
                                        <span className="text-sm font-medium text-slate-700">Audio Approval</span>
                                        <select
                                          value={row.shot?.audioWorkflowStatus || row.shot?.audioStatus || ""}
                                          onChange={(event) => updateShot(row.shotId, { audioWorkflowStatus: event.target.value || null }, { audioWorkflowStatus: event.target.value || null }, "Audio review updated")}
                                          className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                                          disabled={busy}
                                        >
                                          <option value="">Audio workflow</option>
                                          {EDITORIAL_AUDIO_STATUS_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                          ))}
                                        </select>
                                      </label>
                                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Final Output</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-950">{row.shot?.finalOutputName || row.shot?.finalOutput || "No output logged"}</p>
                                        <p className="mt-1 text-xs text-slate-500">{row.shot?.finalOutputVersion ? `Version ${row.shot.finalOutputVersion}` : "Version pending"}</p>
                                        {row.shot?.finalOutputApprovalStatus ? <div className="mt-2"><StatusBadge status={row.shot.finalOutputApprovalStatus} /></div> : null}
                                      </div>
                                      <button type="button" onClick={() => openOutputEditor(row.shot)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
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
                ) : null}
              </section>
            );
          })}

          <section className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm shadow-slate-200/30">
            <div className="flex flex-wrap items-center gap-3">
              <span>Page {pagination.page} of {pagination.totalPages}</span>
              <span>{pagination.total} rows</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={filters.pageSize} onChange={(event) => setFilters((prev) => ({ ...prev, pageSize: Number(event.target.value), page: 1 }))} className="rounded-2xl border border-slate-300 px-3 py-2 text-sm">
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option} / page</option>
                ))}
              </select>
              <button type="button" onClick={() => setFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))} disabled={pagination.page <= 1} className="rounded-2xl border border-slate-300 px-3 py-2 font-semibold text-slate-700 disabled:opacity-40">Prev</button>
              <button type="button" onClick={() => setFilters((prev) => ({ ...prev, page: Math.min(pagination.totalPages, prev.page + 1) }))} disabled={pagination.page >= pagination.totalPages} className="rounded-2xl border border-slate-300 px-3 py-2 font-semibold text-slate-700 disabled:opacity-40">Next</button>
            </div>
          </section>
        </>
      ) : null}

      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title={`Create ${displayStageLabel} Shot`} size="max-w-4xl">
        <form onSubmit={createShot}>
          <div className="-mx-6 max-h-[78vh] overflow-y-auto px-6 pb-6">
            <div className="space-y-4">
              <div className="rounded-[28px] border border-slate-900/90 bg-slate-950 px-4 py-4 text-white shadow-lg shadow-slate-950/20">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Shot creation flow</p>
                <h3 className="mt-1 text-xl font-semibold tracking-tight">Set frames, assign crew, and let the pipeline handle timing</h3>
                <p className="mt-2 text-sm text-slate-300">
                  Sequence grouping follows the label automatically. Use naming like <span className="font-semibold text-white">SEQ_A_SH010</span> or <span className="font-semibold text-white">INTRO_SH001</span> when you want shots grouped together.
                </p>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="space-y-4">
                  <section className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                    <div className="mb-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Section 1 — Shot Info</p>
                      <p className="mt-1 text-sm text-slate-500">Keep frame entry compact and let the system handle numbering and seconds math.</p>
                    </div>
                    <div className="grid gap-3">
                      <label className="space-y-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Shot Label</span>
                        <input
                          value={createForm.name}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                          placeholder="INTRO or SEQ_A_SH010"
                          className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                        />
                      </label>
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                        <label className="space-y-1.5">
                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Frame Range *</span>
                          <input
                            value={createForm.frameRange}
                            onChange={(event) => {
                              setCreateForm((prev) => ({ ...prev, frameRange: event.target.value }));
                              setCreateErrors((prev) => ({ ...prev, frameRange: "" }));
                            }}
                            placeholder="101-148"
                            className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                          />
                          <InlineError>{createErrors.frameRange}</InlineError>
                        </label>
                        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">Auto Seconds</p>
                          <p className="mt-1 text-base font-bold text-violet-950">{createSecondsPreview}</p>
                          <p className="mt-1 text-xs text-violet-700">24 fps</p>
                        </div>
                      </div>
                    </div>
                  </section>

                  <div className="rounded-[24px] border border-slate-200 bg-white">
                    <button
                      type="button"
                      onClick={() => setCreateAdvancedOpen((prev) => !prev)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    >
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Section 4 — Advanced Notes</p>
                        <p className="mt-1 text-sm text-slate-500">Keep blockers, handoff details, and production notes out of the way until needed.</p>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-500">
                        {createAdvancedOpen ? <ChevronDown className="h-4 w-4 rotate-180" /> : <ChevronDown className="h-4 w-4" />}
                      </span>
                    </button>
                    {createAdvancedOpen ? (
                      <div className="border-t border-slate-200 px-4 py-4">
                        <label className="space-y-1.5">
                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Notes</span>
                          <textarea
                            value={createForm.notes}
                            onChange={(event) => setCreateForm((prev) => ({ ...prev, notes: event.target.value }))}
                            rows={4}
                            className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                            placeholder="Production blockers, handoff details, review context, or artist comments"
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-4">
                  <section className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                    <div className="mb-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Section 2 — Assignment</p>
                      <p className="mt-1 text-sm text-slate-500">Recommended department artists appear first, but managers can switch departments any time.</p>
                    </div>
                    <ShotCreateAssignmentPicker
                      users={activeUsers}
                      rows={rows}
                      recommendedDepartment={recommendedDepartment}
                      assignments={createForm.assignments}
                      department={createForm.assignmentDepartment}
                      search={createForm.assignmentSearch}
                      onDepartmentChange={(assignmentDepartment) => setCreateForm((prev) => ({ ...prev, assignmentDepartment, assignmentSearch: "" }))}
                      onSearchChange={(assignmentSearch) => setCreateForm((prev) => ({ ...prev, assignmentSearch }))}
                      onAssignmentsChange={(assignments) => {
                        setCreateForm((prev) => ({ ...prev, assignments }));
                        setCreateErrors((prev) => ({ ...prev, assignments: "" }));
                      }}
                      disabled={busy}
                    />
                    <InlineError>{createErrors.assignments}</InlineError>
                  </section>

                  <section className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                    <div className="mb-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Section 3 — Status & Dates</p>
                      <p className="mt-1 text-sm text-slate-500">Start date defaults to the current time so production timing begins immediately.</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="space-y-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status *</span>
                        <select
                          value={createForm.status}
                          onChange={(event) => {
                            setCreateForm((prev) => ({ ...prev, status: event.target.value }));
                            setCreateErrors((prev) => ({ ...prev, status: "" }));
                          }}
                          className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                        >
                          {STAGE_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {getStatusOptionLabel(status)}
                            </option>
                          ))}
                        </select>
                        <InlineError>{createErrors.status}</InlineError>
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Start Date *</span>
                        <input
                          type="datetime-local"
                          value={createForm.startedAt || currentDateTimeInput()}
                          onChange={(event) => {
                            setCreateForm((prev) => ({ ...prev, startedAt: event.target.value || currentDateTimeInput() }));
                            setCreateErrors((prev) => ({ ...prev, startedAt: "" }));
                          }}
                          className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                        />
                        <InlineError>{createErrors.startedAt}</InlineError>
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">End Date</span>
                        <input
                          type="datetime-local"
                          value={createForm.endedAt}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, endedAt: event.target.value }))}
                          className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                        />
                      </label>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>

          <div className="-mx-6 mt-5 sticky bottom-0 border-t border-slate-200 bg-white px-6 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <p className="font-semibold">Required: frame range, assigned artist, status, start date.</p>
                <p className="mt-0.5 text-amber-800">End date and notes stay optional for fast shot entry.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setCreateModalOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !createCanSubmit}
                  className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Create Shot
                </button>
              </div>
            </div>
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
