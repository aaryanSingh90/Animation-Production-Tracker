import { memo } from "react";
import { STATUS_COLORS } from "../utils/constants";
import { getStageDisplayName, formatDate } from "../utils/format";

function StageStrip({ stages }) {
  const activeStages = (stages || [])
    .filter((stage) => stage.isActive !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (!activeStages.length) {
    return <div className="h-3 rounded bg-slate-100" />;
  }

  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${activeStages.length}, minmax(0, 1fr))` }}>
      {activeStages.map((stage) => {
        const commentCount = stage?._count?.comments || 0;
        return (
          <div
            key={stage.id}
            className="relative h-3 rounded"
            style={{ backgroundColor: STATUS_COLORS[stage.status] || "#6B7280" }}
            title={`${getStageDisplayName(stage)} · ${stage.status.replaceAll("_", " ")}${stage.deadline ? ` · ${formatDate(stage.deadline)}` : ""}${commentCount ? ` · ${commentCount} comment${commentCount > 1 ? "s" : ""}` : ""}`}
          >
            {commentCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[8px] font-bold leading-none text-white">
                {commentCount > 9 ? "9+" : commentCount}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default memo(StageStrip);
