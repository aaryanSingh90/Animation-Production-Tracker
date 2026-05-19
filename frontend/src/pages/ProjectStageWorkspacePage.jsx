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
  const [filters, setFilters] = useState({ page: 1, pageSize: DEFAULT_PAGE_SIZE, status: "", artistId: "", search: "", type: "" });
  const [error, setError] = useState("");
  const [workspaceMode, setWorkspaceMode] = useState("PROJECT");
  const [openCommentsByStageId, setOpenCommentsByStageId] = useState({});
  const [commentCountsByStageId, setCommentCountsByStageId] = useState({});

  const stageSummary = useMemo(() => {
    const rows = overview?.stageSummaries || [];
    return rows.find((row) => String(row.stageCode).toUpperCase() === String(stageCode || "").toUpperCase()) || null;
  }, [overview, stageCode]);

  const trackingMode = workspaceMode || stageSummary?.trackingMode || "PROJECT";

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
        pageSize: nextFilters.pageSize
      };
      if (nextFilters.status) query.status = nextFilters.status;
      if (nextFilters.artistId) query.artistId = nextFilters.artistId;
      if (nextFilters.search) query.search = nextFilters.search;
      if (nextFilters.type) query.type = nextFilters.type;

      let workspaceRes;
      if (resolvedTrackingMode === "SHOT") {
        workspaceRes = await api.get(`/projects/${projectId}/stages/${stageCode}/shots`, { params: query });
        setItems((workspaceRes.data.items || []).map((entry) => ({
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
          raw: entry
        })));
        setPagination(workspaceRes.data.pagination || { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, totalPages: 1 });
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
  }, [filters.page, filters.pageSize, filters.status, filters.artistId, filters.search, filters.type]);

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
            <p className="text-sm text-slate-500">{trackingMode} tracking mode</p>
          </div>
          <Link to={`/projects/${projectId}`} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Back To Overview
          </Link>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
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
            {users.map((user) => (
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
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Progress: {stageSummary?.completionPercent || 0}%
            </div>
          )}
        </div>
      </section>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : !items.length ? (
        <EmptyState title="No work items" description="No rows found for current filters." />
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2">{trackingMode === "SHOT" ? "Shot" : trackingMode === "ASSET" ? "Asset" : "Project"}</th>
                  <th className="py-2">Artist</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Deadline</th>
                  <th className="py-2">Submitted</th>
                  <th className="py-2">Approved</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const commentsOpen = Boolean(openCommentsByStageId[item.stageId]);
                  const commentCount = commentCountsByStageId[item.stageId] || 0;
                  return (
                    <Fragment key={item.id}>
                      <tr className="border-b border-slate-100">
                        <td className="py-2.5 font-semibold text-slate-800">{item.trackingLabel}</td>
                        <td className="py-2.5">
                          <select
                            value={item.assignedUser?.id || ""}
                            onChange={(event) => updateStage(item.stageId, { assignedUserId: event.target.value ? Number(event.target.value) : null })}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                            disabled={saving}
                          >
                            <option value="">Unassigned</option>
                            {users.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.name}
                              </option>
                            ))}
                          </select>
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
                          <td colSpan={7} className="bg-slate-50 px-3 py-2">
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
