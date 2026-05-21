import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Copy,
  Pencil,
  Plus,
  Search,
  Square,
  Trash2,
  Volume2,
  X
} from "lucide-react";
import api from "../lib/api";
import Loader from "./Loader";
import Modal from "./Modal";
import { EmployeeAvailabilityHoverCard } from "./EmployeeAvailabilityHoverCard";
import useEmployeeAvailabilitySummaries from "../hooks/useEmployeeAvailabilitySummaries";
import { getStatusMeta, getStatusOptionLabel, STAGE_STATUSES } from "../utils/constants";
import {
  formatDate,
  formatDateInput,
  formatRelative,
  getDepartmentLabel,
  initials,
  todayDateInput
} from "../utils/format";
import {
  buildDepartmentOptions,
  countUsersByDepartment,
  filterUsersByDepartment,
  getLeadAssignment,
  normalizeAssignmentList,
  sortUsersBySmartAvailability
} from "../utils/assignments";
import { formatEmployeeAvailabilityLabel } from "../utils/employeeAvailability";
import { isDepartmentMatch } from "../utils/stageDepartmentMap";

const DEFAULT_STATUS = "YTS";

function buildAssignment(user, roleType = "LEAD") {
  return {
    employeeId: Number(user.id),
    roleType,
    departmentId: user.departmentId || null,
    employee: user,
    department: user.department || user.departmentInfo || null
  };
}

function normalizeWithUsers(source, usersById) {
  return normalizeAssignmentList(source)
    .map((assignment) => {
      const employeeId = Number(assignment.employeeId || assignment.employee?.id || 0);
      const employee = assignment.employee || usersById.get(employeeId) || null;
      if (!employeeId || !employee) return null;
      return {
        ...assignment,
        employeeId,
        employee,
        departmentId: assignment.departmentId || employee.departmentId || null,
        department: assignment.department || employee.department || employee.departmentInfo || null,
        roleType: assignment.roleType === "SUPPORT" ? "SUPPORT" : "LEAD"
      };
    })
    .filter(Boolean);
}

function createQuickForm({ department = "", defaultAssignment = null } = {}) {
  return {
    name: "",
    status: DEFAULT_STATUS,
    startDate: todayDateInput(),
    endDate: "",
    notes: "",
    assignments: defaultAssignment ? [defaultAssignment] : [],
    department,
    artistSearch: "",
    candidateId: ""
  };
}

function formatCompactDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short"
  }).format(date);
}

function sortAudioRows(rows, sortBy, sortDir) {
  const direction = sortDir === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const getDateValue = (value) => (value ? new Date(value).getTime() : 0);

    if (sortBy === "name") return String(left.name || "").localeCompare(String(right.name || "")) * direction;
    if (sortBy === "status") return String(left.status || "").localeCompare(String(right.status || "")) * direction;
    if (sortBy === "startDate") return (getDateValue(left.startDate) - getDateValue(right.startDate)) * direction;
    if (sortBy === "endDate") return (getDateValue(left.endDate) - getDateValue(right.endDate)) * direction;
    if (sortBy === "latest") return (getDateValue(left.createdAt) - getDateValue(right.createdAt)) * direction;

    const orderDelta = Number(left.order || 0) - Number(right.order || 0);
    if (orderDelta !== 0) return orderDelta;

    return String(left.name || "").localeCompare(String(right.name || ""));
  });
}

function getAudioAssignments(item) {
  return item?.taskAssignments?.length ? item.taskAssignments : normalizeAssignmentList(item);
}

function getAudioAssignedUsers(item, usersById) {
  return getAudioAssignments(item)
    .map((assignment) => assignment.employee || usersById.get(Number(assignment.employeeId || assignment.employee?.id)) || null)
    .filter(Boolean);
}

function validateAudioDraft(values, usersById) {
  const normalizedAssignments = normalizeWithUsers(values.assignments, usersById);

  const normalized = {
    name: String(values.name || "").trim(),
    assignments: normalizedAssignments,
    status: values.status || DEFAULT_STATUS,
    startDate: values.startDate || todayDateInput(),
    endDate: values.endDate || "",
    notes: values.notes || ""
  };

  const errors = {};
  if (!normalized.name) errors.name = "Name is required";
  if (!normalized.assignments.length) errors.assignments = "Artist is required";
  if (!normalized.status) errors.status = "Status is required";
  if (!normalized.startDate) errors.startDate = "Start date is required";

  return { normalized, errors };
}

function resolveDefaultDepartment(activeUsers, recommendedDepartment) {
  if (recommendedDepartment && countUsersByDepartment(activeUsers, recommendedDepartment) > 0) {
    return recommendedDepartment;
  }

  const audioLikeDepartment = buildDepartmentOptions(activeUsers, recommendedDepartment).find((department) =>
    isDepartmentMatch("Audio Department", department)
  );

  if (audioLikeDepartment) return audioLikeDepartment;

  return buildDepartmentOptions(activeUsers, recommendedDepartment)[0] || "";
}

function pickSuggestedUser(activeUsers, summariesByUserId, department, recommendedDepartment) {
  const scoped = filterUsersByDepartment(activeUsers, department);
  const candidatePool = scoped.length ? scoped : activeUsers;
  return sortUsersBySmartAvailability(
    candidatePool,
    summariesByUserId,
    department || recommendedDepartment || ""
  )[0] || null;
}

function InlineError({ children }) {
  if (!children) return null;
  return <p className="mt-1 text-[11px] font-semibold text-rose-600">{children}</p>;
}

function CompactStatusPill({ status }) {
  const meta = getStatusMeta(status);

  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-[0.14em]"
      style={{
        backgroundColor: meta.background,
        borderColor: meta.border,
        color: meta.text
      }}
      title={getStatusOptionLabel(status)}
    >
      {meta.shortKey}
    </span>
  );
}

function ArtistChip({ artist, summary, removable = false, onRemove }) {
  return (
    <EmployeeAvailabilityHoverCard user={artist} summary={summary} roleLabel="Assigned Artist" className="block">
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-900 text-[9px] font-bold text-white">
          {initials(artist.name)}
        </span>
        <span className="truncate">{artist.name}</span>
        {removable ? (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRemove?.(artist);
            }}
            className="rounded-full p-0.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label={`Remove ${artist.name}`}
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </span>
    </EmployeeAvailabilityHoverCard>
  );
}

function CompactArtistPicker({
  users,
  summariesByUserId,
  recommendedDepartment,
  assignments,
  onChange,
  disabled = false,
  allowMultiple = false,
  compact = false
}) {
  const usersById = useMemo(() => new Map((users || []).map((user) => [Number(user.id), user])), [users]);
  const normalizedAssignments = useMemo(() => normalizeWithUsers(assignments, usersById), [assignments, usersById]);
  const departmentOptions = useMemo(
    () => buildDepartmentOptions(users, recommendedDepartment),
    [users, recommendedDepartment]
  );

  const suggestedDepartment = useMemo(() => {
    const assignedDepartment = normalizedAssignments[0]?.employee ? getDepartmentLabel(normalizedAssignments[0].employee) : "";
    if (assignedDepartment) return assignedDepartment;

    if (recommendedDepartment && countUsersByDepartment(users, recommendedDepartment) > 0) {
      return recommendedDepartment;
    }

    return departmentOptions[0] || "";
  }, [departmentOptions, normalizedAssignments, recommendedDepartment, users]);

  const [department, setDepartment] = useState(suggestedDepartment);
  const [search, setSearch] = useState("");
  const [candidateId, setCandidateId] = useState("");

  useEffect(() => {
    if (!department && suggestedDepartment) {
      setDepartment(suggestedDepartment);
    }
  }, [department, suggestedDepartment]);

  const filteredUsers = useMemo(() => {
    const scoped = filterUsersByDepartment(users, department);
    const query = search.trim().toLowerCase();

    const searched = query
      ? scoped.filter((user) => {
          const haystack = [user.name, user.email, getDepartmentLabel(user), user.role]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        })
      : scoped;

    return sortUsersBySmartAvailability(searched, summariesByUserId, department || recommendedDepartment || "");
  }, [department, recommendedDepartment, search, summariesByUserId, users]);

  function commit(nextAssignments) {
    const normalized = normalizeWithUsers(nextAssignments, usersById);
    const withLead = normalized.map((assignment, index) => ({
      ...assignment,
      roleType: index === 0 ? "LEAD" : "SUPPORT"
    }));

    onChange?.(withLead);
  }

  function assignCandidate() {
    const user = usersById.get(Number(candidateId));
    if (!user) return;

    if (!allowMultiple) {
      commit([buildAssignment(user, "LEAD")]);
      setCandidateId("");
      return;
    }

    const exists = normalizedAssignments.some((assignment) => Number(assignment.employeeId) === Number(user.id));
    if (exists) {
      setCandidateId("");
      return;
    }

    commit([...normalizedAssignments, buildAssignment(user, normalizedAssignments.length ? "SUPPORT" : "LEAD")]);
    setCandidateId("");
  }

  function removeAssignedArtist(artist) {
    commit(normalizedAssignments.filter((assignment) => Number(assignment.employeeId) !== Number(artist.id)));
  }

  return (
    <div className="space-y-2">
      <div className={`grid gap-2 ${compact ? "md:grid-cols-[130px_minmax(0,1fr)_minmax(0,1.35fr)_84px]" : "md:grid-cols-[160px_minmax(0,1fr)_minmax(0,1.5fr)_96px]"}`}>
        <select
          value={department}
          onChange={(event) => {
            setDepartment(event.target.value);
            setCandidateId("");
          }}
          className={`rounded-lg border border-slate-300 bg-white ${compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"}`}
          disabled={disabled}
        >
          <option value="">All departments</option>
          {departmentOptions.map((option) => (
            <option key={option} value={option}>
              {option}{option === recommendedDepartment ? " • Suggested" : ""}
            </option>
          ))}
        </select>

        <label className="relative block">
          <Search className={`pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 ${compact ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search artist"
            className={`w-full rounded-lg border border-slate-300 pl-8 pr-2.5 ${compact ? "py-1.5 text-xs" : "py-2 text-sm"}`}
            disabled={disabled}
          />
        </label>

        <select
          value={candidateId}
          onChange={(event) => setCandidateId(event.target.value)}
          className={`rounded-lg border border-slate-300 bg-white ${compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"}`}
          disabled={disabled || !filteredUsers.length}
        >
          <option value="">Select artist</option>
          {filteredUsers.map((artist) => {
            const summary = summariesByUserId[Number(artist.id)];
            const status = formatEmployeeAvailabilityLabel(summary?.liveStatus || artist.availabilityStatus || "AVAILABLE");
            const active = summary?.activeTasks ?? 0;
            const workload = summary?.workloadPercent ?? 0;

            return (
              <option key={artist.id} value={artist.id}>
                {artist.name} · {status} · {active} active · {workload}%
              </option>
            );
          })}
        </select>

        <button
          type="button"
          onClick={assignCandidate}
          disabled={disabled || !candidateId}
          className={`inline-flex items-center justify-center rounded-lg border border-slate-300 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 ${compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"}`}
        >
          Assign
        </button>
      </div>

      <div className="flex min-h-8 flex-wrap items-center gap-1.5">
        {normalizedAssignments.length ? (
          normalizedAssignments.map((assignment) => {
            const artist = assignment.employee;
            if (!artist) return null;
            return (
              <ArtistChip
                key={assignment.employeeId}
                artist={artist}
                summary={summariesByUserId[Number(assignment.employeeId)]}
                removable={!disabled}
                onRemove={removeAssignedArtist}
              />
            );
          })
        ) : (
          <span className="text-[11px] text-slate-500">No artist selected</span>
        )}
      </div>
    </div>
  );
}

function AudioTaskRow({
  item,
  users,
  usersById,
  summariesByUserId,
  recommendedDepartment,
  selected,
  expanded,
  disabled,
  onToggleSelect,
  onToggleExpand,
  onUpdate,
  onDuplicate,
  onDelete
}) {
  const [nameDraft, setNameDraft] = useState(item.name || "");
  const [notesDraft, setNotesDraft] = useState(item.notes || "");

  useEffect(() => {
    setNameDraft(item.name || "");
  }, [item.id, item.name]);

  useEffect(() => {
    setNotesDraft(item.notes || "");
  }, [item.id, item.notes]);

  const assignedArtists = useMemo(() => getAudioAssignedUsers(item, usersById), [item, usersById]);
  const leadArtist = assignedArtists[0] || null;

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300">
      <div className="hidden items-center gap-2 border-b border-slate-100 px-3 py-2 lg:grid lg:grid-cols-[32px_minmax(220px,1.85fr)_130px_minmax(180px,1.2fr)_120px_120px_180px]">
        <label className="inline-flex justify-center">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(item.id)}
            className="h-4 w-4 rounded border-slate-300"
          />
        </label>

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">{item.name}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Updated {formatRelative(item.updatedAt) || "just now"}</p>
        </div>

        <div>
          <CompactStatusPill status={item.status} />
        </div>

        <div className="min-w-0">
          {leadArtist ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <ArtistChip artist={leadArtist} summary={summariesByUserId[Number(leadArtist.id)]} />
              {assignedArtists.length > 1 ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  +{assignedArtists.length - 1}
                </span>
              ) : null}
            </div>
          ) : (
            <span className="text-xs text-slate-500">Unassigned</span>
          )}
        </div>

        <p className="text-xs font-semibold text-slate-700">{formatCompactDate(item.startDate)}</p>
        <p className="text-xs font-semibold text-slate-700">{formatCompactDate(item.endDate)}</p>

        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={() => onToggleExpand(item.id)}
            className="rounded-lg border border-slate-300 p-1.5 text-slate-600 transition hover:bg-slate-50"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDuplicate(item)}
            disabled={disabled}
            className="rounded-lg border border-slate-300 p-1.5 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            title="Duplicate"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(item)}
            disabled={disabled}
            className="rounded-lg border border-rose-200 p-1.5 text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onToggleExpand(item.id)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700 transition hover:bg-slate-50"
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? "Hide" : "More"}
          </button>
        </div>
      </div>

      <div className="space-y-2 px-3 py-2 lg:hidden">
        <div className="flex items-start gap-2">
          <label className="pt-1">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(item.id)}
              className="h-4 w-4 rounded border-slate-300"
            />
          </label>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-950">{item.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <CompactStatusPill status={item.status} />
              <span className="text-[11px] font-semibold text-slate-700">{formatCompactDate(item.startDate)} → {formatCompactDate(item.endDate)}</span>
            </div>
            <div className="mt-1 min-w-0">
              {leadArtist ? (
                <ArtistChip artist={leadArtist} summary={summariesByUserId[Number(leadArtist.id)]} />
              ) : (
                <span className="text-[11px] text-slate-500">Unassigned</span>
              )}
            </div>
          </div>

          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onDuplicate(item)}
              disabled={disabled}
              className="rounded-lg border border-slate-300 p-1.5 text-slate-600"
              title="Duplicate"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(item)}
              disabled={disabled}
              className="rounded-lg border border-rose-200 p-1.5 text-rose-600"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onToggleExpand(item.id)}
              className="rounded-lg border border-slate-300 p-1.5 text-slate-600"
              title={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      <div className={`overflow-hidden transition-all duration-300 ${expanded ? "max-h-[1100px] opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="space-y-3 border-t border-slate-200 bg-slate-50/80 px-3 py-3">
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1.5fr)_160px_160px_160px]">
            <label className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Name</span>
              <input
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={() => {
                  const trimmed = String(nameDraft || "").trim();
                  if (!trimmed) {
                    setNameDraft(item.name || "");
                    return;
                  }
                  if (trimmed !== item.name) {
                    onUpdate(item.id, { name: trimmed }, { name: trimmed });
                  }
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                disabled={disabled}
              />
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Status</span>
              <select
                value={item.status}
                onChange={(event) => onUpdate(item.id, { status: event.target.value }, { status: event.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                disabled={disabled}
              >
                {STAGE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {getStatusOptionLabel(status)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Start</span>
              <input
                type="date"
                value={formatDateInput(item.startDate) || todayDateInput()}
                onChange={(event) => {
                  const nextStartDate = event.target.value || todayDateInput();
                  onUpdate(item.id, { startDate: nextStartDate }, { startDate: nextStartDate });
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                disabled={disabled}
              />
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">End</span>
              <input
                type="date"
                value={formatDateInput(item.endDate)}
                onChange={(event) => onUpdate(item.id, { endDate: event.target.value || null }, { endDate: event.target.value || null })}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                disabled={disabled}
              />
            </label>
          </div>

          <section className="rounded-lg border border-slate-200 bg-white p-2.5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Assignment</p>
            <CompactArtistPicker
              users={users}
              summariesByUserId={summariesByUserId}
              recommendedDepartment={recommendedDepartment}
              assignments={getAudioAssignments(item)}
              onChange={(assignments) => {
                const lead = getLeadAssignment(assignments);
                onUpdate(
                  item.id,
                  { assignments, assignedUserId: lead?.employeeId || null },
                  {
                    taskAssignments: assignments,
                    assignedUser: lead?.employee || usersById.get(Number(lead?.employeeId || 0)) || null
                  }
                );
              }}
              disabled={disabled}
              allowMultiple={false}
              compact
            />
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-2.5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Notes</p>
            <textarea
              value={notesDraft}
              onChange={(event) => setNotesDraft(event.target.value)}
              onBlur={() => {
                if ((item.notes || "") !== notesDraft) {
                  onUpdate(item.id, { notes: notesDraft || null }, { notes: notesDraft || null });
                }
              }}
              rows={3}
              placeholder="Optional production notes, handoff comments, retake context"
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
              disabled={disabled}
            />
          </section>

          <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Approvals</p>
              <p className="mt-1 text-xs font-semibold text-slate-800">Use status to track approval stage</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Comments</p>
              <p className="mt-1 text-xs font-semibold text-slate-800">Capture in notes for now</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Attachments</p>
              <p className="mt-1 text-xs font-semibold text-slate-800">Managed in project files</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">History</p>
              <p className="mt-1 text-xs font-semibold text-slate-800">Created {formatDate(item.createdAt)}</p>
            </div>
          </section>

          <section className="grid gap-2 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Timeline</p>
              <p className="mt-1 text-xs text-slate-700">Start {formatDate(item.startDate)} · End {formatDate(item.endDate)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Retakes</p>
              <p className="mt-1 text-xs text-slate-700">Use status `RTK` for retake cycles</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Output</p>
              <p className="mt-1 text-xs text-slate-700">Final delivery metadata can be tracked here</p>
            </div>
          </section>
        </div>
      </div>
    </article>
  );
}

export default function AudioWorkspace({ projectId, overview, users = [], recommendedDepartment, showToast }) {
  const activeUsers = useMemo(() => users.filter((user) => user?.isActive !== false), [users]);
  const usersById = useMemo(() => new Map(activeUsers.map((user) => [Number(user.id), user])), [activeUsers]);
  const summariesByUserId = useEmployeeAvailabilitySummaries(activeUsers);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  const [filters, setFilters] = useState({
    search: "",
    status: "",
    sortBy: "latest",
    sortDir: "desc"
  });

  const [selectedIds, setSelectedIds] = useState([]);
  const [expandedIds, setExpandedIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkAssignments, setBulkAssignments] = useState([]);

  const [quickForm, setQuickForm] = useState(() => createQuickForm());
  const [quickErrors, setQuickErrors] = useState({});

  const [deleteTarget, setDeleteTarget] = useState(null);

  const defaultDepartment = useMemo(
    () => resolveDefaultDepartment(activeUsers, recommendedDepartment),
    [activeUsers, recommendedDepartment]
  );

  const suggestedQuickUser = useMemo(
    () => pickSuggestedUser(activeUsers, summariesByUserId, quickForm.department || defaultDepartment, recommendedDepartment),
    [activeUsers, defaultDepartment, quickForm.department, recommendedDepartment, summariesByUserId]
  );

  useEffect(() => {
    if (!quickForm.department && defaultDepartment) {
      setQuickForm((prev) => ({ ...prev, department: defaultDepartment }));
    }
  }, [defaultDepartment, quickForm.department]);

  useEffect(() => {
    if (!quickForm.assignments.length && suggestedQuickUser) {
      setQuickForm((prev) => {
        if (prev.assignments.length) return prev;
        return {
          ...prev,
          assignments: [buildAssignment(suggestedQuickUser)]
        };
      });
    }
  }, [quickForm.assignments.length, suggestedQuickUser]);

  useEffect(() => {
    loadAudioTasks();
  }, [projectId]);

  async function loadAudioTasks(withLoader = true) {
    if (withLoader) setLoading(true);
    setError("");

    try {
      const { data } = await api.get(`/projects/${projectId}/audio`, {
        params: {
          page: 1,
          pageSize: 1000,
          sortBy: "createdAt",
          sortDir: "desc"
        }
      });
      setItems(data.items || []);
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || "Failed to load audio tasks");
      setItems([]);
    } finally {
      if (withLoader) setLoading(false);
    }
  }

  const visibleItems = useMemo(() => {
    const searchNeedle = String(filters.search || "").trim().toLowerCase();

    const filtered = items.filter((item) => {
      const assignedUsers = getAudioAssignedUsers(item, usersById);
      const matchesSearch =
        !searchNeedle ||
        [
          item.name,
          item.notes,
          item.status,
          ...assignedUsers.map((user) => user.name),
          ...assignedUsers.map((user) => user.email),
          ...assignedUsers.map((user) => getDepartmentLabel(user))
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(searchNeedle));

      const matchesStatus = !filters.status || item.status === filters.status;

      return matchesSearch && matchesStatus;
    });

    return sortAudioRows(filtered, filters.sortBy, filters.sortDir);
  }, [filters, items, usersById]);

  const allVisibleSelected = Boolean(visibleItems.length) && visibleItems.every((item) => selectedIds.includes(item.id));

  function setAudioList(updater) {
    setItems((current) => (typeof updater === "function" ? updater(current) : updater));
  }

  function resetQuickForm() {
    const suggested = pickSuggestedUser(activeUsers, summariesByUserId, quickForm.department || defaultDepartment, recommendedDepartment);
    setQuickForm(createQuickForm({
      department: quickForm.department || defaultDepartment,
      defaultAssignment: suggested ? buildAssignment(suggested) : null
    }));
    setQuickErrors({});
  }

  function updateQuickForm(key, value) {
    setQuickForm((prev) => ({ ...prev, [key]: value }));
    setQuickErrors((prev) => ({ ...prev, [key]: "", assignments: key === "assignments" ? "" : prev.assignments }));
  }

  async function createAudioTask(values) {
    const { normalized, errors } = validateAudioDraft(values, usersById);
    if (Object.keys(errors).length) {
      setQuickErrors(errors);
      showToast?.("error", "Complete required fields: name, artist, status, start date");
      return null;
    }

    const lead = getLeadAssignment(normalized.assignments || []);
    const payload = {
      projectId: Number(projectId),
      name: normalized.name,
      assignedUserId: lead?.employeeId || null,
      assignments: normalized.assignments,
      status: normalized.status,
      startDate: normalized.startDate || todayDateInput(),
      endDate: normalized.endDate || null,
      notes: normalized.notes || null
    };

    const { data } = await api.post("/audio", payload);
    setAudioList((current) => [data, ...current]);
    return data;
  }

  async function handleQuickCreate(event) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    try {
      const created = await createAudioTask(quickForm);
      if (created) {
        showToast?.("success", "Audio task created");
        resetQuickForm();
      }
    } catch (err) {
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to create audio task");
    } finally {
      setBusy(false);
    }
  }

  async function updateAudioTask(id, payload, optimisticPatch = {}) {
    const previous = items;
    setAudioList((current) => current.map((item) => (item.id === id ? { ...item, ...optimisticPatch } : item)));

    try {
      const { data } = await api.patch(`/audio/${id}`, payload);
      setAudioList((current) => current.map((item) => (item.id === id ? data : item)));
    } catch (err) {
      setItems(previous);
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to update audio task");
    }
  }

  async function duplicateAudioTask(item) {
    setBusy(true);
    try {
      const created = await createAudioTask({
        name: `${item.name} Copy`,
        assignments: getAudioAssignments(item),
        status: item.status,
        startDate: formatDateInput(item.startDate) || todayDateInput(),
        endDate: formatDateInput(item.endDate),
        notes: item.notes || ""
      });

      if (created) showToast?.("success", "Audio task duplicated");
    } catch (err) {
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to duplicate audio task");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const previous = items;

    setAudioList((list) => list.filter((item) => item.id !== deleteTarget.id));
    setBusy(true);

    try {
      await api.delete(`/audio/${deleteTarget.id}`);
      setSelectedIds((prev) => prev.filter((id) => id !== deleteTarget.id));
      showToast?.("success", "Audio task deleted");
      setDeleteTarget(null);
    } catch (err) {
      setItems(previous);
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to delete audio task");
    } finally {
      setBusy(false);
    }
  }

  async function bulkApplyArtist() {
    if (!selectedIds.length || !bulkAssignments.length) return;

    const lead = getLeadAssignment(bulkAssignments);
    const userId = lead?.employeeId || null;
    const assignedUser = lead?.employee || usersById.get(Number(userId)) || null;
    const previous = items;

    setAudioList((list) =>
      list.map((item) =>
        selectedIds.includes(item.id)
          ? {
              ...item,
              assignedUser,
              taskAssignments: bulkAssignments
            }
          : item
      )
    );

    setBusy(true);
    try {
      await Promise.all(selectedIds.map((id) => api.patch(`/audio/${id}`, { assignedUserId: userId, assignments: bulkAssignments })));
      setSelectedIds([]);
      setBulkAssignments([]);
      showToast?.("success", "Artist reassigned for selected rows");
    } catch (err) {
      setItems(previous);
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to bulk assign artists");
    } finally {
      setBusy(false);
    }
  }

  async function bulkApplyStatus() {
    if (!selectedIds.length || !bulkStatus) return;

    const previous = items;
    setAudioList((list) => list.map((item) => (selectedIds.includes(item.id) ? { ...item, status: bulkStatus } : item)));
    setBusy(true);

    try {
      await Promise.all(selectedIds.map((id) => api.patch(`/audio/${id}`, { status: bulkStatus })));
      setSelectedIds([]);
      setBulkStatus("");
      showToast?.("success", "Status updated for selected rows");
    } catch (err) {
      setItems(previous);
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to bulk update statuses");
    } finally {
      setBusy(false);
    }
  }

  async function bulkDelete() {
    if (!selectedIds.length) return;

    const previous = items;
    const selectedSet = new Set(selectedIds);
    setAudioList((list) => list.filter((item) => !selectedSet.has(item.id)));
    setBusy(true);

    try {
      await Promise.all(selectedIds.map((id) => api.delete(`/audio/${id}`)));
      setSelectedIds([]);
      showToast?.("success", "Selected audio tasks deleted");
    } catch (err) {
      setItems(previous);
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to bulk delete audio tasks");
    } finally {
      setBusy(false);
    }
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  }

  function toggleSelectVisible() {
    const visibleIds = visibleItems.map((item) => item.id);
    setSelectedIds((prev) => {
      const allSelected = visibleIds.length && visibleIds.every((id) => prev.includes(id));
      return allSelected ? prev.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...prev, ...visibleIds]));
    });
  }

  function toggleExpand(id) {
    setExpandedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  }

  if (loading) {
    return <Loader label="Loading audio workspace..." />;
  }

  return (
    <div className="space-y-3">
      <section className="rounded-[26px] border border-slate-200/80 bg-white/95 p-4 shadow-sm shadow-slate-200/40">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Audio Production Tracker</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{overview?.project?.name || "Project"} · Audio</h2>
            <p className="mt-1 text-sm text-slate-600">Quick entry at the top, compact rows in the middle, details drawer at the bottom.</p>
          </div>
          <Link
            to={`/projects/${projectId}`}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Back To Overview
          </Link>
        </div>

        <form onSubmit={handleQuickCreate} className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5">
          <div className="grid gap-2 xl:grid-cols-[minmax(220px,1.45fr)_minmax(280px,2fr)_145px_140px_140px_130px]">
            <label className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Audio Name</span>
              <input
                value={quickForm.name}
                onChange={(event) => updateQuickForm("name", event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleQuickCreate(event);
                  }
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="Episode 03 dubbing sync"
                disabled={busy}
              />
              <InlineError>{quickErrors.name}</InlineError>
            </label>

            <label className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Assign Artist</span>
              <CompactArtistPicker
                users={activeUsers}
                summariesByUserId={summariesByUserId}
                recommendedDepartment={quickForm.department || recommendedDepartment}
                assignments={quickForm.assignments}
                onChange={(assignments) => updateQuickForm("assignments", assignments)}
                disabled={busy}
                allowMultiple={false}
                compact
              />
              <InlineError>{quickErrors.assignments}</InlineError>
            </label>

            <label className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Status</span>
              <select
                value={quickForm.status}
                onChange={(event) => updateQuickForm("status", event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                disabled={busy}
              >
                {STAGE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {getStatusOptionLabel(status)}
                  </option>
                ))}
              </select>
              <InlineError>{quickErrors.status}</InlineError>
            </label>

            <label className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Start Date</span>
              <input
                type="date"
                value={quickForm.startDate}
                onChange={(event) => updateQuickForm("startDate", event.target.value || todayDateInput())}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                disabled={busy}
              />
              <InlineError>{quickErrors.startDate}</InlineError>
            </label>

            <label className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">End Date</span>
              <input
                type="date"
                value={quickForm.endDate}
                onChange={(event) => updateQuickForm("endDate", event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                disabled={busy}
              />
            </label>

            <div className="flex items-end justify-end">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Create
              </button>
            </div>
          </div>
        </form>
      </section>

      <section className="rounded-[24px] border border-slate-200/80 bg-white/95 shadow-sm shadow-slate-200/35">
        <div className="space-y-2 border-b border-slate-200 px-3 py-3 sm:px-4">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1.7fr)_220px_220px_auto]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={filters.search}
                onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                placeholder="Search audio rows, notes, artists"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
              />
            </label>

            <select
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              {STAGE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {getStatusOptionLabel(status)}
                </option>
              ))}
            </select>

            <select
              value={filters.sortBy}
              onChange={(event) => setFilters((prev) => ({ ...prev, sortBy: event.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="latest">Sort: Latest</option>
              <option value="startDate">Sort: Start Date</option>
              <option value="endDate">Sort: End Date</option>
              <option value="name">Sort: Name</option>
              <option value="status">Sort: Status</option>
            </select>

            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, sortDir: prev.sortDir === "asc" ? "desc" : "asc" }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700"
            >
              {String(filters.sortDir).toUpperCase()}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs">
            <span className="text-slate-600">
              {visibleItems.length} visible row{visibleItems.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={toggleSelectVisible}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {allVisibleSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
              {allVisibleSelected ? "Clear" : "Select"} visible
            </button>
          </div>

          {selectedIds.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2.5">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{selectedIds.length} selected</div>
              <div className="grid gap-2 xl:grid-cols-[minmax(0,1.55fr)_220px_auto_auto_auto]">
                <CompactArtistPicker
                  users={activeUsers}
                  summariesByUserId={summariesByUserId}
                  recommendedDepartment={recommendedDepartment}
                  assignments={bulkAssignments}
                  onChange={setBulkAssignments}
                  disabled={busy}
                  allowMultiple={false}
                  compact
                />
                <select
                  value={bulkStatus}
                  onChange={(event) => setBulkStatus(event.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  disabled={busy}
                >
                  <option value="">Status</option>
                  {STAGE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {getStatusOptionLabel(status)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={bulkApplyArtist}
                  disabled={busy || !bulkAssignments.length}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  Reassign
                </button>
                <button
                  type="button"
                  onClick={bulkApplyStatus}
                  disabled={busy || !bulkStatus}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  Update Status
                </button>
                <button
                  type="button"
                  onClick={bulkDelete}
                  disabled={busy}
                  className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {error ? <div className="px-4 py-3 text-sm font-medium text-rose-700">{error}</div> : null}

        {!visibleItems.length ? (
          <div className="px-4 py-8 text-center">
            <div className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
              <Volume2 className="h-4 w-4" />
            </div>
            <h4 className="text-lg font-semibold text-slate-950">No Audio Tasks</h4>
            <p className="mt-1 text-sm text-slate-500">Use the quick entry row above to create your first production audio row.</p>
          </div>
        ) : (
          <div className="space-y-2 px-3 py-3 sm:px-4">
            <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:grid lg:grid-cols-[32px_minmax(220px,1.85fr)_130px_minmax(180px,1.2fr)_120px_120px_180px]">
              <span>Select</span>
              <span>Name</span>
              <span>Status</span>
              <span>Artist</span>
              <span>Start</span>
              <span>End</span>
              <span className="text-right">Actions</span>
            </div>

            {visibleItems.map((item) => (
              <AudioTaskRow
                key={item.id}
                item={item}
                users={activeUsers}
                usersById={usersById}
                summariesByUserId={summariesByUserId}
                recommendedDepartment={recommendedDepartment}
                selected={selectedIds.includes(item.id)}
                expanded={expandedIds.includes(item.id)}
                disabled={busy}
                onToggleSelect={toggleSelect}
                onToggleExpand={toggleExpand}
                onUpdate={updateAudioTask}
                onDuplicate={duplicateAudioTask}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </section>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget ? `Delete ${deleteTarget.name}?` : "Delete Audio Task"}
        size="max-w-lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">This removes the audio row from the production tracker and cannot be undone automatically.</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={busy}
              className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
