import { Box, Clapperboard, Film, Layers3, MonitorCheck, Music2, Paintbrush, Scissors, Sparkles, Sun, Wrench } from "lucide-react";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
const FALLBACK_TOPBAR_HEIGHT = 84;
const FALLBACK_BAR_HEIGHT = 56;

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
      label: `${metrics.delayed} delayed`,
      dot: "bg-rose-500",
      text: "text-rose-700",
      border: "border-rose-200"
    };
  }
  if (metrics.pending > 0) {
    return {
      label: `${metrics.pending} pending`,
      dot: "bg-amber-400",
      text: "text-amber-700",
      border: "border-amber-200"
    };
  }
  if (metrics.progress >= 100 && metrics.total > 0) {
    return {
      label: "approved",
      dot: "bg-emerald-500",
      text: "text-emerald-700",
      border: "border-emerald-200"
    };
  }
  if (metrics.inProgress > 0 || metrics.progress > 0) {
    return {
      label: `${metrics.progress}%`,
      dot: "bg-sky-500",
      text: "text-sky-700",
      border: "border-sky-200"
    };
  }
  return {
    label: "queued",
    dot: "bg-slate-400",
    text: "text-slate-600",
    border: "border-slate-200"
  };
}

function PipelineQuickStageBar({
  projectId,
  overview,
  activeStageCode = "",
  navigationState,
  sticky = true,
  className = "",
  onLayoutChange
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const barRef = useRef(null);
  const normalizedActiveStageCode = normalizeStageCode(activeStageCode);
  const resolvedNavigationState = navigationState ?? location.state;
  const [stickyTop, setStickyTop] = useState(FALLBACK_TOPBAR_HEIGHT);

  const summaryByCode = useMemo(() => {
    const map = new Map();
    for (const summary of overview?.stageSummaries || []) {
      const code = normalizeStageCode(summary?.stageCode);
      if (!code) continue;
      map.set(code, summary);
    }
    return map;
  }, [overview]);

  const stageItems = useMemo(() => {
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
  }, [normalizedActiveStageCode, overview, summaryByCode]);

  const activeIndex = stageItems.findIndex((stage) => stage.isActive);

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

  useLayoutEffect(() => {
    if (typeof window === "undefined") return undefined;

    const topbarNode = document.querySelector("[data-app-topbar='true']");
    let frameId = null;

    const syncLayout = () => {
      const measuredTop = Math.round(topbarNode?.getBoundingClientRect?.().height || FALLBACK_TOPBAR_HEIGHT);
      const nextTop = measuredTop > 0 ? measuredTop : FALLBACK_TOPBAR_HEIGHT;
      const measuredBarHeight = Math.round(barRef.current?.getBoundingClientRect?.().height || FALLBACK_BAR_HEIGHT);
      const nextBarHeight = measuredBarHeight > 0 ? measuredBarHeight : FALLBACK_BAR_HEIGHT;

      setStickyTop((previous) => (previous === nextTop ? previous : nextTop));
      onLayoutChange?.({
        stickyTop: nextTop,
        barHeight: nextBarHeight
      });
    };

    const requestSync = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(syncLayout);
    };

    requestSync();

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(requestSync) : null;
    if (observer && topbarNode) observer.observe(topbarNode);
    if (observer && barRef.current) observer.observe(barRef.current);
    window.addEventListener("resize", requestSync);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      observer?.disconnect();
      window.removeEventListener("resize", requestSync);
    };
  }, [onLayoutChange, stageItems.length]);

  return (
    <section
      ref={barRef}
      className={`${sticky ? "sticky z-[25]" : ""} ${className}`.trim()}
      style={sticky ? { top: `${stickyTop}px` } : undefined}
    >
      <div className="rounded-2xl border border-slate-200/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] shadow-[0_8px_18px_-18px_rgba(15,23,42,0.45)] backdrop-blur">
        <div className="flex h-[56px] items-center gap-3 px-3 sm:px-4 lg:px-5">
          <div className="hidden shrink-0 border-r border-slate-200/80 pr-3 sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Pipeline Quick Access</p>
            <p className="text-[11px] text-slate-500">Project navigation</p>
          </div>

          <div className="relative min-w-0 flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-4 bg-gradient-to-r from-slate-50 via-slate-50/90 to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-4 bg-gradient-to-l from-slate-50 via-slate-50/90 to-transparent" />

            <div className="overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <ul className="flex min-w-max items-center gap-1.5 py-1">
                {stageItems.map((stage) => {
                  const link = buildStageWorkspacePath(projectId, stage.slug);
                  const Icon = stage.Icon || Layers3;

                  return (
                    <li key={stage.code}>
                      <Link
                        to={link}
                        state={resolvedNavigationState}
                        aria-current={stage.isActive ? "page" : undefined}
                        title={`${stage.label}: ${stage.metrics.total} total, ${stage.metrics.completed} completed, ${stage.metrics.inProgress} in progress, ${stage.metrics.delayed} delayed, ${stage.metrics.artists} artists, ${stage.metrics.pending} pending approvals`}
                        className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition duration-200 ${
                          stage.isActive
                            ? "border-sky-300 bg-sky-50 text-sky-950 shadow-[0_0_0_1px_rgba(186,230,253,0.9),0_10px_24px_-20px_rgba(14,165,233,0.95)]"
                            : `${stage.visual.border} bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50`
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className={`h-2 w-2 shrink-0 rounded-full ${stage.isActive ? "bg-sky-500" : stage.visual.dot}`} />
                        <span className="max-w-[10rem] truncate whitespace-nowrap">{stage.label}</span>
                        <span
                          className={`hidden rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] sm:inline ${
                            stage.isActive ? "border-sky-200 bg-white text-sky-700" : "border-slate-200 bg-slate-50 text-slate-600"
                          } ${stage.isActive ? "" : stage.visual.text}`}
                        >
                          {stage.visual.label}
                        </span>
                        <span
                          className={`inline-flex min-w-[1.8rem] items-center justify-center rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${
                            stage.isActive ? "border-sky-200 bg-white text-sky-700" : "border-slate-200 bg-slate-50 text-slate-700"
                          }`}
                        >
                          {stage.metrics.total}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default memo(PipelineQuickStageBar);
