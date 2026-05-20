import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, CheckSquare, Copy, Plus, Search, Square, Trash2, Volume2 } from "lucide-react";
import api from "../lib/api";
import Loader from "./Loader";
import Modal from "./Modal";
import StatusBadge from "./StatusBadge";
import FlexibleAssignmentField from "./FlexibleAssignmentField";
import { STAGE_STATUSES, getStatusOptionLabel, isCompleteStatus, isLateStatus } from "../utils/constants";
import { formatDateInput, getDepartmentLabel, initials } from "../utils/format";
import {
  buildDepartmentOptions,
  countUsersByDepartment,
  filterUsersByDepartment,
  getLeadAssignment,
  normalizeAssignmentList
} from "../utils/assignments";
import { isDepartmentMatch } from "../utils/stageDepartmentMap";

function sortAudioRows(rows, sortBy, sortDir) {
  const direction = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const getDateValue = (value) => (value ? new Date(value).getTime() : 0);
    if (sortBy === "name") return String(a.name || "").localeCompare(String(b.name || "")) * direction;
    if (sortBy === "status") return String(a.status || "").localeCompare(String(b.status || "")) * direction;
    if (sortBy === "startDate") return (getDateValue(a.startDate) - getDateValue(b.startDate)) * direction;
    if (sortBy === "endDate") return (getDateValue(a.endDate) - getDateValue(b.endDate)) * direction;
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

function AudioDesktopRow({
  item,
  users,
  recommendedDepartment,
  selected,
  disabled,
  canMoveUp,
  canMoveDown,
  onToggleSelect,
  onUpdate,
  onMove,
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

  return (
    <tr className="border-t border-slate-100 align-top hover:bg-slate-50/60">
      <td className="px-3 py-3">
        <input type="checkbox" checked={selected} onChange={() => onToggleSelect(item.id)} className="h-4 w-4 rounded border-slate-300" />
      </td>
      <td className="px-3 py-3">
        <input
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
          onBlur={() => {
            const trimmed = nameDraft.trim();
            if (!trimmed) {
              setNameDraft(item.name || "");
              return;
            }
            if (trimmed !== item.name) onUpdate(item.id, { name: trimmed }, { name: trimmed });
          }}
          className="w-full min-w-[220px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900"
        />
      </td>
      <td className="px-3 py-3">
        <div className="space-y-2">
          <StatusBadge status={item.status} />
          <select
            value={item.status}
            onChange={(event) => onUpdate(item.id, { status: event.target.value }, { status: event.target.value })}
            className="w-full min-w-[180px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
            disabled={disabled}
          >
            {STAGE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {getStatusOptionLabel(status)}
              </option>
            ))}
          </select>
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="min-w-[280px]">
          <FlexibleAssignmentField
            users={users}
            recommendedDepartment={recommendedDepartment}
            assignments={item.taskAssignments?.length ? item.taskAssignments : normalizeAssignmentList(item)}
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
        </div>
      </td>
      <td className="px-3 py-3">
        <input
          type="date"
          value={formatDateInput(item.startDate)}
          onChange={(event) => onUpdate(item.id, { startDate: event.target.value || null }, { startDate: event.target.value || null })}
          className="w-full min-w-[150px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
          disabled={disabled}
        />
      </td>
      <td className="px-3 py-3">
        <input
          type="date"
          value={formatDateInput(item.endDate)}
          onChange={(event) => onUpdate(item.id, { endDate: event.target.value || null }, { endDate: event.target.value || null })}
          className="w-full min-w-[150px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
          disabled={disabled}
        />
      </td>
      <td className="px-3 py-3">
        <textarea
          value={notesDraft}
          onChange={(event) => setNotesDraft(event.target.value)}
          onBlur={() => {
            if ((item.notes || "") !== notesDraft) {
              onUpdate(item.id, { notes: notesDraft || null }, { notes: notesDraft || null });
            }
          }}
          rows={2}
          placeholder="Notes"
          className="min-h-[44px] w-full min-w-[220px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
          disabled={disabled}
        />
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onMove(item.id, -1)} disabled={!canMoveUp || disabled} className="rounded-lg border border-slate-300 p-2 text-slate-700 disabled:opacity-40" title="Move up">
            <ArrowUp className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onMove(item.id, 1)} disabled={!canMoveDown || disabled} className="rounded-lg border border-slate-300 p-2 text-slate-700 disabled:opacity-40" title="Move down">
            <ArrowDown className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onDuplicate(item)} disabled={disabled} className="rounded-lg border border-slate-300 p-2 text-slate-700 disabled:opacity-40" title="Duplicate">
            <Copy className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onDelete(item)} disabled={disabled} className="rounded-lg border border-rose-200 p-2 text-rose-600 disabled:opacity-40" title="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function AudioMobileCard({
  item,
  users,
  recommendedDepartment,
  selected,
  disabled,
  canMoveUp,
  canMoveDown,
  onToggleSelect,
  onUpdate,
  onMove,
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

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
          <input type="checkbox" checked={selected} onChange={() => onToggleSelect(item.id)} className="h-4 w-4 rounded border-slate-300" />
          {item.name}
        </label>
        <StatusBadge status={item.status} />
      </div>

      <div className="grid gap-3">
        <input
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
          onBlur={() => {
            const trimmed = nameDraft.trim();
            if (!trimmed) {
              setNameDraft(item.name || "");
              return;
            }
            if (trimmed !== item.name) onUpdate(item.id, { name: trimmed }, { name: trimmed });
          }}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
        />
        <select
          value={item.status}
          onChange={(event) => onUpdate(item.id, { status: event.target.value }, { status: event.target.value })}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          disabled={disabled}
        >
          {STAGE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {getStatusOptionLabel(status)}
            </option>
          ))}
        </select>
        <FlexibleAssignmentField
          users={users}
          recommendedDepartment={recommendedDepartment}
          assignments={item.taskAssignments?.length ? item.taskAssignments : normalizeAssignmentList(item)}
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
        <div className="grid grid-cols-2 gap-3">
          <input
            type="date"
            value={formatDateInput(item.startDate)}
            onChange={(event) => onUpdate(item.id, { startDate: event.target.value || null }, { startDate: event.target.value || null })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            disabled={disabled}
          />
          <input
            type="date"
            value={formatDateInput(item.endDate)}
            onChange={(event) => onUpdate(item.id, { endDate: event.target.value || null }, { endDate: event.target.value || null })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            disabled={disabled}
          />
        </div>
        <textarea
          value={notesDraft}
          onChange={(event) => setNotesDraft(event.target.value)}
          onBlur={() => {
            if ((item.notes || "") !== notesDraft) {
              onUpdate(item.id, { notes: notesDraft || null }, { notes: notesDraft || null });
            }
          }}
          rows={2}
          placeholder="Notes"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          disabled={disabled}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onMove(item.id, -1)} disabled={!canMoveUp || disabled} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40">Up</button>
          <button type="button" onClick={() => onMove(item.id, 1)} disabled={!canMoveDown || disabled} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40">Down</button>
          <button type="button" onClick={() => onDuplicate(item)} disabled={disabled} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40">Duplicate</button>
          <button type="button" onClick={() => onDelete(item)} disabled={disabled} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 disabled:opacity-40">Delete</button>
        </div>
      </div>
    </article>
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
  const [selectedIds, setSelectedIds] = useState([]);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({ name: "", assignments: [], status: "YTS", startDate: "", endDate: "", notes: "" });
  const [bulkDraft, setBulkDraft] = useState({ assignments: [], status: "" });
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", assignments: [], status: "YTS", startDate: "", endDate: "", notes: "" });
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    loadAudioTasks();
  }, [projectId]);

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
      const matchesSearch = !searchNeedle || String(item.name || "").toLowerCase().includes(searchNeedle);
      const matchesStatus = !filters.status || item.status === filters.status;
      const assignedUsers = getAudioAssignedUsers(item, activeUsers);
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
  }, [activeUsers, items, filters]);

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
    const assignedArtists = new Set(
      items.flatMap((item) => getAudioAssignments(item).map((assignment) => Number(assignment.employeeId || assignment.employee?.id || 0)).filter(Boolean))
    ).size;
    return {
      total: items.length,
      completed,
      assignedArtists,
      availableArtists: filteredArtists.length,
      late: items.filter((item) => isLateStatus(item.status, item.endDate)).length,
      completionPercent: items.length ? Math.round((completed / items.length) * 100) : stageSummary?.completionPercent || 0
    };
  }, [filteredArtists.length, items, stageSummary?.completionPercent]);

  const allVisibleSelected = Boolean(visibleItems.length) && visibleItems.every((item) => selectedIds.includes(item.id));

  function setAudioList(updater) {
    setItems((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }

  async function createAudioTask(values) {
    const lead = getLeadAssignment(values.assignments || []);
    const payload = {
      projectId: Number(projectId),
      name: String(values.name || "").trim(),
      assignedUserId: lead?.employeeId || null,
      assignments: values.assignments || [],
      status: values.status || "YTS",
      startDate: values.startDate || null,
      endDate: values.endDate || null,
      notes: values.notes || null
    };

    if (!payload.name) {
      showToast?.("error", "Audio task name is required");
      return null;
    }

    const { data } = await api.post("/audio", payload);
    setAudioList((current) => [data, ...current]);
    return data;
  }

  async function handleQuickAdd() {
    setBusy(true);
    try {
      const created = await createAudioTask(quickAddForm);
      if (created) {
        showToast?.("success", "Audio task created");
        setQuickAddForm({ name: "", assignments: [], status: "YTS", startDate: "", endDate: "", notes: "" });
        setQuickAddOpen(true);
      }
    } catch (err) {
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to create audio task");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateFromModal() {
    setBusy(true);
    try {
      const created = await createAudioTask(createForm);
      if (created) {
        showToast?.("success", "Audio task created");
        setCreateOpen(false);
        setCreateForm({ name: "", assignments: [], status: "YTS", startDate: "", endDate: "", notes: "" });
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
        startDate: formatDateInput(item.startDate),
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
    const lead = getLeadAssignment(bulkDraft.assignments || []);
    const userId = lead?.employeeId || null;
    const nextAssignments = bulkDraft.assignments || [];
    if (!selectedIds.length || (!nextAssignments.length && userId !== null)) return;
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

  if (loading) {
    return <Loader label="Loading audio workspace..." />;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Audio Workspace</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">{overview?.project?.name || "Project"} · Audio</h2>
            <p className="mt-1 text-sm text-slate-500">
              Fully editable production audio tracker for voiceover, dubbing, approval, and handoff tasks.
              {recommendedDepartment ? ` Recommended department: ${recommendedDepartment}. Managers can override any time.` : ""}
            </p>
          </div>
          <Link to={`/projects/${projectId}`} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Back To Overview
          </Link>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-5 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Completion</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{metrics.completionPercent}%</p>
            <p className="mt-1 text-xs text-slate-500">{metrics.completed} of {metrics.total} audio rows complete</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Assigned Artists</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{metrics.assignedArtists}</p>
            <p className="mt-1 text-xs text-slate-500">Active audio artists on this project</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Audio Rows</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{metrics.total}</p>
            <p className="mt-1 text-xs text-slate-500">Voice, dubbing, and approval work items</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Available Staff</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{metrics.availableArtists}</p>
            <p className="mt-1 text-xs text-slate-500">
              {filters.department ? `${filters.department} ready for assignment` : "All active departments available"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Late</p>
            <p className="mt-1 text-2xl font-bold text-rose-700">{metrics.late}</p>
            <p className="mt-1 text-xs text-slate-500">Rows past end date without completion</p>
          </div>
        </div>

        {assignedEmployees.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {assignedEmployees.slice(0, 12).map((artist) => (
              <span key={artist.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">{initials(artist.name)}</span>
                <span className="font-semibold text-slate-900">{artist.name}</span>
                <span className="text-slate-500">{getDepartmentLabel(artist)}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
          <div>
            <div className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
              Audio Tasks
            </div>
            <h3 className="mt-2 text-lg font-bold text-slate-900">Production Audio Table</h3>
            <p className="mt-1 text-sm text-slate-500">Create, assign, edit, duplicate, reorder, and delete audio rows inline like a production sheet.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setQuickAddOpen((prev) => !prev)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Plus className="h-4 w-4" /> Quick Add
            </button>
            <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700">
              <Plus className="h-4 w-4" /> Add Audio
            </button>
          </div>
        </div>

        {quickAddOpen && (
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Quick add row</div>
            <div className="grid gap-2 xl:grid-cols-[1.2fr_minmax(0,1.4fr)_180px_160px_160px_minmax(0,1fr)_auto]">
              <input value={quickAddForm.name} onChange={(event) => setQuickAddForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Audio task name" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              <FlexibleAssignmentField
                users={activeUsers}
                recommendedDepartment={recommendedDepartment}
                assignments={quickAddForm.assignments}
                onChange={(assignments) => setQuickAddForm((prev) => ({ ...prev, assignments }))}
              />
              <select value={quickAddForm.status} onChange={(event) => setQuickAddForm((prev) => ({ ...prev, status: event.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
                {STAGE_STATUSES.map((status) => (
                  <option key={status} value={status}>{getStatusOptionLabel(status)}</option>
                ))}
              </select>
              <input type="date" value={quickAddForm.startDate} onChange={(event) => setQuickAddForm((prev) => ({ ...prev, startDate: event.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              <input type="date" value={quickAddForm.endDate} onChange={(event) => setQuickAddForm((prev) => ({ ...prev, endDate: event.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              <input value={quickAddForm.notes} onChange={(event) => setQuickAddForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Notes" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <button type="button" onClick={handleQuickAdd} disabled={busy || !quickAddForm.name.trim()} className="rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Create</button>
                <button type="button" onClick={() => setQuickAddOpen(false)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Close</button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3 border-b border-slate-200 px-4 py-4">
          <div className="grid gap-2 xl:grid-cols-[minmax(0,1.4fr)_220px_220px_220px_220px_auto]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={filters.search} onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))} placeholder="Search audio tasks" className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-sm" />
            </label>
            <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
              <option value="">All statuses</option>
              {STAGE_STATUSES.map((status) => (
                <option key={status} value={status}>{getStatusOptionLabel(status)}</option>
              ))}
            </select>
            <select value={filters.department} onChange={(event) => setFilters((prev) => ({ ...prev, department: event.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
              <option value="">All departments</option>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}{department === recommendedDepartment ? " · Recommended" : ""}
                </option>
              ))}
            </select>
            <select value={filters.artistId} onChange={(event) => setFilters((prev) => ({ ...prev, artistId: event.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
              <option value="">All artists</option>
              {filteredArtists.map((artist) => (
                <option key={artist.id} value={artist.id}>{artist.name} · {getDepartmentLabel(artist)}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <select value={filters.sortBy} onChange={(event) => setFilters((prev) => ({ ...prev, sortBy: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option value="latest">Sort: Latest</option>
                <option value="endDate">Sort: Deadline</option>
                <option value="startDate">Sort: Start Date</option>
                <option value="name">Sort: Name</option>
                <option value="status">Sort: Status</option>
              </select>
              <button type="button" onClick={() => setFilters((prev) => ({ ...prev, sortDir: prev.sortDir === "asc" ? "desc" : "asc" }))} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">
                {String(filters.sortDir || "desc").toUpperCase()}
              </button>
            </div>
            <button type="button" onClick={toggleSelectVisible} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              {allVisibleSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              {allVisibleSelected ? "Clear" : "Select"} visible ({visibleItems.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-900">{filteredArtists.length}</span>
              <span>assignable employees in</span>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700">
                {filters.department || "All departments"}
              </span>
            </div>
            {!filteredArtists.length ? (
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, department: "" }))}
                className="font-semibold text-slate-700 underline-offset-2 hover:underline"
              >
                Select Another Department
              </button>
            ) : null}
          </div>

          {selectedIds.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <span>{selectedIds.length} selected</span>
                <span className="rounded-full bg-white px-2 py-1 text-[11px] tracking-normal text-slate-700">Bulk actions</span>
              </div>
              <div className="grid gap-2 lg:grid-cols-[minmax(0,1.6fr)_220px_auto_auto_auto]">
                <FlexibleAssignmentField
                  users={activeUsers}
                  recommendedDepartment={recommendedDepartment}
                  assignments={bulkDraft.assignments}
                  onChange={(assignments) => setBulkDraft((prev) => ({ ...prev, assignments }))}
                  allowMultiple={false}
                  disabled={busy}
                />
                <select value={bulkDraft.status} onChange={(event) => setBulkDraft((prev) => ({ ...prev, status: event.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" disabled={busy}>
                  <option value="">Choose status</option>
                  {STAGE_STATUSES.map((status) => (
                    <option key={status} value={status}>{getStatusOptionLabel(status)}</option>
                  ))}
                </select>
                <button type="button" onClick={bulkAssign} disabled={busy || !bulkDraft.assignments.length} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Assign Artist</button>
                <button type="button" onClick={bulkStatusUpdate} disabled={busy || !bulkDraft.status} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Change Status</button>
                <button type="button" onClick={bulkDelete} disabled={busy} className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Delete Selected</button>
              </div>
            </div>
          )}
        </div>

        {error ? <div className="px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        {!visibleItems.length ? (
          <div className="px-4 py-12 text-center">
            <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <Volume2 className="h-5 w-5" />
            </div>
            <h4 className="text-lg font-bold text-slate-900">No Audio Tasks Yet</h4>
            <p className="mt-1 text-sm text-slate-500">Create the first audio production row for this project and start tracking assignments and approvals.</p>
            <button type="button" onClick={() => setCreateOpen(true)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700">
              <Plus className="h-4 w-4" /> Create First Audio Task
            </button>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Sel</th>
                    <th className="px-3 py-3">Name</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Artist Name</th>
                    <th className="px-3 py-3">Start Date</th>
                    <th className="px-3 py-3">End Date</th>
                    <th className="px-3 py-3">Notes</th>
                    <th className="px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item, index) => (
                    <AudioDesktopRow
                      key={item.id}
                      item={item}
                      users={activeUsers}
                      recommendedDepartment={recommendedDepartment}
                      selected={selectedIds.includes(item.id)}
                      disabled={busy}
                      canMoveUp={index > 0}
                      canMoveDown={index < visibleItems.length - 1}
                      onToggleSelect={toggleSelect}
                      onUpdate={updateAudioTask}
                      onMove={moveAudioTask}
                      onDuplicate={duplicateAudioTask}
                      onDelete={requestDelete}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 p-4 md:hidden">
              {visibleItems.map((item, index) => (
                <AudioMobileCard
                  key={item.id}
                  item={item}
                  users={activeUsers}
                  recommendedDepartment={recommendedDepartment}
                  selected={selectedIds.includes(item.id)}
                  disabled={busy}
                  canMoveUp={index > 0}
                  canMoveDown={index < visibleItems.length - 1}
                  onToggleSelect={toggleSelect}
                  onUpdate={updateAudioTask}
                  onMove={moveAudioTask}
                  onDuplicate={duplicateAudioTask}
                  onDelete={requestDelete}
                />
              ))}
            </div>
          </>
        )}
      </section>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Audio Task" size="max-w-2xl">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Name</span>
              <input value={createForm.name} onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
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
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Start Date</span>
                <input type="date" value={createForm.startDate} onChange={(event) => setCreateForm((prev) => ({ ...prev, startDate: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">End Date</span>
                <input type="date" value={createForm.endDate} onChange={(event) => setCreateForm((prev) => ({ ...prev, endDate: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              </label>
            </div>
          </div>
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Notes</span>
            <textarea value={createForm.notes} onChange={(event) => setCreateForm((prev) => ({ ...prev, notes: event.target.value }))} rows={3} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button>
            <button type="button" onClick={handleCreateFromModal} disabled={busy || !createForm.name.trim()} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Create Audio Task</button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title={deleteTarget ? `Delete ${deleteTarget.name}?` : "Delete Audio Task"} size="max-w-lg">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">This removes the audio task from the project workspace. This action cannot be undone automatically.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button>
            <button type="button" onClick={confirmDelete} disabled={busy} className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Delete</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
