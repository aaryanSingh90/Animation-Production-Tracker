import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Copy,
  Layers3,
  Link2,
  NotebookPen,
  Plus,
  Search,
  Trash2,
  Users,
  X
} from "lucide-react";
import api from "../lib/api";
import Loader from "./Loader";
import Modal from "./Modal";
import StatusBadge from "./StatusBadge";
import FlexibleAssignmentField from "./FlexibleAssignmentField";
import useEmployeeAvailabilitySummaries from "../hooks/useEmployeeAvailabilitySummaries";
import { EmployeeAvailabilityHoverCard } from "./EmployeeAvailabilityHoverCard";
import { formatDate, formatDateInput, formatDurationMinutes, getDepartmentLabel, initials, todayDateInput } from "../utils/format";
import { STAGE_STATUSES, getStatusOptionLabel, isCompleteStatus, isLateStatus } from "../utils/constants";
import { buildAssetCategoryPath } from "../utils/stageRouting";
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
const QUICK_CREATE_SUCCESS_TIMEOUT_MS = 1200;

const SECTION_CONFIG = {
  CHARACTER: {
    key: "CHARACTER",
    title: "Characters",
    singular: "Character",
    type: "CHARACTER",
    subCategory: "CHARACTER",
    routeSlug: "characters",
    accent: "from-sky-500/15 to-sky-100",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    button: "bg-sky-600 hover:bg-sky-700",
    countTone: "text-sky-700",
    emptyTitle: "No Character Assets Yet",
    emptyAction: "Create First Character"
  },
  CHARACTER_BLENDSHAPES: {
    key: "CHARACTER_BLENDSHAPES",
    title: "Character Blendshapes",
    singular: "Blendshape",
    type: "CHARACTER",
    subCategory: "CHARACTER_BLENDSHAPES",
    routeSlug: "blendshapes",
    accent: "from-violet-500/15 to-violet-100",
    badge: "border-violet-200 bg-violet-50 text-violet-700",
    button: "bg-violet-600 hover:bg-violet-700",
    countTone: "text-violet-700",
    emptyTitle: "No Blendshape Assets Yet",
    emptyAction: "Create First Blendshape"
  },
  PROP: {
    key: "PROP",
    title: "Props",
    singular: "Prop",
    type: "PROP",
    subCategory: "PROP",
    routeSlug: "props",
    accent: "from-orange-500/15 to-orange-100",
    badge: "border-orange-200 bg-orange-50 text-orange-700",
    button: "bg-orange-600 hover:bg-orange-700",
    countTone: "text-orange-700",
    emptyTitle: "No Prop Assets Yet",
    emptyAction: "Create First Prop"
  },
  BG: {
    key: "BG",
    title: "BG Assets",
    singular: "BG Asset",
    type: "BG",
    subCategory: "BG",
    routeSlug: "bg",
    accent: "from-emerald-500/15 to-emerald-100",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    button: "bg-emerald-600 hover:bg-emerald-700",
    countTone: "text-emerald-700",
    emptyTitle: "No BG Assets Yet",
    emptyAction: "Create First BG Asset"
  }
};

const STAGE_SECTION_KEYS = {
  MODELLING: ["CHARACTER", "CHARACTER_BLENDSHAPES", "PROP", "BG"],
  UNWRAPPING: ["CHARACTER", "PROP", "BG"],
  TEXTURING: ["CHARACTER", "PROP", "BG"],
  RIGGING: ["CHARACTER", "PROP", "BG"]
};

function createInitialForm(sectionKey) {
  return {
    name: "",
    status: "YTS",
    assignments: [],
    startedAt: todayDateInput(),
    endedAt: "",
    notes: "",
    description: "",
    referenceImageUrl: ""
  };
}

function useDebouncedValue(value, delayMs = 180) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debounced;
}

function getNamePlaceholder(sectionSingular) {
  const normalized = String(sectionSingular || "asset").toLowerCase();
  if (normalized === "character") return "Enter character name";
  if (normalized === "blendshape") return "Enter blendshape name";
  if (normalized === "bg asset") return "Enter background asset name";
  return `Enter ${normalized} name`;
}

function toStageAssignments(assignments = []) {
  return normalizeAssignmentList(assignments).map((assignment) => ({
    employeeId: Number(assignment.employeeId),
    roleType: assignment.roleType === "SUPPORT" ? "SUPPORT" : "LEAD",
    ...(assignment.departmentId ? { departmentId: String(assignment.departmentId) } : {})
  }));
}

function buildStageUpdatePayload({
  status,
  assignments = [],
  startedAt,
  endedAt,
  notes = "",
  assignedUserId = null
}) {
  const safeStart = String(startedAt || "").trim() || todayDateInput();
  const safeEnd = String(endedAt || "").trim();
  const safeStatus = STAGE_STATUSES.includes(status) ? status : "YTS";
  const safeAssignments = toStageAssignments(assignments);
  const lead = getLeadAssignment(safeAssignments);

  return {
    status: safeStatus,
    assignedUserId: Number(assignedUserId || lead?.employeeId || 0) || null,
    assignments: safeAssignments,
    startedAt: safeStart,
    startDate: safeStart,
    endedAt: safeEnd || null,
    endDate: safeEnd || null,
    notes: typeof notes === "string" ? notes : ""
  };
}

function validateStageCreatePayload({ assetName, projectId, stageId, payload }) {
  const errors = {};
  if (!String(assetName || "").trim()) errors.assetName = "Asset name is required";
  if (!Number.isFinite(Number(projectId)) || Number(projectId) <= 0) errors.projectId = "Project id is required";
  if (!String(stageId || "").trim()) errors.stageId = "Stage id is required";
  if (!payload?.status || !STAGE_STATUSES.includes(payload.status)) errors.status = "Valid status is required";
  if (!payload?.startedAt) errors.startDate = "Start date is required";
  if (!Number(payload?.assignedUserId)) errors.artistId = "Artist id is required";
  if (!Array.isArray(payload?.assignments) || !payload.assignments.length) errors.assignments = "Assignment is required";
  return errors;
}

function logStagePayload(context, payload) {
  console.log(`[asset-stage-payload:${context}]`, payload);
}

function validateEditorForm(values) {
  const errors = {};
  if (!String(values.name || "").trim()) errors.name = "Asset name is required.";
  if (!String(values.status || "").trim()) errors.status = "Status is required.";
  if (!normalizeAssignmentList(values.assignments).length) errors.assignments = "Assign at least one artist.";
  if (!String(values.startedAt || "").trim()) errors.startedAt = "Start date is required.";
  return errors;
}

function normalizeStageLabel(value) {
  if (!value) return "Asset";
  if (value === "MODELLING") return "Modelling";
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getSectionKeyForAsset(asset) {
  if (asset?.subCategory === "CHARACTER_BLENDSHAPES") return "CHARACTER_BLENDSHAPES";
  if (asset?.subCategory === "PROP" || asset?.type === "PROP") return "PROP";
  if (asset?.subCategory === "BG" || asset?.type === "BG" || asset?.type === "ENVIRONMENT") return "BG";
  return "CHARACTER";
}

function getStageForCode(asset, stageCode) {
  return (asset?.stages || []).find((stage) => String(stage?.stageDefinition?.code || "").toUpperCase() === String(stageCode || "").toUpperCase()) || null;
}

function sortByAssetOrder(items) {
  return [...items].sort((a, b) => {
    const orderDelta = Number(a.order || 0) - Number(b.order || 0);
    if (orderDelta !== 0) return orderDelta;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
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

  const endValue = resolveStageEnd(stage);
  const endTime = endValue ? new Date(endValue).getTime() : stage?.isTimerRunning ? nowTick : null;
  const startTime = new Date(startedAt).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) return null;

  return Math.max(1, Math.round((endTime - startTime) / 60000));
}

function getDurationTone(minutes) {
  if (!minutes) return "border-slate-200 bg-slate-100 text-slate-600";
  if (minutes < 60) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (minutes < 480) return "border-sky-200 bg-sky-50 text-sky-700";
  if (minutes < 1440) return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function isOverdue(stage) {
  return isLateStatus(stage?.status, stage?.endDate || stage?.deadline);
}

function uniqueArtistCount(entries) {
  return new Set(
    entries.flatMap((entry) =>
      getStageAssignments(entry.stage).map((assignment) => Number(assignment.employeeId || assignment.employee?.id || 0)).filter(Boolean)
    )
  ).size;
}

function sumDurationMinutes(entries, nowTick) {
  return entries.reduce((sum, entry) => sum + (resolveDurationMinutes(entry.stage, nowTick) || 0), 0);
}

function getSectionStats(assets, stageCode, nowTick) {
  const activeEntries = assets
    .filter((asset) => !asset.isArchived)
    .map((asset) => ({ asset, stage: getStageForCode(asset, stageCode) }))
    .filter((entry) => Boolean(entry.stage));

  return {
    total: activeEntries.length,
    completed: activeEntries.filter((entry) => isCompleteStatus(entry.stage.status)).length,
    inProgress: activeEntries.filter((entry) => entry.stage.status === "IP").length,
    overdue: activeEntries.filter((entry) => isOverdue(entry.stage)).length,
    final: activeEntries.filter((entry) => entry.stage.status === "FINAL").length,
    assignedArtists: uniqueArtistCount(activeEntries),
    totalMinutes: sumDurationMinutes(activeEntries, nowTick),
    completionPercent: activeEntries.length ? Math.round((activeEntries.filter((entry) => isCompleteStatus(entry.stage.status)).length / activeEntries.length) * 100) : 0
  };
}

function patchAssetStage(asset, stageId, patch) {
  return {
    ...asset,
    stages: (asset.stages || []).map((stage) => (stage.id === stageId ? { ...stage, ...patch } : stage))
  };
}

function getStageAssignments(stage) {
  return stage?.taskAssignments?.length ? stage.taskAssignments : normalizeAssignmentList(stage);
}

function resolvePreferredDepartment(users, recommendedDepartment) {
  if (recommendedDepartment && countUsersByDepartment(users, recommendedDepartment) > 0) return recommendedDepartment;
  return buildDepartmentOptions(users, recommendedDepartment)[0] || "";
}

function buildLeadAssignment(users, employeeId) {
  const resolvedId = Number(employeeId || 0);
  if (!resolvedId) return [];
  const employee = users.find((user) => Number(user.id) === resolvedId) || null;
  if (!employee) return [];
  return [
    {
      employeeId: resolvedId,
      roleType: "LEAD",
      departmentId: employee.departmentId || null,
      employee,
      department: employee.department || employee.departmentInfo || null
    }
  ];
}

function WorkspaceMetric({ label, value, caption, tone = "text-slate-900" }) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white/85 px-4 py-3 shadow-sm shadow-slate-200/35 backdrop-blur">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tracking-tight ${tone}`}>{value}</p>
      {caption ? <p className="mt-1 text-xs text-slate-500">{caption}</p> : null}
    </div>
  );
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

function ModalSection({ title, description, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ArtistCandidateCard({ user, summary, assigned, disabled, onAssign }) {
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
                {summary?.activeTasks ?? 0} active · {summary?.workloadPercent ?? 0}% load
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
          {assigned ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {assigned ? "Assigned" : "Assign"}
        </button>
      </div>
    </EmployeeAvailabilityHoverCard>
  );
}

function ModalAssignmentPicker({
  users,
  recommendedDepartment,
  assignments,
  onChange,
  disabled = false
}) {
  const normalizedAssignments = useMemo(() => normalizeAssignmentList(assignments), [assignments]);
  const departmentOptions = useMemo(() => buildDepartmentOptions(users, recommendedDepartment), [users, recommendedDepartment]);
  const summariesByUserId = useEmployeeAvailabilitySummaries(users);
  const assignedDepartment = useMemo(
    () => (normalizedAssignments[0]?.employee ? getDepartmentLabel(normalizedAssignments[0].employee) : ""),
    [normalizedAssignments]
  );
  const recommendedDepartmentCount = useMemo(
    () => countUsersByDepartment(users, recommendedDepartment),
    [users, recommendedDepartment]
  );
  const defaultDepartment = assignedDepartment || (recommendedDepartmentCount > 0 ? recommendedDepartment : "");

  const [selectedDepartment, setSelectedDepartment] = useState(defaultDepartment);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!selectedDepartment && defaultDepartment) {
      setSelectedDepartment(defaultDepartment);
      return;
    }

    if (selectedDepartment === recommendedDepartment && !recommendedDepartmentCount && !assignedDepartment) {
      setSelectedDepartment("");
    }
  }, [assignedDepartment, defaultDepartment, recommendedDepartment, recommendedDepartmentCount, selectedDepartment]);

  const filteredUsers = useMemo(() => {
    const scoped = filterUsersByDepartment(users, selectedDepartment);
    const query = search.trim().toLowerCase();
    const filtered = !query
      ? scoped
      : scoped.filter((user) => {
          const haystack = [
            user.name,
            user.email,
            getDepartmentLabel(user),
            getEmploymentLabel(user.employmentType)
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        });
    return sortUsersBySmartAvailability(filtered, summariesByUserId, selectedDepartment || recommendedDepartment);
  }, [recommendedDepartment, search, selectedDepartment, summariesByUserId, users]);

  const assignmentWarning = useMemo(() => {
    const found = normalizedAssignments.find((assignment) => getOverloadWarning(summariesByUserId[Number(assignment.employeeId)]));
    if (!found) return "";
    const employee = found.employee || users.find((user) => Number(user.id) === Number(found.employeeId));
    if (!employee) return "";
    return `${employee.name}: ${getOverloadWarning(summariesByUserId[Number(found.employeeId)])}`;
  }, [normalizedAssignments, summariesByUserId, users]);

  function commit(nextAssignments) {
    onChange?.(ensureSingleLead(nextAssignments));
  }

  function handleAssign(user) {
    const employeeId = Number(user.id);
    const exists = normalizedAssignments.some((assignment) => assignment.employeeId === employeeId);
    if (exists) return;

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

  function handleRoleChange(employeeId, roleType) {
    commit(
      normalizedAssignments.map((assignment) => ({
        ...assignment,
        roleType: assignment.employeeId === employeeId ? roleType : assignment.roleType
      }))
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Department</span>
          <select
            value={selectedDepartment}
            onChange={(event) => setSelectedDepartment(event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            disabled={disabled}
          >
            <option value="">All departments</option>
            {departmentOptions.map((department) => (
              <option key={department} value={department}>
                {department}{department === recommendedDepartment ? " · Recommended" : ""}
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
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, department, email, or type"
              className="w-full rounded-xl border border-slate-300 bg-white px-10 py-2 text-sm"
              disabled={disabled}
            />
          </label>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-2">
          <Users className="h-4 w-4" />
          <span className="font-semibold text-slate-900">{filteredUsers.length}</span>
          <span>artists available in</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-700">
            {selectedDepartment || "All departments"}
          </span>
        </div>
        {recommendedDepartment && !recommendedDepartmentCount ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
            {recommendedDepartment} has no active staff
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredUsers.length ? (
          filteredUsers.map((user) => (
            <ArtistCandidateCard
              key={user.id}
              user={user}
              summary={summariesByUserId[Number(user.id)]}
              assigned={normalizedAssignments.some((assignment) => assignment.employeeId === Number(user.id))}
              disabled={disabled}
              onAssign={handleAssign}
            />
          ))
        ) : (
          <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
            <p>No employees found in this department.</p>
            <button
              type="button"
              onClick={() => setSelectedDepartment("")}
              disabled={disabled}
              className="mt-2 font-semibold text-slate-700 underline-offset-2 hover:underline disabled:opacity-60"
            >
              Select Another Department
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Assigned Artists</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {normalizedAssignments.length ? (
            normalizedAssignments.map((assignment) => {
              const employee = assignment.employee || users.find((user) => user.id === assignment.employeeId) || null;
              if (!employee) return null;

              return (
                <EmployeeAvailabilityHoverCard key={assignment.employeeId} user={employee} summary={summariesByUserId[Number(assignment.employeeId)]} roleLabel={assignment.roleType === "LEAD" ? "Lead Artist" : "Support Artist"} className="block">
                  <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                      {initials(employee.name)}
                    </span>
                    <span className="truncate font-semibold text-slate-900">{employee.name}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getEmploymentBadgeClasses(employee.employmentType)}`}>
                      {employee.employmentType === "FREELANCE" ? "FREELANCE" : "IN-HOUSE"}
                    </span>
                    <select
                      value={assignment.roleType || "SUPPORT"}
                      onChange={(event) => {
                        event.stopPropagation();
                        handleRoleChange(assignment.employeeId, event.target.value);
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold"
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
                      className="rounded-full p-1 text-slate-500 transition hover:bg-white hover:text-slate-900"
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
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-500">
              No artists assigned yet.
            </div>
          )}
        </div>
      </div>
      {assignmentWarning ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {assignmentWarning}
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ projectId, projectName, stageCode, stageLabel, breadcrumbState, section, stats }) {
  return (
    <Link
      to={buildAssetCategoryPath(projectId, stageCode, section.key)}
      state={breadcrumbState}
      className="group rounded-[30px] border border-slate-200/80 bg-white/90 p-5 shadow-sm shadow-slate-200/35 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/45"
    >
      <div className={`rounded-[26px] bg-gradient-to-br ${section.accent} p-4`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${section.badge}`}>
              {section.title}
            </div>
            <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">{section.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{projectName} · {stageLabel}</p>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 text-right shadow-sm">
            <p className={`text-3xl font-bold ${section.countTone}`}>{stats.total}</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Assets</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <WorkspaceMetric label="Completed" value={stats.completed} tone="text-emerald-700" />
        <WorkspaceMetric label="In Progress" value={stats.inProgress} tone="text-sky-700" />
        <WorkspaceMetric label="Overdue" value={stats.overdue} tone="text-rose-700" />
        <WorkspaceMetric label="Assigned Artists" value={stats.assignedArtists} tone="text-slate-900" />
        <WorkspaceMetric label="Total Time" value={formatDurationMinutes(stats.totalMinutes)} tone="text-violet-700" />
        <WorkspaceMetric label="Completion" value={`${stats.completionPercent}%`} tone="text-slate-900" />
      </div>

      <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Open dedicated workspace</p>
          <p className="text-xs text-slate-500">Manage {section.title.toLowerCase()} in a compact production table.</p>
        </div>
        <span className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition group-hover:bg-slate-800">Open</span>
      </div>
    </Link>
  );
}

function DurationPill({ minutes }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getDurationTone(minutes)}`}>{formatDurationMinutes(minutes)}</span>;
}

function AssignedArtistsSummary({ assignments, users, compact = false }) {
  const normalizedAssignments = normalizeAssignmentList(assignments);
  if (!normalizedAssignments.length) {
    return <span className="text-xs font-medium text-slate-400">Unassigned</span>;
  }

  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? "max-w-full" : ""}`}>
      {normalizedAssignments.slice(0, compact ? 2 : 3).map((assignment) => {
        const employee = assignment.employee || users.find((user) => Number(user.id) === Number(assignment.employeeId)) || null;
        if (!employee) return null;
        return (
          <span key={assignment.employeeId} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[9px] font-bold text-white">
              {initials(employee.name)}
            </span>
            <span className="truncate">{employee.name}</span>
          </span>
        );
      })}
      {normalizedAssignments.length > (compact ? 2 : 3) ? (
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
          +{normalizedAssignments.length - (compact ? 2 : 3)}
        </span>
      ) : null}
    </div>
  );
}

function QuickCreateRow({ section, users, recommendedDepartment, disabled, onCreate }) {
  const departmentOptions = useMemo(() => buildDepartmentOptions(users, recommendedDepartment), [users, recommendedDepartment]);
  const [draft, setDraft] = useState(() => ({
    name: "",
    department: resolvePreferredDepartment(users, recommendedDepartment),
    employeeId: "",
    status: "YTS",
    startedAt: todayDateInput(),
    endedAt: ""
  }));
  const [errors, setErrors] = useState({});
  const [createState, setCreateState] = useState("idle");

  useEffect(() => {
    setDraft({
      name: "",
      department: resolvePreferredDepartment(users, recommendedDepartment),
      employeeId: "",
      status: "YTS",
      startedAt: todayDateInput(),
      endedAt: ""
    });
    setErrors({});
    setCreateState("idle");
  }, [section.key, users, recommendedDepartment]);

  useEffect(() => {
    if (createState !== "success") return undefined;
    const timeoutId = window.setTimeout(() => setCreateState("idle"), QUICK_CREATE_SUCCESS_TIMEOUT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [createState]);

  const artists = useMemo(() => {
    const scoped = filterUsersByDepartment(users, draft.department);
    return scoped.sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")));
  }, [draft.department, users]);

  const canCreate =
    Boolean(String(draft.name || "").trim()) &&
    Boolean(String(draft.status || "").trim()) &&
    Boolean(String(draft.startedAt || "").trim()) &&
    Boolean(String(draft.employeeId || "").trim());

  function validateDraft(values) {
    const nextErrors = {};
    if (!String(values.name || "").trim()) nextErrors.name = `${section.singular} name is required`;
    if (!String(values.employeeId || "").trim()) nextErrors.employeeId = "Assigned artist is required";
    if (!String(values.status || "").trim()) nextErrors.status = "Status is required";
    if (!String(values.startedAt || "").trim()) nextErrors.startedAt = "Start date is required";
    return nextErrors;
  }

  function getFieldClass(hasError) {
    return `h-11 w-full rounded-xl bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition ${
      hasError
        ? "border border-rose-300 focus:border-rose-500"
        : "border border-slate-300 focus:border-slate-500"
    }`;
  }

  async function handleCreate() {
    if (disabled || createState === "loading") return;
    const nextErrors = validateDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setCreateState("loading");
    try {
      await onCreate({
        name: String(draft.name || "").trim(),
        status: draft.status || "YTS",
        assignments: buildLeadAssignment(users, draft.employeeId),
        startedAt: draft.startedAt || todayDateInput(),
        endedAt: draft.endedAt || ""
      });

      setDraft((prev) => ({
        name: "",
        department: prev.department,
        employeeId: "",
        status: "YTS",
        startedAt: todayDateInput(),
        endedAt: ""
      }));
      setErrors({});
      setCreateState("success");
    } catch (_error) {
      setCreateState("idle");
      setErrors((prev) => ({
        ...prev,
        form: `Unable to create ${section.singular.toLowerCase()}. Please check required fields.`
      }));
    }
  }

  return (
    <section className="rounded-[24px] border border-slate-200/80 bg-white/95 p-3.5 shadow-sm shadow-slate-200/30 backdrop-blur">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{section.title} production table</p>
          <h3 className="mt-1 text-base font-semibold tracking-tight text-slate-950">Quick add {section.singular.toLowerCase()}</h3>
        </div>
        <span className="text-xs text-slate-500">Fast row entry optimized for production managers.</span>
      </div>

      <div className="mt-3 space-y-2">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(340px,2.25fr)_minmax(240px,1.45fr)_170px_170px_150px]">
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{section.singular} Name</span>
            <input
              value={draft.name}
              onChange={(event) => {
                setDraft((prev) => ({ ...prev, name: event.target.value }));
                setErrors((prev) => ({ ...prev, name: "" }));
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleCreate();
                }
              }}
              placeholder={getNamePlaceholder(section.singular)}
              className={`${getFieldClass(Boolean(errors.name))} min-w-0 text-[15px]`}
              disabled={disabled}
            />
            <InlineError>{errors.name}</InlineError>
          </label>

          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Artist</span>
            <select
              value={draft.employeeId}
              onChange={(event) => {
                setDraft((prev) => ({ ...prev, employeeId: event.target.value }));
                setErrors((prev) => ({ ...prev, employeeId: "" }));
              }}
              className={getFieldClass(Boolean(errors.employeeId))}
              disabled={disabled}
            >
              <option value="">{artists.length ? "Assign artist" : "No employees found"}</option>
              {artists.map((artist) => (
                <option key={artist.id} value={artist.id}>
                  {artist.name} · {getEmploymentLabel(artist.employmentType)}
                </option>
              ))}
            </select>
            <InlineError>{errors.employeeId}</InlineError>
          </label>

          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Status</span>
            <select
              value={draft.status}
              onChange={(event) => {
                setDraft((prev) => ({ ...prev, status: event.target.value }));
                setErrors((prev) => ({ ...prev, status: "" }));
              }}
              className={getFieldClass(Boolean(errors.status))}
              disabled={disabled}
            >
              {STAGE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {getStatusOptionLabel(status)}
                </option>
              ))}
            </select>
            <InlineError>{errors.status}</InlineError>
          </label>

          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Start Date</span>
            <input
              type="date"
              value={draft.startedAt || todayDateInput()}
              onChange={(event) => {
                setDraft((prev) => ({ ...prev, startedAt: event.target.value || todayDateInput() }));
                setErrors((prev) => ({ ...prev, startedAt: "" }));
              }}
              className={getFieldClass(Boolean(errors.startedAt))}
              disabled={disabled}
            />
            <InlineError>{errors.startedAt}</InlineError>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!canCreate || disabled || createState === "loading"}
              className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm ${section.button} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <Plus className="h-4 w-4" />
              {createState === "loading" ? "Creating..." : createState === "success" ? "Created ✓" : "Create"}
            </button>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[260px_180px_1fr]">
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Department (Optional)</span>
            <select
              value={draft.department}
              onChange={(event) => setDraft((prev) => ({ ...prev, department: event.target.value, employeeId: "" }))}
              className={getFieldClass(false)}
              disabled={disabled}
            >
              <option value="">All departments</option>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}{department === recommendedDepartment ? " · Recommended" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">End Date (Optional)</span>
            <input
              type="date"
              value={draft.endedAt}
              onChange={(event) => setDraft((prev) => ({ ...prev, endedAt: event.target.value }))}
              className={getFieldClass(false)}
              disabled={disabled}
            />
          </label>

          <div className="flex items-end justify-between gap-2 text-xs text-slate-500">
            <span>Required: name, artist, status, start date.</span>
            {!artists.length && draft.department ? (
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, department: "", employeeId: "" }))}
                className="font-semibold text-slate-700 underline-offset-2 hover:underline"
              >
                Select another department
              </button>
            ) : (
              <span>End date stays optional.</span>
            )}
          </div>
        </div>
      </div>

      {errors.form ? <p className="mt-2 text-xs font-semibold text-rose-600">{errors.form}</p> : null}
    </section>
  );
}

function WorkspaceToolbar({
  filters,
  onFilterChange,
  users,
  recommendedDepartment,
  section,
  selectedCount,
  bulkDraft,
  onBulkDraftChange,
  onBulkAssign,
  onBulkStatus,
  onBulkDelete,
  onSelectVisible,
  allVisibleSelected,
  visibleCount,
  disabled,
  onOpenCreate,
  stageLabel
}) {
  const sortedUsers = useMemo(
    () => [...users].sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""))),
    [users]
  );

  return (
    <div className="space-y-2.5 rounded-[24px] border border-slate-200/80 bg-white/95 p-3.5 shadow-sm shadow-slate-200/30 backdrop-blur">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{stageLabel} control room</p>
          <h3 className="text-base font-semibold tracking-tight text-slate-950">{section.title} production table</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSelectVisible}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {allVisibleSelected ? "Clear visible" : `Select visible (${visibleCount})`}
          </button>
          <button
            type="button"
            onClick={onOpenCreate}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm ${section.button}`}
          >
            <Plus className="h-4 w-4" /> Add {section.singular}
          </button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1.8fr)_180px_240px]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={filters.search}
            onChange={(event) => onFilterChange({ search: event.target.value, page: 1 })}
            placeholder={`Search ${section.title.toLowerCase()}`}
            className="h-10 w-full rounded-xl border border-slate-300 bg-white px-10 py-2 text-sm shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500"
          />
        </label>
        <select value={filters.status} onChange={(event) => onFilterChange({ status: event.target.value, page: 1 })} className="h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-500">
          <option value="">All statuses</option>
          {STAGE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {getStatusOptionLabel(status)}
            </option>
          ))}
        </select>
        <select value={filters.artistId} onChange={(event) => onFilterChange({ artistId: event.target.value, page: 1 })} className="h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-500">
          <option value="">All artists</option>
          {sortedUsers.map((artist) => (
            <option key={artist.id} value={artist.id}>
              {artist.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-[180px_200px_140px]">
        <select value={filters.archived} onChange={(event) => onFilterChange({ archived: event.target.value, page: 1 })} className="h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-500">
          <option value="active">Active only</option>
          <option value="archived">Archived only</option>
          <option value="all">Active + Archived</option>
        </select>
        <select value={filters.sortBy} onChange={(event) => onFilterChange({ sortBy: event.target.value, page: 1 })} className="h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-500">
          <option value="order">Sort: Pipeline order</option>
          <option value="name">Sort: Name</option>
          <option value="artist">Sort: Artist</option>
          <option value="status">Sort: Status</option>
          <option value="duration">Sort: Duration</option>
          <option value="latest">Sort: Latest</option>
        </select>
        <select
          value={String(filters.pageSize)}
          onChange={(event) => onFilterChange({ pageSize: Number(event.target.value), page: 1 })}
          className="h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-500"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              View: {size} rows
            </option>
          ))}
        </select>
      </div>

      {selectedCount > 0 && (
        <div className="rounded-3xl border border-slate-200 bg-slate-50/80 px-3 py-3">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span>{selectedCount} selected</span>
            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold tracking-normal text-slate-700">Bulk actions</span>
          </div>
          <div className="grid gap-2 xl:grid-cols-[minmax(0,1.5fr)_220px_auto_auto_auto]">
            <FlexibleAssignmentField
              users={users}
              recommendedDepartment={recommendedDepartment}
              assignments={bulkDraft.assignments}
              onChange={(assignments) => onBulkDraftChange({ assignments })}
              allowMultiple={false}
              disabled={disabled}
            />
            <select
              value={bulkDraft.status}
              onChange={(event) => onBulkDraftChange({ status: event.target.value })}
              className="rounded-2xl border border-slate-300 px-3 py-2.5 text-sm"
              disabled={disabled}
            >
              <option value="">Choose status</option>
              {STAGE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {getStatusOptionLabel(status)}
                </option>
              ))}
            </select>
            <button type="button" onClick={onBulkAssign} disabled={!bulkDraft.assignments?.length || disabled} className="rounded-full border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40">
              Assign Artist
            </button>
            <button type="button" onClick={onBulkStatus} disabled={!bulkDraft.status || disabled} className="rounded-full border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40">
              Change Status
            </button>
            <button type="button" onClick={onBulkDelete} disabled={disabled} className="rounded-full bg-rose-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              Delete Selected
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DesktopRow({
  asset,
  stage,
  users,
  selected,
  disabled,
  onToggleSelect,
  onMove,
  onEdit,
  onDuplicate,
  onArchive,
  onDelete
}) {
  const leadAssignment = getLeadAssignment(getStageAssignments(stage), stage?.assignedUser);

  return (
    <tr className="border-t border-slate-100 align-top hover:bg-slate-50/70">
      <td className="px-3 py-3">
        <input type="checkbox" checked={selected} onChange={() => onToggleSelect(asset.id)} className="h-4 w-4 rounded border-slate-300" />
      </td>
      <td className="px-3 py-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{asset.name}</p>
          <p className="mt-1 text-xs text-slate-500">{asset.isArchived ? "Archived asset" : "Active production row"}</p>
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="min-w-0 space-y-2">
          <AssignedArtistsSummary assignments={getStageAssignments(stage)} users={users} compact />
          {leadAssignment?.employee ? (
            <p className="text-xs text-slate-500">{getDepartmentLabel(leadAssignment.employee)}</p>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-3">
        <StatusBadge status={stage?.status || "YTS"} />
      </td>
      <td className="px-3 py-3 text-sm text-slate-700">{formatDate(resolveStageStart(stage))}</td>
      <td className="px-3 py-3 text-sm text-slate-700">{formatDate(resolveStageEnd(stage))}</td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onMove(asset.id, -1)} className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50" disabled={disabled || asset.isArchived} title="Move up">
            <ArrowUp className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onMove(asset.id, 1)} className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50" disabled={disabled || asset.isArchived} title="Move down">
            <ArrowDown className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onEdit(asset)} className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50" title="Edit">
            <NotebookPen className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onDuplicate(asset)} className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50" disabled={disabled} title="Duplicate">
            <Copy className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onArchive(asset, !asset.isArchived)} className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50" disabled={disabled} title={asset.isArchived ? "Restore" : "Archive"}>
            {asset.isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => onDelete(asset)} className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50" disabled={disabled} title="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function MobileCard({ asset, stage, users, nowTick, disabled, onEdit, onDuplicate, onArchive, onDelete }) {
  const duration = resolveDurationMinutes(stage, nowTick);
  const leadAssignment = getLeadAssignment(getStageAssignments(stage), stage?.assignedUser);

  return (
    <article className="rounded-[26px] border border-slate-200/80 bg-white/92 p-4 shadow-sm shadow-slate-200/35 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-900">{asset.name}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusBadge status={stage?.status || "YTS"} />
            <DurationPill minutes={duration} />
          </div>
        </div>
          <button type="button" onClick={() => onEdit(asset)} className="rounded-xl border border-slate-300 p-2 text-slate-600">
            <NotebookPen className="h-4 w-4" />
          </button>
      </div>

      <div className="mt-4 grid gap-3">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Assigned Artists</p>
          <AssignedArtistsSummary assignments={getStageAssignments(stage)} users={users} />
          {leadAssignment?.employee ? <p className="text-xs text-slate-500">{getDepartmentLabel(leadAssignment.employee)}</p> : null}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Start</p>
            <p className="mt-1 text-slate-900">{formatDate(resolveStageStart(stage))}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">End</p>
            <p className="mt-1 text-slate-900">{formatDate(resolveStageEnd(stage))}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onEdit(asset)} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Edit</button>
          <button type="button" onClick={() => onDuplicate(asset)} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Duplicate</button>
          <button type="button" onClick={() => onArchive(asset, !asset.isArchived)} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">
            {asset.isArchived ? "Restore" : "Archive"}
          </button>
          <button type="button" onClick={() => onDelete(asset)} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600">Delete</button>
        </div>
      </div>
    </article>
  );
}

export default function ModellingWorkspace({
  projectId,
  overview,
  stageSummary,
  users = [],
  recommendedDepartment,
  workspaceVariant,
  showToast,
  stageCode = "MODELLING",
  stageLabel = "Modelling"
}) {
  const activeUsers = useMemo(() => users.filter((user) => user?.isActive !== false), [users]);
  const normalizedStageCode = String(stageCode || "MODELLING").toUpperCase();
  const displayStageLabel = normalizeStageLabel(stageLabel || normalizedStageCode);
  const sectionKeys = STAGE_SECTION_KEYS[normalizedStageCode] || ["CHARACTER", "PROP", "BG"];
  const sections = sectionKeys.map((key) => SECTION_CONFIG[key]).filter(Boolean);
  const activeSectionKey = workspaceVariant && sectionKeys.includes(workspaceVariant) ? workspaceVariant : null;
  const activeSection = activeSectionKey ? SECTION_CONFIG[activeSectionKey] : null;
  const isHub = !activeSection;

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [assets, setAssets] = useState([]);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    artistId: "",
    archived: "active",
    sortBy: "order",
    page: 1,
    pageSize: 25
  });
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkDraft, setBulkDraft] = useState({ assignments: [], status: "" });
  const [editor, setEditor] = useState({ open: false, mode: "create", sectionKey: sections[0]?.key || "CHARACTER", asset: null, form: createInitialForm(sections[0]?.key || "CHARACTER") });
  const [editorErrors, setEditorErrors] = useState({});
  const [editorAdvancedOpen, setEditorAdvancedOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState({ open: false, assets: [] });
  const [nowTick, setNowTick] = useState(Date.now());
  const debouncedSearch = useDebouncedValue(filters.search, 180);

  const projectName = overview?.project?.name || "Project";
  const breadcrumbState = useMemo(
    () => ({
      breadcrumbClientId: overview?.project?.client?.id,
      breadcrumbClientName: overview?.project?.client?.name,
      breadcrumbProjectName: overview?.project?.name
    }),
    [overview?.project?.client?.id, overview?.project?.client?.name, overview?.project?.name]
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowTick(Date.now()), 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    loadAssets();
  }, [projectId]);

  async function loadAssets(withLoader = true) {
    if (withLoader) setLoading(true);
    setError("");
    try {
      const { data } = await api.get(`/projects/${projectId}/assets`, {
        params: {
          page: 1,
          pageSize: 1000,
          sortBy: "order",
          sortDir: "asc",
          archived: "all"
        }
      });
      setAssets(sortByAssetOrder(data.items || []));
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || `Failed to load ${displayStageLabel.toLowerCase()} assets`);
      setAssets([]);
    } finally {
      if (withLoader) setLoading(false);
    }
  }

  const assetsBySection = useMemo(() => {
    const buckets = Object.fromEntries(sectionKeys.map((key) => [key, []]));
    for (const asset of assets) {
      const key = getSectionKeyForAsset(asset);
      if (!buckets[key]) continue;
      buckets[key].push(asset);
    }
    for (const key of Object.keys(buckets)) {
      buckets[key] = sortByAssetOrder(buckets[key]);
    }
    return buckets;
  }, [assets, sectionKeys]);

  const hubStats = useMemo(() => {
    const result = {};
    for (const key of sectionKeys) {
      result[key] = getSectionStats(assetsBySection[key] || [], normalizedStageCode, nowTick);
    }
    return result;
  }, [assetsBySection, normalizedStageCode, nowTick, sectionKeys]);

  const sectionAssets = useMemo(() => (activeSection ? assetsBySection[activeSection.key] || [] : []), [activeSection, assetsBySection]);
  const hasAnySectionAssets = sectionAssets.length > 0;
  const filterStatus = filters.status;
  const filterArtistId = filters.artistId;
  const filterArchived = filters.archived;
  const filterSortBy = filters.sortBy;

  const detailEntries = useMemo(() => {
    if (!activeSection) return [];

    const filtered = sectionAssets
      .map((asset) => ({ asset, stage: getStageForCode(asset, normalizedStageCode) }))
      .filter((entry) => Boolean(entry.stage))
      .filter((entry) => {
        const searchNeedle = String(debouncedSearch || "").trim().toLowerCase();
        const matchesSearch =
          !searchNeedle ||
          String(entry.asset.name || "").toLowerCase().includes(searchNeedle) ||
          String(entry.asset.description || "").toLowerCase().includes(searchNeedle) ||
          String(entry.stage.notes || "").toLowerCase().includes(searchNeedle);
        const matchesStatus = !filterStatus || entry.stage.status === filterStatus;
        const matchesArtist =
          !filterArtistId ||
          getStageAssignments(entry.stage).some((assignment) => Number(assignment.employeeId || assignment.employee?.id) === Number(filterArtistId)) ||
          entry.stage.assignedUser?.id === Number(filterArtistId);
        const matchesArchived = filterArchived === "all" || (filterArchived === "archived" ? entry.asset.isArchived : !entry.asset.isArchived);
        return matchesSearch && matchesStatus && matchesArtist && matchesArchived;
      });

    const sorted = [...filtered].sort((left, right) => {
      switch (filterSortBy) {
        case "name":
          return String(left.asset.name || "").localeCompare(String(right.asset.name || ""));
        case "artist":
          return String(getLeadAssignment(getStageAssignments(left.stage), left.stage.assignedUser)?.employee?.name || left.stage.assignedUser?.name || "").localeCompare(
            String(getLeadAssignment(getStageAssignments(right.stage), right.stage.assignedUser)?.employee?.name || right.stage.assignedUser?.name || "")
          );
        case "status":
          return String(left.stage.status || "").localeCompare(String(right.stage.status || ""));
        case "duration":
          return (resolveDurationMinutes(right.stage, nowTick) || 0) - (resolveDurationMinutes(left.stage, nowTick) || 0);
        case "latest":
          return new Date(right.asset.updatedAt || right.asset.createdAt).getTime() - new Date(left.asset.updatedAt || left.asset.createdAt).getTime();
        default: {
          const orderDelta = Number(left.asset.order || 0) - Number(right.asset.order || 0);
          if (orderDelta !== 0) return orderDelta;
          return String(left.asset.name || "").localeCompare(String(right.asset.name || ""));
        }
      }
    });

    return sorted;
  }, [activeSection, debouncedSearch, filterArchived, filterArtistId, filterSortBy, filterStatus, normalizedStageCode, nowTick, sectionAssets]);

  const detailStats = useMemo(() => getSectionStats(sectionAssets, normalizedStageCode, nowTick), [normalizedStageCode, nowTick, sectionAssets]);
  const totalPages = Math.max(1, Math.ceil(detailEntries.length / Number(filters.pageSize || 25)));
  const currentPage = Math.min(filters.page, totalPages);
  const pagedEntries = useMemo(() => {
    const pageSize = Number(filters.pageSize || 25);
    const startIndex = (currentPage - 1) * pageSize;
    return detailEntries.slice(startIndex, startIndex + pageSize);
  }, [currentPage, detailEntries, filters.pageSize]);

  const visibleIds = pagedEntries.map((entry) => entry.asset.id);
  const allVisibleSelected = Boolean(visibleIds.length) && visibleIds.every((id) => selectedIds.includes(id));
  const editorSection = SECTION_CONFIG[editor.sectionKey] || sections[0];
  const editorNormalizedAssignments = normalizeAssignmentList(editor.form.assignments);
  const editorCanSubmit =
    Boolean(String(editor.form.name || "").trim()) &&
    Boolean(String(editor.form.status || "").trim()) &&
    Boolean(editorNormalizedAssignments.length) &&
    Boolean(String(editor.form.startedAt || "").trim());

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => detailEntries.some((entry) => entry.asset.id === id)));
  }, [detailEntries]);

  function updateFilters(patch) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function updateEditorField(field, value) {
    setEditor((prev) => ({ ...prev, form: { ...prev.form, [field]: value } }));
    setEditorErrors((prev) => ({ ...prev, [field]: "" }));
  }

  function openCreate(sectionKey) {
    setEditor({ open: true, mode: "create", sectionKey, asset: null, form: createInitialForm(sectionKey) });
    setEditorErrors({});
    setEditorAdvancedOpen(false);
  }

  function openEdit(asset) {
    const sectionKey = getSectionKeyForAsset(asset);
    const stage = getStageForCode(asset, normalizedStageCode);
    setEditor({
      open: true,
      mode: "edit",
      sectionKey,
      asset,
      form: {
        name: asset.name || "",
        status: stage?.status || "YTS",
        assignments: getStageAssignments(stage),
        startedAt: formatDateInput(resolveStageStart(stage)) || todayDateInput(),
        endedAt: formatDateInput(resolveStageEnd(stage)),
        notes: stage?.notes || "",
        description: asset.description || "",
        referenceImageUrl: asset.referenceImageUrl || ""
      }
    });
    setEditorErrors({});
    setEditorAdvancedOpen(Boolean(asset.description || asset.referenceImageUrl || stage?.notes));
  }

  function closeEditor() {
    setEditor((prev) => ({ ...prev, open: false, asset: null }));
    setEditorErrors({});
    setEditorAdvancedOpen(false);
  }

  function setAssetList(updater) {
    setAssets((prev) => sortByAssetOrder(typeof updater === "function" ? updater(prev) : updater));
  }

  async function createAsset(sectionKey, values) {
    const section = SECTION_CONFIG[sectionKey];
    const name = String(values.name || "").trim();
    const startedAt = values.startedAt || todayDateInput();
    if (!name) throw new Error(`${section.singular} name is required`);

    const { data: createdAsset } = await api.post(`/projects/${projectId}/assets`, {
      name,
      type: section.type,
      subCategory: section.subCategory,
      status: values.status || "YTS",
      ...(String(values.description || "").trim() ? { description: String(values.description).trim() } : {}),
      ...(String(values.referenceImageUrl || "").trim() ? { referenceImageUrl: String(values.referenceImageUrl).trim() } : {})
    });

    const stage = getStageForCode(createdAsset, normalizedStageCode);
    if (stage) {
      const stagePayload = buildStageUpdatePayload({
        status: values.status || "YTS",
        assignments: values.assignments || [],
        assignedUserId: getLeadAssignment(values.assignments || [])?.employeeId || null,
        startedAt,
        endedAt: values.endedAt || "",
        notes: values.notes || ""
      });

      const stagePayloadErrors = validateStageCreatePayload({
        assetName: name,
        projectId: Number(projectId),
        stageId: stage.id,
        payload: stagePayload
      });

      logStagePayload("create-asset-stage", {
        assetName: name,
        projectId: Number(projectId),
        stageId: stage.id,
        payload: stagePayload
      });

      if (Object.keys(stagePayloadErrors).length) {
        throw new Error(`Unable to create ${section.singular.toLowerCase()}. Please check required fields.`);
      }

      await api.put(`/asset-stages/${stage.id}`, stagePayload);
    }

    await loadAssets(false);
  }

  async function persistAssetUpdate(assetId, payload) {
    const previous = assets;
    setAssetList((current) => current.map((asset) => (asset.id === assetId ? { ...asset, ...payload } : asset)));
    try {
      const { data } = await api.patch(`/assets/${assetId}`, payload);
      setAssetList((current) => current.map((asset) => (asset.id === assetId ? { ...asset, ...data } : asset)));
    } catch (err) {
      setAssets(previous);
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to update asset");
    }
  }

  async function persistStageUpdate(assetId, stageId, payload, optimisticPatch = {}) {
    const previous = assets;
    setAssetList((current) => current.map((asset) => (asset.id !== assetId ? asset : patchAssetStage(asset, stageId, optimisticPatch))));
    try {
      const { data } = await api.put(`/asset-stages/${stageId}`, payload);
      setAssetList((current) => current.map((asset) => (asset.id !== assetId ? asset : patchAssetStage(asset, stageId, data))));
    } catch (err) {
      setAssets(previous);
      showToast?.("error", err.userMessage || err.response?.data?.message || `Unable to update ${displayStageLabel.toLowerCase()} row`);
    }
  }

  async function submitEditor() {
    const nextErrors = validateEditorForm(editor.form);
    if (Object.keys(nextErrors).length) {
      setEditorErrors(nextErrors);
      showToast?.("error", "Complete the required asset fields");
      return;
    }

    setBusy(true);
    try {
      if (editor.mode === "create") {
        await createAsset(editor.sectionKey, editor.form);
        showToast?.("success", `${SECTION_CONFIG[editor.sectionKey].singular} created`);
      } else if (editor.asset) {
        const stage = getStageForCode(editor.asset, normalizedStageCode);
        await api.patch(`/assets/${editor.asset.id}`, {
          name: editor.form.name.trim(),
          ...(String(editor.form.description || "").trim()
            ? { description: String(editor.form.description).trim() }
            : { description: "" }),
          ...(String(editor.form.referenceImageUrl || "").trim()
            ? { referenceImageUrl: String(editor.form.referenceImageUrl).trim() }
            : { referenceImageUrl: "" })
        });
        if (stage) {
          const stagePayload = buildStageUpdatePayload({
            status: editor.form.status,
            assignments: editor.form.assignments || [],
            assignedUserId: getLeadAssignment(editor.form.assignments || [])?.employeeId || null,
            startedAt: editor.form.startedAt || todayDateInput(),
            endedAt: editor.form.endedAt || "",
            notes: editor.form.notes || ""
          });
          logStagePayload("edit-asset-stage", {
            assetName: editor.form.name,
            projectId: Number(projectId),
            stageId: stage.id,
            payload: stagePayload
          });
          await api.put(`/asset-stages/${stage.id}`, stagePayload);
        }
        await loadAssets(false);
        showToast?.("success", `${SECTION_CONFIG[editor.sectionKey].singular} updated`);
      }
      closeEditor();
    } catch (err) {
      const statusCode = Number(err?.response?.status || 0);
      const fallbackCreateMessage = `Unable to create ${String(editorSection?.singular || "asset").toLowerCase()}. Please check required fields.`;
      if (editor.mode === "create" && statusCode === 400) {
        setEditorErrors((prev) => ({ ...validateEditorForm(editor.form), ...prev }));
        showToast?.("error", fallbackCreateMessage);
      } else {
        showToast?.("error", err.userMessage || err.response?.data?.message || err.message || "Unable to save asset");
      }
    } finally {
      setBusy(false);
    }
  }

  async function moveAsset(assetId, delta) {
    const ordered = sortByAssetOrder(sectionAssets.filter((asset) => !asset.isArchived));
    const index = ordered.findIndex((asset) => asset.id === assetId);
    if (index === -1) return;
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= ordered.length) return;

    const current = ordered[index];
    const target = ordered[targetIndex];

    setBusy(true);
    try {
      await Promise.all([
        api.patch(`/assets/${current.id}`, { order: Number(target.order || 0) }),
        api.patch(`/assets/${target.id}`, { order: Number(current.order || 0) })
      ]);
      await loadAssets(false);
    } catch (err) {
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to reorder assets");
    } finally {
      setBusy(false);
    }
  }

  async function duplicateAsset(asset) {
    const stage = getStageForCode(asset, normalizedStageCode);
    const sectionKey = getSectionKeyForAsset(asset);

    setBusy(true);
    try {
      await createAsset(sectionKey, {
        name: `${asset.name} Copy`,
        status: stage?.status || "YTS",
        assignments: getStageAssignments(stage),
        startedAt: formatDateInput(resolveStageStart(stage)) || todayDateInput(),
        endedAt: formatDateInput(resolveStageEnd(stage)),
        notes: stage?.notes || "",
        description: asset.description || "",
        referenceImageUrl: asset.referenceImageUrl || ""
      });
      showToast?.("success", `${SECTION_CONFIG[sectionKey].singular} duplicated`);
    } catch (err) {
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to duplicate asset");
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive(asset, nextArchived) {
    await persistAssetUpdate(asset.id, { isArchived: nextArchived });
    showToast?.("success", nextArchived ? `${asset.name} archived` : `${asset.name} restored`);
  }

  function requestDeleteAssets(nextAssets) {
    setConfirmDelete({ open: true, assets: nextAssets });
  }

  async function confirmDeleteAssets() {
    if (!confirmDelete.assets.length) return;

    setBusy(true);
    try {
      await Promise.all(confirmDelete.assets.map((asset) => api.delete(`/assets/${asset.id}`)));
      setSelectedIds((prev) => prev.filter((id) => !confirmDelete.assets.some((asset) => asset.id === id)));
      setConfirmDelete({ open: false, assets: [] });
      await loadAssets(false);
      showToast?.("success", `${confirmDelete.assets.length} asset${confirmDelete.assets.length === 1 ? "" : "s"} removed`);
    } catch (err) {
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to delete assets");
    } finally {
      setBusy(false);
    }
  }

  function toggleVisibleSelection() {
    setSelectedIds((prev) => {
      if (allVisibleSelected) return prev.filter((id) => !visibleIds.includes(id));
      return Array.from(new Set([...prev, ...visibleIds]));
    });
  }

  async function bulkAssign() {
    const normalizedAssignments = toStageAssignments(bulkDraft.assignments || []);
    if (!normalizedAssignments.length) return;
    const targets = detailEntries.filter((entry) => selectedIds.includes(entry.asset.id));
    const lead = getLeadAssignment(normalizedAssignments || []);
    setBusy(true);
    try {
      await Promise.all(
        targets.map((entry) =>
          api.put(`/asset-stages/${entry.stage.id}`, {
            assignedUserId: lead?.employeeId || null,
            assignments: normalizedAssignments
          })
        )
      );
      await loadAssets(false);
      showToast?.("success", `${targets.length} rows reassigned`);
    } catch (err) {
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to bulk assign assets");
    } finally {
      setBusy(false);
    }
  }

  async function bulkStatusUpdate() {
    if (!bulkDraft.status) return;
    const targets = detailEntries.filter((entry) => selectedIds.includes(entry.asset.id));
    setBusy(true);
    try {
      await Promise.all(targets.map((entry) => api.put(`/asset-stages/${entry.stage.id}`, { status: bulkDraft.status })));
      await loadAssets(false);
      showToast?.("success", `${targets.length} rows updated`);
    } catch (err) {
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to bulk update rows");
    } finally {
      setBusy(false);
    }
  }

  function bulkDelete() {
    const targets = detailEntries.filter((entry) => selectedIds.includes(entry.asset.id)).map((entry) => entry.asset);
    if (targets.length) requestDeleteAssets(targets);
  }

  if (loading) return <Loader label={`Loading ${displayStageLabel.toLowerCase()} workspace...`} />;

  if (error) {
    return <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>;
  }

  if (isHub) {
    return (
      <div className="space-y-5">
        <section className="rounded-[32px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.94))] p-5 shadow-sm shadow-slate-200/45">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                <Layers3 className="h-3.5 w-3.5" /> {displayStageLabel} Workspace
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Asset production control</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Split {displayStageLabel.toLowerCase()} into dedicated studio lanes so characters, props, and BG assets stay manageable across large productions.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <WorkspaceMetric label="Project" value={projectName} caption={recommendedDepartment || `${displayStageLabel} Department`} />
              <WorkspaceMetric label="Progress" value={`${stageSummary?.completionPercent || 0}%`} caption="Stage completion" tone="text-slate-900" />
              <WorkspaceMetric label="Assigned Artists" value={uniqueArtistCount(assets.filter((asset) => !asset.isArchived).map((asset) => ({ stage: getStageForCode(asset, normalizedStageCode) })).filter((entry) => entry.stage))} caption="Across all active lanes" tone="text-sky-700" />
              <WorkspaceMetric label="Active Assets" value={assets.filter((asset) => !asset.isArchived && sectionKeys.includes(getSectionKeyForAsset(asset))).length} caption={sections.map((section) => section.title).join(" · ")} tone="text-violet-700" />
            </div>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-2">
          {sections.map((section) => (
            <SummaryCard
              key={section.key}
              projectId={projectId}
              projectName={projectName}
              stageCode={normalizedStageCode}
              stageLabel={displayStageLabel}
              breadcrumbState={breadcrumbState}
              section={section}
              stats={hubStats[section.key]}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      <section className="rounded-[26px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.94))] p-4 shadow-sm shadow-slate-200/40">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link to={`/projects/${projectId}/workspace/${String(normalizedStageCode).toLowerCase()}`} state={breadcrumbState} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600 hover:bg-slate-100">
              <ChevronLeft className="h-3.5 w-3.5" /> Back to {displayStageLabel} hub
            </Link>
            <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${activeSection.badge}`}>
              {activeSection.title}
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{activeSection.singular} {displayStageLabel} Workspace</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Project: <span className="font-semibold text-slate-900">{projectName}</span> · Compact spreadsheet-style production control for {activeSection.title.toLowerCase()}.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <WorkspaceMetric label={`${detailStats.total} Assets`} value={detailStats.total} tone={activeSection.countTone} />
            <WorkspaceMetric label="Assigned" value={detailStats.assignedArtists} tone="text-slate-900" />
            <WorkspaceMetric label="In Progress" value={detailStats.inProgress} tone="text-sky-700" />
            <WorkspaceMetric label="Final" value={detailStats.final} tone="text-emerald-700" />
            <WorkspaceMetric label="Late" value={detailStats.overdue} tone="text-rose-700" />
          </div>
        </div>
      </section>

      <WorkspaceToolbar
        filters={filters}
        onFilterChange={updateFilters}
        users={activeUsers}
        recommendedDepartment={recommendedDepartment}
        section={activeSection}
        selectedCount={selectedIds.length}
        bulkDraft={bulkDraft}
        onBulkDraftChange={(patch) => setBulkDraft((prev) => ({ ...prev, ...patch }))}
        onBulkAssign={bulkAssign}
        onBulkStatus={bulkStatusUpdate}
        onBulkDelete={bulkDelete}
        onSelectVisible={toggleVisibleSelection}
        allVisibleSelected={allVisibleSelected}
        visibleCount={visibleIds.length}
        disabled={busy}
        onOpenCreate={() => openCreate(activeSection.key)}
        stageLabel={displayStageLabel}
      />

      <QuickCreateRow
        section={activeSection}
        users={activeUsers}
        recommendedDepartment={recommendedDepartment}
        disabled={busy}
        onCreate={async (values) => {
          setBusy(true);
          try {
            await createAsset(activeSection.key, values);
            showToast?.("success", `${activeSection.singular} created`);
            return true;
          } catch (err) {
            const fallbackMessage = `Unable to create ${activeSection.singular.toLowerCase()}. Please check required fields.`;
            showToast?.("error", err.userMessage || err.response?.data?.message || err.message || fallbackMessage);
            throw err;
          } finally {
            setBusy(false);
          }
        }}
      />

      {!detailEntries.length ? (
        <section className="rounded-[22px] border border-dashed border-slate-300 bg-white/95 px-4 py-5 text-center shadow-sm shadow-slate-200/25">
          <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${activeSection.accent}`}>
            <Plus className="h-5 w-5 text-slate-800" />
          </div>
          <h3 className="mt-4 text-xl font-semibold tracking-tight text-slate-950">{hasAnySectionAssets ? `No ${activeSection.title} match current filters` : activeSection.emptyTitle}</h3>
          <p className="mt-1.5 text-sm text-slate-500">
            {hasAnySectionAssets ? "Adjust the filter bar or create a new row for this lane." : `Create your first ${activeSection.singular.toLowerCase()} asset.`}
          </p>
          <button type="button" onClick={() => openCreate(activeSection.key)} className={`mt-4 inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white ${activeSection.button}`}>
            <Plus className="h-4 w-4" /> {hasAnySectionAssets ? `Add ${activeSection.singular}` : activeSection.emptyAction}
          </button>
        </section>
      ) : (
        <>
          <section className="hidden overflow-hidden rounded-[22px] border border-slate-200/80 bg-white/95 shadow-sm shadow-slate-200/30 lg:block">
            <div className="max-h-[68vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-10 bg-slate-950 text-white">
                  <tr>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em]">Select</th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em]">{activeSection.singular} Name</th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em]">Assigned Artist</th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em]">Status</th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em]">Start Date</th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em]">End Date</th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedEntries.map(({ asset, stage }) => (
                    <DesktopRow
                      key={asset.id}
                      asset={asset}
                      stage={stage}
                      users={activeUsers}
                      selected={selectedIds.includes(asset.id)}
                      disabled={busy}
                      onToggleSelect={(assetId) => setSelectedIds((prev) => (prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]))}
                      onMove={moveAsset}
                      onEdit={openEdit}
                      onDuplicate={duplicateAsset}
                      onArchive={toggleArchive}
                      onDelete={(assetToDelete) => requestDeleteAssets([assetToDelete])}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-4 lg:hidden">
            {pagedEntries.map(({ asset, stage }) => (
              <MobileCard
                key={asset.id}
                asset={asset}
                stage={stage}
                users={activeUsers}
                nowTick={nowTick}
                disabled={busy}
                onEdit={openEdit}
                onDuplicate={duplicateAsset}
                onArchive={toggleArchive}
                onDelete={(assetToDelete) => requestDeleteAssets([assetToDelete])}
              />
            ))}
          </div>

          <section className="flex flex-col gap-2.5 rounded-[20px] border border-slate-200/80 bg-white/95 px-3 py-2.5 shadow-sm shadow-slate-200/25 backdrop-blur md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span>Showing <span className="font-semibold text-slate-900">{pagedEntries.length}</span> of <span className="font-semibold text-slate-900">{detailEntries.length}</span></span>
              <span className="text-slate-300">•</span>
              <span>Page {currentPage} of {totalPages}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => updateFilters({ page: Math.max(1, currentPage - 1) })} disabled={currentPage <= 1} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">Previous</button>
              <button type="button" onClick={() => updateFilters({ page: Math.min(totalPages, currentPage + 1) })} disabled={currentPage >= totalPages} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">Next</button>
            </div>
          </section>
        </>
      )}

      <Modal open={editor.open} onClose={closeEditor} title={editor.mode === "create" ? `Add ${editorSection?.singular || "Asset"}` : `Edit ${editorSection?.singular || "Asset"}`} size="max-w-5xl">
        <div className="-mx-6 max-h-[78vh] overflow-y-auto px-6 pb-6">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {displayStageLabel} creation flow
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Create and assign {String(editorSection?.title || "assets").toLowerCase()} quickly without fighting a raw admin form.
              </p>
            </div>

            <ModalSection title="Section 1 — Basic Info" description="Only the essentials stay up front so managers can create assets fast.">
              <div className="grid gap-3 md:grid-cols-[minmax(0,2.2fr)_220px]">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Asset Name *</span>
                  <input
                    value={editor.form.name}
                    onChange={(event) => updateEditorField("name", event.target.value)}
                    placeholder={getNamePlaceholder(editorSection?.singular || "asset")}
                    className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[15px] font-medium focus:border-slate-500"
                  />
                  <InlineError>{editorErrors.name}</InlineError>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status *</span>
                  <select
                    value={editor.form.status}
                    onChange={(event) => updateEditorField("status", event.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  >
                    {STAGE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {getStatusOptionLabel(status)}
                      </option>
                    ))}
                  </select>
                  <InlineError>{editorErrors.status}</InlineError>
                </label>
              </div>
            </ModalSection>

            <ModalSection title="Section 2 — Assignment" description="Recommended department artists appear first, with manual override available at any time.">
              <ModalAssignmentPicker
                users={activeUsers}
                recommendedDepartment={recommendedDepartment}
                assignments={editor.form.assignments}
                onChange={(assignments) => updateEditorField("assignments", assignments)}
                disabled={busy}
              />
              <InlineError>{editorErrors.assignments}</InlineError>
            </ModalSection>

            <ModalSection title="Section 3 — Dates" description="Start date defaults to today so tracking begins immediately. End date stays optional.">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Start Date *</span>
                  <input
                    type="date"
                    value={editor.form.startedAt || todayDateInput()}
                    onChange={(event) => updateEditorField("startedAt", event.target.value || todayDateInput())}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  />
                  <InlineError>{editorErrors.startedAt}</InlineError>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">End Date</span>
                  <input
                    type="date"
                    value={editor.form.endedAt}
                    onChange={(event) => updateEditorField("endedAt", event.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  />
                </label>
              </div>
            </ModalSection>

            <div className="rounded-2xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setEditorAdvancedOpen((prev) => !prev)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Section 4 — Advanced Notes</p>
                  <p className="mt-1 text-sm text-slate-500">Optional details like notes, description, and reference URL stay out of the way until needed.</p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-500">
                  {editorAdvancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
              </button>

              {editorAdvancedOpen ? (
                <div className="border-t border-slate-200 px-4 py-4">
                  <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                    <label className="space-y-1.5 xl:col-span-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Notes</span>
                      <textarea
                        value={editor.form.notes}
                        onChange={(event) => updateEditorField("notes", event.target.value)}
                        rows={3}
                        className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                        placeholder="Production notes, review reminders, or assignment context"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Description</span>
                      <textarea
                        value={editor.form.description}
                        onChange={(event) => updateEditorField("description", event.target.value)}
                        rows={3}
                        className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                        placeholder="Optional asset description"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Reference URL</span>
                      <div className="relative">
                        <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          value={editor.form.referenceImageUrl}
                          onChange={(event) => updateEditorField("referenceImageUrl", event.target.value)}
                          placeholder="https://..."
                          className="w-full rounded-xl border border-slate-300 bg-white px-10 py-2.5 text-sm"
                        />
                      </div>
                    </label>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="-mx-6 mt-5 sticky bottom-0 border-t border-slate-200 bg-white px-6 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-semibold">Required: Name, status, assigned artist, start date.</p>
              <p className="mt-0.5 text-amber-800">End date, notes, description, and reference URL stay optional.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={closeEditor} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">
                Cancel
              </button>
              <button
                type="button"
                onClick={submitEditor}
                disabled={busy || !editorCanSubmit}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${editorSection?.button || "bg-slate-900 hover:bg-slate-800"} disabled:opacity-50`}
              >
                {editor.mode === "create" ? `Create ${editorSection?.singular || "Asset"}` : `Save ${editorSection?.singular || "Asset"}`}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={confirmDelete.open} onClose={() => setConfirmDelete({ open: false, assets: [] })} title="Delete asset" size="max-w-lg">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <div>
              <p className="font-semibold text-rose-900">This will permanently remove the selected asset rows.</p>
              <p className="mt-1 text-rose-700">Related stage records will be removed safely through the existing relations.</p>
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Selected</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {confirmDelete.assets.map((asset) => (
              <li key={asset.id}>• {asset.name}</li>
            ))}
          </ul>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setConfirmDelete({ open: false, assets: [] })} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
          <button type="button" onClick={confirmDeleteAssets} disabled={busy} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Delete</button>
        </div>
      </Modal>
    </div>
  );
}
