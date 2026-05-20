import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock3,
  Copy,
  Filter,
  Plus,
  Search,
  Square,
  Trash2,
  Volume2
} from "lucide-react";
import api from "../lib/api";
import Loader from "./Loader";
import Modal from "./Modal";
import FlexibleAssignmentField from "./FlexibleAssignmentField";
import {
  STAGE_STATUSES,
  getStatusMeta,
  getStatusOptionLabel,
  isCompleteStatus,
  isLateStatus
} from "../utils/constants";
import {
  formatDate,
  formatDateInput,
  formatDurationMinutes,
  getDepartmentLabel,
  initials,
  todayDateInput
} from "../utils/format";
import {
  buildDepartmentOptions,
  countUsersByDepartment,
  filterUsersByDepartment,
  getLeadAssignment,
  normalizeAssignmentList
} from "../utils/assignments";
import { isDepartmentMatch } from "../utils/stageDepartmentMap";

const DEFAULT_FORM = () => ({
  name: "",
  assignments: [],
  status: "YTS",
  startDate: todayDateInput(),
  endDate: "",
  notes: ""
});

function sortAudioRows(rows, sortBy, sortDir) {
  const direction = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const getDateValue = (value) => (value ? new Date(value).getTime() : 0);

    if (sortBy === "name") return String(a.name || "").localeCompare(String(b.name || "")) * direction;
    if (sortBy === "status") return String(a.status || "").localeCompare(String(b.status || "")) * direction;
    if (sortBy === "startDate") return (getDateValue(a.startDate) - getDateValue(b.startDate)) * direction;
    if (sortBy === "endDate") return (getDateValue(a.endDate) - getDateValue(b.endDate)) * direction;
    if (sortBy === "duration") return ((getAudioDurationMinutes(a) || 0) - (getAudioDurationMinutes(b) || 0)) * direction;
    if (sortBy === "latest") return (getDateValue(a.createdAt) - getDateValue(b.createdAt)) * direction;

    const orderDelta = Number(a.order || 0) - Number(b.order || 0);
    if (orderDelta !== 0) return orderDelta;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

function getAudioAssignments(item) {
  return item?.taskAssignments?.length ? item.taskAssignments : normalizeAssignmentList(item);
}

function getAudioAssignedUsers(item, users) {
  const usersById = new Map((users || []).map((user) => [user.id, user]));
  return getAudioAssignments(item)
    .map((assignment) => assignment.employee || usersById.get(Number(assignment.employeeId)) || null)
    .filter(Boolean);
}

function getAudioDurationMinutes(item, now = Date.now()) {
  const start = item?.startDate ? new Date(item.startDate) : null;
  if (!start || Number.isNaN(start.getTime())) return null;

  const endValue = item?.endDate ? new Date(item.endDate) : new Date(now);
  if (Number.isNaN(endValue.getTime())) return null;

  return Math.max(0, Math.round((endValue.getTime() - start.getTime()) / 60000));
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

function getDurationBadgeClasses(minutes) {
  const value = Number(minutes || 0);
  if (!value) return "border-slate-200 bg-slate-50 text-slate-500";
  if (value < 60) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value < 480) return "border-sky-200 bg-sky-50 text-sky-700";
  if (value < 1440) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function validateAudioDraft(values) {
  const next = {
    name: String(values.name || "").trim(),
    assignments: normalizeAssignmentList(values.assignments),
    status: values.status || "",
    startDate: values.startDate || todayDateInput(),
    endDate: values.endDate || "",
    notes: values.notes || ""
  };

  const errors = {};
  if (!next.name) errors.name = "Task name is required.";
  if (!next.assignments.length) errors.assignments = "Assign at least one artist.";
  if (!next.status) errors.status = "Status is required.";
  if (!next.startDate) errors.startDate = "Start date is required.";
  return { normalized: next, errors };
}

function InlineError({ children }) {
  if (!children) return null;
  return <p className="mt-1 text-xs font-medium text-rose-600">{children}</p>;
}

function MetricCard({ label, value, hint, tone = "text-slate-950" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function CompactStatusPill({ status }) {
  const meta = getStatusMeta(status);
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-[0.12em] shadow-sm"
      style={{ backgroundColor: meta.background, color: meta.text, borderColor: meta.border }}
      title={getStatusOptionLabel(status)}
    >
      {meta.shortKey}
    </span>
  );
}

function SummaryArtistChip({ artist }) {
  const isFreelance = artist.employmentType === "FREELANCE";
  return (
    <span
      className={`inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
        isFreelance
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
        {initials(artist.name)}
      </span>
      <span className="truncate">{artist.name}</span>
    </span>
  );
}

function DetailSection({ title, description, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
        {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function AudioTaskRow({
  item,
  users,
  recommendedDepartment,
  selected,
  disabled,
  expanded,
  onToggleExpand,
  onToggleSelect,
  onUpdate,
  onMove,
  onDuplicate,
  onDelete,
  canMoveUp,
  canMoveDown,
  nowTick
}) {
  const [nameDraft, setNameDraft] = useState(item.name || "");
  const [notesDraft, setNotesDraft] = useState(item.notes || "");

  useEffect(() => {
    setNameDraft(item.name || "");
  }, [item.id, item.name]);

  useEffect(() => {
    setNotesDraft(item.notes || "");
  }, [item.id, item.notes]);

  const assignedArtists = useMemo(() => getAudioAssignedUsers(item, users), [item, users]);
  const durationMinutes = useMemo(() => getAudioDurationMinutes(item, nowTick), [item, nowTick]);
  const durationLabel = durationMinutes ? formatDurationMinutes(durationMinutes) : "Waiting";
  const notesPreview = String(item.notes || "").trim();

  return (
    <article className="rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300">
      <div className="space-y-3 px-4 py-4">
        <div className="flex flex-wrap items-start gap-3">
          <label className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(item.id)}
              className="h-4 w-4 rounded border-slate-300"
            />
          </label>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="truncate text-base font-semibold text-slate-950">{item.name}</h4>
                  <CompactStatusPill status={item.status} />
                  {isLateStatus(item.status, item.endDate) ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700">
                      <CircleAlert className="h-3.5 w-3.5" /> Delayed
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>Audio task</span>
                  <span>•</span>
                  <span>Created {formatCompactDate(item.createdAt)}</span>
                  <span>•</span>
                  <span>Updated {formatCompactDate(item.updatedAt)}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onMove(item.id, -1)}
                  disabled={disabled || !canMoveUp}
                  className="rounded-xl border border-slate-300 p-2 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                  title="Move up"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(item.id, 1)}
                  disabled={disabled || !canMoveDown}
                  className="rounded-xl border border-slate-300 p-2 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                  title="Move down"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDuplicate(item)}
                  disabled={disabled}
                  className="rounded-xl border border-slate-300 p-2 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                  title="Duplicate"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(item)}
                  disabled={disabled}
                  className="rounded-xl border border-rose-200 p-2 text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onToggleExpand(item.id)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 transition hover:bg-slate-50"
                >
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {expanded ? "Collapse" : "Expand"}
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_150px_150px_150px_150px]">
              <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Assigned Artists</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {assignedArtists.length ? (
                    <>
                      {assignedArtists.slice(0, 3).map((artist) => (
                        <SummaryArtistChip key={artist.id} artist={artist} />
                      ))}
                      {assignedArtists.length > 3 ? (
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                          +{assignedArtists.length - 3} more
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-sm text-slate-500">Unassigned</span>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Start Date</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{formatCompactDate(item.startDate)}</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">End Date</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{formatCompactDate(item.endDate)}</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Time Consumption</p>
                <span className={`mt-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${getDurationBadgeClasses(durationMinutes)}`}>
                  <Clock3 className="h-3.5 w-3.5" />
                  {durationLabel}
                </span>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Quick Notes</p>
                <p className="mt-2 line-clamp-2 text-sm text-slate-600">{notesPreview || "No notes yet"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-slate-200 bg-slate-50/60 px-4 py-4">
          <div className="grid gap-3 xl:grid-cols-[1.1fr_1.25fr]">
            <DetailSection title="Task Setup" description="Required production controls stay compact and editable.">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700">Task Name</span>
                  <input
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    onBlur={() => {
                      const trimmed = nameDraft.trim();
                      if (!trimmed) {
                        setNameDraft(item.name || "");
                        return;
                      }
                      if (trimmed !== item.name) {
                        onUpdate(item.id, { name: trimmed }, { name: trimmed });
                      }
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    disabled={disabled}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700">Status</span>
                  <select
                    value={item.status}
                    onChange={(event) => onUpdate(item.id, { status: event.target.value }, { status: event.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    disabled={disabled}
                  >
                    {STAGE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {getStatusOptionLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700">Start Date</span>
                  <input
                    type="date"
                    value={formatDateInput(item.startDate) || todayDateInput()}
                    onChange={(event) => {
                      const nextStartDate = event.target.value || todayDateInput();
                      onUpdate(item.id, { startDate: nextStartDate }, { startDate: nextStartDate });
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    disabled={disabled}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700">End Date</span>
                  <input
                    type="date"
                    value={formatDateInput(item.endDate)}
                    onChange={(event) => onUpdate(item.id, { endDate: event.target.value || null }, { endDate: event.target.value || null })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    disabled={disabled}
                  />
                </label>
              </div>
            </DetailSection>

            <DetailSection title="Assignment" description="Recommended department first, with manual override always available.">
              <FlexibleAssignmentField
                users={users}
                recommendedDepartment={recommendedDepartment}
                assignments={getAudioAssignments(item)}
                onChange={(assignments) => {
                  const lead = getLeadAssignment(assignments);
                  onUpdate(
                    item.id,
                    { assignments, assignedUserId: lead?.employeeId || null },
                    {
                      taskAssignments: assignments.map((assignment) => ({
                        ...assignment,
                        employee: users.find((user) => user.id === assignment.employeeId) || assignment.employee || null
                      })),
                      assignedUser: lead?.employee || users.find((user) => user.id === lead?.employeeId) || null
                    }
                  );
                }}
                disabled={disabled}
              />
            </DetailSection>
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-[1.4fr_0.9fr]">
            <DetailSection title="Notes" description="Optional context that can be filled now or later.">
              <textarea
                value={notesDraft}
                onChange={(event) => setNotesDraft(event.target.value)}
                onBlur={() => {
                  if ((item.notes || "") !== notesDraft) {
                    onUpdate(item.id, { notes: notesDraft || null }, { notes: notesDraft || null });
                  }
                }}
                rows={4}
                placeholder="Voice notes, approval context, review reminders, or handoff instructions"
                className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                disabled={disabled}
              />
            </DetailSection>

            <DetailSection title="Workflow Snapshot" description="Compact audit visibility without leaving the row.">
              <div className="space-y-2 text-sm text-slate-600">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <span className="text-slate-500">Created</span>
                  <span className="font-semibold text-slate-900">{formatDate(item.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <span className="text-slate-500">Last Updated</span>
                  <span className="font-semibold text-slate-900">{formatDate(item.updatedAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <span className="text-slate-500">Lead Artist</span>
                  <span className="font-semibold text-slate-900">{assignedArtists[0]?.name || "Unassigned"}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <span className="text-slate-500">Time</span>
                  <span className="font-semibold text-slate-900">{durationLabel}</span>
                </div>
              </div>
            </DetailSection>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function AudioTaskModal({
  open,
  onClose,
  title,
  values,
  errors,
  users,
  recommendedDepartment,
  busy,
  onChange,
  onSubmit
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="max-w-3xl">
      <div className="space-y-5">
        <DetailSection title="Section 1" description="Name, status, and the production basics required to open a task.">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Task Name</span>
              <input
                value={values.name}
                onChange={(event) => onChange("name", event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="Episode 1 dubbing handoff"
              />
              <InlineError>{errors.name}</InlineError>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</span>
              <select
                value={values.status}
                onChange={(event) => onChange("status", event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {STAGE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {getStatusOptionLabel(status)}
                  </option>
                ))}
              </select>
              <InlineError>{errors.status}</InlineError>
            </label>
          </div>
        </DetailSection>

        <DetailSection title="Section 2" description="Recommended department comes first, but managers can override any time.">
          <FlexibleAssignmentField
            users={users}
            recommendedDepartment={recommendedDepartment}
            assignments={values.assignments}
            onChange={(assignments) => onChange("assignments", assignments)}
            disabled={busy}
          />
          <InlineError>{errors.assignments}</InlineError>
        </DetailSection>

        <DetailSection title="Section 3" description="Start date defaults to today so the task is immediately trackable.">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Start Date</span>
              <input
                type="date"
                value={values.startDate}
                onChange={(event) => onChange("startDate", event.target.value || todayDateInput())}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              />
              <InlineError>{errors.startDate}</InlineError>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">End Date</span>
              <input
                type="date"
                value={values.endDate}
                onChange={(event) => onChange("endDate", event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
        </DetailSection>

        <DetailSection title="Section 4" description="Notes are optional and can be added later without blocking production.">
          <textarea
            value={values.notes}
            onChange={(event) => onChange("notes", event.target.value)}
            rows={4}
            className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            placeholder="Dubbing notes, approval reminders, freelancer handoff context, or review comments"
          />
        </DetailSection>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Required before create</p>
              <p className="text-xs text-amber-800">Name, artist assignment, status, and start date. End date and notes stay optional.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              Cancel
            </button>
            <button type="button" onClick={onSubmit} disabled={busy} className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Create Audio Task
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function AudioWorkspace({ projectId, overview, stageSummary, users = [], recommendedDepartment, showToast }) {
  const activeUsers = useMemo(() => users.filter((user) => user?.isActive !== false), [users]);
  const departmentOptions = useMemo(
    () => buildDepartmentOptions(activeUsers, recommendedDepartment),
    [activeUsers, recommendedDepartment]
  );

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    department: "",
    artistId: "",
    sortBy: "latest",
    sortDir: "desc"
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [expandedIds, setExpandedIds] = useState([]);
  const [bulkDraft, setBulkDraft] = useState({ assignments: [], status: "" });
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(DEFAULT_FORM);
  const [createErrors, setCreateErrors] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    loadAudioTasks();
  }, [projectId]);

  useEffect(() => {
    const interval = window.setInterval(() => setTick(Date.now()), 30 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setFilters((current) => {
      if (current.department) return current;
      if (recommendedDepartment && countUsersByDepartment(activeUsers, recommendedDepartment) > 0) {
        return { ...current, department: recommendedDepartment };
      }
      return current;
    });
  }, [activeUsers, recommendedDepartment]);

  const filteredArtists = useMemo(
    () => filterUsersByDepartment(activeUsers, filters.department),
    [activeUsers, filters.department]
  );

  useEffect(() => {
    if (!filters.artistId) return;
    const stillVisible = filteredArtists.some((artist) => Number(artist.id) === Number(filters.artistId));
    if (!stillVisible) {
      setFilters((current) => ({ ...current, artistId: "" }));
    }
  }, [filteredArtists, filters.artistId]);

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
    const filtered = items.filter((item) => {
      const searchNeedle = String(filters.search || "").trim().toLowerCase();
      const assignedUsers = getAudioAssignedUsers(item, activeUsers);
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
      const matchesDepartment =
        !filters.department ||
        !assignedUsers.length ||
        assignedUsers.some((user) => isDepartmentMatch(filters.department, getDepartmentLabel(user)));
      const matchesArtist =
        !filters.artistId ||
        getAudioAssignments(item).some((assignment) => Number(assignment.employeeId || assignment.employee?.id) === Number(filters.artistId)) ||
        item.assignedUser?.id === Number(filters.artistId);

      return matchesSearch && matchesStatus && matchesDepartment && matchesArtist;
    });

    return sortAudioRows(filtered, filters.sortBy, filters.sortDir);
  }, [activeUsers, filters, items]);

  const assignedEmployees = useMemo(() => {
    const unique = new Map();
    for (const item of items) {
      for (const employee of getAudioAssignedUsers(item, activeUsers)) {
        if (!unique.has(employee.id)) unique.set(employee.id, employee);
      }
    }
    return Array.from(unique.values());
  }, [activeUsers, items]);

  const metrics = useMemo(() => {
    const completed = items.filter((item) => isCompleteStatus(item.status)).length;
    return {
      total: items.length,
      completed,
      assignedArtists: assignedEmployees.length,
      availableArtists: filteredArtists.length,
      late: items.filter((item) => isLateStatus(item.status, item.endDate)).length,
      completionPercent: items.length ? Math.round((completed / items.length) * 100) : stageSummary?.completionPercent || 0
    };
  }, [assignedEmployees.length, filteredArtists.length, items, stageSummary?.completionPercent]);

  const allVisibleSelected = Boolean(visibleItems.length) && visibleItems.every((item) => selectedIds.includes(item.id));

  function setAudioList(updater) {
    setItems((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }

  function resetCreateForm() {
    setCreateForm(DEFAULT_FORM());
    setCreateErrors({});
  }

  function openCreateModal() {
    resetCreateForm();
    setCreateOpen(true);
  }

  function updateCreateField(key, value) {
    setCreateForm((prev) => ({ ...prev, [key]: value }));
    setCreateErrors((prev) => ({ ...prev, [key]: "", assignments: key === "assignments" ? "" : prev.assignments }));
  }

  async function createAudioTask(values) {
    const { normalized, errors } = validateAudioDraft(values);
    if (Object.keys(errors).length) {
      setCreateErrors(errors);
      showToast?.("error", "Complete the required audio task fields");
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

  async function handleCreateFromModal() {
    setBusy(true);
    try {
      const created = await createAudioTask(createForm);
      if (created) {
        showToast?.("success", "Audio task created");
        setCreateOpen(false);
        resetCreateForm();
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

  async function moveAudioTask(id, delta) {
    const currentIndex = visibleItems.findIndex((item) => item.id === id);
    const target = visibleItems[currentIndex + delta];
    const current = visibleItems[currentIndex];
    if (!current || !target) return;

    const previous = items;
    const currentOrder = Number(current.order || 0);
    const targetOrder = Number(target.order || 0);

    setAudioList((list) =>
      list.map((item) => {
        if (item.id === current.id) return { ...item, order: targetOrder };
        if (item.id === target.id) return { ...item, order: currentOrder };
        return item;
      })
    );

    setBusy(true);
    try {
      await Promise.all([
        api.patch(`/audio/${current.id}`, { order: targetOrder }),
        api.patch(`/audio/${target.id}`, { order: currentOrder })
      ]);
      showToast?.("success", "Audio order updated");
    } catch (err) {
      setItems(previous);
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to reorder audio tasks");
    } finally {
      setBusy(false);
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

  function requestDelete(item) {
    setDeleteTarget(item);
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

  async function bulkAssign() {
    const nextAssignments = bulkDraft.assignments || [];
    if (!selectedIds.length || !nextAssignments.length) return;

    const lead = getLeadAssignment(nextAssignments);
    const userId = lead?.employeeId || null;
    const assignedUser = lead?.employee || activeUsers.find((user) => user.id === userId) || null;
    const previous = items;

    setAudioList((list) =>
      list.map((item) =>
        selectedIds.includes(item.id)
          ? {
              ...item,
              assignedUser,
              taskAssignments: nextAssignments.map((assignment) => ({
                ...assignment,
                employee: activeUsers.find((user) => user.id === assignment.employeeId) || assignment.employee || null
              }))
            }
          : item
      )
    );

    setBusy(true);
    try {
      await Promise.all(selectedIds.map((id) => api.patch(`/audio/${id}`, { assignedUserId: userId, assignments: nextAssignments })));
      setSelectedIds([]);
      setBulkDraft((prev) => ({ ...prev, assignments: [] }));
      showToast?.("success", "Bulk artist assignment applied");
    } catch (err) {
      setItems(previous);
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to bulk assign audio tasks");
    } finally {
      setBusy(false);
    }
  }

  async function bulkStatusUpdate() {
    if (!selectedIds.length || !bulkDraft.status) return;
    const previous = items;
    setAudioList((list) => list.map((item) => (selectedIds.includes(item.id) ? { ...item, status: bulkDraft.status } : item)));
    setBusy(true);
    try {
      await Promise.all(selectedIds.map((id) => api.patch(`/audio/${id}`, { status: bulkDraft.status })));
      setSelectedIds([]);
      setBulkDraft((prev) => ({ ...prev, status: "" }));
      showToast?.("success", "Bulk status update applied");
    } catch (err) {
      setItems(previous);
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to bulk update audio statuses");
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
    <div className="space-y-4">
      <section className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Audio Workspace</p>
            <h2 className="mt-2 text-xl font-bold text-slate-950 sm:text-2xl">{overview?.project?.name || "Project"} · Audio</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Compact production tracking for voiceover, dubbing, approvals, and handoff tasks.
              {recommendedDepartment ? ` Recommended department: ${recommendedDepartment}. Managers can override any time.` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/projects/${projectId}`}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back To Overview
            </Link>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" /> Add Audio Task
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Completion" value={`${metrics.completionPercent}%`} hint={`${metrics.completed} of ${metrics.total} tasks complete`} />
          <MetricCard label="Assigned Artists" value={metrics.assignedArtists} hint="Artists actively attached to audio work" />
          <MetricCard label="Audio Tasks" value={metrics.total} hint="Voice, dubbing, and approval rows" />
          <MetricCard
            label="Available Staff"
            value={metrics.availableArtists}
            hint={filters.department ? `${filters.department} ready for assignment` : "All active departments available"}
          />
          <MetricCard label="Late" value={metrics.late} hint="Tasks past end date without completion" tone="text-rose-700" />
        </div>

        {assignedEmployees.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {assignedEmployees.slice(0, 10).map((artist) => (
              <SummaryArtistChip key={artist.id} artist={artist} />
            ))}
            {assignedEmployees.length > 10 ? (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                +{assignedEmployees.length - 10} more assigned
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
          <div>
            <div className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
              Audio Tasks
            </div>
            <h3 className="mt-2 text-lg font-bold text-slate-900">Production Audio Tracker</h3>
            <p className="mt-1 text-sm text-slate-500">Compact task rows, expandable details, and responsive staffing controls with no horizontal scrolling.</p>
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 md:hidden"
          >
            <Filter className="h-4 w-4" /> {filtersOpen ? "Hide Filters" : "Show Filters"}
          </button>
        </div>

        <div className="space-y-3 border-b border-slate-200 px-4 py-4 sm:px-5">
          <div className={`${filtersOpen ? "grid" : "hidden"} gap-2 md:grid xl:grid-cols-[minmax(0,1.5fr)_180px_220px_220px_minmax(180px,220px)]`}>
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={filters.search}
                onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                placeholder="Search tasks, notes, artists, departments"
                className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-sm"
              />
            </label>
            <select
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              {STAGE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {getStatusOptionLabel(status)}
                </option>
              ))}
            </select>
            <select
              value={filters.department}
              onChange={(event) => setFilters((prev) => ({ ...prev, department: event.target.value, artistId: "" }))}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All departments</option>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}{department === recommendedDepartment ? " · Recommended" : ""}
                </option>
              ))}
            </select>
            <select
              value={filters.artistId}
              onChange={(event) => setFilters((prev) => ({ ...prev, artistId: event.target.value }))}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All artists</option>
              {filteredArtists.map((artist) => (
                <option key={artist.id} value={artist.id}>
                  {artist.name} · {getDepartmentLabel(artist)}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <select
                value={filters.sortBy}
                onChange={(event) => setFilters((prev) => ({ ...prev, sortBy: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="latest">Sort: Latest</option>
                <option value="endDate">Sort: End Date</option>
                <option value="startDate">Sort: Start Date</option>
                <option value="duration">Sort: Duration</option>
                <option value="name">Sort: Name</option>
                <option value="status">Sort: Status</option>
              </select>
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, sortDir: prev.sortDir === "asc" ? "desc" : "asc" }))}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                {String(filters.sortDir || "desc").toUpperCase()}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-900">{filteredArtists.length}</span>
              <span>assignable employees in</span>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700">
                {filters.department || "All departments"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {!filteredArtists.length ? (
                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, department: "", artistId: "" }))}
                  className="font-semibold text-slate-700 underline-offset-2 hover:underline"
                >
                  Select Another Department
                </button>
              ) : null}
              <button
                type="button"
                onClick={toggleSelectVisible}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {allVisibleSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                {allVisibleSelected ? "Clear" : "Select"} visible ({visibleItems.length})
              </button>
            </div>
          </div>

          {selectedIds.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <span>{selectedIds.length} selected</span>
                <span className="rounded-full bg-white px-2 py-1 text-[11px] tracking-normal text-slate-700">Bulk actions</span>
              </div>
              <div className="grid gap-2 xl:grid-cols-[minmax(0,1.4fr)_200px_auto_auto_auto]">
                <FlexibleAssignmentField
                  users={activeUsers}
                  recommendedDepartment={recommendedDepartment}
                  assignments={bulkDraft.assignments}
                  onChange={(assignments) => setBulkDraft((prev) => ({ ...prev, assignments }))}
                  allowMultiple={false}
                  disabled={busy}
                />
                <select
                  value={bulkDraft.status}
                  onChange={(event) => setBulkDraft((prev) => ({ ...prev, status: event.target.value }))}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  disabled={busy}
                >
                  <option value="">Choose status</option>
                  {STAGE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {getStatusOptionLabel(status)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={bulkAssign}
                  disabled={busy || !bulkDraft.assignments.length}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  Assign Artists
                </button>
                <button
                  type="button"
                  onClick={bulkStatusUpdate}
                  disabled={busy || !bulkDraft.status}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  Change Status
                </button>
                <button
                  type="button"
                  onClick={bulkDelete}
                  disabled={busy}
                  className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Delete Selected
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {error ? <div className="px-4 py-3 text-sm text-rose-700 sm:px-5">{error}</div> : null}

        {!visibleItems.length ? (
          <div className="px-4 py-12 text-center sm:px-5">
            <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <Volume2 className="h-5 w-5" />
            </div>
            <h4 className="text-lg font-bold text-slate-900">No Audio Tasks Yet</h4>
            <p className="mt-1 text-sm text-slate-500">
              Create the first audio production row for this project and start tracking assignments, approvals, and handoff work.
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" /> Create First Audio Task
            </button>
          </div>
        ) : (
          <div className="space-y-3 px-4 py-4 sm:px-5">
            {visibleItems.map((item, index) => (
              <AudioTaskRow
                key={item.id}
                item={item}
                users={activeUsers}
                recommendedDepartment={recommendedDepartment}
                selected={selectedIds.includes(item.id)}
                disabled={busy}
                expanded={expandedIds.includes(item.id)}
                onToggleExpand={toggleExpand}
                onToggleSelect={toggleSelect}
                onUpdate={updateAudioTask}
                onMove={moveAudioTask}
                onDuplicate={duplicateAudioTask}
                onDelete={requestDelete}
                canMoveUp={index > 0}
                canMoveDown={index < visibleItems.length - 1}
                nowTick={tick}
              />
            ))}
          </div>
        )}
      </section>

      <AudioTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Audio Task"
        values={createForm}
        errors={createErrors}
        users={activeUsers}
        recommendedDepartment={recommendedDepartment}
        busy={busy}
        onChange={updateCreateField}
        onSubmit={handleCreateFromModal}
      />

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget ? `Delete ${deleteTarget.name}?` : "Delete Audio Task"}
        size="max-w-lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This removes the audio task from the project workspace. This action cannot be undone automatically.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
              Cancel
            </button>
            <button type="button" onClick={confirmDelete} disabled={busy} className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
