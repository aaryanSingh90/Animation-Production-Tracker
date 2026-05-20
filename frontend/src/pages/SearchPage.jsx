import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import { stageSlugFromCode } from "../utils/stageRouting";
import { useToastStore } from "../store/toastStore";

function stageLabelFromCode(code) {
  return String(code || "")
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function SearchPage() {
  const showToast = useToastStore((state) => state.showToast);

  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    projectId: "",
    department: "",
    artist: "",
    status: "",
    stage: ""
  });
  const [results, setResults] = useState({
    shotEntries: [],
    assetEntries: [],
    projectEntries: []
  });

  async function runSearch() {
    setLoading(true);
    try {
      const { data } = await api.get("/search", {
        params: {
          ...(filters.projectId ? { projectId: filters.projectId } : {}),
          ...(filters.department ? { department: filters.department } : {}),
          ...(filters.artist ? { artist: filters.artist } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.stage ? { stage: filters.stage } : {})
        }
      });
      setResults({
        shotEntries: data.shotEntries || [],
        assetEntries: data.assetEntries || [],
        projectEntries: data.projectEntries || []
      });
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  const flat = useMemo(() => {
    const projectRows = (results.projectEntries || []).map((entry) => ({
      key: `project:${entry.id}`,
      kind: "PROJECT",
      projectId: entry.projectId,
      projectName: entry.project?.name || "Project",
      stageCode: entry.stageDefinition?.code || entry.stageName,
      stageName: entry.stageDefinition?.name || entry.stageTemplate?.name || entry.customName || entry.stageName,
      itemName: entry.project?.name || "Project",
      status: entry.status,
      artistName: entry.assignedUser?.name || "-"
    }));

    const shotRows = (results.shotEntries || []).map((entry) => ({
      key: `shot:${entry.id}`,
      kind: "SHOT",
      projectId: entry.shot?.projectId,
      projectName: entry.shot?.project?.name || "Project",
      stageCode: entry.stageDefinition?.code,
      stageName: entry.stageDefinition?.name || entry.stageDefinition?.code,
      itemName: entry.shot?.label || entry.shot?.name || `Shot ${entry.shot?.shotNumber || ""}`,
      status: entry.status,
      artistName: entry.assignedUser?.name || "-"
    }));

    const assetRows = (results.assetEntries || []).map((entry) => ({
      key: `asset:${entry.id}`,
      kind: "ASSET",
      projectId: entry.asset?.projectId,
      projectName: entry.asset?.project?.name || "Project",
      stageCode: entry.stageDefinition?.code,
      stageName: entry.stageDefinition?.name || entry.stageDefinition?.code,
      itemName: entry.asset?.name || "Asset",
      status: entry.status,
      artistName: entry.assignedUser?.name || "-"
    }));

    return [...projectRows, ...shotRows, ...assetRows];
  }, [results]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-lg font-bold text-slate-900">Global Filter</h3>
        <p className="mb-3 text-sm text-slate-500">Search across project, shot, and asset stage entries.</p>

        <div className="grid gap-3 md:grid-cols-5">
          <input
            value={filters.projectId}
            onChange={(event) => setFilters((prev) => ({ ...prev, projectId: event.target.value }))}
            placeholder="Project ID"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={filters.department}
            onChange={(event) => setFilters((prev) => ({ ...prev, department: event.target.value }))}
            placeholder="Department"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={filters.artist}
            onChange={(event) => setFilters((prev) => ({ ...prev, artist: event.target.value }))}
            placeholder="Artist ID"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={filters.status}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            placeholder="Status"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <input
              value={filters.stage}
              onChange={(event) => setFilters((prev) => ({ ...prev, stage: event.target.value }))}
              placeholder="Stage"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <button onClick={runSearch} disabled={loading} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
              Search
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <Loader label="Searching..." />
      ) : !flat.length ? (
        <EmptyState title="No results" description="Run a search to view matching stage entries." />
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm text-slate-500">Results: {flat.length} task{flat.length > 1 ? "s" : ""} found</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2">Project</th>
                  <th className="py-2">Track</th>
                  <th className="py-2">Stage</th>
                  <th className="py-2">Item</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Artist</th>
                </tr>
              </thead>
              <tbody>
                {flat.map((row) => {
                  const stageSlug = stageSlugFromCode(row.stageCode || "");
                  const href = row.projectId && stageSlug ? `/projects/${row.projectId}/${stageSlug}` : null;
                  return (
                    <tr key={row.key} className="border-b border-slate-100">
                      <td className="py-3">
                        {href ? (
                          <Link to={href} className="font-semibold text-slate-900 hover:text-emerald-600">
                            {row.projectName}
                          </Link>
                        ) : (
                          <span className="font-semibold text-slate-900">{row.projectName}</span>
                        )}
                      </td>
                      <td className="py-3 text-xs text-slate-600">{row.kind}</td>
                      <td className="py-3">{row.stageName || stageLabelFromCode(row.stageCode)}</td>
                      <td className="py-3">{row.itemName}</td>
                      <td className="py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="py-3">{row.artistName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
