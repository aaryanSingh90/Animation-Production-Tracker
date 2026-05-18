import clsx from "clsx";
import { memo } from "react";
import { STATUS_COLORS } from "../utils/constants";
import { labelize } from "../utils/format";

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || "#64748B";

  return (
    <span
      className={clsx(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white",
        "shadow-sm"
      )}
      style={{ backgroundColor: color }}
    >
      {labelize(status)}
    </span>
  );
}

export default memo(StatusBadge);
