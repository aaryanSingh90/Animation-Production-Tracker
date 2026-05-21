import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  NotebookPen,
  Pencil,
  Plus,
  Search,
  Trash2,
  X
} from "lucide-react";
import api from "../lib/api";
import FlexibleAssignmentField from "./FlexibleAssignmentField";
import Loader from "./Loader";
import Modal from "./Modal";
import StageCommentThread from "./StageCommentThread";
import useEmployeeAvailabilitySummaries from "../hooks/useEmployeeAvailabilitySummaries";
import { EmployeeAvailabilityHoverCard } from "./EmployeeAvailabilityHoverCard";
import { formatDateTimeInput, formatDurationMinutes, getDepartmentLabel, initials } from "../utils/format";
import {
  STAGE_STATUSES,
  getStatusMeta,
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
  normalizeAssignmentList,
  sortUsersBySmartAvailability
} from "../utils/assignments";
import { formatEmployeeAvailabilityLabel, getEmployeeAvailabilityMeta, getOverloadWarning } from "../utils/employeeAvailability";

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const SHOT_STAGE_CODES = ["ANIMATICS", "ANIMATION", "FX", "LIGHTING", "COMPOSITING", "EDITING"];
const COMPLETE_SHOT_STATUSES = new Set(["DONE", "APPROVED", "FINAL"]);
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
const DEFAULT_FRAME_RANGE = "101-124";
const HEADER_COLLAPSE_SCROLL_Y = 96;
const ENABLE_PIPELINE_DEBUG = Boolean(import.meta?.env?.DEV);

function debugPipeline(context, payload) {
  if (!ENABLE_PIPELINE_DEBUG) return;
  console.log(`[pipeline:${context}]`, payload);
}

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .replace(/[-\s]+/g, "_")
    .toUpperCase();
}

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

function useDebouncedValue(value, delayMs = 180) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [value, delayMs]);
  return debounced;
}

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
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getDurationTone(minutes)}`}>
      {formatDurationMinutes(minutes)}
    </span>
  );
}

function resolveCreateFrameRange(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return parseFrameRange(DEFAULT_FRAME_RANGE);
  return parseFrameRange(normalized);
}

function buildQuickCreateForm() {
  return {
    name: "",
    frameRange: DEFAULT_FRAME_RANGE,
    department: "",
    artistSearch: "",
    artistId: "",
    status: "YTS",
    startedAt: todayDateInput(),
    endedAt: ""
  };
}

function getStatusTone(status) {
  return SHOT_STATUS_THEME[status] || SHOT_STATUS_THEME.YTS;
}

function StageStatusPill({ status }) {
  const meta = getStatusMeta(status);
  return (
    <span
      title={getStatusOptionLabel(status)}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${getStatusTone(status)}`}
    >
      {meta.shortKey || status || "YTS"}
    </span>
  );
}

function ToolbarStat({ label, value, tone = "text-slate-100" }) {
  return (
    <div className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 backdrop-blur">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className={`mt-0.5 text-xs font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

function buildCreateForm(defaultDepartment = "") {
  return {
    name: "",
    frameRange: DEFAULT_FRAME_RANGE,
    assignments: [],
    status: "YTS",
    startedAt: todayDateInput(),
    endedAt: "",
    notes: "",
    assignmentDepartment: defaultDepartment,
    assignmentSearch: ""
  };
}

function validateCreateForm(values) {
  const errors = {};
  if (!String(values.name || "").trim()) errors.name = "Shot label is required.";
  if (!resolveCreateFrameRange(values.frameRange)) errors.frameRange = "Enter a valid frame range like 101-148.";
  if (!normalizeAssignmentList(values.assignments).length) errors.assignments = "Assign at least one artist.";
  if (!String(values.status || "").trim()) errors.status = "Status is required.";
  if (!String(values.startedAt || "").trim()) errors.startedAt = "Start date is required.";
  return errors;
}

function normalizeDateInput(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function toShotStageAssignments(assignments = [], usersById = new Map()) {
  const normalizedAssignments = normalizeAssignmentList(assignments);
  if (!normalizedAssignments.length) return [];

  return ensureSingleLead(
    normalizedAssignments
      .map((assignment) => {
        const employeeId = Number(assignment.employeeId || assignment.employee?.id || 0);
        if (!employeeId) return null;
        const employee = assignment.employee || usersById.get(employeeId) || null;
        const departmentId = assignment.departmentId || employee?.departmentId || null;
        return {
          employeeId,
          roleType: assignment.roleType === "SUPPORT" ? "SUPPORT" : "LEAD",
          ...(departmentId ? { departmentId: String(departmentId) } : {})
        };
      })
      .filter(Boolean)
  );
}

function buildShotStagePayload(values, usersById = new Map()) {
  const payload = {};

  if ("status" in values) {
    const status = String(values.status || "").trim().toUpperCase();
    if (STAGE_STATUSES.includes(status)) payload.status = status;
  }

  if ("assignments" in values || "assignedUserId" in values) {
    const assignments = toShotStageAssignments(values.assignments || [], usersById);
    const lead = getLeadAssignment(assignments);
    if (Array.isArray(values.assignments)) payload.assignments = assignments;
    payload.assignedUserId = Number(values.assignedUserId || 0) || lead?.employeeId || null;
  }

  if ("startedAt" in values || "startDate" in values) {
    const startedAt = normalizeDateInput(values.startedAt ?? values.startDate);
    payload.startedAt = startedAt;
    payload.startDate = startedAt;
  }

  if ("endedAt" in values || "endDate" in values) {
    const endedAt = normalizeDateInput(values.endedAt ?? values.endDate);
    payload.endedAt = endedAt;
    payload.endDate = endedAt;
  }

  if ("notes" in values) {
    const notes = String(values.notes || "").trim();
    payload.notes = notes || null;
  }

  return payload;
}

function validateShotStagePayload({ shotLabel, projectId, stageId, payload }) {
  const errors = {};
  if (!String(shotLabel || "").trim()) errors.name = "Shot label is required";
  if (!projectId) errors.projectId = "Project ID is required";
  if (!stageId) errors.stageId = "Stage ID is required";
  if (!payload?.status || !STAGE_STATUSES.includes(payload.status)) errors.status = "Valid status is required";
  if (!payload?.startedAt) errors.startedAt = "Start date is required";
  if (!Array.isArray(payload?.assignments) || !payload.assignments.length) errors.assignments = "Lead artist is required";
  if (payload?.assignments?.some((assignment) => !Number(assignment?.employeeId || 0))) errors.assignments = "Valid artist assignment is required";
  return errors;
}

function logShotPayload(label, payload) {
  console.log(`[shot-pipeline] ${label}`, payload);
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

function rowMatchesFilters(row, filters) {
  const searchNeedle = String(filters?.search || "").trim().toLowerCase();
  const normalizedStatusFilter = normalizeToken(filters?.status || "");
  const artistFilterId = Number(filters?.artistId || 0);
  const overdueOnly = Boolean(filters?.overdueOnly);
  const rowLead = getLeadAssignment(getStageAssignments(row), row.assignedUser);
  const rowLeadId = Number(rowLead?.employeeId || row.assignedUser?.id || 0);
  const rowSearchText = [
    deriveShotLabel(row.shot),
    row.shot?.name,
    row.shot?.label,
    row.sequence,
    row.notes,
    row.assignedUser?.name
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (searchNeedle && !rowSearchText.includes(searchNeedle)) return false;
  if (normalizedStatusFilter && normalizeToken(row.stageStatus) !== normalizedStatusFilter) return false;
  if (artistFilterId && rowLeadId !== artistFilterId) return false;
  if (overdueOnly && !isLateStatus(row.stageStatus, row.deadline || row.endDate)) return false;
  return true;
}

function mapStageRow(entry) {
  const normalizedStatus = normalizeToken(entry.status || entry.stageStatus || "YTS") || "YTS";
  const normalizedShot = entry.shot
    ? {
        ...entry.shot,
        label: entry.shot.label || entry.shot.name || entry.shot.shotLabel || "",
        name: entry.shot.name || entry.shot.label || entry.shot.shotLabel || ""
      }
    : null;
  return {
    id: entry.id,
    shotId: entry.shotId,
    stageId: entry.id,
    stageStatus: STAGE_STATUSES.includes(normalizedStatus) ? normalizedStatus : "YTS",
    assignedUser: entry.assignedUser,
    taskAssignments: entry.taskAssignments || entry.assignments || [],
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
    shot: normalizedShot,
    sequence: deriveSequence(normalizedShot),
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

function formatWorkspaceShortDate(value) {
  if (!value) return "--";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short"
    }).format(new Date(value));
  } catch {
    return "--";
  }
}

function buildShotId(shotNumber) {
  if (!Number.isFinite(Number(shotNumber))) return "SH_---";
  return `SH_${String(Number(shotNumber)).padStart(3, "0")}`;
}

function RowMeta({ label, value, emphasize = false, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      {children || <p className={`mt-0.5 truncate text-xs ${emphasize ? "font-semibold text-slate-950" : "text-slate-600"}`}>{value}</p>}
    </div>
  );
}

function IconToolbarButton({ title, onClick, disabled, tone = "slate", children }) {
  const toneClasses =
    tone === "danger"
      ? "border-rose-200 text-rose-600 hover:bg-rose-50"
      : "border-slate-200 text-slate-600 hover:bg-slate-100";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border bg-white transition ${toneClasses} disabled:opacity-40`}
    >
      {children}
    </button>
  );
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

function getQuickAddFieldClass(hasError = false) {
  return `h-11 w-full rounded-xl border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition ${
    hasError ? "border-rose-400 ring-2 ring-rose-100" : "border-slate-300 focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
  }`;
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

function sortUsersForWorkspace(users, recommendedDepartment, summariesByUserId) {
  return sortUsersBySmartAvailability(users, summariesByUserId, recommendedDepartment);
}

function CreateArtistCard({ user, summary, assigned, shotCount, disabled, onAssign }) {
  const meta = getEmployeeAvailabilityMeta(summary?.liveStatus || user.availabilityStatus || "AVAILABLE");
  return (
    <EmployeeAvailabilityHoverCard user={user} summary={summary} roleLabel="Artist" className="block">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-sm font-bold text-white">
            {initials(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                <p className="truncate text-xs text-slate-500">{getDepartmentLabel(user)}</p>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.tone}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                {formatEmployeeAvailabilityLabel(summary?.liveStatus || user.availabilityStatus || "AVAILABLE")}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${getEmploymentBadgeClasses(user.employmentType)}`}>
                {user.employmentType === "FREELANCE" ? "FREELANCE" : "IN-HOUSE"}
              </span>
              <span className="text-[11px] text-slate-500">
                {shotCount} active shot{shotCount === 1 ? "" : "s"} · {summary?.workloadPercent ?? 0}% load
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onAssign(user);
          }}
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
    </EmployeeAvailabilityHoverCard>
  );
}

function CompactAssignmentStrip({
  users,
  recommendedDepartment,
  assignments,
  summariesByUserId,
  disabled,
  onChange
}) {
  const normalizedAssignments = useMemo(() => normalizeAssignmentList(assignments), [assignments]);
  const assignedDepartment = useMemo(() => {
    const lead = getLeadAssignment(normalizedAssignments);
    const employee = lead?.employee || users.find((user) => Number(user.id) === Number(lead?.employeeId));
    return employee ? getDepartmentLabel(employee) : "";
  }, [normalizedAssignments, users]);
  const recommendedDepartmentCount = useMemo(
    () => countUsersByDepartment(users, recommendedDepartment),
    [users, recommendedDepartment]
  );
  const defaultDepartment = assignedDepartment || (recommendedDepartmentCount > 0 ? recommendedDepartment : "");

  const [selectedDepartment, setSelectedDepartment] = useState(defaultDepartment);
  const [search, setSearch] = useState("");
  const [candidateId, setCandidateId] = useState("");

  useEffect(() => {
    if (!selectedDepartment && defaultDepartment) {
      setSelectedDepartment(defaultDepartment);
      return;
    }

    if (selectedDepartment === recommendedDepartment && !recommendedDepartmentCount && !assignedDepartment) {
      setSelectedDepartment("");
    }
  }, [assignedDepartment, defaultDepartment, recommendedDepartment, recommendedDepartmentCount, selectedDepartment]);

  const departmentOptions = useMemo(() => buildDepartmentOptions(users, recommendedDepartment), [users, recommendedDepartment]);
  const filteredUsers = useMemo(() => {
    const scoped = filterUsersByDepartment(users, selectedDepartment);
    const query = String(search || "").trim().toLowerCase();
    const filtered = !query
      ? scoped
      : scoped.filter((user) =>
          [user.name, user.email, getDepartmentLabel(user), getEmploymentLabel(user.employmentType), user.role]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query)
        );
    return sortUsersBySmartAvailability(filtered, summariesByUserId, selectedDepartment || recommendedDepartment);
  }, [recommendedDepartment, search, selectedDepartment, summariesByUserId, users]);

  const quickUsers = useMemo(() => filteredUsers.slice(0, 5), [filteredUsers]);
  const candidateWarning = useMemo(() => {
    const selected = filteredUsers.find((user) => String(user.id) === String(candidateId));
    if (!selected) return "";
    return getOverloadWarning(summariesByUserId[Number(selected.id)]);
  }, [candidateId, filteredUsers, summariesByUserId]);

  function commit(nextAssignments) {
    onChange?.(ensureSingleLead(nextAssignments));
  }

  function addUser(user) {
    const employeeId = Number(user.id || 0);
    if (!employeeId || normalizedAssignments.some((assignment) => Number(assignment.employeeId) === employeeId)) {
      setCandidateId("");
      return;
    }

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
    setCandidateId("");
  }

  function handleAddCandidate() {
    const user = users.find((item) => String(item.id) === String(candidateId));
    if (!user) return;
    addUser(user);
  }

  function handleRoleChange(employeeId, roleType) {
    commit(
      normalizedAssignments.map((assignment) => ({
        ...assignment,
        roleType: Number(assignment.employeeId) === Number(employeeId) ? roleType : assignment.roleType
      }))
    );
  }

  function handleRemove(employeeId) {
    commit(normalizedAssignments.filter((assignment) => Number(assignment.employeeId) !== Number(employeeId)));
  }

  return (
    <div className="space-y-2.5">
      <div className="grid gap-2 lg:grid-cols-[180px_minmax(0,1fr)_220px_auto]">
        <select
          value={selectedDepartment}
          onChange={(event) => {
            setSelectedDepartment(event.target.value);
            setCandidateId("");
          }}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          disabled={disabled}
        >
          <option value="">All departments</option>
          {departmentOptions.map((department) => (
            <option key={department} value={department}>
              {department}{department === recommendedDepartment ? " · Recommended" : ""}
            </option>
          ))}
        </select>

        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search artist, department, email, or role"
            className="w-full rounded-xl border border-slate-300 bg-white px-10 py-2 text-sm"
            disabled={disabled}
          />
        </label>

        <select
          value={candidateId}
          onChange={(event) => setCandidateId(event.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          disabled={disabled || !filteredUsers.length}
        >
          <option value="">Quick select artist</option>
          {filteredUsers.map((user) => {
            const summary = summariesByUserId[Number(user.id)];
            return (
              <option key={user.id} value={user.id}>
                {user.name} · {getDepartmentLabel(user)} · {formatEmployeeAvailabilityLabel(summary?.liveStatus || user.availabilityStatus || "AVAILABLE")} · {summary?.activeTasks ?? 0} active
              </option>
            );
          })}
        </select>

        <button
          type="button"
          onClick={handleAddCandidate}
          disabled={disabled || !candidateId}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      {candidateWarning ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {candidateWarning}
        </div>
      ) : null}

      {quickUsers.length ? (
        <div className="flex flex-wrap gap-2">
          {quickUsers.map((user) => {
            const summary = summariesByUserId[Number(user.id)];
            const alreadyAssigned = normalizedAssignments.some((assignment) => Number(assignment.employeeId) === Number(user.id));
            const availabilityMeta = getEmployeeAvailabilityMeta(summary?.liveStatus || user.availabilityStatus || "AVAILABLE");
            return (
              <EmployeeAvailabilityHoverCard key={user.id} user={user} summary={summary} roleLabel="Artist" className="block">
                <button
                  type="button"
                  onClick={() => addUser(user)}
                  disabled={disabled || alreadyAssigned}
                  className={`inline-flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition ${
                    alreadyAssigned
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  } disabled:opacity-60`}
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-[10px] font-bold text-white">
                    {initials(user.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{user.name}</span>
                    <span className="block truncate text-[11px] text-slate-500">{getDepartmentLabel(user)}</span>
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${availabilityMeta.tone}`}>
                    {formatEmployeeAvailabilityLabel(summary?.liveStatus || user.availabilityStatus || "AVAILABLE")}
                  </span>
                </button>
              </EmployeeAvailabilityHoverCard>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          No employees found in this department. Choose another department to override staffing.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {normalizedAssignments.length ? (
          normalizedAssignments.map((assignment) => {
            const employee = assignment.employee || users.find((user) => Number(user.id) === Number(assignment.employeeId)) || null;
            if (!employee) return null;
            const summary = summariesByUserId[Number(assignment.employeeId)];
            return (
              <EmployeeAvailabilityHoverCard
                key={assignment.employeeId}
                user={employee}
                summary={summary}
                roleLabel={assignment.roleType === "LEAD" ? "Lead Artist" : "Support Artist"}
                className="block"
              >
                <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-950 text-[10px] font-bold text-white">
                    {initials(employee.name)}
                  </span>
                  <span className="font-semibold text-slate-950">{employee.name}</span>
                  <select
                    value={assignment.roleType || "SUPPORT"}
                    onChange={(event) => {
                      event.stopPropagation();
                      handleRoleChange(assignment.employeeId, event.target.value);
                    }}
                    className="rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-[10px] font-semibold"
                    disabled={disabled}
                  >
                    <option value="LEAD">Lead</option>
                    <option value="SUPPORT">Support</option>
                  </select>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      handleRemove(assignment.employeeId);
                    }}
                    className="rounded-full p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                    disabled={disabled}
                    aria-label={`Remove ${employee.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </EmployeeAvailabilityHoverCard>
            );
          })
        ) : (
          <div className="rounded-full border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            No artists assigned yet
          </div>
        )}
      </div>
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
  const summariesByUserId = useEmployeeAvailabilitySummaries(users);
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
    const filtered = !query
      ? scoped
      : scoped.filter((user) =>
          [user.name, user.email, getDepartmentLabel(user), getEmploymentLabel(user.employmentType)]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query)
        );
    return sortUsersBySmartAvailability(filtered, summariesByUserId, department || recommendedDepartment);
  }, [department, recommendedDepartment, search, summariesByUserId, users]);

  const highlightedWarning = useMemo(() => {
    const found = normalizedAssignments.find((assignment) => getOverloadWarning(summariesByUserId[Number(assignment.employeeId)]));
    if (!found) return "";
    const employee = found.employee || users.find((user) => Number(user.id) === Number(found.employeeId));
    if (!employee) return "";
    return `${employee.name}: ${getOverloadWarning(summariesByUserId[Number(found.employeeId)])}`;
  }, [normalizedAssignments, summariesByUserId, users]);

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
              summary={summariesByUserId[Number(user.id)]}
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
                <EmployeeAvailabilityHoverCard key={assignment.employeeId} user={employee} summary={summariesByUserId[Number(assignment.employeeId)]} roleLabel={assignment.roleType === "LEAD" ? "Lead Artist" : "Support Artist"} className="block">
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                      {initials(employee.name)}
                    </span>
                    <span className="font-semibold text-slate-900">{employee.name}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getEmploymentBadgeClasses(employee.employmentType)}`}>
                      {employee.employmentType === "FREELANCE" ? "FREELANCE" : "IN-HOUSE"}
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handleRemove(assignment.employeeId);
                      }}
                      className="rounded-full p-1 text-slate-500 transition hover:bg-white hover:text-slate-900"
                      disabled={disabled}
                      aria-label={`Remove ${employee.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </EmployeeAvailabilityHoverCard>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-500">
              No artists assigned yet.
            </div>
          )}
        </div>
      </div>
      {highlightedWarning ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {highlightedWarning}
        </div>
      ) : null}
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
  const summariesByUserId = useEmployeeAvailabilitySummaries(activeUsers);
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
  const [quickCreateErrors, setQuickCreateErrors] = useState({});
  const [quickCreateError, setQuickCreateError] = useState("");
  const [quickCreateState, setQuickCreateState] = useState("idle");
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
  const [isHeaderCompact, setIsHeaderCompact] = useState(false);
  const headerRef = useRef(null);
  const rowRefs = useRef(new Map());
  const scrollFrameRef = useRef(null);
  const quickNameInputRef = useRef(null);
  const activeUsersById = useMemo(() => new Map(activeUsers.map((user) => [Number(user.id), user])), [activeUsers]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowTick(Date.now()), 30 * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const updateCompactMode = () => {
      const nextCompact = window.scrollY > HEADER_COLLAPSE_SCROLL_Y;
      setIsHeaderCompact((prev) => (prev === nextCompact ? prev : nextCompact));
      scrollFrameRef.current = null;
    };

    const handleScroll = () => {
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(updateCompactMode);
    };

    updateCompactMode();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
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

      const normalizedRows = (data.items || []).map(mapStageRow);
      setRows(normalizedRows);
      setPagination(data.pagination || { page: 1, pageSize: 25, total: 0, totalPages: 1 });
      setSelectedIds((prev) => prev.filter((id) => (data.items || []).some((item) => item.id === id)));
      debugPipeline("shot.tableData", {
        stageCode: normalizedStageCode,
        count: normalizedRows.length,
        sample: normalizedRows.slice(0, 5).map((row) => ({
          id: row.id,
          shotId: row.shotId,
          name: deriveShotLabel(row.shot),
          status: row.stageStatus
        }))
      });
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

  useEffect(() => {
    debugPipeline("shot.renderRows", {
      count: rows.length,
      filters,
      sample: rows.slice(0, 5).map((row) => ({
        id: row.id,
        shotId: row.shotId,
        name: deriveShotLabel(row.shot),
        status: row.stageStatus
      }))
    });
  }, [filters, rows]);

  const headerStats = useMemo(() => {
    const localTotal = rows.length;
    const localInProgress = rows.filter((row) => row.stageStatus === "IP").length;
    const localFinal = rows.filter((row) => row.stageStatus === "FINAL").length;
    const localOverdue = rows.filter((row) => isLateStatus(row.stageStatus, row.deadline || row.endDate)).length;
    const localCompletion = localTotal
      ? Math.round((rows.filter((row) => COMPLETE_SHOT_STATUSES.has(normalizeToken(row.stageStatus))).length / localTotal) * 100)
      : 0;
    const visibleDuration = rows.reduce((sum, row) => sum + (resolveDurationMinutes(row, nowTick) || 0), 0);
    const assignedArtists = new Set(
      rows.flatMap((row) => getStageAssignments(row).map((assignment) => Number(assignment.employeeId || assignment.employee?.id || 0)).filter(Boolean))
    ).size;
    return {
      total: localTotal || stageSummary?.total || pagination.total,
      inProgress: localInProgress || stageSummary?.inProgress || 0,
      final: localFinal || stageSummary?.final || 0,
      overdue: localOverdue || stageSummary?.delayed || 0,
      completion: localCompletion || stageSummary?.completionPercent || 0,
      assignedArtists,
      visibleDuration
    };
  }, [stageSummary, pagination.total, rows, nowTick]);

  const assignableUsers = useMemo(
    () => sortUsersForWorkspace(activeUsers, recommendedDepartment, summariesByUserId),
    [activeUsers, recommendedDepartment, summariesByUserId]
  );
  const debouncedQuickArtistSearch = useDebouncedValue(quickCreateForm.artistSearch, 160);
  const quickCreateDepartmentOptions = useMemo(
    () => buildDepartmentOptions(activeUsers, recommendedDepartment),
    [activeUsers, recommendedDepartment]
  );
  const quickCreateArtists = useMemo(() => {
    const scopedUsers = filterUsersByDepartment(activeUsers, quickCreateForm.department);
    const query = String(debouncedQuickArtistSearch || "").trim().toLowerCase();
    const filteredUsers = !query
      ? scopedUsers
      : scopedUsers.filter((user) =>
          [user.name, user.email, getDepartmentLabel(user), getEmploymentLabel(user.employmentType), user.role]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query)
        );
    return sortUsersBySmartAvailability(
      filteredUsers,
      summariesByUserId,
      quickCreateForm.department || recommendedDepartment
    );
  }, [
    activeUsers,
    debouncedQuickArtistSearch,
    quickCreateForm.department,
    recommendedDepartment,
    summariesByUserId
  ]);

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

  useEffect(() => {
    if (!defaultCreateDepartment) return;
    setQuickCreateForm((prev) => {
      if (prev.department) return prev;
      return { ...prev, department: defaultCreateDepartment };
    });
  }, [defaultCreateDepartment]);

  useEffect(() => {
    if (quickCreateState !== "success") return;
    const timeoutId = window.setTimeout(() => setQuickCreateState("idle"), 1400);
    return () => window.clearTimeout(timeoutId);
  }, [quickCreateState]);

  const createSecondsPreview = useMemo(() => {
    const parsed = resolveCreateFrameRange(createForm.frameRange);
    return parsed ? `${resolveSeconds(parsed.frameStart, parsed.frameEnd)} sec` : "--";
  }, [createForm.frameRange]);

  const createCanSubmit = useMemo(
    () =>
      Boolean(String(createForm.name || "").trim()) &&
      Boolean(resolveCreateFrameRange(createForm.frameRange)) &&
      Boolean(normalizeAssignmentList(createForm.assignments).length) &&
      Boolean(String(createForm.status || "").trim()) &&
      Boolean(String(createForm.startedAt || "").trim()),
    [createForm.assignments, createForm.frameRange, createForm.name, createForm.startedAt, createForm.status]
  );

  const quickCreateSecondsPreview = useMemo(() => {
    const parsed = resolveCreateFrameRange(quickCreateForm.frameRange);
    return parsed ? `${resolveSeconds(parsed.frameStart, parsed.frameEnd)}s` : "--";
  }, [quickCreateForm.frameRange]);

  const quickCreateCanSubmit = useMemo(() => {
    return (
      Boolean(String(quickCreateForm.name || "").trim()) &&
      Boolean(resolveCreateFrameRange(quickCreateForm.frameRange)) &&
      Boolean(quickCreateForm.artistId) &&
      Boolean(quickCreateForm.status) &&
      Boolean(String(quickCreateForm.startedAt || "").trim())
    );
  }, [quickCreateForm.artistId, quickCreateForm.frameRange, quickCreateForm.name, quickCreateForm.startedAt, quickCreateForm.status]);

  const hasExpandedRows = useMemo(() => Object.values(expandedRows).some(Boolean), [expandedRows]);
  const headerCompact = isHeaderCompact || hasExpandedRows;

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
      const safePayload = buildShotStagePayload(payload, activeUsersById);
      const requestPayload = Object.keys(safePayload).length ? safePayload : payload;
      logShotPayload("update-shot-stage", requestPayload);
      const { data } = await api.put(`/shot-stages/${stageId}`, requestPayload);
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
    const range = resolveCreateFrameRange(values.frameRange);
    if (!range) {
      throw new Error("Invalid frame range");
    }
    const normalizedName = String(values.name || "").trim();
    const shotCreatePayload = {
      frameStart: range.frameStart,
      frameEnd: range.frameEnd,
      label: normalizedName || undefined,
      name: normalizedName || undefined,
      status: values.status
    };
    debugPipeline("shot.quickAdd.submit", { stageCode: normalizedStageCode, payload: shotCreatePayload });
    const { data } = await api.post(`/projects/${projectId}/shots`, shotCreatePayload);
    debugPipeline("shot.quickAdd.shotResponse", data);

    const stageRow = (data.stages || []).find((stage) => String(stage.stageDefinition?.code || "").toUpperCase() === normalizedStageCode);
    if (stageRow) {
      const stagePayload = buildShotStagePayload(
        {
          assignedUserId: getLeadAssignment(values.assignments || [])?.employeeId || null,
          assignments: values.assignments || [],
          status: values.status,
          startedAt: values.startedAt || null,
          endedAt: values.endedAt || null,
          notes: values.notes || null
        },
        activeUsersById
      );
      const stagePayloadErrors = validateShotStagePayload({
        shotLabel: normalizedName,
        projectId,
        stageId: stageRow.id,
        payload: stagePayload
      });
      if (Object.keys(stagePayloadErrors).length) {
        const validationError = new Error("Invalid stage payload");
        validationError.userMessage = "Unable to create shot. Please check required fields.";
        validationError.validation = stagePayloadErrors;
        throw validationError;
      }
      logShotPayload("create-shot-stage", stagePayload);
      const { data: createdStage } = await api.put(`/shot-stages/${stageRow.id}`, stagePayload);
      debugPipeline("shot.quickAdd.stageResponse", createdStage);

      const fallbackShot = {
        id: data.id || stageRow.shotId,
        shotNumber: data.shotNumber || data.order || stageRow.shot?.shotNumber || null,
        frameStart: range.frameStart,
        frameEnd: range.frameEnd,
        label: normalizedName || data.label || data.name || "",
        name: normalizedName || data.name || data.label || ""
      };
      const stageEntry = {
        ...stageRow,
        ...(createdStage || {}),
        id: createdStage?.id || stageRow.id,
        shotId: createdStage?.shotId || stageRow.shotId || fallbackShot.id,
        shot: createdStage?.shot || stageRow.shot || data.shot || fallbackShot
      };
      const createdRow = mapStageRow(stageEntry);
      const shouldRenderCreatedRow = rowMatchesFilters(createdRow, filters);
      setRows((prev) => {
        const deduped = prev.filter((row) => row.shotId !== createdRow.shotId);
        if (!shouldRenderCreatedRow) return deduped;
        return [createdRow, ...deduped];
      });
      if (shouldRenderCreatedRow) {
        setPagination((prev) => ({
          ...prev,
          total: prev.total + 1,
          totalPages: Math.max(1, Math.ceil((prev.total + 1) / Number(prev.pageSize || 25)))
        }));
      }
    }

    showToast("success", successMessage);
    void loadRows(false);
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
      const validation = err.validation || {};
      if (Object.keys(validation).length) {
        setCreateErrors((prev) => ({
          ...prev,
          ...(validation.name ? { name: validation.name } : {}),
          ...(validation.assignments ? { assignments: validation.assignments } : {}),
          ...(validation.status ? { status: validation.status } : {}),
          ...(validation.startedAt ? { startedAt: validation.startedAt } : {})
        }));
      }
      const statusCode = Number(err?.response?.status || 0);
      if (statusCode === 400) {
        showToast("error", "Unable to create shot. Please check required fields.");
      } else {
        showToast("error", err.userMessage || err.response?.data?.message || "Unable to create shot");
      }
    } finally {
      setBusy(false);
    }
  }

  async function createQuickShot(event) {
    event?.preventDefault?.();
    if (quickCreateState !== "idle") setQuickCreateState("idle");
    const artist = activeUsers.find((user) => String(user.id) === String(quickCreateForm.artistId));
    const quickDraft = {
      ...quickCreateForm,
      endedAt: quickCreateForm.endedAt || "",
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
      setQuickCreateErrors({
        name: nextErrors.name || "",
        frameRange: nextErrors.frameRange || "",
        artistId: nextErrors.assignments || "",
        status: nextErrors.status || "",
        startedAt: nextErrors.startedAt || ""
      });
      setQuickCreateError("Unable to create shot. Please check required fields.");
      showToast("error", "Complete the quick create fields");
      return;
    }

    setQuickCreateState("loading");
    setBusy(true);
    try {
      await submitShotCreate(quickDraft, `${displayStageLabel} shot created`);
      setQuickCreateErrors({});
      setQuickCreateError("");
      setQuickCreateForm((prev) => ({
        ...buildQuickCreateForm(),
        department: prev.department || defaultCreateDepartment,
        artistId: prev.artistId || "",
        status: prev.status || "YTS",
        startedAt: todayDateInput()
      }));
      setQuickCreateState("success");
      window.requestAnimationFrame(() => {
        quickNameInputRef.current?.focus();
      });
    } catch (err) {
      const validation = err.validation || {};
      if (Object.keys(validation).length) {
        setQuickCreateErrors({
          name: validation.name || "",
          frameRange: validation.frameRange || "",
          artistId: validation.assignments || "",
          status: validation.status || "",
          startedAt: validation.startedAt || ""
        });
        setQuickCreateError("Unable to create shot. Please check required fields.");
      }
      const statusCode = Number(err?.response?.status || 0);
      if (statusCode === 400) {
        showToast("error", "Unable to create shot. Please check required fields.");
      } else {
        showToast("error", err.userMessage || err.response?.data?.message || "Unable to create shot");
      }
      setQuickCreateState("idle");
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
        const stagePayload = buildShotStagePayload(
          {
            assignedUserId: getLeadAssignment(getStageAssignments(row))?.employeeId || null,
            assignments: getStageAssignments(row),
            status: row.stageStatus,
            startedAt: resolveStageStart(row) || null,
            endedAt: resolveStageEnd(row) || null,
            notes: row.notes || null
          },
          activeUsersById
        );
        logShotPayload("duplicate-shot-stage", stagePayload);
        await api.put(`/shot-stages/${stageRow.id}`, stagePayload);
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

  function focusExpandedRow(stageId) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const rowNode = rowRefs.current.get(stageId);
        if (!rowNode) return;
        const stickyOffset = (headerRef.current?.offsetHeight || 0) + 96;
        const targetTop = rowNode.getBoundingClientRect().top + window.scrollY - stickyOffset;
        window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
      });
    });
  }

  function toggleExpanded(stageId) {
    let willOpen = false;
    setExpandedRows((prev) => {
      willOpen = !prev[stageId];
      return { ...prev, [stageId]: willOpen };
    });
    if (willOpen) focusExpandedRow(stageId);
  }

  function toggleComments(stageId) {
    setExpandedRows((prev) => ({ ...prev, [stageId]: true }));
    setCommentOpenByStageId((prev) => ({ ...prev, [stageId]: !prev[stageId] }));
    focusExpandedRow(stageId);
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
    <div className="-mt-3 space-y-3 md:-mt-4">
      <section
        ref={headerRef}
        className={`sticky top-3 z-20 overflow-hidden rounded-[24px] border border-slate-900/90 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.12),_transparent_30%),linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(2,6,23,0.98))] text-white backdrop-blur transition-[transform,padding,box-shadow] duration-300 ${
          headerCompact ? "shadow-xl shadow-slate-950/15" : "shadow-2xl shadow-slate-950/20"
        }`}
      >
        <div className={`px-4 transition-all duration-300 ${headerCompact ? "space-y-2 py-2.5" : "space-y-3 py-3"}`}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">{displayStageLabel} Production Workspace</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className={`truncate font-semibold tracking-tight text-white transition-all duration-300 ${headerCompact ? "text-base" : "text-xl"}`}>
                  {overview?.project?.name || "Project"}
                </h2>
                <span className="text-xs text-slate-400">
                  {groupBySequence ? `${groupedRows.length} sequences` : "Flat shot view"}
                </span>
              </div>
              {!headerCompact ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <ToolbarStat label="Shots" value={headerStats.total} />
                  <ToolbarStat label="IP" value={headerStats.inProgress} tone="text-sky-200" />
                  <ToolbarStat label="Final" value={headerStats.final} tone="text-emerald-200" />
                  <ToolbarStat label="Late" value={headerStats.overdue} tone="text-rose-200" />
                  <ToolbarStat label="Crew" value={headerStats.assignedArtists} tone="text-cyan-200" />
                  <ToolbarStat label="Time" value={formatDurationMinutes(headerStats.visibleDuration)} tone="text-amber-200" />
                </div>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-slate-300">
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1">{headerStats.total} shots</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1">{headerStats.inProgress} IP</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1">{headerStats.final} final</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1">{headerStats.overdue} late</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              {!headerCompact ? (
                <>
                  <select
                    value={filters.sortBy}
                    onChange={(event) => setFilters((prev) => ({ ...prev, sortBy: event.target.value, page: 1 }))}
                    className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none"
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
                    className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-[11px] font-semibold tracking-[0.16em] text-slate-200 transition hover:bg-white/10"
                  >
                    {String(filters.sortDir).toUpperCase()}
                  </button>
                  <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.06] p-1">
                    <button
                      type="button"
                      onClick={() => setGroupBySequence(true)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${groupBySequence ? "bg-white text-slate-950" : "text-slate-200 hover:bg-white/10"}`}
                    >
                      Sequence
                    </button>
                    <button
                      type="button"
                      onClick={() => setGroupBySequence(false)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${!groupBySequence ? "bg-white text-slate-950" : "text-slate-200 hover:bg-white/10"}`}
                    >
                      Flat
                    </button>
                  </div>
                </>
              ) : null}
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
              >
                <Plus className="h-4 w-4" /> Create Shot
              </button>
            </div>
          </div>

          <div className={`grid gap-2 ${headerCompact ? "md:grid-cols-[minmax(0,1.4fr)_170px_220px_auto]" : "md:grid-cols-2 xl:grid-cols-[minmax(0,1.45fr)_170px_220px_150px_auto]"}`}>
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={filters.search}
                onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value, page: 1 }))}
                placeholder="Search shot, sequence, artist, or output"
                className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-10 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
              />
            </label>
            <select
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value, page: 1 }))}
              className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none"
            >
              <option value="" className="text-slate-900">All statuses</option>
              {STAGE_STATUSES.map((status) => (
                <option key={status} value={status} className="text-slate-900">{getStatusOptionLabel(status)}</option>
              ))}
            </select>
            <select
              value={filters.artistId}
              onChange={(event) => setFilters((prev) => ({ ...prev, artistId: event.target.value, page: 1 }))}
              className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none"
            >
              <option value="" className="text-slate-900">All artists</option>
              {assignableUsers.map((artist) => (
                <option key={artist.id} value={artist.id} className="text-slate-900">
                  {artist.name} · {getDepartmentLabel(artist)} · {formatEmployeeAvailabilityLabel(summariesByUserId[Number(artist.id)]?.liveStatus || artist.availabilityStatus || "AVAILABLE")}
                </option>
              ))}
            </select>
            {!headerCompact ? (
              <>
                <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={filters.overdueOnly}
                    onChange={(event) => setFilters((prev) => ({ ...prev, overdueOnly: event.target.checked, page: 1 }))}
                    className="rounded border-white/20 bg-slate-900"
                  />
                  Delayed only
                </label>
                <button
                  type="button"
                  onClick={() => setSelectedIds(allVisibleSelected ? [] : rowIds)}
                  className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
                >
                  {allVisibleSelected ? "Clear Selection" : `Select ${rowIds.length}`}
                </button>
              </>
            ) : null}
          </div>

          {!headerCompact ? (
            <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-300">
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1">24 fps auto-seconds</span>
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1">{headerStats.completion}% completion</span>
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1">{pagination.total} visible rows</span>
            </div>
          ) : null}
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

      <section className="rounded-[22px] border border-slate-200/80 bg-white/95 px-3 py-3 shadow-sm shadow-slate-200/30">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Quick Create</p>
            <h3 className="text-sm font-semibold text-slate-950">Add shots in seconds</h3>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Press Enter to create</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Start date defaults to today</span>
          </div>
        </div>

        <form onSubmit={createQuickShot} className="mt-3 space-y-2.5">
          <div className="grid gap-2 xl:grid-cols-[minmax(0,1.45fr)_140px_250px_170px_170px_140px]">
            <input
              ref={quickNameInputRef}
              value={quickCreateForm.name}
              onChange={(event) => {
                setQuickCreateForm((prev) => ({ ...prev, name: event.target.value }));
                setQuickCreateErrors((prev) => ({ ...prev, name: "" }));
                setQuickCreateError("");
                setQuickCreateState("idle");
              }}
              placeholder="Shot label"
              className={getQuickAddFieldClass(Boolean(quickCreateErrors.name))}
            />
            <input
              value={quickCreateForm.frameRange}
              onChange={(event) => {
                setQuickCreateForm((prev) => ({ ...prev, frameRange: event.target.value }));
                setQuickCreateErrors((prev) => ({ ...prev, frameRange: "" }));
                setQuickCreateError("");
                setQuickCreateState("idle");
              }}
              placeholder="101-148"
              className={getQuickAddFieldClass(Boolean(quickCreateErrors.frameRange))}
            />
            <select
              value={quickCreateForm.artistId}
              onChange={(event) => {
                setQuickCreateForm((prev) => ({ ...prev, artistId: event.target.value }));
                setQuickCreateErrors((prev) => ({ ...prev, artistId: "" }));
                setQuickCreateError("");
                setQuickCreateState("idle");
              }}
              className={getQuickAddFieldClass(Boolean(quickCreateErrors.artistId))}
            >
              <option value="">Assign lead artist</option>
              {quickCreateArtists.map((artist) => (
                <option key={artist.id} value={artist.id}>
                  {artist.name} · {getDepartmentLabel(artist)} · {formatEmployeeAvailabilityLabel(summariesByUserId[Number(artist.id)]?.liveStatus || artist.availabilityStatus || "AVAILABLE")} · {summariesByUserId[Number(artist.id)]?.activeTasks ?? 0} active
                </option>
              ))}
            </select>
            <select
              value={quickCreateForm.status}
              onChange={(event) => {
                setQuickCreateForm((prev) => ({ ...prev, status: event.target.value }));
                setQuickCreateErrors((prev) => ({ ...prev, status: "" }));
                setQuickCreateError("");
                setQuickCreateState("idle");
              }}
              className={getQuickAddFieldClass(Boolean(quickCreateErrors.status))}
            >
              {STAGE_STATUSES.map((status) => (
                <option key={status} value={status}>{getStatusOptionLabel(status)}</option>
              ))}
            </select>
            <input
              type="date"
              value={quickCreateForm.startedAt || todayDateInput()}
              onChange={(event) => {
                setQuickCreateForm((prev) => ({ ...prev, startedAt: event.target.value || todayDateInput() }));
                setQuickCreateErrors((prev) => ({ ...prev, startedAt: "" }));
                setQuickCreateError("");
                setQuickCreateState("idle");
              }}
              className={getQuickAddFieldClass(Boolean(quickCreateErrors.startedAt))}
            />
            <button
              type="submit"
              disabled={!quickCreateCanSubmit || busy || quickCreateState === "loading"}
              className="inline-flex h-11 w-[140px] items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {quickCreateState === "loading" ? "Creating..." : quickCreateState === "success" ? "Created ✓" : "Create"}
            </button>
          </div>

          <div className="grid gap-2 md:grid-cols-[200px_minmax(0,1fr)_170px]">
            <select
              value={quickCreateForm.department}
              onChange={(event) => {
                const department = event.target.value;
                setQuickCreateForm((prev) => ({ ...prev, department, artistId: "", artistSearch: "" }));
                setQuickCreateErrors((prev) => ({ ...prev, artistId: "" }));
                setQuickCreateError("");
                setQuickCreateState("idle");
              }}
              className={getQuickAddFieldClass(false)}
            >
              <option value="">All departments</option>
              {quickCreateDepartmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}{department === recommendedDepartment ? " · Recommended" : ""}
                </option>
              ))}
            </select>

            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={quickCreateForm.artistSearch}
                onChange={(event) => {
                  setQuickCreateForm((prev) => ({ ...prev, artistSearch: event.target.value }));
                  setQuickCreateState("idle");
                }}
                placeholder="Search artist, department, or role"
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-10 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
              />
            </label>

            <input
              type="date"
              value={quickCreateForm.endedAt || ""}
              onChange={(event) => {
                setQuickCreateForm((prev) => ({ ...prev, endedAt: event.target.value }));
                setQuickCreateState("idle");
              }}
              className={getQuickAddFieldClass(false)}
              placeholder="End date (optional)"
            />
          </div>
        </form>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Preview {quickCreateSecondsPreview}</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Start {formatWorkspaceShortDate(quickCreateForm.startedAt)}</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">{quickCreateArtists.length} artist options</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Required: name, artist, status, start date</span>
        </div>
        {quickCreateError ? <p className="mt-2 text-[11px] font-medium text-rose-600">{quickCreateError}</p> : null}
        {Object.values(quickCreateErrors).some(Boolean) ? (
          <div className="mt-1 grid gap-1 text-[11px] text-rose-600 sm:grid-cols-2 xl:grid-cols-5">
            <InlineError>{quickCreateErrors.name}</InlineError>
            <InlineError>{quickCreateErrors.frameRange}</InlineError>
            <InlineError>{quickCreateErrors.artistId}</InlineError>
            <InlineError>{quickCreateErrors.status}</InlineError>
            <InlineError>{quickCreateErrors.startedAt}</InlineError>
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : null}

      {!rows.length && !error ? (
        <section className="rounded-[22px] border border-dashed border-slate-300 bg-white px-5 py-6 text-center shadow-sm shadow-slate-200/20">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white shadow-lg shadow-slate-950/15">
            <Plus className="h-4 w-4" />
          </div>
          <h3 className="mt-3 text-base font-semibold text-slate-950">
            {filters.search || filters.status || filters.artistId || filters.overdueOnly ? "No rows match current filters" : `No ${displayStageLabel} shots yet`}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {filters.search || filters.status || filters.artistId || filters.overdueOnly
              ? "Adjust search or filters to view existing rows."
              : "Create the first shot row to start staffing, timing, and reviews."}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={openCreateModal} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Open Create Shot</button>
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
              <section key={group.key} className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-sm shadow-slate-200/30">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50/70 px-3 py-3">
                  <div className="flex items-center gap-3">
                    {groupBySequence ? (
                      <button
                        type="button"
                        onClick={() => toggleSequence(group.key)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100"
                        aria-label={collapsed ? `Expand ${group.label}` : `Collapse ${group.label}`}
                      >
                        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    ) : null}
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{groupBySequence ? "Sequence group" : "All shots"}</p>
                      <h3 className="text-lg font-semibold tracking-tight text-slate-950">{group.label}</h3>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-600">
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{sequenceStats.total} shots</span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{sequenceStats.inProgress} IP</span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{sequenceStats.final} final</span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{sequenceStats.delayed} late</span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{formatDurationMinutes(sequenceStats.duration)}</span>
                  </div>
                </div>

                {!collapsed ? (
                  <div className="divide-y divide-slate-200/70">
                    <div className="hidden xl:grid xl:grid-cols-[28px_minmax(0,1.65fr)_minmax(0,1.15fr)_minmax(0,0.95fr)_auto] xl:items-center xl:gap-3 xl:bg-slate-950/[0.03] xl:px-3 xl:py-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Pick</span>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Shot / Frames / Seconds</span>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Status / Artist</span>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Start / End / Time</span>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Actions</span>
                    </div>
                    <div className="space-y-2 p-2">
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
                        <article
                          key={row.id}
                          ref={(node) => {
                            if (node) rowRefs.current.set(row.stageId, node);
                            else rowRefs.current.delete(row.stageId);
                          }}
                          className="overflow-hidden rounded-[18px] border border-slate-200/80 bg-white shadow-sm shadow-slate-200/20 transition hover:border-slate-300 hover:bg-slate-50/70"
                        >
                          <div className="grid gap-3 px-3 py-3 md:grid-cols-[28px_minmax(0,1.3fr)_minmax(0,1fr)] xl:grid-cols-[28px_minmax(0,1.65fr)_minmax(0,1.15fr)_minmax(0,0.95fr)_auto] xl:items-center">
                            <div className="pt-1">
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(row.id)}
                                onChange={() => setSelectedIds((prev) => (prev.includes(row.id) ? prev.filter((id) => id !== row.id) : [...prev, row.id]))}
                                className="rounded border-slate-300"
                              />
                            </div>

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <p className="min-w-0 truncate text-sm font-semibold tracking-[0.03em] text-slate-950">{deriveShotLabel(row.shot)}</p>
                                <p className="text-xs font-semibold tracking-[0.12em] text-slate-500">{buildShotId(row.shot?.shotNumber)}</p>
                                <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                                  {row.sequence || "MAIN"}
                                </span>
                              </div>
                              <div className={`mt-1 grid gap-2 text-xs text-slate-600 ${isEditingStage ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                                <RowMeta label="Frame Range" value={frameRangeLabel} emphasize />
                                <RowMeta
                                  label="Seconds"
                                  children={
                                    <div className="mt-0.5 inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-800">
                                      <span>{frameCount ? `${frameCount}f` : "--"}</span>
                                      <span>→</span>
                                      <span>{seconds ? `${seconds}s` : "--"}</span>
                                    </div>
                                  }
                                />
                                {isEditingStage ? (
                                  <RowMeta
                                    label="Output"
                                    value={row.shot?.finalOutputApprovalStatus || row.shot?.audioWorkflowStatus || row.shot?.audioStatus || "--"}
                                  />
                                ) : null}
                              </div>
                            </div>

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <StageStatusPill status={row.stageStatus} />
                                {isDelayed ? <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">Late</span> : null}
                              </div>
                              {assignmentSummary.leadUser ? (
                                <EmployeeAvailabilityHoverCard user={assignmentSummary.leadUser} summary={summariesByUserId[Number(assignmentSummary.leadUser.id)]} roleLabel="Lead Artist" className="mt-2 block">
                                  <div className="flex min-w-0 items-center gap-2.5">
                                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-950 text-[10px] font-bold text-white">
                                      {initials(assignmentSummary.leadUser.name || "U")}
                                    </span>
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-slate-950">{assignmentSummary.leadUser.name}</p>
                                      <p className="truncate text-[11px] text-slate-500">
                                        {leadDepartment} · {assignmentSummary.supportCount > 0 ? `${assignmentSummary.supportCount} support` : "Lead artist"}
                                      </p>
                                    </div>
                                  </div>
                                </EmployeeAvailabilityHoverCard>
                              ) : (
                                <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                                  Lead artist not assigned.
                                </div>
                              )}
                            </div>

                            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-3">
                              <RowMeta label="Start" value={formatWorkspaceShortDate(resolveStageStart(row))} emphasize />
                              <RowMeta label="End" value={formatWorkspaceShortDate(resolveStageEnd(row))} emphasize />
                              <RowMeta label="Time" children={<div className="mt-0.5"><DurationPill minutes={duration} /></div>} />
                            </div>

                            <div className="flex items-center gap-1.5 xl:justify-end">
                              <IconToolbarButton
                                title="Quick edit"
                                onClick={() => {
                                  if (!expandedRows[row.stageId]) {
                                    toggleExpanded(row.stageId);
                                  } else {
                                    focusExpandedRow(row.stageId);
                                  }
                                }}
                                disabled={busy}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </IconToolbarButton>
                              <IconToolbarButton title="Move up" onClick={() => moveShot(row, -1)} disabled={busy}>
                                <ArrowUp className="h-3.5 w-3.5" />
                              </IconToolbarButton>
                              <IconToolbarButton title="Move down" onClick={() => moveShot(row, 1)} disabled={busy}>
                                <ArrowDown className="h-3.5 w-3.5" />
                              </IconToolbarButton>
                              <IconToolbarButton title="Duplicate" onClick={() => duplicateShot(row)} disabled={busy}>
                                <Copy className="h-3.5 w-3.5" />
                              </IconToolbarButton>
                              <IconToolbarButton title="Delete" onClick={() => setDeleteState({ open: true, shot: row, many: [] })} disabled={busy} tone="danger">
                                <Trash2 className="h-3.5 w-3.5" />
                              </IconToolbarButton>
                              <IconToolbarButton title={expanded ? "Collapse" : "Expand"} onClick={() => toggleExpanded(row.stageId)} disabled={busy}>
                                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </IconToolbarButton>
                            </div>
                          </div>

                          {expanded ? (
                            <div className="border-t border-slate-200 bg-slate-50/60 px-3 py-3">
                              <div className="space-y-3">
                                <div className="flex flex-col gap-3 rounded-[16px] border border-slate-200/80 bg-white/85 px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full border border-slate-200 bg-slate-950 px-2.5 py-1 text-[11px] font-semibold tracking-[0.12em] text-white">
                                      {buildShotId(row.shot?.shotNumber)}
                                    </span>
                                    <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                                      {row.sequence || "MAIN"}
                                    </span>
                                    <StageStatusPill status={row.stageStatus} />
                                    {assignmentSummary.leadUser ? (
                                      <EmployeeAvailabilityHoverCard
                                        user={assignmentSummary.leadUser}
                                        summary={summariesByUserId[Number(assignmentSummary.leadUser.id)]}
                                        roleLabel="Lead Artist"
                                        className="block"
                                      >
                                        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
                                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-950 text-[10px] font-bold text-white">
                                            {initials(assignmentSummary.leadUser.name || "U")}
                                          </span>
                                          <span className="font-semibold text-slate-950">{assignmentSummary.leadUser.name}</span>
                                        </div>
                                      </EmployeeAvailabilityHoverCard>
                                    ) : (
                                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                                        Unassigned
                                      </span>
                                    )}
                                    <DurationPill minutes={duration} />
                                    {isDelayed ? <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">Late</span> : null}
                                  </div>

                                  <div className="flex flex-wrap gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleStatusChange(row, "TEST", "Shot marked as test")}
                                      className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-800 transition hover:bg-cyan-100"
                                      disabled={busy}
                                    >
                                      Test
                                    </button>
                                    {canReview ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleStatusChange(row, "APPROVED", "Lead Approve applied")}
                                          className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-100"
                                          disabled={busy}
                                        >
                                          Approve
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleStatusChange(row, "RTK", "Lead Retake applied")}
                                          className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-700 transition hover:bg-orange-100"
                                          disabled={busy}
                                        >
                                          Retake
                                        </button>
                                      </>
                                    ) : null}
                                    <button
                                      type="button"
                                      onClick={() => toggleComments(row.stageId)}
                                      className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                                    >
                                      {commentsOpen ? "Hide Comments" : commentCount > 0 ? `Comments ${commentCount}` : "Comments"}
                                    </button>
                                    {isEditingStage ? (
                                      <button
                                        type="button"
                                        onClick={() => openOutputEditor(row.shot)}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                                      >
                                        <NotebookPen className="h-3.5 w-3.5" /> Output
                                      </button>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="grid gap-2 rounded-[16px] border border-slate-200/80 bg-white/85 px-3 py-3 lg:grid-cols-[minmax(0,1.1fr)_180px_210px_210px_auto_160px]">
                                  <label className="space-y-1">
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Shot Label</span>
                                    <input
                                      defaultValue={deriveShotLabel(row.shot)}
                                      onBlur={(event) => {
                                        const nextName = event.target.value.trim();
                                        if (nextName && nextName !== deriveShotLabel(row.shot)) {
                                          updateShot(row.shotId, { name: nextName, label: nextName }, { name: nextName, label: nextName }, "Shot label updated");
                                        }
                                      }}
                                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                                    />
                                  </label>

                                  <label className="space-y-1">
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Frame Range</span>
                                    <input
                                      defaultValue={frameRangeLabel}
                                      onBlur={(event) => handleFrameRangeBlur(row, event.target.value)}
                                      placeholder="101-148"
                                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                                    />
                                  </label>

                                  <label className="space-y-1">
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Start Date</span>
                                    <input
                                      type="date"
                                      value={formatDateTimeInput(resolveStageStart(row)).slice(0, 10)}
                                      onChange={(event) =>
                                        updateStage(
                                          row.stageId,
                                          { startedAt: event.target.value || null, startDate: event.target.value || null },
                                          { startedAt: event.target.value || null, startDate: event.target.value || null },
                                          "Start time updated"
                                        )
                                      }
                                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                                      disabled={busy}
                                    />
                                  </label>

                                  <label className="space-y-1">
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">End Date</span>
                                    <input
                                      type="date"
                                      value={formatDateTimeInput(resolveStageEnd(row)).slice(0, 10)}
                                      onChange={(event) =>
                                        updateStage(
                                          row.stageId,
                                          { endedAt: event.target.value || null, endDate: event.target.value || null },
                                          { endedAt: event.target.value || null, endDate: event.target.value || null },
                                          "End time updated"
                                        )
                                      }
                                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                                      disabled={busy}
                                    />
                                  </label>

                                  <div className="space-y-1">
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Duration</span>
                                    <div className="flex h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
                                      <span className="text-sm font-semibold text-slate-900">{frameCount ? `${frameCount}f` : "--"}</span>
                                      <span className="text-slate-400">→</span>
                                      <span className="text-sm font-semibold text-violet-700">{seconds ? `${seconds}s` : "--"}</span>
                                    </div>
                                  </div>

                                  <label className="space-y-1">
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Status</span>
                                    <select
                                      value={row.stageStatus || "YTS"}
                                      onChange={(event) => handleStatusChange(row, event.target.value)}
                                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                                      disabled={busy}
                                    >
                                      {STAGE_STATUSES.map((status) => (
                                        <option key={status} value={status}>{getStatusOptionLabel(status)}</option>
                                      ))}
                                    </select>
                                  </label>
                                </div>

                                <div className="rounded-[16px] border border-slate-200/80 bg-white/85 px-3 py-3">
                                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Assignment</p>
                                      <p className="text-xs text-slate-500">Department-first recommendations with manager override.</p>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                                        Lead {assignmentSummary.leadUser?.name || "None"}
                                      </span>
                                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                                        {assignmentSummary.supportCount} support
                                      </span>
                                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                                        {assignmentSummary.totalArtists} total
                                      </span>
                                    </div>
                                  </div>

                                  <CompactAssignmentStrip
                                    users={activeUsers}
                                    recommendedDepartment={recommendedDepartment}
                                    assignments={assignmentSummary.assignments}
                                    summariesByUserId={summariesByUserId}
                                    disabled={busy}
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
                                  />
                                </div>

                                <div className="grid gap-2 rounded-[16px] border border-slate-200/80 bg-white/85 px-3 py-3 md:grid-cols-3">
                                  <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Started</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-900">{formatWorkspaceDateTime(resolveStageStart(row))}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Deadline</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-900">{formatWorkspaceDateTime(row.deadline || resolveStageEnd(row))}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Latest Review</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-900">{formatWorkspaceDateTime(row.approvedAt || row.submittedAt)}</p>
                                  </div>
                                </div>

                                <details className="overflow-hidden rounded-[16px] border border-slate-200/80 bg-white/85">
                                  <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-semibold text-slate-900">
                                    Notes, feedback, and timeline
                                    <span className="text-[11px] font-medium text-slate-500">Expand</span>
                                  </summary>
                                  <div className="space-y-3 border-t border-slate-200/80 px-3 py-3">
                                    <label className="space-y-1">
                                      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Notes</span>
                                      <textarea
                                        defaultValue={row.notes || ""}
                                        rows={3}
                                        onBlur={(event) => {
                                          const nextValue = event.target.value.trim();
                                          if ((row.notes || "") !== nextValue) {
                                            updateStage(row.stageId, { notes: nextValue || null }, { notes: nextValue || null }, "Notes updated");
                                          }
                                        }}
                                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                                        placeholder="Blocking notes, acting direction, handoff details, or technical reminders"
                                      />
                                    </label>

                                    {row.feedback ? (
                                      <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-700">Lead Feedback</p>
                                        <p className="mt-1 whitespace-pre-wrap">{row.feedback}</p>
                                      </div>
                                    ) : null}

                                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                                      {historyItems.length ? (
                                        historyItems.map((item) => (
                                          <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</span>
                                            <p className="mt-1 font-semibold text-slate-900">{formatWorkspaceDateTime(item.value)}</p>
                                          </div>
                                        ))
                                      ) : (
                                        <p className="text-sm text-slate-500">No timeline stamps yet for this shot.</p>
                                      )}
                                    </div>
                                  </div>
                                </details>

                                {commentsOpen ? (
                                  <div className="rounded-[16px] border border-slate-200/80 bg-white px-3 py-3">
                                    <StageCommentThread
                                      stageId={row.stageId}
                                      currentUser={currentUser}
                                      isManager
                                      resource="shot"
                                      onCountChange={(count) => setCommentCountsByStageId((prev) => ({ ...prev, [row.stageId]: count }))}
                                    />
                                  </div>
                                ) : null}

                                {isEditingStage && (row.shot?.finalOutputName || row.shot?.finalOutput || row.shot?.audioWorkflowStatus || row.shot?.audioStatus) ? (
                                  <div className="flex flex-wrap items-center gap-2 rounded-[16px] border border-slate-200/80 bg-white/85 px-3 py-3 text-xs text-slate-600">
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                                      Audio {row.shot?.audioWorkflowStatus || row.shot?.audioStatus || "Pending"}
                                    </span>
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                                      Output {row.shot?.finalOutputName || row.shot?.finalOutput || "Not logged"}
                                    </span>
                                    {row.shot?.finalOutputVersion ? (
                                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                                        Version {row.shot.finalOutputVersion}
                                      </span>
                                    ) : null}
                                  </div>
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
                          onChange={(event) => {
                            setCreateForm((prev) => ({ ...prev, name: event.target.value }));
                            setCreateErrors((prev) => ({ ...prev, name: "" }));
                          }}
                          placeholder="INTRO or SEQ_A_SH010"
                          className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                        />
                        <InlineError>{createErrors.name}</InlineError>
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
                      <p className="mt-1 text-sm text-slate-500">Start date defaults to today so production timing starts without extra clicks.</p>
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
                          type="date"
                          value={createForm.startedAt || todayDateInput()}
                          onChange={(event) => {
                            setCreateForm((prev) => ({ ...prev, startedAt: event.target.value || todayDateInput() }));
                            setCreateErrors((prev) => ({ ...prev, startedAt: "" }));
                          }}
                          className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                        />
                        <InlineError>{createErrors.startedAt}</InlineError>
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">End Date</span>
                        <input
                          type="date"
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
                <p className="font-semibold">Required: shot label, frame range, assigned artist, status, start date.</p>
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
