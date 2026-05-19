import { PROJECT_STAGES, STATUS_COLORS } from "../utils/constants";
import { memo } from "react";

function StageStrip({ stages }) {
  const byStage = new Map((stages || []).map((stage) => [stage.stageName, stage]));

  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${PROJECT_STAGES.length}, minmax(0, 1fr))` }}>
      {PROJECT_STAGES.map((stageName) => {
        const status = byStage.get(stageName)?.status || "NOT_STARTED";
        return (
          <div
            key={stageName}
            className="h-3 rounded"
            style={{ backgroundColor: STATUS_COLORS[status] }}
            title={`${stageName.replaceAll("_", " ")} - ${status.replaceAll("_", " ")}`}
          />
        );
      })}
    </div>
  );
}

export default memo(StageStrip);
