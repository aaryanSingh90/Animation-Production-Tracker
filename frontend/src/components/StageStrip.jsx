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
      {activeStages.map((stage) => (
        <div
          key={stage.id}
          className="h-3 rounded"
          style={{ backgroundColor: STATUS_COLORS[stage.status] || "#6B7280" }}
          title={`${getStageDisplayName(stage)} · ${stage.status.replaceAll("_", " ")}${stage.deadline ? ` · ${formatDate(stage.deadline)}` : ""}`}
        />
      ))}
    </div>
  );
}

export default memo(StageStrip);
