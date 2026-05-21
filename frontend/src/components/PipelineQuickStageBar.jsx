import { ArrowRight } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { buildStageWorkspacePath, stageSlugFromCode } from "../utils/stageRouting";

const STAGE_ITEMS = [
  { code: "ANIMATICS", slug: "animatics", label: "Animatics" },
  { code: "MODELLING", slug: "modelling", label: "Modelling" },
  { code: "TEXTURING", slug: "texturing", label: "Texturing" },
  { code: "RIGGING", slug: "rigging", label: "Rigging" },
  { code: "UNWRAPPING", slug: "unwrapping", label: "Unwrapping" },
  { code: "ANIMATION", slug: "animation", label: "Animation" },
  { code: "FX", slug: "fx", label: "FX" },
  { code: "LIGHTING", slug: "lighting", label: "Lighting" },
  { code: "COMPOSITING", slug: "composite", label: "Compositing" },
  { code: "EDITING", slug: "editing", label: "Editing" },
  { code: "AUDIO", slug: "audio", label: "Audio" },
  { code: "RENDERING", slug: "rendering", label: "Final Output" }
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
    progress
  };
}

function deriveIndicator(metrics) {
  if (metrics.delayed > 0) {
    return {
      label: `${metrics.delayed} Delayed`,
      tone: "text-rose-600"
    };
  }
  if (metrics.pending > 0) {
    return {
      label: `${metrics.pending} Pending`,
      tone: "text-amber-600"
    };
  }
  if (metrics.progress >= 100 && metrics.total > 0) {
    return {
      label: "Approved",
      tone: "text-emerald-600"
    };
  }
  if (metrics.progress > 0) {
    return {
      label: `${metrics.progress}%`,
      tone: "text-slate-500"
    };
  }
  return {
    label: "Queued",
    tone: "text-slate-500"
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
      const configuredCodes = Array.isArray(overview?.project?.activeStageCodes)
        ? overview.project.activeStageCodes.map((code) => normalizeStageCode(code)).filter(Boolean)
        : [];
      const summaryCodes = (overview?.stageSummaries || []).map((summary) => normalizeStageCode(summary?.stageCode)).filter(Boolean);
      const codes = Array.from(new Set(configuredCodes.length ? configuredCodes : summaryCodes.length ? summaryCodes : STAGE_ITEMS.map((stage) => stage.code)));

      return codes.map((code) => {
        const meta = STAGE_META_BY_CODE.get(code) || {
          code,
          slug: stageSlugFromCode(code) || code.toLowerCase().replaceAll("_", "-"),
          label: code === "RENDERING" ? "Final Output" : code.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase())
        };
        const stage = {
          ...meta,
          code
        };
        const summary = summaryByCode.get(stage.code) || (stage.code === "RENDERING" ? summaryByCode.get("RENDER") : null);
        const metrics = deriveStageMetrics(summary);
        return {
          ...stage,
          metrics,
          indicator: deriveIndicator(metrics),
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
    <section className={`${sticky ? "sticky top-[120px] z-[25] sm:top-[96px]" : ""} ${className}`.trim()}>
      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-r from-white via-slate-50/90 to-white shadow-sm shadow-slate-200/60 backdrop-blur">
        <div className="flex items-center justify-between px-3 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Pipeline Quick Access</p>
          {hoveredStage ? (
            <div className="hidden items-center gap-2 text-[11px] text-slate-500 md:flex">
              <span className="font-semibold text-slate-800">{hoveredStage.label}</span>
              <span>{hoveredStage.metrics.total} total</span>
              <span>{hoveredStage.metrics.inProgress} IP</span>
              <span>{hoveredStage.metrics.delayed} delayed</span>
              <span>{hoveredStage.metrics.artists} artists</span>
            </div>
          ) : null}
        </div>

        <div className="relative">
          <div className="pointer-events-none absolute bottom-0 left-0 top-0 w-6 bg-gradient-to-r from-white via-white/95 to-transparent" />
          <div className="pointer-events-none absolute bottom-0 right-0 top-0 w-6 bg-gradient-to-l from-white via-white/95 to-transparent" />

          <div className="overflow-x-auto px-3 pb-3 pt-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <ul className="flex min-w-max items-center gap-1.5">
              {stageItems.map((stage, index) => {
                const link = buildStageWorkspacePath(projectId, stage.slug);

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
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition duration-200 ${
                        stage.isActive
                          ? "border-blue-400 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${stage.isActive ? "bg-white" : "bg-slate-300"}`} />
                      <span>{stage.label}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-[0.1em] ${stage.isActive ? "text-blue-100" : stage.indicator.tone}`}>
                        {stage.indicator.label}
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
