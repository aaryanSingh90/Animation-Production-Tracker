import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import StageCommentThread from "../components/StageCommentThread";
import { formatDate, formatDateInput, labelize } from "../utils/format";
import { STAGE_STATUSES } from "../utils/constants";
import { stageCodeFromSlug, stageLabelFromSlug } from "../utils/stageRouting";
import { isDepartmentMatch, stageDepartmentFromCode } from "../utils/stageDepartmentMap";
import { useToastStore } from "../store/toastStore";
import { useAuthStore } from "../store/authStore";

const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_TRACKING_BY_STAGE = {
  AUDIO: "PROJECT",
  COMPOSITING: "PROJECT",
  EDITING: "PROJECT",
  ANIMATICS: "SHOT",
  TEXTURING: "SHOT",
  ANIMATION: "SHOT",
  CHARACTER_MODELLING: "ASSET",
  BLENDSHAPES: "ASSET",
  BG_MODELLING: "ASSET",
  RIGGING: "ASSET"
};

function isOverdue(deadline, status) {
  if (!deadline) return false;
  if (status === "APPROVED") return false;
  return new Date(deadline) < new Date();
}

function deriveShotCode(shot) {
  if (shot?.name) return String(shot.name).trim();
  if (Number.isInteger(shot?.shotNumber)) {
    return `SH${String(shot.shotNumber).padStart(3, "0")}`;
  }
  return "SHOT";
}

function deriveSequence(shotCode) {
  const code = String(shotCode || "").trim();
  if (!code) return "MAIN";

  const withPrefix = code.match(/^([A-Za-z0-9]+)[_-]SH\d+/i);
  if (withPrefix?.[1]) return withPrefix[1].toUpperCase();

  if (code.includes("_")) return code.split("_")[0].toUpperCase();
  if (code.includes("-")) return code.split("-")[0].toUpperCase();
  return "MAIN";
}

export default function ProjectStageWorkspacePage() {
  const { projectId, stageSlug } = useParams();
  const showToast = useToastStore((state) => state.showToast);
  const currentUser = useAuthStore((state) => state.user);

  const stageCode = stageCodeFromSlug(stageSlug);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, totalPages: 1 });
  const [filters, setFilters] = useState({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    status: "",
    artistId: "",
    search: "",
    type: "",
    sequence: "",
    unassigned: false,
    overdue: false,
    sortBy: "shotNumber",
    sortDir: "asc"
  });
  const [error, setError] = useState("");
  const [workspaceMode, setWorkspaceMode] = useState("PROJECT");
  const [openCommentsByStageId, setOpenCommentsByStageId] = useState({});
  const [commentCountsByStageId, setCommentCountsByStageId] = useState({});

  const [selectedShotStageIds, setSelectedShotStageIds] = useState([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);
  const [bulkForm, setBulkForm] = useState({ artistId: "", status: "", deadline: "", notes: "" });

  const stageSummary = useMemo(() => {
    const rows = overview?.stageSummaries || [];
    return rows.find((row) => String(row.stageCode).toUpperCase() === String(stageCode || "").toUpperCase()) || null;
  }, [overview, stageCode]);

  const trackingMode = workspaceMode || stageSummary?.trackingMode || "PROJECT";
  const isShotMode = trackingMode === "SHOT";

  const requiredDepartment = useMemo(() => stageDepartmentFromCode(stageCode), [stageCode]);
  const eligibleUsers = useMemo(() => {
    if (!requiredDepartment) return users;
    return users.filter((user) => {
      const departmentName = user.departmentInfo?.name || user.departmentName || user.department || "";
      return isDepartmentMatch(requiredDepartment, departmentName);
    });
  }, [users, requiredDepartment]);

  const selectedSet = useMemo(() => new Set(selectedShotStageIds), [selectedShotStageIds]);
  const allVisibleSelected = useMemo(() => isShotMode && items.length > 0 && items.every((item) => selectedSet.has(item.stageId)), [items, isShotMode, selectedSet]);

  const workloadRows = useMemo(() => {
    if (!isShotMode) return [];

    const buckets = new Map();
    for (const item of items) {
      if (!item.assignedUser?.id) continue;

      const id = item.assignedUser.id;
      if (!buckets.has(id)) {
        buckets.set(id, {
          id,
          name: item.assignedUser.name,
          total: 0,
          active: 0,
          overdue: 0
        });
      }

      const bucket = buckets.get(id);
      bucket.total += 1;
      if (item.stageStatus !== "APPROVED") bucket.active += 1;
      if (isOverdue(item.deadline, item.stageStatus)) bucket.overdue += 1;
    }

    return Array.from(buckets.values()).sort((a, b) => b.total - a.total);
  }, [items, isShotMode]);

  const unassignedShotsCount = useMemo(() => {
    if (!isShotMode) return 0;
    return items.filter((item) => !item.assignedUser?.id).length;
  }, [items, isShotMode]);

  async function loadWorkspace(nextFilters = filters) {
    if (!stageCode) return;

    setLoading(true);
    setError("");

    try {
      const [overviewRes, usersRes] = await Promise.all([api.get(`/projects/${projectId}/overview`), api.get("/users")]);

      setOverview(overviewRes.data);
      setUsers((usersRes.data || []).filter((user) => user.isActive && user.role === "EMPLOYEE"));

      const resolvedSummary =
        (overviewRes.data?.stageSummaries || []).find(
          (row) => String(row.stageCode).toUpperCase() === String(stageCode || "").toUpperCase()
        ) || null;
      let resolvedTrackingMode = resolvedSummary?.trackingMode || DEFAULT_TRACKING_BY_STAGE[String(stageCode || "").toUpperCase()] || "PROJECT";

      if (!resolvedSummary && stageCode === "LIGHTING") {
        resolvedTrackingMode = overviewRes.data?.project?.lightingMode || "PROJECT";
      }
      if (!resolvedSummary && stageCode === "RENDERING") {
        resolvedTrackingMode = overviewRes.data?.project?.renderingMode || "PROJECT";
      }

      setWorkspaceMode(resolvedTrackingMode);

      const query = {
        page: nextFilters.page,
        pageSize: nextFilters.pageSize,
        sortBy: nextFilters.sortBy,
        sortDir: nextFilters.sortDir
      };
      if (nextFilters.status) query.status = nextFilters.status;
      if (nextFilters.artistId) query.artistId = nextFilters.artistId;
      if (nextFilters.search) query.search = nextFilters.search;
      if (nextFilters.type) query.type = nextFilters.type;
      if (nextFilters.sequence) query.sequence = nextFilters.sequence;
      if (nextFilters.unassigned) query.unassigned = true;
      if (nextFilters.overdue) query.overdue = true;

      let workspaceRes;
      if (resolvedTrackingMode === "SHOT") {
        workspaceRes = await api.get(`/projects/${projectId}/stages/${stageCode}/shots`, { params: query });
        const mapped = (workspaceRes.data.items || []).map((entry) => {
          const shotCode = deriveShotCode(entry.shot);
          return {
            id: entry.id,
            trackingId: entry.shotId,
            trackingLabel: entry.shot?.name || `Shot ${entry.shot?.shotNumber || "-"}`,
            trackingType: "SHOT",
            stageId: entry.id,
            stageStatus: entry.status,
            deadline: entry.deadline,
            submittedAt: entry.submittedAt,
            approvedAt: entry.approvedAt,
            assignedUser: entry.assignedUser,
            feedback: entry.feedback,
            notes: entry.notes,
            shot: entry.shot,
            shotCode,
            sequence: deriveSequence(shotCode),
            priority: entry.shot?.order || entry.shot?.shotNumber || 0,
            raw: entry
          };
        });
        setItems(mapped);
        setPagination(workspaceRes.data.pagination || { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, totalPages: 1 });
        setSelectedShotStageIds((prev) => prev.filter((id) => mapped.some((item) => item.stageId === id)));
      } else if (resolvedTrackingMode === "ASSET") {
        workspaceRes = await api.get(`/projects/${projectId}/stages/${stageCode}/assets`, { params: query });
        setItems((workspaceRes.data.items || []).map((entry) => ({
          id: entry.id,
          trackingId: entry.assetId,
          trackingLabel: entry.asset?.name || "Asset",
          trackingType: "ASSET",
          stageId: entry.id,
          stageStatus: entry.status,
          deadline: entry.deadline,
          submittedAt: entry.submittedAt,
          approvedAt: entry.approvedAt,
          assignedUser: entry.assignedUser,
          feedback: entry.feedback,
          notes: entry.notes,
          raw: entry
        })));
        setPagination(workspaceRes.data.pagination || { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, totalPages: 1 });
        setSelectedShotStageIds([]);
      } else {
        workspaceRes = await api.get(`/projects/${projectId}/stages/${stageCode}/project`, { params: query });
        const normalizedItems = (workspaceRes.data.items || []).map((entry) => ({
          id: entry.id,
          trackingId: entry.projectId,
          trackingLabel: overviewRes.data.project?.name || "Project",
          trackingType: "PROJECT",
          stageId: entry.id,
          stageStatus: entry.status,
          deadline: entry.deadline,
          submittedAt: entry.submittedAt,
          approvedAt: entry.approvedAt,
          assignedUser: entry.assignedUser,
          feedback: entry.feedback,
          notes: entry.notes,
          raw: entry
        }));
        setItems(normalizedItems);
        setPagination({
          page: 1,
          pageSize: normalizedItems.length || DEFAULT_PAGE_SIZE,
          total: normalizedItems.length,
          totalPages: 1
        });
        setSelectedShotStageIds([]);
      }
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || "Failed to load stage workspace");
      setItems([]);
      setPagination({ page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, totalPages: 1 });
      setSelectedShotStageIds([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWorkspace();
  }, [projectId, stageCode]);

  useEffect(() => {
    if (!stageCode) return;
    const timeout = setTimeout(() => loadWorkspace(filters), 250);
    return () => clearTimeout(timeout);
  }, [filters.page, filters.pageSize, filters.status, filters.artistId, filters.search, filters.type, filters.sequence, filters.unassigned, filters.overdue, filters.sortBy, filters.sortDir]);

  async function updateStage(stageId, payload) {
    setSaving(true);
    try {
      const endpoint = trackingMode === "SHOT" ? `/shot-stages/${stageId}` : trackingMode === "ASSET" ? `/asset-stages/${stageId}` : `/stages/${stageId}`;
      await api.put(endpoint, payload);
      showToast("success", "Stage updated");
      await loadWorkspace(filters);
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to update stage");
    } finally {
      setSaving(false);
    }
  }

  function toggleShotSelection(stageId, index, event) {
    const checked = event.target.checked;

    setSelectedShotStageIds((prev) => {
      const next = new Set(prev);

      if (event.shiftKey && lastSelectedIndex !== null && index !== null) {
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        const rangeIds = items.slice(start, end + 1).map((row) => row.stageId);
        for (const id of rangeIds) {
          if (checked) next.add(id);
          else next.delete(id);
        }
      } else {
        if (checked) next.add(stageId);
        else next.delete(stageId);
      }

      return Array.from(next);
    });

    setLastSelectedIndex(index);
  }

  function toggleSelectAllVisible(event) {
    const checked = event.target.checked;
    if (!checked) {
      setSelectedShotStageIds([]);
      return;
    }

    setSelectedShotStageIds(items.map((item) => item.stageId));
  }

  async function applyBulkAssign() {
    if (!selectedShotStageIds.length) return;

    setSaving(true);
    try {
      await api.post("/shots/bulk-assign", {
        shotStageIds: selectedShotStageIds,
        userId: bulkForm.artistId ? Number(bulkForm.artistId) : null
      });
      showToast("success", `Assigned ${selectedShotStageIds.length} shots`);
      setSelectedShotStageIds([]);
      await loadWorkspace(filters);
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to bulk assign shots");
    } finally {
      setSaving(false);
    }
  }

  async function applyBulkUpdate() {
    if (!selectedShotStageIds.length) return;

    const payload = {
      shotStageIds: selectedShotStageIds
    };

    if (bulkForm.status) payload.status = bulkForm.status;
    if (bulkForm.deadline) payload.deadline = bulkForm.deadline;
    if (bulkForm.notes.trim()) payload.notes = bulkForm.notes.trim();

    if (Object.keys(payload).length === 1) {
      showToast("error", "Choose status, deadline or notes to apply bulk update");
      return;
    }

    setSaving(true);
    try {
      await api.post("/shots/bulk-update", payload);
      showToast("success", `Updated ${selectedShotStageIds.length} shots`);
      setSelectedShotStageIds([]);
      setBulkForm((prev) => ({ ...prev, notes: "" }));
      await loadWorkspace(filters);
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to bulk update shots");
    } finally {
      setSaving(false);
    }
  }

  if (!stageCode) {
    return <EmptyState title="Unknown stage" description="This stage route is not configured." />;
  }

  if (loading && !overview) return <Loader label="Loading stage workspace..." />;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Stage Workspace</p>
            <h3 className="text-xl font-bold text-slate-900">{stageSummary?.stageName || stageLabelFromSlug(stageSlug)}</h3>
            <p className="text-sm text-slate-500">
              {trackingMode} tracking mode
              {requiredDepartment ? ` · ${requiredDepartment}` : ""}
            </p>
          </div>
          <Link to={`/projects/${projectId}`} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Back To Overview
          </Link>
        </div>

        <div className="grid gap-3 md:grid-cols-7">
          <input
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value, page: 1 }))}
            placeholder={`Search ${trackingMode === "SHOT" ? "shot" : trackingMode === "ASSET" ? "asset" : "project"}`}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm md:col-span-2"
          />
          <select
            value={filters.status}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value, page: 1 }))}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            {STAGE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {labelize(status)}
              </option>
            ))}
          </select>
          <select
            value={filters.artistId}
            onChange={(event) => setFilters((prev) => ({ ...prev, artistId: event.target.value, page: 1 }))}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All artists</option>
            {eligibleUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>

          {trackingMode === "ASSET" ? (
            <select
              value={filters.type}
              onChange={(event) => setFilters((prev) => ({ ...prev, type: event.target.value, page: 1 }))}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All asset types</option>
              <option value="CHARACTER">Character</option>
              <option value="PROP">Prop</option>
              <option value="ENVIRONMENT">Environment</option>
            </select>
          ) : trackingMode === "SHOT" ? (
            <input
              value={filters.sequence}
              onChange={(event) => setFilters((prev) => ({ ...prev, sequence: event.target.value, page: 1 }))}
              placeholder="Filter sequence (e.g. EP01)"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Progress: {stageSummary?.completionPercent || 0}%
            </div>
          )}

          <div className="flex items-center gap-2">
            <select
              value={filters.sortBy}
              onChange={(event) => setFilters((prev) => ({ ...prev, sortBy: event.target.value, page: 1 }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="shotNumber">Sort by Shot</option>
              <option value="artist">Sort by Artist</option>
              <option value="status">Sort by Status</option>
              <option value="deadline">Sort by Deadline</option>
              <option value="priority">Sort by Priority</option>
            </select>
            <button
              onClick={() => setFilters((prev) => ({ ...prev, sortDir: prev.sortDir === "asc" ? "desc" : "asc", page: 1 }))}
              className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
            >
              {String(filters.sortDir || "asc").toUpperCase()}
            </button>
          </div>
        </div>

        {isShotMode && (
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(filters.unassigned)}
                onChange={(event) => setFilters((prev) => ({ ...prev, unassigned: event.target.checked, page: 1 }))}
              />
              Unassigned only
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(filters.overdue)}
                onChange={(event) => setFilters((prev) => ({ ...prev, overdue: event.target.checked, page: 1 }))}
              />
              Overdue only
            </label>
            <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{unassignedShotsCount} unassigned shots</span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{items.length} visible rows</span>
          </div>
        )}
      </section>

      {isShotMode && workloadRows.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h4 className="mb-3 text-sm font-bold text-slate-900">Artist Workload (Current View)</h4>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {workloadRows.slice(0, 8).map((row) => (
              <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                <p className="text-sm font-semibold text-slate-900">{row.name}</p>
                <p className="text-xs text-slate-600">{row.total} assigned · {row.active} active · {row.overdue} overdue</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : !items.length ? (
        <EmptyState title="No work items" description="No rows found for current filters." />
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          {isShotMode && selectedShotStageIds.length > 0 && (
            <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-emerald-900">{selectedShotStageIds.length} shots selected</p>
                <button
                  onClick={() => setSelectedShotStageIds([])}
                  className="rounded-md border border-emerald-300 px-2 py-1 text-xs font-semibold text-emerald-700"
                >
                  Clear Selection
                </button>
              </div>
              <div className="grid gap-2 md:grid-cols-4">
                <select
                  value={bulkForm.artistId}
                  onChange={(event) => setBulkForm((prev) => ({ ...prev, artistId: event.target.value }))}
                  className="rounded-lg border border-emerald-300 px-2 py-1.5 text-xs"
                >
                  <option value="">Assign artist...</option>
                  {eligibleUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
                <select
                  value={bulkForm.status}
                  onChange={(event) => setBulkForm((prev) => ({ ...prev, status: event.target.value }))}
                  className="rounded-lg border border-emerald-300 px-2 py-1.5 text-xs"
                >
                  <option value="">Update status...</option>
                  {STAGE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {labelize(status)}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={bulkForm.deadline}
                  onChange={(event) => setBulkForm((prev) => ({ ...prev, deadline: event.target.value }))}
                  className="rounded-lg border border-emerald-300 px-2 py-1.5 text-xs"
                />
                <input
                  value={bulkForm.notes}
                  onChange={(event) => setBulkForm((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Bulk notes (optional)"
                  className="rounded-lg border border-emerald-300 px-2 py-1.5 text-xs"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={applyBulkAssign}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                  disabled={saving}
                >
                  Bulk Assign
                </button>
                <button
                  onClick={applyBulkUpdate}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                  disabled={saving}
                >
                  Bulk Update
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  {isShotMode && (
                    <th className="py-2">
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
                    </th>
                  )}
                  <th className="py-2">{trackingMode === "SHOT" ? "Shot" : trackingMode === "ASSET" ? "Asset" : "Project"}</th>
                  {isShotMode && <th className="py-2">Sequence</th>}
                  {isShotMode && <th className="py-2">Department</th>}
                  <th className="py-2">Artist</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Deadline</th>
                  {isShotMode && <th className="py-2">Priority</th>}
                  <th className="py-2">Notes</th>
                  <th className="py-2">Submitted</th>
                  <th className="py-2">Approved</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const commentsOpen = Boolean(openCommentsByStageId[item.stageId]);
                  const commentCount = commentCountsByStageId[item.stageId] || 0;

                  return (
                    <Fragment key={item.id}>
                      <tr className="border-b border-slate-100">
                        {isShotMode && (
                          <td className="py-2.5">
                            <input
                              type="checkbox"
                              checked={selectedSet.has(item.stageId)}
                              onChange={(event) => toggleShotSelection(item.stageId, index, event)}
                            />
                          </td>
                        )}
                        <td className="py-2.5 font-semibold text-slate-800">
                          {item.trackingLabel}
                          {isShotMode && item.shot?.shotNumber ? (
                            <p className="text-[11px] font-normal text-slate-500">#{item.shot.shotNumber}</p>
                          ) : null}
                        </td>
                        {isShotMode && <td className="py-2.5 text-xs text-slate-700">{item.sequence}</td>}
                        {isShotMode && <td className="py-2.5 text-xs text-slate-700">{requiredDepartment || "General"}</td>}
                        <td className="py-2.5">
                          <select
                            value={item.assignedUser?.id || ""}
                            onChange={(event) => updateStage(item.stageId, { assignedUserId: event.target.value ? Number(event.target.value) : null })}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                            disabled={saving}
                          >
                            <option value="">Unassigned</option>
                            {eligibleUsers.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.name} · {user.departmentName || "No Department"} · {user._count?.assignedProjectStages || 0} active
                              </option>
                            ))}
                          </select>
                          {!eligibleUsers.length && (
                            <p className="mt-1 text-[11px] font-medium text-amber-600">No artists available in this department</p>
                          )}
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <StatusBadge status={item.stageStatus} />
                            <select
                              value={item.stageStatus}
                              onChange={(event) => updateStage(item.stageId, { status: event.target.value })}
                              className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                              disabled={saving}
                            >
                              {STAGE_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {labelize(status)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td className="py-2.5">
                          <input
                            type="date"
                            value={formatDateInput(item.deadline)}
                            onChange={(event) => updateStage(item.stageId, { deadline: event.target.value || null })}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                            disabled={saving}
                          />
                        </td>
                        {isShotMode && <td className="py-2.5 text-xs text-slate-700">{item.priority || 0}</td>}
                        <td className="py-2.5">
                          <input
                            defaultValue={item.notes || ""}
                            onBlur={(event) => {
                              const nextNotes = event.target.value || "";
                              if ((item.notes || "") !== nextNotes) {
                                updateStage(item.stageId, { notes: nextNotes || null });
                              }
                            }}
                            className="w-44 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                            placeholder="Add notes"
                            disabled={saving}
                          />
                        </td>
                        <td className="py-2.5 text-xs text-slate-600">{formatDate(item.submittedAt)}</td>
                        <td className="py-2.5 text-xs text-slate-600">{formatDate(item.approvedAt)}</td>
                        <td className="py-2.5">
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              onClick={() => updateStage(item.stageId, { status: "APPROVED" })}
                              className="rounded-md bg-emerald-500 px-2 py-1 text-xs font-semibold text-white"
                              disabled={saving}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => updateStage(item.stageId, { status: "REJECTED" })}
                              className="rounded-md bg-red-500 px-2 py-1 text-xs font-semibold text-white"
                              disabled={saving}
                            >
                              Reject
                            </button>
                            <button
                              onClick={() => updateStage(item.stageId, { status: "REVISION_REQUIRED" })}
                              className="rounded-md bg-amber-500 px-2 py-1 text-xs font-semibold text-white"
                              disabled={saving}
                            >
                              Revision
                            </button>
                            <button
                              onClick={() =>
                                setOpenCommentsByStageId((prev) => ({
                                  ...prev,
                                  [item.stageId]: !prev[item.stageId]
                                }))
                              }
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                              disabled={saving}
                            >
                              {commentCount > 0 ? `Comments (${commentCount})` : "Comments"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {commentsOpen && (
                        <tr className="border-b border-slate-100">
                          <td colSpan={isShotMode ? 12 : 8} className="bg-slate-50 px-3 py-2">
                            <StageCommentThread
                              stageId={item.stageId}
                              currentUser={currentUser}
                              isManager
                              resource={trackingMode === "SHOT" ? "shot" : trackingMode === "ASSET" ? "asset" : "project"}
                              onCountChange={(count) =>
                                setCommentCountsByStageId((prev) => ({
                                  ...prev,
                                  [item.stageId]: count
                                }))
                              }
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {trackingMode !== "PROJECT" && pagination.totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
              <p>
                Page {pagination.page} of {pagination.totalPages} · {pagination.total} rows
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => setFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                  disabled={filters.page <= 1}
                  className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  onClick={() => setFilters((prev) => ({ ...prev, page: Math.min(pagination.totalPages, prev.page + 1) }))}
                  disabled={filters.page >= pagination.totalPages}
                  className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
