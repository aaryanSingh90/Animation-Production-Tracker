import clsx from "clsx";
import { memo } from "react";

function ProgressBar({ value }) {
  const width = Math.max(0, Math.min(100, Number(value) || 0));
  const tone = width > 75 ? "bg-emerald-500" : width >= 40 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
        <span>Progress</span>
        <span>{width.toFixed(0)}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
        <div className={clsx("h-full rounded-full transition-all", tone)} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default memo(ProgressBar);
