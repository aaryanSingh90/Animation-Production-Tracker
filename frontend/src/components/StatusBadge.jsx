import clsx from "clsx";
import { memo } from "react";
import { getStatusMeta, getStatusOptionLabel, normalizeStatus } from "../utils/constants";

function StatusBadge({ status }) {
  const normalized = normalizeStatus(status);
  const meta = getStatusMeta(normalized);

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] transition-transform duration-150 hover:-translate-y-px",
        "shadow-sm"
      )}
      style={{
        backgroundColor: meta.background,
        color: meta.text,
        borderColor: meta.border
      }}
      title={getStatusOptionLabel(normalized)}
    >
      {getStatusOptionLabel(normalized)}
    </span>
  );
}

export default memo(StatusBadge);
