import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  Copy,
  Layers3,
  NotebookPen,
  Plus,
  Search,
  Trash2
} from "lucide-react";
import api from "../lib/api";
import Loader from "./Loader";
import Modal from "./Modal";
import StatusBadge from "./StatusBadge";
import {
  formatDateTimeInput,
  formatDurationMinutes,
  initials
} from "../utils/format";
import {
  STAGE_STATUSES,
  getStatusOptionLabel,
  isCompleteStatus,
  isLateStatus
} from "../utils/constants";
import {
  buildModellingCategoryPath,
  modellingCategoryLabelFromVariant
} from "../utils/stageRouting";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

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
    emptyTitle: "No Characters Added Yet",
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
    emptyTitle: "No Blendshapes Added Yet",
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
    emptyTitle: "No Props Added Yet",
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
    emptyTitle: "No BG Assets Added Yet",
    emptyAction: "Create First BG Asset"
  }
};

function createInitialForm(sectionKey) {
  const section = SECTION_CONFIG[sectionKey];
  return {
    name: "",
    status: "YTS",
    artistId: "",
    priority: "3",
    startedAt: "",
    endedAt: "",
    notes: "",
    description: "",
    referenceImageUrl: "",
    sectionKey: section?.key || "CHARACTER"
  };
}

function getSectionKeyForAsset(asset) {
  if (asset?.subCategory === "CHARACTER_BLENDSHAPES") return "CHARACTER_BLENDSHAPES";
  if (asset?.subCategory === "PROP" || asset?.type === "PROP") return "PROP";
  if (asset?.subCategory === "BG" || asset?.type === "BG" || asset?.type === "ENVIRONMENT") return "BG";
  return "CHARACTER";
}

function getModellingStage(asset) {
  return (asset?.stages || []).find((stage) => String(stage?.stageDefinition?.code || "").toUpperCase() === "MODELLING") || null;
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
  if (Number.isFinite(Number(explicit)) && Number(explicit) > 0) {
    return Number(explicit);
  }

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

function uniqueArtistCount(items) {
  return new Set(items.map((entry) => entry.stage?.assignedUser?.id).filter(Boolean)).size;
}

function sumDurationMinutes(items, nowTick) {
  return items.reduce((sum, entry) => sum + (resolveDurationMinutes(entry.stage, nowTick) || 0), 0);
}

function getSectionStats(assets, nowTick) {
  const activeEntries = assets
    .filter((asset) => !asset.isArchived)
    .map((asset) => ({ asset, stage: getModellingStage(asset) }))
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

function WorkspaceMetric({ label, value, caption, tone = "text-slate-900" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-200/40">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
      {caption ? <p className="mt-1 text-xs text-slate-500">{caption}</p> : null}
    </div>
  );
}

function SummaryCard({ projectId, projectName, breadcrumbState, section, stats }) {
  return (
    <Link
      to={buildModellingCategoryPath(projectId, section.key)}
      state={breadcrumbState}
      className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className={`rounded-2xl bg-gradient-to-br ${section.accent} p-4`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${section.badge}`}>
              {section.title}
            </div>
            <h3 className="mt-3 text-xl font-bold text-slate-900">{section.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{projectName} production lane</p>
          </div>
          <div className="rounded-2xl bg-white/85 px-4 py-3 text-right shadow-sm">
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

      <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Open dedicated workspace</p>
          <p className="text-xs text-slate-500">Manage {section.title.toLowerCase()} without the long scrolling page.</p>
        </div>
        <span className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition group-hover:bg-slate-700">Open</span>
      </div>
    </Link>
  );
}

function PriorityPill({ priority }) {
  const level = Number(priority || 3);
  const tone = level <= 2 ? "border-rose-200 bg-rose-50 text-rose-700" : level === 3 ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-100 text-slate-600";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone}`}>P{level}</span>;
}

function DurationPill({ minutes }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getDurationTone(minutes)}`}>{formatDurationMinutes(minutes)}</span>;
}

function AssigneeCell({ artist }) {
  if (!artist) return <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">Unassigned</span>;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-sm">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">{initials(artist.name || "Artist")}</span>
      <span className="text-sm font-semibold text-slate-800">{artist.name}</span>
    </div>
  );
}

function WorkspaceToolbar({
  filters,
  onFilterChange,
  eligibleUsers,
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
  onOpenCreate
}) {
  return (
    <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{section.title} control room</p>
          <h3 className="text-lg font-bold text-slate-900">Production table</h3>
        </div>
        <button
          type="button"
          onClick={onOpenCreate}
          className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm ${section.button}`}
        >
          <Plus className="h-4 w-4" /> Add {section.singular}
        </button>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_180px_220px_120px_150px_170px_120px]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={filters.search}
            onChange={(event) => onFilterChange({ search: event.target.value, page: 1 })}
            placeholder={`Search ${section.title.toLowerCase()}`}
            className="w-full rounded-xl border border-slate-300 px-10 py-2.5 text-sm"
          />
        </label>
        <select value={filters.status} onChange={(event) => onFilterChange({ status: event.target.value, page: 1 })} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
          <option value="">All statuses</option>
          {STAGE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {getStatusOptionLabel(status)}
            </option>
          ))}
        </select>
        <select value={filters.artistId} onChange={(event) => onFilterChange({ artistId: event.target.value, page: 1 })} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
          <option value="">All artists</option>
          {eligibleUsers.map((artist) => (
            <option key={artist.id} value={artist.id}>
              {artist.name}
            </option>
          ))}
        </select>
        <select value={filters.priority} onChange={(event) => onFilterChange({ priority: event.target.value, page: 1 })} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
          <option value="">All priorities</option>
          {[1, 2, 3, 4, 5].map((priority) => (
            <option key={priority} value={priority}>
              P{priority}
            </option>
          ))}
        </select>
        <select value={filters.archived} onChange={(event) => onFilterChange({ archived: event.target.value, page: 1 })} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
          <option value="active">Active only</option>
          <option value="archived">Archived only</option>
          <option value="all">Active + Archived</option>
        </select>
        <select value={filters.sortBy} onChange={(event) => onFilterChange({ sortBy: event.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
          <option value="order">Sort: Pipeline order</option>
          <option value="name">Sort: Name</option>
          <option value="priority">Sort: Priority</option>
          <option value="artist">Sort: Artist</option>
          <option value="status">Sort: Status</option>
          <option value="duration">Sort: Duration</option>
          <option value="latest">Sort: Latest</option>
          <option value="overdue">Sort: Overdue</option>
        </select>
        <button
          type="button"
          onClick={onSelectVisible}
          className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {allVisibleSelected ? "Clear visible" : `Select visible (${visibleCount})`}
        </button>
      </div>

      {selectedCount > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span>{selectedCount} selected</span>
            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold tracking-normal text-slate-700">Bulk actions</span>
          </div>
          <div className="grid gap-2 xl:grid-cols-[220px_220px_auto_auto_auto]">
            <select
              value={bulkDraft.artistId}
              onChange={(event) => onBulkDraftChange({ artistId: event.target.value })}
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              disabled={disabled}
            >
              <option value="">Choose artist</option>
              <option value="__UNASSIGN__">Unassign selected</option>
              {eligibleUsers.map((artist) => (
                <option key={artist.id} value={artist.id}>
                  {artist.name}
                </option>
              ))}
            </select>
            <select
              value={bulkDraft.status}
              onChange={(event) => onBulkDraftChange({ status: event.target.value })}
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              disabled={disabled}
            >
              <option value="">Choose status</option>
              {STAGE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {getStatusOptionLabel(status)}
                </option>
              ))}
            </select>
            <button type="button" onClick={onBulkAssign} disabled={!bulkDraft.artistId || disabled} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40">
              Assign Artist
            </button>
            <button type="button" onClick={onBulkStatus} disabled={!bulkDraft.status || disabled} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40">
              Change Status
            </button>
            <button type="button" onClick={onBulkDelete} disabled={disabled} className="rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              Delete Selected
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ModellingRow({
  asset,
  stage,
  artists,
  selected,
  onToggleSelect,
  onUpdateAsset,
  onUpdateStage,
  onMove,
  onEdit,
  onDuplicate,
  onArchive,
  onDelete,
  nowTick,
  isArchived,
  disabled
}) {
  const minutes = resolveDurationMinutes(stage, nowTick);

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/70">
      <td className="px-3 py-3">
        <input type="checkbox" checked={selected} onChange={() => onToggleSelect(asset.id)} className="h-4 w-4 rounded border-slate-300" />
      </td>
      <td className="px-3 py-3">
        <input
          defaultValue={asset.name || ""}
          onBlur={(event) => {
            const nextName = event.target.value.trim();
            if (nextName && nextName !== asset.name) onUpdateAsset(asset.id, { name: nextName });
            if (!nextName) event.target.value = asset.name || "";
          }}
          className="w-full min-w-[220px] rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900"
        />
      </td>
      <td className="px-3 py-3">
        <select
          value={stage?.status || "YTS"}
          onChange={(event) => onUpdateStage(asset.id, stage.id, { status: event.target.value }, { status: event.target.value })}
          className="w-full min-w-[190px] rounded-xl border border-slate-300 px-3 py-2 text-sm"
          disabled={disabled}
        >
          {STAGE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {getStatusOptionLabel(status)}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-3">
        <select
          value={stage?.assignedUser?.id || ""}
          onChange={(event) => {
            const assignedUserId = event.target.value ? Number(event.target.value) : null;
            const assignedUser = artists.find((artist) => artist.id === assignedUserId) || null;
            onUpdateStage(asset.id, stage.id, { assignedUserId }, { assignedUser, assignedUserId });
          }}
          className="w-full min-w-[220px] rounded-xl border border-slate-300 px-3 py-2 text-sm"
          disabled={disabled}
        >
          <option value="">Unassigned</option>
          {artists.map((artist) => (
            <option key={artist.id} value={artist.id}>
              {artist.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-3">
        <input
          type="datetime-local"
          value={formatDateTimeInput(resolveStageStart(stage))}
          onChange={(event) => onUpdateStage(asset.id, stage.id, { startedAt: event.target.value || null, startDate: event.target.value || null }, { startedAt: event.target.value || null, startDate: event.target.value || null })}
          className="w-full min-w-[190px] rounded-xl border border-slate-300 px-3 py-2 text-sm"
          disabled={disabled}
        />
      </td>
      <td className="px-3 py-3">
        <input
          type="datetime-local"
          value={formatDateTimeInput(resolveStageEnd(stage))}
          onChange={(event) => onUpdateStage(asset.id, stage.id, { endedAt: event.target.value || null, endDate: event.target.value || null }, { endedAt: event.target.value || null, endDate: event.target.value || null })}
          className="w-full min-w-[190px] rounded-xl border border-slate-300 px-3 py-2 text-sm"
          disabled={disabled}
        />
      </td>
      <td className="px-3 py-3">
        <DurationPill minutes={minutes} />
      </td>
      <td className="px-3 py-3">
        <select
          value={String(asset.priority || 3)}
          onChange={(event) => onUpdateAsset(asset.id, { priority: Number(event.target.value) })}
          className="w-full min-w-[120px] rounded-xl border border-slate-300 px-3 py-2 text-sm"
          disabled={disabled}
        >
          {[1, 2, 3, 4, 5].map((priority) => (
            <option key={priority} value={priority}>
              P{priority}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onMove(asset.id, -1)} className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50" disabled={disabled || isArchived} title="Move up">
            <ArrowUp className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onMove(asset.id, 1)} className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50" disabled={disabled || isArchived} title="Move down">
            <ArrowDown className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onEdit(asset)} className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50" title="Edit drawer">
            <NotebookPen className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onDuplicate(asset)} className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50" disabled={disabled} title="Duplicate">
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onArchive(asset, !asset.isArchived)}
            className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50"
            disabled={disabled}
            title={asset.isArchived ? "Restore" : "Archive"}
          >
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

function MobileAssetCard({ asset, stage, artists, onUpdateAsset, onUpdateStage, onEdit, onDuplicate, onArchive, onDelete, nowTick, disabled }) {
  const minutes = resolveDurationMinutes(stage, nowTick);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-900">{asset.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={stage?.status || "YTS"} />
            <PriorityPill priority={asset.priority} />
            <DurationPill minutes={minutes} />
          </div>
        </div>
        <button type="button" onClick={() => onEdit(asset)} className="rounded-lg border border-slate-300 p-2 text-slate-600">
          <NotebookPen className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Artist</p>
          <select
            value={stage?.assignedUser?.id || ""}
            onChange={(event) => {
              const assignedUserId = event.target.value ? Number(event.target.value) : null;
              const assignedUser = artists.find((artist) => artist.id === assignedUserId) || null;
              onUpdateStage(asset.id, stage.id, { assignedUserId }, { assignedUser, assignedUserId });
            }}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            disabled={disabled}
          >
            <option value="">Unassigned</option>
            {artists.map((artist) => (
              <option key={artist.id} value={artist.id}>
                {artist.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Start</span>
            <input
              type="datetime-local"
              value={formatDateTimeInput(resolveStageStart(stage))}
              onChange={(event) => onUpdateStage(asset.id, stage.id, { startedAt: event.target.value || null, startDate: event.target.value || null }, { startedAt: event.target.value || null, startDate: event.target.value || null })}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              disabled={disabled}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">End</span>
            <input
              type="datetime-local"
              value={formatDateTimeInput(resolveStageEnd(stage))}
              onChange={(event) => onUpdateStage(asset.id, stage.id, { endedAt: event.target.value || null, endDate: event.target.value || null }, { endedAt: event.target.value || null, endDate: event.target.value || null })}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              disabled={disabled}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <AssigneeCell artist={stage?.assignedUser} />
          {asset.isArchived ? <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">Archived</span> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onDuplicate(asset)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Duplicate</button>
          <button type="button" onClick={() => onArchive(asset, !asset.isArchived)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">
            {asset.isArchived ? "Restore" : "Archive"}
          </button>
          <button type="button" onClick={() => onDelete(asset)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600">Delete</button>
        </div>
      </div>
    </article>
  );
}

export default function ModellingWorkspace({ projectId, overview, stageSummary, eligibleUsers, requiredDepartment, workspaceVariant, showToast }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [assets, setAssets] = useState([]);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    artistId: "",
    priority: "",
    archived: "active",
    sortBy: "order",
    sortDir: "asc",
    page: 1,
    pageSize: 25
  });
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkDraft, setBulkDraft] = useState({ artistId: "", status: "" });
  const [editor, setEditor] = useState({ open: false, mode: "create", sectionKey: workspaceVariant || "CHARACTER", asset: null, form: createInitialForm(workspaceVariant || "CHARACTER") });
  const [confirmDelete, setConfirmDelete] = useState({ open: false, assets: [] });
  const [nowTick, setNowTick] = useState(Date.now());

  const activeSectionKey = workspaceVariant && SECTION_CONFIG[workspaceVariant] ? workspaceVariant : null;
  const isHub = !activeSectionKey;
  const activeSection = activeSectionKey ? SECTION_CONFIG[activeSectionKey] : null;
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
      setError(err.userMessage || err.response?.data?.message || "Failed to load modelling assets");
      setAssets([]);
    } finally {
      if (withLoader) setLoading(false);
    }
  }

  const assetsBySection = useMemo(() => {
    const buckets = { CHARACTER: [], CHARACTER_BLENDSHAPES: [], PROP: [], BG: [] };
    for (const asset of assets) {
      const key = getSectionKeyForAsset(asset);
      buckets[key].push(asset);
    }
    for (const key of Object.keys(buckets)) {
      buckets[key] = sortByAssetOrder(buckets[key]);
    }
    return buckets;
  }, [assets]);

  const hubStats = useMemo(() => {
    const result = {};
    for (const key of Object.keys(SECTION_CONFIG)) {
      result[key] = getSectionStats(assetsBySection[key] || [], nowTick);
    }
    return result;
  }, [assetsBySection, nowTick]);

  const sectionAssets = useMemo(() => (activeSection ? assetsBySection[activeSection.key] || [] : []), [activeSection, assetsBySection]);

  const detailEntries = useMemo(() => {
    if (!activeSection) return [];

    const filtered = sectionAssets
      .map((asset) => ({ asset, stage: getModellingStage(asset) }))
      .filter((entry) => Boolean(entry.stage))
      .filter((entry) => {
        const { asset, stage } = entry;
        const searchNeedle = String(filters.search || "").trim().toLowerCase();
        const matchesSearch = !searchNeedle || String(asset.name || "").toLowerCase().includes(searchNeedle) || String(asset.description || "").toLowerCase().includes(searchNeedle);
        const matchesStatus = !filters.status || stage.status === filters.status;
        const matchesArtist = !filters.artistId || stage.assignedUser?.id === Number(filters.artistId);
        const matchesPriority = !filters.priority || Number(asset.priority || 3) === Number(filters.priority);
        const matchesArchived = filters.archived === "all" || (filters.archived === "archived" ? asset.isArchived : !asset.isArchived);
        return matchesSearch && matchesStatus && matchesArtist && matchesPriority && matchesArchived;
      });

    const sorted = [...filtered].sort((left, right) => {
      const a = left.asset;
      const b = right.asset;
      const stageA = left.stage;
      const stageB = right.stage;

      switch (filters.sortBy) {
        case "name":
          return String(a.name || "").localeCompare(String(b.name || ""));
        case "priority":
          return Number(a.priority || 3) - Number(b.priority || 3);
        case "artist":
          return String(stageA?.assignedUser?.name || "").localeCompare(String(stageB?.assignedUser?.name || ""));
        case "status":
          return String(stageA?.status || "").localeCompare(String(stageB?.status || ""));
        case "duration":
          return (resolveDurationMinutes(stageB, nowTick) || 0) - (resolveDurationMinutes(stageA, nowTick) || 0);
        case "latest":
          return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
        case "overdue": {
          const lateA = isOverdue(stageA) ? 1 : 0;
          const lateB = isOverdue(stageB) ? 1 : 0;
          if (lateA !== lateB) return lateB - lateA;
          return new Date(stageA?.endDate || 0).getTime() - new Date(stageB?.endDate || 0).getTime();
        }
        default: {
          const orderDelta = Number(a.order || 0) - Number(b.order || 0);
          if (orderDelta !== 0) return orderDelta;
          return String(a.name || "").localeCompare(String(b.name || ""));
        }
      }
    });

    return filters.sortDir === "desc" && !["duration", "latest", "overdue"].includes(filters.sortBy) ? sorted.reverse() : sorted;
  }, [activeSection, filters, nowTick, sectionAssets]);

  const detailStats = useMemo(() => getSectionStats(sectionAssets, nowTick), [nowTick, sectionAssets]);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(detailEntries.length / Number(filters.pageSize || 25))), [detailEntries.length, filters.pageSize]);
  const currentPage = Math.min(filters.page, totalPages);
  const pagedEntries = useMemo(() => {
    const pageSize = Number(filters.pageSize || 25);
    const startIndex = (currentPage - 1) * pageSize;
    return detailEntries.slice(startIndex, startIndex + pageSize);
  }, [currentPage, detailEntries, filters.pageSize]);

  const visibleIds = pagedEntries.map((entry) => entry.asset.id);
  const allVisibleSelected = Boolean(visibleIds.length) && visibleIds.every((id) => selectedIds.includes(id));

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => detailEntries.some((entry) => entry.asset.id === id)));
  }, [detailEntries]);

  function updateFilters(patch) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function openCreate(sectionKey) {
    setEditor({
      open: true,
      mode: "create",
      sectionKey,
      asset: null,
      form: createInitialForm(sectionKey)
    });
  }

  function openEdit(asset) {
    const sectionKey = getSectionKeyForAsset(asset);
    const stage = getModellingStage(asset);
    setEditor({
      open: true,
      mode: "edit",
      sectionKey,
      asset,
      form: {
        name: asset.name || "",
        status: stage?.status || "YTS",
        artistId: stage?.assignedUser?.id ? String(stage.assignedUser.id) : "",
        priority: String(asset.priority || 3),
        startedAt: formatDateTimeInput(resolveStageStart(stage)),
        endedAt: formatDateTimeInput(resolveStageEnd(stage)),
        notes: stage?.notes || "",
        description: asset.description || "",
        referenceImageUrl: asset.referenceImageUrl || "",
        sectionKey
      }
    });
  }

  function closeEditor() {
    setEditor((prev) => ({ ...prev, open: false, asset: null }));
  }

  function setAssetList(updater) {
    setAssets((prev) => sortByAssetOrder(typeof updater === "function" ? updater(prev) : updater));
  }

  async function createAsset(sectionKey, values) {
    const section = SECTION_CONFIG[sectionKey];
    const name = String(values.name || "").trim();
    if (!name) throw new Error(`${section.singular} name is required`);

    const { data: createdAsset } = await api.post(`/projects/${projectId}/assets`, {
      name,
      type: section.type,
      subCategory: section.subCategory,
      description: values.description || null,
      referenceImageUrl: values.referenceImageUrl || null,
      priority: Number(values.priority || 3),
      status: values.status || "YTS"
    });

    const stage = getModellingStage(createdAsset);
    if (stage) {
      await api.put(`/asset-stages/${stage.id}`, {
        assignedUserId: values.artistId ? Number(values.artistId) : null,
        status: values.status || "YTS",
        startedAt: values.startedAt || null,
        endedAt: values.endedAt || null,
        startDate: values.startedAt || null,
        endDate: values.endedAt || null,
        notes: values.notes || null
      });
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
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to update modelling stage");
    }
  }

  async function submitEditor() {
    const sectionKey = editor.sectionKey;
    if (!SECTION_CONFIG[sectionKey]) return;

    setBusy(true);
    try {
      if (editor.mode === "create") {
        await createAsset(sectionKey, editor.form);
        showToast?.("success", `${SECTION_CONFIG[sectionKey].singular} created`);
      } else if (editor.asset) {
        const stage = getModellingStage(editor.asset);
        await api.patch(`/assets/${editor.asset.id}`, {
          name: editor.form.name.trim(),
          description: editor.form.description || null,
          referenceImageUrl: editor.form.referenceImageUrl || null,
          priority: Number(editor.form.priority || 3)
        });
        if (stage) {
          await api.put(`/asset-stages/${stage.id}`, {
            status: editor.form.status,
            assignedUserId: editor.form.artistId ? Number(editor.form.artistId) : null,
            startedAt: editor.form.startedAt || null,
            endedAt: editor.form.endedAt || null,
            startDate: editor.form.startedAt || null,
            endDate: editor.form.endedAt || null,
            notes: editor.form.notes || null
          });
        }
        await loadAssets(false);
        showToast?.("success", `${SECTION_CONFIG[sectionKey].singular} updated`);
      }
      closeEditor();
    } catch (err) {
      showToast?.("error", err.userMessage || err.response?.data?.message || err.message || "Unable to save asset");
    } finally {
      setBusy(false);
    }
  }

  async function moveAsset(assetId, delta) {
    const rows = sortByAssetOrder(sectionAssets.filter((asset) => !asset.isArchived));
    const index = rows.findIndex((asset) => asset.id === assetId);
    if (index === -1) return;

    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= rows.length) return;

    const current = rows[index];
    const target = rows[targetIndex];

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
    const sectionKey = getSectionKeyForAsset(asset);
    const stage = getModellingStage(asset);

    setBusy(true);
    try {
      await createAsset(sectionKey, {
        name: `${asset.name} Copy`,
        status: stage?.status || "YTS",
        artistId: stage?.assignedUser?.id ? String(stage.assignedUser.id) : "",
        priority: String(asset.priority || 3),
        startedAt: formatDateTimeInput(resolveStageStart(stage)),
        endedAt: formatDateTimeInput(resolveStageEnd(stage)),
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
    try {
      await persistAssetUpdate(asset.id, { isArchived: nextArchived });
      showToast?.("success", nextArchived ? `${asset.name} archived` : `${asset.name} restored`);
    } catch {
      // persistAssetUpdate handles rollback/toast
    }
  }

  function requestDeleteAssets(items) {
    setConfirmDelete({ open: true, assets: items });
  }

  async function confirmDeleteAssets() {
    const targets = confirmDelete.assets;
    if (!targets.length) return;

    setBusy(true);
    try {
      await Promise.all(targets.map((asset) => api.delete(`/assets/${asset.id}`)));
      setConfirmDelete({ open: false, assets: [] });
      setSelectedIds((prev) => prev.filter((id) => !targets.some((asset) => asset.id === id)));
      await loadAssets(false);
      showToast?.("success", `${targets.length} asset${targets.length === 1 ? "" : "s"} removed`);
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
    if (!bulkDraft.artistId) return;
    const selectedAssets = detailEntries.filter((entry) => selectedIds.includes(entry.asset.id));
    setBusy(true);
    try {
      await Promise.all(
        selectedAssets.map((entry) =>
          api.put(`/asset-stages/${entry.stage.id}`, {
            assignedUserId: bulkDraft.artistId === "__UNASSIGN__" ? null : Number(bulkDraft.artistId)
          })
        )
      );
      await loadAssets(false);
      showToast?.("success", `${selectedAssets.length} rows reassigned`);
    } catch (err) {
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to bulk assign assets");
    } finally {
      setBusy(false);
    }
  }

  async function bulkStatusUpdate() {
    if (!bulkDraft.status) return;
    const selectedAssets = detailEntries.filter((entry) => selectedIds.includes(entry.asset.id));
    setBusy(true);
    try {
      await Promise.all(selectedAssets.map((entry) => api.put(`/asset-stages/${entry.stage.id}`, { status: bulkDraft.status })));
      await loadAssets(false);
      showToast?.("success", `${selectedAssets.length} rows updated`);
    } catch (err) {
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to bulk update statuses");
    } finally {
      setBusy(false);
    }
  }

  function bulkDelete() {
    const selectedAssets = detailEntries.filter((entry) => selectedIds.includes(entry.asset.id)).map((entry) => entry.asset);
    if (!selectedAssets.length) return;
    requestDeleteAssets(selectedAssets);
  }

  if (loading) return <Loader label="Loading modelling workspace..." />;

  if (error) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (isHub) {
    return (
      <div className="space-y-5">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                <Layers3 className="h-3.5 w-3.5" /> Modelling Workspace
              </div>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Asset production control</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Split modelling into dedicated studio lanes so characters, blendshapes, props, and BG assets stay manageable even when productions scale.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <WorkspaceMetric label="Project" value={projectName} caption={requiredDepartment || "Modelling Department"} />
              <WorkspaceMetric label="Progress" value={`${stageSummary?.completionPercent || 0}%`} caption="Stage completion" tone="text-slate-900" />
              <WorkspaceMetric label="Assigned Artists" value={uniqueArtistCount(assets.filter((asset) => !asset.isArchived).map((asset) => ({ stage: getModellingStage(asset) })).filter((entry) => entry.stage))} caption="Across all modelling lanes" tone="text-sky-700" />
              <WorkspaceMetric label="Active Assets" value={assets.filter((asset) => !asset.isArchived).length} caption="Characters + blendshapes + props + BG" tone="text-violet-700" />
            </div>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-2">
          {Object.values(SECTION_CONFIG).map((section) => (
            <SummaryCard
              key={section.key}
              projectId={projectId}
              projectName={projectName}
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
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link to={`/projects/${projectId}/workspace/modelling`} state={breadcrumbState} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600 hover:bg-slate-100">
              <ChevronLeft className="h-3.5 w-3.5" /> Back to Modelling hub
            </Link>
            <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${activeSection.badge}`}>
              {activeSection.title}
            </div>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{modellingCategoryLabelFromVariant(activeSection.key)} Workspace</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Project: <span className="font-semibold text-slate-900">{projectName}</span> · Compact production tracking for {activeSection.title.toLowerCase()}.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <WorkspaceMetric label={`Total ${activeSection.singular}s`} value={detailStats.total} tone={activeSection.countTone} />
            <WorkspaceMetric label="Assigned" value={detailStats.assignedArtists} tone="text-slate-900" />
            <WorkspaceMetric label="In Progress" value={detailStats.inProgress} tone="text-sky-700" />
            <WorkspaceMetric label="Final" value={detailStats.final} tone="text-emerald-700" />
            <WorkspaceMetric label="Total Time" value={formatDurationMinutes(detailStats.totalMinutes)} tone="text-violet-700" />
          </div>
        </div>
      </section>

      <WorkspaceToolbar
        filters={filters}
        onFilterChange={updateFilters}
        eligibleUsers={eligibleUsers}
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
      />

      {detailEntries.length === 0 ? (
        <section className="rounded-[2rem] border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm shadow-slate-200/40">
          <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${activeSection.accent}`}>
            <Plus className="h-7 w-7 text-slate-800" />
          </div>
          <h3 className="mt-5 text-2xl font-bold text-slate-900">{activeSection.emptyTitle}</h3>
          <p className="mt-2 text-sm text-slate-500">Build a scalable production list first, then manage status, artists, time, and approvals from this workspace.</p>
          <button type="button" onClick={() => openCreate(activeSection.key)} className={`mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${activeSection.button}`}>
            <Plus className="h-4 w-4" /> {activeSection.emptyAction}
          </button>
        </section>
      ) : (
        <>
          <section className="hidden overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm shadow-slate-200/40 lg:block">
            <div className="max-h-[68vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-10 bg-slate-950 text-white">
                  <tr>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em]">Select</th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em]">{activeSection.singular} Name</th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em]">Status</th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em]">Assigned Artist</th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em]">Start Time</th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em]">End Time</th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em]">Total Time</th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em]">Priority</th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedEntries.map(({ asset, stage }) => (
                    <ModellingRow
                      key={asset.id}
                      asset={asset}
                      stage={stage}
                      artists={eligibleUsers}
                      selected={selectedIds.includes(asset.id)}
                      onToggleSelect={(assetId) => setSelectedIds((prev) => (prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]))}
                      onUpdateAsset={persistAssetUpdate}
                      onUpdateStage={persistStageUpdate}
                      onMove={moveAsset}
                      onEdit={openEdit}
                      onDuplicate={duplicateAsset}
                      onArchive={toggleArchive}
                      onDelete={(assetToDelete) => requestDeleteAssets([assetToDelete])}
                      nowTick={nowTick}
                      isArchived={asset.isArchived}
                      disabled={busy}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-4 lg:hidden">
            {pagedEntries.map(({ asset, stage }) => (
              <MobileAssetCard
                key={asset.id}
                asset={asset}
                stage={stage}
                artists={eligibleUsers}
                onUpdateAsset={persistAssetUpdate}
                onUpdateStage={persistStageUpdate}
                onEdit={openEdit}
                onDuplicate={duplicateAsset}
                onArchive={toggleArchive}
                onDelete={(assetToDelete) => requestDeleteAssets([assetToDelete])}
                nowTick={nowTick}
                disabled={busy}
              />
            ))}
          </div>

          <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-200/40 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span>
                Showing <span className="font-semibold text-slate-900">{pagedEntries.length}</span> of <span className="font-semibold text-slate-900">{detailEntries.length}</span>
              </span>
              <span className="text-slate-300">•</span>
              <span>Page {currentPage} of {totalPages}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={String(filters.pageSize)} onChange={(event) => updateFilters({ pageSize: Number(event.target.value), page: 1 })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size} / page
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => updateFilters({ page: Math.max(1, currentPage - 1) })} disabled={currentPage <= 1} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">
                Previous
              </button>
              <button type="button" onClick={() => updateFilters({ page: Math.min(totalPages, currentPage + 1) })} disabled={currentPage >= totalPages} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">
                Next
              </button>
            </div>
          </section>
        </>
      )}

      <Modal open={editor.open} onClose={closeEditor} title={editor.mode === "create" ? `Add ${SECTION_CONFIG[editor.sectionKey]?.singular || "Asset"}` : `Edit ${SECTION_CONFIG[editor.sectionKey]?.singular || "Asset"}`} size="max-w-3xl">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">{SECTION_CONFIG[editor.sectionKey]?.singular || "Asset"} Name</span>
            <input value={editor.form.name} onChange={(event) => setEditor((prev) => ({ ...prev, form: { ...prev.form, name: event.target.value } }))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Assigned Artist</span>
            <select value={editor.form.artistId} onChange={(event) => setEditor((prev) => ({ ...prev, form: { ...prev.form, artistId: event.target.value } }))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
              <option value="">Unassigned</option>
              {eligibleUsers.map((artist) => (
                <option key={artist.id} value={artist.id}>
                  {artist.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Status</span>
            <select value={editor.form.status} onChange={(event) => setEditor((prev) => ({ ...prev, form: { ...prev.form, status: event.target.value } }))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
              {STAGE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {getStatusOptionLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Priority</span>
            <select value={editor.form.priority} onChange={(event) => setEditor((prev) => ({ ...prev, form: { ...prev.form, priority: event.target.value } }))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
              {[1, 2, 3, 4, 5].map((priority) => (
                <option key={priority} value={priority}>
                  P{priority}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Start Time</span>
            <input type="datetime-local" value={editor.form.startedAt} onChange={(event) => setEditor((prev) => ({ ...prev, form: { ...prev.form, startedAt: event.target.value } }))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">End Time</span>
            <input type="datetime-local" value={editor.form.endedAt} onChange={(event) => setEditor((prev) => ({ ...prev, form: { ...prev.form, endedAt: event.target.value } }))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Notes</span>
            <textarea value={editor.form.notes} onChange={(event) => setEditor((prev) => ({ ...prev, form: { ...prev.form, notes: event.target.value } }))} rows={3} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Description</span>
            <textarea value={editor.form.description} onChange={(event) => setEditor((prev) => ({ ...prev, form: { ...prev.form, description: event.target.value } }))} rows={3} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Reference URL</span>
            <input value={editor.form.referenceImageUrl} onChange={(event) => setEditor((prev) => ({ ...prev, form: { ...prev.form, referenceImageUrl: event.target.value } }))} placeholder="https://..." className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={closeEditor} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
          <button type="button" onClick={submitEditor} disabled={busy || !editor.form.name.trim()} className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${SECTION_CONFIG[editor.sectionKey]?.button || "bg-slate-900 hover:bg-slate-800"} disabled:opacity-50`}>
            {editor.mode === "create" ? "Create Asset" : "Save Changes"}
          </button>
        </div>
      </Modal>

      <Modal open={confirmDelete.open} onClose={() => setConfirmDelete({ open: false, assets: [] })} title="Delete asset" size="max-w-lg">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <div>
              <p className="font-semibold text-rose-900">This will permanently remove the selected asset rows.</p>
              <p className="mt-1 text-rose-700">Related modelling stage records will be removed safely through the existing relations.</p>
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
