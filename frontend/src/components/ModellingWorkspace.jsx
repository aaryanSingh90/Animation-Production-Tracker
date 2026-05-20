import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  CheckSquare,
  Copy,
  LayoutGrid,
  Plus,
  Search,
  Square,
  Trash2
} from "lucide-react";
import api from "../lib/api";
import Loader from "./Loader";
import Modal from "./Modal";
import StatusBadge from "./StatusBadge";
import { formatDateInput, initials } from "../utils/format";
import { STAGE_STATUSES, getStatusOptionLabel, isCompleteStatus, isLateStatus } from "../utils/constants";

const SECTION_CONFIG = {
  CHARACTER: {
    key: "CHARACTER",
    title: "Characters",
    singular: "Character",
    type: "CHARACTER",
    subCategory: "CHARACTER",
    accent: "border-sky-200 bg-sky-50 text-sky-700",
    pill: "bg-sky-100 text-sky-700",
    button: "bg-sky-600 hover:bg-sky-700"
  },
  CHARACTER_BLENDSHAPES: {
    key: "CHARACTER_BLENDSHAPES",
    title: "Character Blendshapes",
    singular: "Blendshape",
    type: "CHARACTER",
    subCategory: "CHARACTER_BLENDSHAPES",
    accent: "border-violet-200 bg-violet-50 text-violet-700",
    pill: "bg-violet-100 text-violet-700",
    button: "bg-violet-600 hover:bg-violet-700"
  },
  PROP: {
    key: "PROP",
    title: "Props",
    singular: "Prop",
    type: "PROP",
    subCategory: "PROP",
    accent: "border-orange-200 bg-orange-50 text-orange-700",
    pill: "bg-orange-100 text-orange-700",
    button: "bg-orange-600 hover:bg-orange-700"
  },
  BG: {
    key: "BG",
    title: "BG",
    singular: "BG Asset",
    type: "BG",
    subCategory: "BG",
    accent: "border-emerald-200 bg-emerald-50 text-emerald-700",
    pill: "bg-emerald-100 text-emerald-700",
    button: "bg-emerald-600 hover:bg-emerald-700"
  }
};

function makeSectionState(factory) {
  return Object.fromEntries(Object.keys(SECTION_CONFIG).map((key) => [key, factory(key)]));
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

function sortAssets(rows) {
  return [...rows].sort((a, b) => {
    const orderDelta = Number(a.order || 0) - Number(b.order || 0);
    if (orderDelta !== 0) return orderDelta;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

function patchAssetStage(asset, stageId, patch) {
  return {
    ...asset,
    stages: (asset.stages || []).map((stage) => (stage.id === stageId ? { ...stage, ...patch } : stage))
  };
}

function SectionFilterBar({ sectionKey, filters, onChange, artists, selectedCount, onSelectVisible, allVisibleSelected, visibleCount, bulkDraft, onBulkDraftChange, onBulkAssign, onBulkStatus, onBulkDelete, disabled }) {
  return (
    <div className="space-y-3 border-b border-slate-200 px-4 py-4">
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1.4fr)_180px_220px_auto]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={filters.search}
            onChange={(event) => onChange(sectionKey, { search: event.target.value })}
            placeholder="Search assets"
            className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-sm"
          />
        </label>
        <select
          value={filters.status}
          onChange={(event) => onChange(sectionKey, { status: event.target.value })}
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
          value={filters.artistId}
          onChange={(event) => onChange(sectionKey, { artistId: event.target.value })}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All artists</option>
          {artists.map((artist) => (
            <option key={artist.id} value={artist.id}>
              {artist.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onSelectVisible(sectionKey)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {allVisibleSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          {allVisibleSelected ? "Clear" : "Select"} visible ({visibleCount})
        </button>
      </div>

      {selectedCount > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span>{selectedCount} selected</span>
            <span className="rounded-full bg-white px-2 py-1 text-[11px] tracking-normal text-slate-700">Bulk actions</span>
          </div>
          <div className="grid gap-2 lg:grid-cols-[220px_220px_auto_auto_auto]">
            <select
              value={bulkDraft.artistId}
              onChange={(event) => onBulkDraftChange(sectionKey, { artistId: event.target.value })}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
              disabled={disabled}
            >
              <option value="">Choose artist</option>
              <option value="__UNASSIGN__">Unassign selected</option>
              {artists.map((artist) => (
                <option key={artist.id} value={artist.id}>
                  {artist.name}
                </option>
              ))}
            </select>
            <select
              value={bulkDraft.status}
              onChange={(event) => onBulkDraftChange(sectionKey, { status: event.target.value })}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
              disabled={disabled}
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
              onClick={() => onBulkAssign(sectionKey)}
              disabled={disabled || !bulkDraft.artistId}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Assign Artist
            </button>
            <button
              type="button"
              onClick={() => onBulkStatus(sectionKey)}
              disabled={disabled || !bulkDraft.status}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Change Status
            </button>
            <button
              type="button"
              onClick={() => onBulkDelete(sectionKey)}
              disabled={disabled}
              className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Delete Selected
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ModellingDesktopRow({ asset, stage, artists, selected, onToggleSelect, onUpdateAsset, onUpdateStage, onMove, onDuplicate, onDelete, disabled, canMoveUp, canMoveDown }) {
  const [nameDraft, setNameDraft] = useState(asset.name || "");
  const [notesDraft, setNotesDraft] = useState(stage?.notes || "");

  useEffect(() => {
    setNameDraft(asset.name || "");
  }, [asset.id, asset.name]);

  useEffect(() => {
    setNotesDraft(stage?.notes || "");
  }, [stage?.id, stage?.notes]);

  return (
    <tr className="border-t border-slate-100 align-top hover:bg-slate-50/60">
      <td className="px-3 py-3">
        <input type="checkbox" checked={selected} onChange={() => onToggleSelect(asset.id)} className="h-4 w-4 rounded border-slate-300" />
      </td>
      <td className="px-3 py-3">
        <input
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
          onBlur={() => {
            const trimmed = nameDraft.trim();
            if (trimmed && trimmed !== asset.name) onUpdateAsset(asset.id, { name: trimmed });
            if (!trimmed) setNameDraft(asset.name || "");
          }}
          className="w-full min-w-[180px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900"
        />
      </td>
      <td className="px-3 py-3">
        <div className="space-y-2">
          <StatusBadge status={stage?.status || asset.status} />
          <select
            value={stage?.status || "YTS"}
            onChange={(event) => onUpdateStage(asset.id, stage.id, { status: event.target.value }, { status: event.target.value })}
            className="w-full min-w-[170px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
        <select
          value={stage?.assignedUser?.id || ""}
          onChange={(event) => {
            const value = event.target.value;
            const assignedUserId = value ? Number(value) : null;
            const assignedUser = artists.find((artist) => artist.id === assignedUserId) || null;
            onUpdateStage(asset.id, stage.id, { assignedUserId }, { assignedUser });
          }}
          className="w-full min-w-[220px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
          type="date"
          value={formatDateInput(stage?.startDate)}
          onChange={(event) => onUpdateStage(asset.id, stage.id, { startDate: event.target.value || null }, { startDate: event.target.value || null })}
          className="w-full min-w-[150px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
          disabled={disabled}
        />
      </td>
      <td className="px-3 py-3">
        <input
          type="date"
          value={formatDateInput(stage?.endDate)}
          onChange={(event) => onUpdateStage(asset.id, stage.id, { endDate: event.target.value || null }, { endDate: event.target.value || null })}
          className="w-full min-w-[150px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
          disabled={disabled}
        />
      </td>
      <td className="px-3 py-3">
        <textarea
          value={notesDraft}
          onChange={(event) => setNotesDraft(event.target.value)}
          onBlur={() => {
            if ((stage?.notes || "") !== notesDraft) {
              onUpdateStage(asset.id, stage.id, { notes: notesDraft || null }, { notes: notesDraft || null });
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
          <button
            type="button"
            onClick={() => onMove(asset.id, -1)}
            disabled={!canMoveUp || disabled}
            className="rounded-lg border border-slate-300 p-2 text-slate-700 disabled:opacity-40"
            title="Move up"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove(asset.id, 1)}
            disabled={!canMoveDown || disabled}
            className="rounded-lg border border-slate-300 p-2 text-slate-700 disabled:opacity-40"
            title="Move down"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDuplicate(asset)}
            disabled={disabled}
            className="rounded-lg border border-slate-300 p-2 text-slate-700 disabled:opacity-40"
            title="Duplicate"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(asset)}
            disabled={disabled}
            className="rounded-lg border border-rose-200 p-2 text-rose-600 disabled:opacity-40"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function ModellingMobileCard({ asset, stage, artists, selected, onToggleSelect, onUpdateAsset, onUpdateStage, onMove, onDuplicate, onDelete, disabled, canMoveUp, canMoveDown }) {
  const [nameDraft, setNameDraft] = useState(asset.name || "");
  const [notesDraft, setNotesDraft] = useState(stage?.notes || "");

  useEffect(() => {
    setNameDraft(asset.name || "");
  }, [asset.id, asset.name]);

  useEffect(() => {
    setNotesDraft(stage?.notes || "");
  }, [stage?.id, stage?.notes]);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
          <input type="checkbox" checked={selected} onChange={() => onToggleSelect(asset.id)} className="h-4 w-4 rounded border-slate-300" />
          {asset.name}
        </label>
        <StatusBadge status={stage?.status || asset.status} />
      </div>

      <div className="grid gap-3">
        <input
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
          onBlur={() => {
            const trimmed = nameDraft.trim();
            if (trimmed && trimmed !== asset.name) onUpdateAsset(asset.id, { name: trimmed });
            if (!trimmed) setNameDraft(asset.name || "");
          }}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
        />
        <select
          value={stage?.status || "YTS"}
          onChange={(event) => onUpdateStage(asset.id, stage.id, { status: event.target.value }, { status: event.target.value })}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          disabled={disabled}
        >
          {STAGE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {getStatusOptionLabel(status)}
            </option>
          ))}
        </select>
        <select
          value={stage?.assignedUser?.id || ""}
          onChange={(event) => {
            const value = event.target.value;
            const assignedUserId = value ? Number(value) : null;
            const assignedUser = artists.find((artist) => artist.id === assignedUserId) || null;
            onUpdateStage(asset.id, stage.id, { assignedUserId }, { assignedUser });
          }}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          disabled={disabled}
        >
          <option value="">Unassigned</option>
          {artists.map((artist) => (
            <option key={artist.id} value={artist.id}>
              {artist.name}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <input
            type="date"
            value={formatDateInput(stage?.startDate)}
            onChange={(event) => onUpdateStage(asset.id, stage.id, { startDate: event.target.value || null }, { startDate: event.target.value || null })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            disabled={disabled}
          />
          <input
            type="date"
            value={formatDateInput(stage?.endDate)}
            onChange={(event) => onUpdateStage(asset.id, stage.id, { endDate: event.target.value || null }, { endDate: event.target.value || null })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            disabled={disabled}
          />
        </div>
        <textarea
          value={notesDraft}
          onChange={(event) => setNotesDraft(event.target.value)}
          onBlur={() => {
            if ((stage?.notes || "") !== notesDraft) {
              onUpdateStage(asset.id, stage.id, { notes: notesDraft || null }, { notes: notesDraft || null });
            }
          }}
          rows={2}
          placeholder="Notes"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          disabled={disabled}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onMove(asset.id, -1)} disabled={!canMoveUp || disabled} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40">Up</button>
          <button type="button" onClick={() => onMove(asset.id, 1)} disabled={!canMoveDown || disabled} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40">Down</button>
          <button type="button" onClick={() => onDuplicate(asset)} disabled={disabled} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40">Duplicate</button>
          <button type="button" onClick={() => onDelete(asset)} disabled={disabled} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 disabled:opacity-40">Delete</button>
        </div>
      </div>
    </article>
  );
}

function ModellingSection({ section, assets, filters, artists, quickAdd, selectedIds, bulkDraft, highlighted, busy, onFilterChange, onToggleQuickAdd, onQuickAddChange, onQuickAddSubmit, onOpenCreateModal, onToggleSelect, onSelectVisible, onBulkDraftChange, onBulkAssign, onBulkStatus, onBulkDelete, onUpdateAsset, onUpdateStage, onMove, onDuplicate, onDelete }) {
  const visibleAssetIds = assets.map((asset) => asset.id);
  const allVisibleSelected = Boolean(visibleAssetIds.length) && visibleAssetIds.every((id) => selectedIds.includes(id));

  return (
    <section className={`overflow-hidden rounded-3xl border bg-white shadow-sm ${highlighted ? "ring-2 ring-slate-300" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
        <div className="min-w-0">
          <div className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${section.accent}`}>
            {section.title}
          </div>
          <h3 className="mt-2 text-lg font-bold text-slate-900">{section.title}</h3>
          <p className="mt-1 text-sm text-slate-500">Create, assign, edit, reorder, duplicate, and remove {section.title.toLowerCase()} inline.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onToggleQuickAdd(section.key)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Plus className="h-4 w-4" /> Quick Add
          </button>
          <button type="button" onClick={() => onOpenCreateModal(section.key)} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-white ${section.button}`}>
            <Plus className="h-4 w-4" /> Add {section.singular}
          </button>
        </div>
      </div>

      {quickAdd.open && (
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Quick add row</div>
          <div className="grid gap-2 xl:grid-cols-[1.4fr_220px_180px_160px_160px_minmax(0,1fr)_auto]">
            <input
              value={quickAdd.name}
              onChange={(event) => onQuickAddChange(section.key, { name: event.target.value })}
              placeholder={`${section.singular} name`}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={quickAdd.artistId}
              onChange={(event) => onQuickAddChange(section.key, { artistId: event.target.value })}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Unassigned</option>
              {artists.map((artist) => (
                <option key={artist.id} value={artist.id}>
                  {artist.name}
                </option>
              ))}
            </select>
            <select
              value={quickAdd.status}
              onChange={(event) => onQuickAddChange(section.key, { status: event.target.value })}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              {STAGE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {getStatusOptionLabel(status)}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={quickAdd.startDate}
              onChange={(event) => onQuickAddChange(section.key, { startDate: event.target.value })}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={quickAdd.endDate}
              onChange={(event) => onQuickAddChange(section.key, { endDate: event.target.value })}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={quickAdd.notes}
              onChange={(event) => onQuickAddChange(section.key, { notes: event.target.value })}
              placeholder="Notes"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => onQuickAddSubmit(section.key)} disabled={busy || !quickAdd.name.trim()} className={`rounded-xl px-3 py-2 text-sm font-semibold text-white ${section.button} disabled:opacity-50`}>Create</button>
              <button type="button" onClick={() => onToggleQuickAdd(section.key)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Close</button>
            </div>
          </div>
        </div>
      )}

      <SectionFilterBar
        sectionKey={section.key}
        filters={filters}
        onChange={onFilterChange}
        artists={artists}
        selectedCount={selectedIds.length}
        onSelectVisible={onSelectVisible}
        allVisibleSelected={allVisibleSelected}
        visibleCount={visibleAssetIds.length}
        bulkDraft={bulkDraft}
        onBulkDraftChange={onBulkDraftChange}
        onBulkAssign={onBulkAssign}
        onBulkStatus={onBulkStatus}
        onBulkDelete={onBulkDelete}
        disabled={busy}
      />

      {!assets.length ? (
        <div className="px-4 py-12 text-center">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <LayoutGrid className="h-5 w-5" />
          </div>
          <h4 className="text-lg font-bold text-slate-900">No {section.title} Added Yet</h4>
          <p className="mt-1 text-sm text-slate-500">Start the modelling tracker by creating the first {section.singular.toLowerCase()} for this project.</p>
          <button type="button" onClick={() => onOpenCreateModal(section.key)} className={`mt-4 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-white ${section.button}`}>
            <Plus className="h-4 w-4" /> Create First {section.singular}
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
                {assets.map((asset, index) => {
                  const stage = getModellingStage(asset);
                  if (!stage) return null;

                  return (
                    <ModellingDesktopRow
                      key={asset.id}
                      asset={asset}
                      stage={stage}
                      artists={artists}
                      selected={selectedIds.includes(asset.id)}
                      onToggleSelect={onToggleSelect}
                      onUpdateAsset={onUpdateAsset}
                      onUpdateStage={onUpdateStage}
                      onMove={(assetId, delta) => onMove(section.key, assetId, delta)}
                      onDuplicate={onDuplicate}
                      onDelete={onDelete}
                      disabled={busy}
                      canMoveUp={index > 0}
                      canMoveDown={index < assets.length - 1}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 p-4 md:hidden">
            {assets.map((asset, index) => {
              const stage = getModellingStage(asset);
              if (!stage) return null;

              return (
                <ModellingMobileCard
                  key={asset.id}
                  asset={asset}
                  stage={stage}
                  artists={artists}
                  selected={selectedIds.includes(asset.id)}
                  onToggleSelect={onToggleSelect}
                  onUpdateAsset={onUpdateAsset}
                  onUpdateStage={onUpdateStage}
                  onMove={(assetId, delta) => onMove(section.key, assetId, delta)}
                  onDuplicate={onDuplicate}
                  onDelete={onDelete}
                  disabled={busy}
                  canMoveUp={index > 0}
                  canMoveDown={index < assets.length - 1}
                />
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

export default function ModellingWorkspace({ projectId, overview, stageSummary, eligibleUsers, requiredDepartment, workspaceVariant, showToast }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [assets, setAssets] = useState([]);
  const [error, setError] = useState("");
  const [filtersBySection, setFiltersBySection] = useState(() => makeSectionState(() => ({ search: "", status: "", artistId: "" })));
  const [selectedBySection, setSelectedBySection] = useState(() => makeSectionState(() => []));
  const [quickAddBySection, setQuickAddBySection] = useState(() =>
    makeSectionState(() => ({ open: false, name: "", artistId: "", status: "YTS", startDate: "", endDate: "", notes: "" }))
  );
  const [bulkDraftBySection, setBulkDraftBySection] = useState(() => makeSectionState(() => ({ artistId: "", status: "" })));
  const [createModalSection, setCreateModalSection] = useState(null);
  const [createForm, setCreateForm] = useState({ name: "", artistId: "", status: "YTS", startDate: "", endDate: "", notes: "" });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const projectName = overview?.project?.name || "Project";
  const sectionEntries = useMemo(() => {
    const orderedKeys = Object.keys(SECTION_CONFIG);
    if (workspaceVariant && orderedKeys.includes(workspaceVariant)) {
      return [workspaceVariant, ...orderedKeys.filter((key) => key !== workspaceVariant)].map((key) => SECTION_CONFIG[key]);
    }
    return orderedKeys.map((key) => SECTION_CONFIG[key]);
  }, [workspaceVariant]);

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
          pageSize: 500,
          sortBy: "order",
          sortDir: "asc"
        }
      });
      setAssets(sortAssets(data.items || []));
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || "Failed to load modelling assets");
      setAssets([]);
    } finally {
      if (withLoader) setLoading(false);
    }
  }

  const assetsBySection = useMemo(() => {
    const buckets = makeSectionState(() => []);
    for (const asset of assets) {
      const sectionKey = getSectionKeyForAsset(asset);
      if (!buckets[sectionKey]) continue;
      buckets[sectionKey].push(asset);
    }

    for (const key of Object.keys(buckets)) {
      buckets[key] = sortAssets(buckets[key]);
    }

    return buckets;
  }, [assets]);

  const visibleAssetsBySection = useMemo(() => {
    const next = makeSectionState(() => []);

    for (const sectionKey of Object.keys(SECTION_CONFIG)) {
      const filters = filtersBySection[sectionKey];
      const source = assetsBySection[sectionKey] || [];
      next[sectionKey] = source.filter((asset) => {
        const stage = getModellingStage(asset);
        if (!stage) return false;

        const searchNeedle = String(filters.search || "").trim().toLowerCase();
        const matchesSearch = !searchNeedle || String(asset.name || "").toLowerCase().includes(searchNeedle);
        const matchesStatus = !filters.status || stage.status === filters.status;
        const matchesArtist = !filters.artistId || stage.assignedUser?.id === Number(filters.artistId);
        return matchesSearch && matchesStatus && matchesArtist;
      });
    }

    return next;
  }, [assetsBySection, filtersBySection]);

  const metrics = useMemo(() => {
    const modellingStages = assets
      .map((asset) => ({ asset, stage: getModellingStage(asset) }))
      .filter((entry) => Boolean(entry.stage));

    const total = modellingStages.length;
    const completed = modellingStages.filter((entry) => isCompleteStatus(entry.stage.status)).length;
    const late = modellingStages.filter((entry) => isLateStatus(entry.stage.status, entry.stage.deadline || entry.stage.endDate)).length;
    const assignedArtists = new Set(modellingStages.map((entry) => entry.stage.assignedUser?.id).filter(Boolean)).size;

    return {
      total,
      completed,
      late,
      assignedArtists,
      completionPercent: total ? Math.round((completed / total) * 100) : stageSummary?.completionPercent || 0
    };
  }, [assets, stageSummary?.completionPercent]);

  function setAssetList(updater) {
    setAssets((prev) => sortAssets(typeof updater === "function" ? updater(prev) : updater));
  }

  function updateSectionFilters(sectionKey, patch) {
    setFiltersBySection((prev) => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        ...patch
      }
    }));
  }

  function updateQuickAdd(sectionKey, patch) {
    setQuickAddBySection((prev) => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        ...patch
      }
    }));
  }

  function resetQuickAdd(sectionKey, keepOpen = false) {
    setQuickAddBySection((prev) => ({
      ...prev,
      [sectionKey]: {
        open: keepOpen,
        name: "",
        artistId: "",
        status: "YTS",
        startDate: "",
        endDate: "",
        notes: ""
      }
    }));
  }

  function toggleQuickAdd(sectionKey) {
    setQuickAddBySection((prev) => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        open: !prev[sectionKey].open
      }
    }));
  }

  function updateBulkDraft(sectionKey, patch) {
    setBulkDraftBySection((prev) => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        ...patch
      }
    }));
  }

  function toggleAssetSelection(sectionKey, assetId) {
    setSelectedBySection((prev) => {
      const exists = prev[sectionKey].includes(assetId);
      return {
        ...prev,
        [sectionKey]: exists ? prev[sectionKey].filter((id) => id !== assetId) : [...prev[sectionKey], assetId]
      };
    });
  }

  function toggleVisibleSelection(sectionKey) {
    const visibleIds = (visibleAssetsBySection[sectionKey] || []).map((asset) => asset.id);
    setSelectedBySection((prev) => {
      const allSelected = visibleIds.length && visibleIds.every((id) => prev[sectionKey].includes(id));
      return {
        ...prev,
        [sectionKey]: allSelected ? prev[sectionKey].filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...prev[sectionKey], ...visibleIds]))
      };
    });
  }

  function clearSectionSelection(sectionKey) {
    setSelectedBySection((prev) => ({
      ...prev,
      [sectionKey]: []
    }));
  }

  function openCreateModal(sectionKey) {
    setCreateModalSection(sectionKey);
    setCreateForm({ name: "", artistId: "", status: "YTS", startDate: "", endDate: "", notes: "" });
  }

  async function createAssetInSection(sectionKey, values, options = {}) {
    const config = SECTION_CONFIG[sectionKey];
    const name = String(values.name || "").trim();
    if (!name) throw new Error(`${config.singular} name is required`);

    const { data: createdAsset } = await api.post(`/projects/${projectId}/assets`, {
      name,
      type: config.type,
      subCategory: config.subCategory
    });

    let hydratedAsset = createdAsset;
    const modellingStage = getModellingStage(createdAsset);
    const stagePayload = {};
    if (Object.prototype.hasOwnProperty.call(values, "artistId")) {
      stagePayload.assignedUserId = values.artistId ? Number(values.artistId) : null;
    }
    if (values.status) stagePayload.status = values.status;
    if (Object.prototype.hasOwnProperty.call(values, "startDate")) stagePayload.startDate = values.startDate || null;
    if (Object.prototype.hasOwnProperty.call(values, "endDate")) stagePayload.endDate = values.endDate || null;
    if (Object.prototype.hasOwnProperty.call(values, "notes")) stagePayload.notes = values.notes || null;

    if (modellingStage && Object.keys(stagePayload).length > 0) {
      const { data: updatedStage } = await api.put(`/asset-stages/${modellingStage.id}`, stagePayload);
      hydratedAsset = {
        ...createdAsset,
        stages: (createdAsset.stages || []).map((stage) => (stage.id === updatedStage.id ? updatedStage : stage))
      };
    }

    setAssetList((prev) => [...prev, hydratedAsset]);

    if (!options.quiet) {
      options.onSuccess?.();
    }

    return hydratedAsset;
  }

  async function handleQuickAdd(sectionKey) {
    const form = quickAddBySection[sectionKey];
    setBusy(true);
    try {
      await createAssetInSection(sectionKey, form);
      resetQuickAdd(sectionKey, true);
      showToast?.("success", `${SECTION_CONFIG[sectionKey].singular} created`);
    } catch (err) {
      const message = err.userMessage || err.response?.data?.message || err.message || "Unable to create asset";
      showToast?.("error", message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateFromModal() {
    if (!createModalSection) return;
    setBusy(true);
    try {
      await createAssetInSection(createModalSection, createForm);
      showToast?.("success", `${SECTION_CONFIG[createModalSection].singular} created`);
      setCreateModalSection(null);
    } catch (err) {
      const message = err.userMessage || err.response?.data?.message || err.message || "Unable to create asset";
      showToast?.("error", message);
    } finally {
      setBusy(false);
    }
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
    setAssetList((current) =>
      current.map((asset) => {
        if (asset.id !== assetId) return asset;
        return patchAssetStage(asset, stageId, optimisticPatch);
      })
    );

    try {
      const { data } = await api.put(`/asset-stages/${stageId}`, payload);
      setAssetList((current) =>
        current.map((asset) => {
          if (asset.id !== assetId) return asset;
          return patchAssetStage(asset, stageId, data);
        })
      );
    } catch (err) {
      setAssets(previous);
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to update modelling row");
    }
  }

  async function moveAsset(sectionKey, assetId, delta) {
    const rows = visibleAssetsBySection[sectionKey] || [];
    const currentIndex = rows.findIndex((row) => row.id === assetId);
    const target = rows[currentIndex + delta];
    const current = rows[currentIndex];

    if (!current || !target) return;

    const currentOrder = Number(current.order || 0);
    const targetOrder = Number(target.order || 0);
    const previous = assets;

    setAssetList((list) =>
      list.map((asset) => {
        if (asset.id === current.id) return { ...asset, order: targetOrder };
        if (asset.id === target.id) return { ...asset, order: currentOrder };
        return asset;
      })
    );

    setBusy(true);
    try {
      await Promise.all([
        api.patch(`/assets/${current.id}`, { order: targetOrder }),
        api.patch(`/assets/${target.id}`, { order: currentOrder })
      ]);
      showToast?.("success", "Asset order updated");
    } catch (err) {
      setAssets(previous);
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
      await createAssetInSection(
        sectionKey,
        {
          name: `${asset.name} Copy`,
          artistId: stage?.assignedUser?.id || "",
          status: stage?.status || "YTS",
          startDate: formatDateInput(stage?.startDate),
          endDate: formatDateInput(stage?.endDate),
          notes: stage?.notes || ""
        },
        { quiet: true }
      );
      showToast?.("success", "Asset duplicated");
    } catch (err) {
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to duplicate asset");
    } finally {
      setBusy(false);
    }
  }

  function requestDeleteAsset(asset) {
    setDeleteTarget({
      mode: "single",
      sectionKey: getSectionKeyForAsset(asset),
      assetIds: [asset.id],
      title: `Delete ${asset.name}?`,
      description: "This removes the asset and its related stage rows from the pipeline."
    });
  }

  function requestBulkDelete(sectionKey) {
    const selectedIds = selectedBySection[sectionKey] || [];
    if (!selectedIds.length) return;
    setDeleteTarget({
      mode: "bulk",
      sectionKey,
      assetIds: selectedIds,
      title: `Delete ${selectedIds.length} selected ${SECTION_CONFIG[sectionKey].title.toLowerCase()}?`,
      description: "This removes the selected assets and their related stage rows from the pipeline."
    });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const previous = assets;
    const idsToDelete = new Set(deleteTarget.assetIds);
    setAssetList((list) => list.filter((asset) => !idsToDelete.has(asset.id)));
    setBusy(true);
    try {
      await Promise.all(deleteTarget.assetIds.map((assetId) => api.delete(`/assets/${assetId}`)));
      clearSectionSelection(deleteTarget.sectionKey);
      showToast?.("success", deleteTarget.mode === "bulk" ? "Selected assets deleted" : "Asset deleted");
      setDeleteTarget(null);
    } catch (err) {
      setAssets(previous);
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to delete asset");
    } finally {
      setBusy(false);
    }
  }

  async function applyBulkAssign(sectionKey) {
    const selectedIds = selectedBySection[sectionKey] || [];
    if (!selectedIds.length) return;

    const userValue = bulkDraftBySection[sectionKey].artistId;
    if (!userValue) return;

    const userId = userValue === "__UNASSIGN__" ? null : Number(userValue);
    const assignedUser = userId ? eligibleUsers.find((user) => user.id === userId) || null : null;
    const previous = assets;

    setAssetList((list) =>
      list.map((asset) => {
        if (!selectedIds.includes(asset.id)) return asset;
        const stage = getModellingStage(asset);
        if (!stage) return asset;
        return patchAssetStage(asset, stage.id, { assignedUser });
      })
    );

    setBusy(true);
    try {
      const stageUpdates = assets
        .filter((asset) => selectedIds.includes(asset.id))
        .map((asset) => {
          const stage = getModellingStage(asset);
          return stage ? api.put(`/asset-stages/${stage.id}`, { assignedUserId: userId }) : null;
        })
        .filter(Boolean);
      await Promise.all(stageUpdates);
      clearSectionSelection(sectionKey);
      updateBulkDraft(sectionKey, { artistId: "" });
      showToast?.("success", "Bulk artist assignment applied");
    } catch (err) {
      setAssets(previous);
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to bulk assign assets");
    } finally {
      setBusy(false);
    }
  }

  async function applyBulkStatus(sectionKey) {
    const selectedIds = selectedBySection[sectionKey] || [];
    const status = bulkDraftBySection[sectionKey].status;
    if (!selectedIds.length || !status) return;

    const previous = assets;
    setAssetList((list) =>
      list.map((asset) => {
        if (!selectedIds.includes(asset.id)) return asset;
        const stage = getModellingStage(asset);
        if (!stage) return asset;
        return patchAssetStage(asset, stage.id, { status });
      })
    );

    setBusy(true);
    try {
      const stageUpdates = assets
        .filter((asset) => selectedIds.includes(asset.id))
        .map((asset) => {
          const stage = getModellingStage(asset);
          return stage ? api.put(`/asset-stages/${stage.id}`, { status }) : null;
        })
        .filter(Boolean);
      await Promise.all(stageUpdates);
      clearSectionSelection(sectionKey);
      updateBulkDraft(sectionKey, { status: "" });
      showToast?.("success", "Bulk status update applied");
    } catch (err) {
      setAssets(previous);
      showToast?.("error", err.userMessage || err.response?.data?.message || "Unable to bulk update statuses");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <Loader label="Loading modelling workspace..." />;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Production Asset Workspace</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">{projectName} · Modelling</h2>
            <p className="mt-1 text-sm text-slate-500">
              Real production asset tracking for characters, blendshapes, props, and background builds.
              {requiredDepartment ? ` Assigned department: ${requiredDepartment}.` : ""}
            </p>
          </div>
          <Link to={`/projects/${projectId}`} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Back To Overview
          </Link>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Progress</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{metrics.completionPercent}%</p>
            <p className="mt-1 text-xs text-slate-500">{metrics.completed} of {metrics.total} modelling rows complete</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Assigned Artists</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{metrics.assignedArtists}</p>
            <p className="mt-1 text-xs text-slate-500">Active modelling artists on this project</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Assets Tracked</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{metrics.total}</p>
            <p className="mt-1 text-xs text-slate-500">Characters, blendshapes, props, and BG items</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Late Rows</p>
            <p className="mt-1 text-2xl font-bold text-rose-700">{metrics.late}</p>
            <p className="mt-1 text-xs text-slate-500">Tasks missing their planned finish window</p>
          </div>
        </div>

        {eligibleUsers.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {eligibleUsers.slice(0, 10).map((artist) => (
              <span key={artist.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">{initials(artist.name)}</span>
                {artist.name}
              </span>
            ))}
          </div>
        )}
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {sectionEntries.map((section) => (
        <ModellingSection
          key={section.key}
          section={section}
          assets={visibleAssetsBySection[section.key] || []}
          filters={filtersBySection[section.key]}
          artists={eligibleUsers}
          quickAdd={quickAddBySection[section.key]}
          selectedIds={selectedBySection[section.key] || []}
          bulkDraft={bulkDraftBySection[section.key]}
          highlighted={workspaceVariant === section.key}
          busy={busy}
          onFilterChange={updateSectionFilters}
          onToggleQuickAdd={toggleQuickAdd}
          onQuickAddChange={updateQuickAdd}
          onQuickAddSubmit={handleQuickAdd}
          onOpenCreateModal={openCreateModal}
          onToggleSelect={(assetId) => toggleAssetSelection(section.key, assetId)}
          onSelectVisible={toggleVisibleSelection}
          onBulkDraftChange={updateBulkDraft}
          onBulkAssign={applyBulkAssign}
          onBulkStatus={applyBulkStatus}
          onBulkDelete={requestBulkDelete}
          onUpdateAsset={persistAssetUpdate}
          onUpdateStage={persistStageUpdate}
          onMove={moveAsset}
          onDuplicate={duplicateAsset}
          onDelete={requestDeleteAsset}
        />
      ))}

      <Modal open={Boolean(createModalSection)} onClose={() => setCreateModalSection(null)} title={`Create ${createModalSection ? SECTION_CONFIG[createModalSection].singular : "Asset"}`} size="max-w-2xl">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Name</span>
              <input value={createForm.name} onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Artist</span>
              <select value={createForm.artistId} onChange={(event) => setCreateForm((prev) => ({ ...prev, artistId: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option value="">Unassigned</option>
                {eligibleUsers.map((artist) => (
                  <option key={artist.id} value={artist.id}>
                    {artist.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Status</span>
              <select value={createForm.status} onChange={(event) => setCreateForm((prev) => ({ ...prev, status: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                {STAGE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {getStatusOptionLabel(status)}
                  </option>
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
            <button type="button" onClick={() => setCreateModalSection(null)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button>
            <button type="button" onClick={handleCreateFromModal} disabled={busy || !createForm.name.trim()} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Create Asset</button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title={deleteTarget?.title || "Delete Asset"} size="max-w-lg">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">{deleteTarget?.description}</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button>
            <button type="button" onClick={confirmDelete} disabled={busy} className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Delete</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
