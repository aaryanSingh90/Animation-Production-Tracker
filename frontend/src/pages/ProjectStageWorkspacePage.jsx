import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import StageCommentThread from "../components/StageCommentThread";
import { formatDate, formatDateInput, initials, labelize } from "../utils/format";
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
  if (Number.isInteger(shot?.shotNumber)) return `SH${String(shot.shotNumber).padStart(3, "0")}`;
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

function applyStagePatch(item, patch) {
  return {
    ...item,
    ...patch
  };
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

  const [rangeForm, setRangeForm] = useState({
    startShot: "",
    endShot: "",
    artistId: ""
  });

  const [collapsedSequences, setCollapsedSequences] = useState({});

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

  const userById = useMemo(() => {
    const map = new Map();
    for (const user of eligibleUsers) map.set(user.id, user);
    return map;
  }, [eligibleUsers]);

  const shotGroups = useMemo(() => {
    if (!isShotMode) return [];

    const grouped = new Map();

    for (const item of items) {
      const sequence = item.sequence || "MAIN";
      if (!grouped.has(sequence)) grouped.set(sequence, []);
      grouped.get(sequence).push(item);
    }

    return Array.from(grouped.entries())
      .map(([sequence, rows]) => {
        const sortedRows = [...rows].sort((a, b) => (a.shot?.shotNumber || 0) - (b.shot?.shotNumber || 0));
        const assigned = sortedRows.filter((row) => !!row.assignedUser?.id).length;
        const overdue = sortedRows.filter((row) => isOverdue(row.deadline, row.stageStatus)).length;

        return {
          sequence,
          rows: sortedRows,
          total: sortedRows.length,
          assigned,
          unassigned: sortedRows.length - assigned,
          overdue
        };
      })
      .sort((a, b) => a.sequence.localeCompare(b.sequence));
  }, [items, isShotMode]);

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

  async function loadWorkspace(nextFilters = filters, options = {}) {
    if (!stageCode) return;

    const withLoader = options.withLoader !== false;
    if (withLoader) setLoading(true);
    setError("");

    try {
      const [overviewRes, usersRes] = await Promise.all([api.get(`/projects/${projectId}/overview`), api.get("/users")]);

      setOverview(overviewRes.data);
      setUsers((usersRes.data || []).filter((user) => user.isActive && user.role === "EMPLOYEE"));

      const resolvedSummary =
        (overviewRes.data?.stageSummaries || []).find(
          (row) => String(row.stageCode).toUpperCase() === String(stageCode || "").toUpperCase()
        ) || null;

      let resolvedTrackingMode =
        resolvedSummary?.trackingMode || DEFAULT_TRACKING_BY_STAGE[String(stageCode || "").toUpperCase()] || "PROJECT";

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
            trackingLabel: shotCode,
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

        setCollapsedSequences((prev) => {
          const next = { ...prev };
          for (const group of mapped) {
            if (!Object.prototype.hasOwnProperty.call(next, group.sequence || "MAIN")) {
              next[group.sequence || "MAIN"] = false;
            }
          }
          return next;
        });
      } else if (resolvedTrackingMode === "ASSET") {
        workspaceRes = await api.get(`/projects/${projectId}/stages/${stageCode}/assets`, { params: query });
        setItems(
          (workspaceRes.data.items || []).map((entry) => ({
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
          }))
        );
        setPagination(workspaceRes.data.pagination || { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, totalPages: 1 });
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
      }
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || "Failed to load stage workspace");
      setItems([]);
      setPagination({ page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, totalPages: 1 });
    } finally {
      if (withLoader) setLoading(false);
    }
  }

  useEffect(() => {
    loadWorkspace();
  }, [projectId, stageCode]);

  useEffect(() => {
    if (!stageCode) return;
    const timeout = setTimeout(() => loadWorkspace(filters, { withLoader: false }), 220);
    return () => clearTimeout(timeout);
  }, [filters.page, filters.pageSize, filters.status, filters.artistId, filters.search, filters.type, filters.sequence, filters.unassigned, filters.overdue, filters.sortBy, filters.sortDir]);

  function patchOneItem(stageId, patch) {
    setItems((prev) => prev.map((item) => (item.stageId === stageId ? applyStagePatch(item, patch) : item)));
  }

  async function updateStage(stageId, payload, options = {}) {
    const optimisticPatch = options.optimisticPatch;
    const successMessage = options.successMessage || "Stage updated";

    if (optimisticPatch) {
      patchOneItem(stageId, optimisticPatch);
    }

    setSaving(true);
    try {
      const endpoint =
        trackingMode === "SHOT"
          ? `/shot-stages/${stageId}`
          : trackingMode === "ASSET"
            ? `/asset-stages/${stageId}`
            : `/stages/${stageId}`;

      const { data } = await api.put(endpoint, payload);

      patchOneItem(stageId, {
        stageStatus: data.status,
        deadline: data.deadline,
        submittedAt: data.submittedAt,
        approvedAt: data.approvedAt,
        notes: data.notes,
        feedback: data.feedback,
        assignedUser: data.assignedUser || null
      });

      showToast("success", successMessage);
    } catch (err) {
      if (optimisticPatch) {
        await loadWorkspace(filters, { withLoader: false });
      }
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to update stage");
    } finally {
      setSaving(false);
    }
  }

  async function assignSingleShot(stageId, userIdValue) {
    const userId = userIdValue ? Number(userIdValue) : null;
    const selectedUser = userId ? userById.get(userId) || null : null;

    await updateStage(
      stageId,
      { assignedUserId: userId },
      {
        optimisticPatch: {
          assignedUser: selectedUser
            ? {
                id: selectedUser.id,
                name: selectedUser.name,
                departmentId: selectedUser.departmentId,
                departmentName: selectedUser.departmentName,
                department: selectedUser.departmentInfo || selectedUser.department || null
              }
            : null
        },
        successMessage: userId ? "Artist assigned" : "Artist unassigned"
      }
    );
  }

  async function applyRangeAssign() {
    if (!isShotMode) return;

    const startShotNumber = Number(rangeForm.startShot);
    const endShotNumber = Number(rangeForm.endShot);

    if (!Number.isInteger(startShotNumber) || !Number.isInteger(endShotNumber) || startShotNumber <= 0 || endShotNumber <= 0) {
      showToast("error", "Enter valid start and end shot numbers");
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.post("/shots/range-assign", {
        projectId: Number(projectId),
        stageCode,
        startShotNumber,
        endShotNumber,
        sequence: filters.sequence || null,
        userId: rangeForm.artistId ? Number(rangeForm.artistId) : null
      });

      showToast("success", `Updated ${data.updatedCount || 0} shots in range`);
      await loadWorkspace(filters, { withLoader: false });
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to assign shot range");
    } finally {
      setSaving(false);
    }
  }

  function toggleSequence(sequence) {
    setCollapsedSequences((prev) => ({
      ...prev,
      [sequence]: !prev[sequence]
    }));
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
              placeholder="Sequence (e.g. EP01)"
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
              <option value="shotNumber">Sort: Shot</option>
              <option value="artist">Sort: Artist</option>
              <option value="status">Sort: Status</option>
              <option value="deadline">Sort: Deadline</option>
              <option value="priority">Sort: Priority</option>
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
            <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{unassignedShotsCount} unassigned</span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{items.length} visible</span>
            {saving && <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">Saving updates...</span>}
          </div>
        )}
      </section>

      {isShotMode && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h4 className="mb-2 text-sm font-bold text-slate-900">Range Assignment</h4>
          <p className="mb-3 text-xs text-slate-500">Assign a shot number range in one action. Individual assignment still works per shot row.</p>
          <div className="grid gap-2 md:grid-cols-5">
            <input
              type="number"
              min="1"
              value={rangeForm.startShot}
              onChange={(event) => setRangeForm((prev) => ({ ...prev, startShot: event.target.value }))}
              placeholder="Start shot #"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="number"
              min="1"
              value={rangeForm.endShot}
              onChange={(event) => setRangeForm((prev) => ({ ...prev, endShot: event.target.value }))}
              placeholder="End shot #"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={rangeForm.artistId}
              onChange={(event) => setRangeForm((prev) => ({ ...prev, artistId: event.target.value }))}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Unassign range</option>
              {eligibleUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
            <button
              onClick={applyRangeAssign}
              disabled={saving}
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Assign Range
            </button>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Dept filter: {requiredDepartment || "Any"}
            </div>
          </div>
          {!eligibleUsers.length && (
            <p className="mt-2 text-xs font-medium text-amber-700">No available artists in this stage department.</p>
          )}
        </section>
      )}

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
      ) : isShotMode ? (
        <section className="space-y-3">
          {shotGroups.map((group) => {
            const collapsed = Boolean(collapsedSequences[group.sequence]);
            return (
              <article key={group.sequence} className="rounded-2xl border border-slate-200 bg-white">
                <button
                  onClick={() => toggleSequence(group.sequence)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-2">
                    {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <h4 className="text-sm font-bold text-slate-900">{group.sequence}</h4>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">{group.total} shots</span>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">{group.assigned} assigned</span>
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">{group.unassigned} unassigned</span>
                    {group.overdue > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">{group.overdue} overdue</span>}
                  </div>
                </button>

                {!collapsed && (
                  <div className="space-y-2 border-t border-slate-100 px-3 py-3">
                    {group.rows.map((item) => {
                      const assigned = Boolean(item.assignedUser?.id);
                      const overdue = isOverdue(item.deadline, item.stageStatus);
                      const commentsOpen = Boolean(openCommentsByStageId[item.stageId]);
                      const commentCount = commentCountsByStageId[item.stageId] || 0;

                      return (
                        <div
                          key={item.id}
                          className={`rounded-xl border p-3 ${
                            assigned ? "border-emerald-200 bg-emerald-50/30" : "border-amber-200 bg-amber-50/40"
                          }`}
                        >
                          <div className="grid gap-3 md:grid-cols-[1.2fr_1.6fr_1fr]">
                            <div>
                              <p className="text-sm font-bold text-slate-900">{item.trackingLabel}</p>
                              <p className="text-xs text-slate-500">Shot #{item.shot?.shotNumber || "-"} · Priority {item.priority || 0}</p>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${assigned ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                                  {assigned ? "Assigned" : "Unassigned"}
                                </span>
                                {overdue && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">Overdue</span>}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                {assigned ? (
                                  <>
                                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white">
                                      {initials(item.assignedUser.name || "U")}
                                    </span>
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900">{item.assignedUser.name}</p>
                                      <p className="text-[11px] text-slate-500">{item.assignedUser.department?.name || item.assignedUser.departmentName || requiredDepartment || "Department"}</p>
                                    </div>
                                  </>
                                ) : (
                                  <p className="text-sm font-semibold text-amber-700">No artist assigned</p>
                                )}
                              </div>
                              <select
                                value={item.assignedUser?.id || ""}
                                onChange={(event) => assignSingleShot(item.stageId, event.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                                disabled={saving}
                              >
                                <option value="">Unassigned</option>
                                {eligibleUsers.map((user) => (
                                  <option key={user.id} value={user.id}>
                                    {user.name} · {user.departmentName || "No Department"} · {user._count?.assignedProjectStages || 0} active
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <StatusBadge status={item.stageStatus} />
                                <select
                                  value={item.stageStatus}
                                  onChange={(event) =>
                                    updateStage(item.stageId, { status: event.target.value }, { optimisticPatch: { stageStatus: event.target.value } })
                                  }
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
                              <input
                                type="date"
                                value={formatDateInput(item.deadline)}
                                onChange={(event) =>
                                  updateStage(
                                    item.stageId,
                                    { deadline: event.target.value || null },
                                    { optimisticPatch: { deadline: event.target.value || null } }
                                  )
                                }
                                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                                disabled={saving}
                              />
                            </div>
                          </div>

                          <details className="mt-3 rounded-lg border border-slate-200 bg-white p-2">
                            <summary className="cursor-pointer text-xs font-semibold text-slate-700">Show details</summary>
                            <div className="mt-2 space-y-2">
                              <div className="grid gap-2 md:grid-cols-3">
                                <span className="text-xs text-slate-600">Submitted: <strong className="text-slate-800">{formatDate(item.submittedAt)}</strong></span>
                                <span className="text-xs text-slate-600">Approved: <strong className="text-slate-800">{formatDate(item.approvedAt)}</strong></span>
                                <span className="text-xs text-slate-600">Deadline: <strong className="text-slate-800">{formatDate(item.deadline)}</strong></span>
                              </div>

                              <textarea
                                defaultValue={item.notes || ""}
                                onBlur={(event) => {
                                  const nextNotes = event.target.value || "";
                                  if ((item.notes || "") !== nextNotes) {
                                    updateStage(item.stageId, { notes: nextNotes || null }, { optimisticPatch: { notes: nextNotes || null } });
                                  }
                                }}
                                rows={2}
                                placeholder="Notes"
                                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                                disabled={saving}
                              />

                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  onClick={() => updateStage(item.stageId, { status: "APPROVED" }, { optimisticPatch: { stageStatus: "APPROVED" } })}
                                  className="rounded-md bg-emerald-500 px-2 py-1 text-xs font-semibold text-white"
                                  disabled={saving}
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => updateStage(item.stageId, { status: "REJECTED" }, { optimisticPatch: { stageStatus: "REJECTED" } })}
                                  className="rounded-md bg-red-500 px-2 py-1 text-xs font-semibold text-white"
                                  disabled={saving}
                                >
                                  Reject
                                </button>
                                <button
                                  onClick={() => updateStage(item.stageId, { status: "REVISION_REQUIRED" }, { optimisticPatch: { stageStatus: "REVISION_REQUIRED" } })}
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

                              {commentsOpen && (
                                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                                  <StageCommentThread
                                    stageId={item.stageId}
                                    currentUser={currentUser}
                                    isManager
                                    resource="shot"
                                    onCountChange={(count) =>
                                      setCommentCountsByStageId((prev) => ({
                                        ...prev,
                                        [item.stageId]: count
                                      }))
                                    }
                                  />
                                </div>
                              )}
                            </div>
                          </details>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}

          {pagination.totalPages > 1 && (
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
      ) : (
        <section className="space-y-3">
          {items.map((item) => {
            const commentsOpen = Boolean(openCommentsByStageId[item.stageId]);
            const commentCount = commentCountsByStageId[item.stageId] || 0;
            const assigned = Boolean(item.assignedUser?.id);
            const overdue = isOverdue(item.deadline, item.stageStatus);
            const subtitle = trackingMode === "ASSET" ? labelize(item.raw?.asset?.type || "ASSET") : "Project-Level Stage";

            return (
              <article
                key={item.id}
                className={`rounded-2xl border p-3 ${
                  assigned ? "border-emerald-200 bg-emerald-50/20" : "border-amber-200 bg-amber-50/30"
                }`}
              >
                <div className="grid gap-3 xl:grid-cols-[1.2fr_1.3fr_1fr_auto]">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{item.trackingLabel}</p>
                    <p className="text-xs text-slate-500">{subtitle}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          assigned ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {assigned ? "Assigned" : "Unassigned"}
                      </span>
                      {overdue && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                          Overdue
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {assigned ? (
                        <>
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white">
                            {initials(item.assignedUser.name || "U")}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.assignedUser.name}</p>
                            <p className="text-[11px] text-slate-500">
                              {item.assignedUser.department?.name || item.assignedUser.departmentName || requiredDepartment || "Department"}
                            </p>
                          </div>
                        </>
                      ) : (
                        <p className="text-sm font-semibold text-amber-700">No artist assigned</p>
                      )}
                    </div>
                    <select
                      value={item.assignedUser?.id || ""}
                      onChange={(event) => assignSingleShot(item.stageId, event.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                      disabled={saving}
                    >
                      <option value="">Unassigned</option>
                      {eligibleUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} · {user.departmentName || "No Department"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={item.stageStatus} />
                      <select
                        value={item.stageStatus}
                        onChange={(event) =>
                          updateStage(item.stageId, { status: event.target.value }, { optimisticPatch: { stageStatus: event.target.value } })
                        }
                        className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
                        disabled={saving}
                      >
                        {STAGE_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {labelize(status)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="date"
                      value={formatDateInput(item.deadline)}
                      onChange={(event) =>
                        updateStage(item.stageId, { deadline: event.target.value || null }, { optimisticPatch: { deadline: event.target.value || null } })
                      }
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                      disabled={saving}
                    />
                  </div>

                  <div className="flex flex-wrap items-start gap-2 xl:flex-col">
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
                    <span className="text-[11px] text-slate-500">Submitted: {formatDate(item.submittedAt)}</span>
                    <span className="text-[11px] text-slate-500">Approved: {formatDate(item.approvedAt)}</span>
                  </div>
                </div>

                <details className="mt-3 rounded-lg border border-slate-200 bg-white p-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">Notes & Actions</summary>
                  <div className="mt-2 space-y-2">
                    <textarea
                      defaultValue={item.notes || ""}
                      onBlur={(event) => {
                        const nextNotes = event.target.value || "";
                        if ((item.notes || "") !== nextNotes) {
                          updateStage(item.stageId, { notes: nextNotes || null }, { optimisticPatch: { notes: nextNotes || null } });
                        }
                      }}
                      rows={2}
                      placeholder="Notes"
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                      disabled={saving}
                    />

                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => updateStage(item.stageId, { status: "APPROVED" }, { optimisticPatch: { stageStatus: "APPROVED" } })}
                        className="rounded-md bg-emerald-500 px-2 py-1 text-xs font-semibold text-white"
                        disabled={saving}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => updateStage(item.stageId, { status: "REJECTED" }, { optimisticPatch: { stageStatus: "REJECTED" } })}
                        className="rounded-md bg-red-500 px-2 py-1 text-xs font-semibold text-white"
                        disabled={saving}
                      >
                        Reject
                      </button>
                      <button
                        onClick={() =>
                          updateStage(item.stageId, { status: "REVISION_REQUIRED" }, { optimisticPatch: { stageStatus: "REVISION_REQUIRED" } })
                        }
                        className="rounded-md bg-amber-500 px-2 py-1 text-xs font-semibold text-white"
                        disabled={saving}
                      >
                        Revision
                      </button>
                    </div>
                  </div>
                </details>

                {commentsOpen && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                    <StageCommentThread
                      stageId={item.stageId}
                      currentUser={currentUser}
                      isManager
                      resource={trackingMode === "ASSET" ? "asset" : "project"}
                      onCountChange={(count) =>
                        setCommentCountsByStageId((prev) => ({
                          ...prev,
                          [item.stageId]: count
                        }))
                      }
                    />
                  </div>
                )}
              </article>
            );
          })}

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
