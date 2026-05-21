import {
  ArrowRight,
  Box,
  Clapperboard,
  Film,
  Layers3,
  MonitorCheck,
  Music2,
  Paintbrush,
  Scissors,
  Sparkles,
  Sun,
  Wrench
} from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { buildStageWorkspacePath, stageSlugFromCode } from "../utils/stageRouting";

const STAGE_ITEMS = [
  { code: "ANIMATICS", slug: "animatics", label: "Animatics", Icon: Clapperboard },
  { code: "MODELLING", slug: "modelling", label: "Modelling", Icon: Box },
  { code: "TEXTURING", slug: "texturing", label: "Texturing", Icon: Paintbrush },
  { code: "RIGGING", slug: "rigging", label: "Rigging", Icon: Wrench },
  { code: "UNWRAPPING", slug: "unwrapping", label: "Unwrapping", Icon: Layers3 },
  { code: "ANIMATION", slug: "animation", label: "Animation", Icon: Film },
  { code: "FX", slug: "fx", label: "FX", Icon: Sparkles },
  { code: "LIGHTING", slug: "lighting", label: "Lighting", Icon: Sun },
  { code: "COMPOSITING", slug: "composite", label: "Compositing", Icon: Layers3 },
  { code: "EDITING", slug: "editing", label: "Editing", Icon: Scissors },
  { code: "AUDIO", slug: "audio", label: "Audio", Icon: Music2 },
  { code: "RENDERING", slug: "rendering", label: "Final Output", Icon: MonitorCheck }
];

export const PIPELINE_STAGE_ITEMS = STAGE_ITEMS;
const STAGE_META_BY_CODE = new Map(STAGE_ITEMS.map((stage) => [stage.code, stage]));

function normalizeStageCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "RENDER") return "RENDERING";
  if (normalized === "COMP") return "COMPOSITING";
  return normalized;
}

function toPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function deriveStageMetrics(summary) {
  const total = toPositiveNumber(summary?.total ?? summary?.totalCount ?? summary?.count ?? summary?._count);
  const completed = toPositiveNumber(summary?.approved ?? summary?.completed ?? summary?.done);
  const delayed = toPositiveNumber(summary?.delayed ?? summary?.late ?? summary?.overdue);
  const pending = toPositiveNumber(summary?.pendingApprovals ?? summary?.submitted ?? summary?.pending ?? summary?.pendingCount);
  const inProgress = toPositiveNumber(summary?.inProgress ?? summary?.active ?? summary?.ip);
  const artists = toPositiveNumber(summary?.assignedArtists ?? summary?.artistsAssigned ?? summary?.artistCount);
  const progress = Math.min(
    100,
    Math.max(0, Math.round(Number(summary?.completionPercent ?? (total ? (completed / total) * 100 : 0)) || 0))
  );

  return {
    total,
    completed,
    delayed,
    pending,
    inProgress,
    artists,
    active: Math.max(total - completed, 0),
    progress
  };
}

function deriveStageVisual(metrics) {
  if (metrics.delayed > 0) {
    return {
      label: `${metrics.delayed} Delayed`,
      dot: "bg-rose-500",
      text: "text-rose-600",
      border: "border-rose-200",
      soft: "bg-rose-50"
    };
  }
  if (metrics.pending > 0) {
    return {
      label: `${metrics.pending} Pending`,
      dot: "bg-amber-400",
      text: "text-amber-600",
      border: "border-amber-200",
      soft: "bg-amber-50"
    };
  }
  if (metrics.progress >= 100 && metrics.total > 0) {
    return {
      label: "Approved",
      dot: "bg-emerald-500",
      text: "text-emerald-600",
      border: "border-emerald-200",
      soft: "bg-emerald-50"
    };
  }
  if (metrics.inProgress > 0 || metrics.progress > 0) {
    return {
      label: `${metrics.progress}%`,
      dot: "bg-blue-500",
      text: "text-blue-600",
      border: "border-blue-200",
      soft: "bg-blue-50"
    };
  }
  return {
    label: "Queued",
    dot: "bg-slate-400",
    text: "text-slate-500",
    border: "border-slate-200",
    soft: "bg-slate-50"
  };
}

function PipelineQuickStageBar({
  projectId,
  overview,
  activeStageCode = "",
  navigationState,
  sticky = true,
  className = ""
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [hoveredStageCode, setHoveredStageCode] = useState("");
  const normalizedActiveStageCode = normalizeStageCode(activeStageCode);
  const resolvedNavigationState = navigationState ?? location.state;

  const summaryByCode = useMemo(() => {
    const map = new Map();
    for (const summary of overview?.stageSummaries || []) {
      const code = normalizeStageCode(summary?.stageCode);
      if (!code) continue;
      map.set(code, summary);
    }
    return map;
  }, [overview]);

  const stageItems = useMemo(
    () => {
      const configuredStages = Array.isArray(overview?.project?.pipelineStages)
        ? overview.project.pipelineStages
            .map((stage, index) => ({
              ...stage,
              stageCode: normalizeStageCode(stage.stageCode),
              order: Number(stage.order || index + 1)
            }))
            .filter((stage) => stage.stageCode)
            .sort((a, b) => a.order - b.order)
        : [];
      const configuredCodes = configuredStages.length
        ? configuredStages.map((stage) => stage.stageCode)
        : Array.isArray(overview?.project?.activeStageCodes)
          ? overview.project.activeStageCodes.map((code) => normalizeStageCode(code)).filter(Boolean)
          : [];
      const summaryCodes = (overview?.stageSummaries || []).map((summary) => normalizeStageCode(summary?.stageCode)).filter(Boolean);
      const codes = Array.from(new Set(configuredCodes.length ? configuredCodes : summaryCodes.length ? summaryCodes : STAGE_ITEMS.map((stage) => stage.code)));

      return codes.map((code) => {
        const configuredStage = configuredStages.find((stage) => stage.stageCode === code);
        const meta = STAGE_META_BY_CODE.get(code) || {
          code,
          slug: stageSlugFromCode(code) || code.toLowerCase().replaceAll("_", "-"),
          label: code === "RENDERING" ? "Final Output" : code.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()),
          Icon: Layers3
        };
        const stage = {
          ...meta,
          code,
          label: configuredStage?.stageName || meta.label
        };
        const summary = configuredStage || summaryByCode.get(stage.code) || (stage.code === "RENDERING" ? summaryByCode.get("RENDER") : null);
        const metrics = deriveStageMetrics(summary);
        return {
          ...stage,
          metrics,
          visual: deriveStageVisual(metrics),
          isActive: normalizeStageCode(stage.code) === normalizedActiveStageCode
        };
      });
    },
    [normalizedActiveStageCode, overview, summaryByCode]
  );
  const activeIndex = stageItems.findIndex((stage) => stage.isActive);
  const hoveredStage = stageItems.find((stage) => stage.code === hoveredStageCode);

  useEffect(() => {
    if (!projectId || activeIndex < 0) return undefined;

    function handleKeyDown(event) {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;

      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (activeIndex + direction + stageItems.length) % stageItems.length;
      const nextStage = stageItems[nextIndex];
      if (!nextStage) return;

      navigate(buildStageWorkspacePath(projectId, nextStage.slug), { state: resolvedNavigationState });
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, navigate, projectId, resolvedNavigationState, stageItems]);

  return (
    <section className={`${sticky ? "sticky top-[84px] z-[35] sm:top-[76px]" : ""} ${className}`.trim()}>
      <div className="border-y border-slate-200/80 bg-white/95 shadow-sm shadow-slate-200/70 backdrop-blur-xl">
        <div className="flex items-center justify-between px-3 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">Pipeline Quick Access</p>
          {hoveredStage ? (
            <div className="hidden items-center gap-2 text-[11px] text-slate-500 md:flex">
              <span className="font-semibold text-slate-800">{hoveredStage.label}</span>
              <span>{hoveredStage.metrics.total} total</span>
              <span>{hoveredStage.metrics.inProgress} IP</span>
              <span>{hoveredStage.metrics.delayed} delayed</span>
              <span>{hoveredStage.metrics.pending} approvals</span>
            </div>
          ) : null}
        </div>

        <div className="relative">
          <div className="pointer-events-none absolute bottom-0 left-0 top-0 w-6 bg-gradient-to-r from-white via-white/95 to-transparent" />
          <div className="pointer-events-none absolute bottom-0 right-0 top-0 w-6 bg-gradient-to-l from-white via-white/95 to-transparent" />

          <div className="overflow-x-auto px-3 pb-2 pt-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <ul className="flex min-w-max items-center gap-1.5">
              {stageItems.map((stage, index) => {
                const link = buildStageWorkspacePath(projectId, stage.slug);
                const Icon = stage.Icon || Layers3;

                return (
                  <li key={stage.code} className="group relative flex items-center gap-1.5">
                    <Link
                      to={link}
                      state={resolvedNavigationState}
                      aria-current={stage.isActive ? "page" : undefined}
                      title={`${stage.label}: ${stage.metrics.total} total, ${stage.metrics.completed} completed, ${stage.metrics.inProgress} in progress, ${stage.metrics.delayed} delayed, ${stage.metrics.artists} artists, ${stage.metrics.pending} pending approvals`}
                      onMouseEnter={() => setHoveredStageCode(stage.code)}
                      onFocus={() => setHoveredStageCode(stage.code)}
                      onMouseLeave={() => setHoveredStageCode("")}
                      onBlur={() => setHoveredStageCode("")}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition duration-200 ${
                        stage.isActive
                          ? "border-blue-500 bg-slate-950 text-white shadow-lg shadow-blue-500/20 ring-1 ring-blue-400/40"
                          : `${stage.visual.border} ${stage.visual.soft} text-slate-800 hover:border-slate-400 hover:bg-white hover:shadow-sm`
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className={`h-2 w-2 rounded-full ${stage.isActive ? "bg-white" : stage.visual.dot}`} />
                      <span>{stage.label}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${stage.isActive ? "bg-white/15 text-white" : "bg-white/80 text-slate-700"}`}>
                        {stage.metrics.active}
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-[0.1em] ${stage.isActive ? "text-blue-100" : stage.visual.text}`}>
                        {stage.visual.label}
                      </span>
                    </Link>

                    {index < stageItems.length - 1 ? <ArrowRight className="h-3.5 w-3.5 text-slate-300" /> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

export default memo(PipelineQuickStageBar);
