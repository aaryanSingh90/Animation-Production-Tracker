import { PROJECT_STAGES, STATUS_COLORS } from "../utils/constants";

export default function StageStrip({ stages }) {
  const byStage = new Map((stages || []).map((stage) => [stage.stageName, stage]));

  return (
    <div className="grid grid-cols-12 gap-1">
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
