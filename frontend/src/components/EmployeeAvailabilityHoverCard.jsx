import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BriefcaseBusiness, Clock3, FolderKanban, TriangleAlert } from "lucide-react";
import { getDepartmentLabel, initials } from "../utils/format";
import {
  formatEmployeeAvailabilityLabel,
  getEmployeeAvailabilityMeta,
  getOverloadWarning,
  getWorkloadTone
} from "../utils/employeeAvailability";

function formatMetaDate(value) {
  if (!value) return "--";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return "--";
  }
}

function EmployeeAvailabilityCard({ user, summary, roleLabel, compact = false }) {
  const availabilityMeta = getEmployeeAvailabilityMeta(summary?.liveStatus || user?.availabilityStatus || "AVAILABLE");
  const workloadTone = getWorkloadTone(summary?.workloadPercent || 0);
  const warning = getOverloadWarning(summary);
  const visibleProjects = summary?.currentProjects || [];

  return (
    <div className={`overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/10 ${compact ? "w-full" : "w-[340px]"}`}>
      <div className="border-b border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-4 py-4 text-white">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-sm font-bold text-white">
            {initials(user?.name || "U")}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{user?.name || "Unknown artist"}</p>
            <p className="mt-0.5 truncate text-sm text-slate-300">{getDepartmentLabel(user)}</p>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">{roleLabel || "Artist"}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${availabilityMeta.tone}`}>
            <span className={`h-2 w-2 rounded-full ${availabilityMeta.dot}`} />
            {formatEmployeeAvailabilityLabel(summary?.liveStatus || user?.availabilityStatus || "AVAILABLE")}
          </span>
          <span className={`text-xs font-semibold ${workloadTone.text}`}>{summary?.workloadPercent || 0}% workload</span>
        </div>

        <div className={`h-2 overflow-hidden rounded-full ${workloadTone.rail}`}>
          <div className={`h-full rounded-full ${workloadTone.bar}`} style={{ width: `${Math.min(100, Number(summary?.workloadPercent || 0))}%` }} />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Assigned Projects</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{summary?.assignedProjects || 0}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Active Tasks</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{summary?.activeTasks || 0}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Late Tasks</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{summary?.lateTasks || 0}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Pending Reviews</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{summary?.pendingReviews || 0}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:col-span-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Final Approvals</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{summary?.finalApprovals || 0}</p>
          </div>
        </div>

        {warning ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            <div className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{warning}</p>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Current Active Projects</p>
          {visibleProjects.length ? (
            <div className="space-y-2">
              {visibleProjects.map((project) => (
                <div key={project.projectId} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <FolderKanban className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{project.projectName}</p>
                      <div className="mt-1 space-y-1 text-xs text-slate-600">
                        {project.tasks.map((task) => (
                          <p key={`${project.projectId}-${task}`}>• {task}</p>
                        ))}
                        {project.hiddenTaskCount ? <p>+{project.hiddenTaskCount} more</p> : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {summary?.hiddenProjectCount ? (
                <p className="text-xs text-slate-500">+{summary.hiddenProjectCount} more project{summary.hiddenProjectCount === 1 ? "" : "s"}</p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-500">
              No active project load right now.
            </div>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Active Since</p>
            <p className="mt-1 text-xs font-semibold text-slate-900">{formatMetaDate(summary?.activeSince)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Expected Free</p>
            <p className="mt-1 text-xs font-semibold text-slate-900">{formatMetaDate(summary?.expectedFreeDate)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Last Completed</p>
            <p className="mt-1 text-xs font-semibold text-slate-900">{summary?.lastCompletedTask?.label || "--"}</p>
          </div>
        </div>

        {summary?.lastCompletedTask?.completedAt ? (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock3 className="h-3.5 w-3.5" />
            <span>{summary.lastCompletedTask.projectName || "Project"} · {formatMetaDate(summary.lastCompletedTask.completedAt)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function EmployeeAvailabilityHoverCard({
  user,
  summary,
  roleLabel,
  children,
  className = "",
  compact = false
}) {
  const triggerRef = useRef(null);
  const cardRef = useRef(null);
  const closeTimeoutRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, mobile: false });

  const cardContent = useMemo(() => {
    if (!user) return null;
    return <EmployeeAvailabilityCard user={user} summary={summary} roleLabel={roleLabel} compact={position.mobile || compact} />;
  }, [compact, position.mobile, roleLabel, summary, user]);

  useEffect(() => {
    if (!open) return undefined;

    function updatePosition() {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const mobile = window.innerWidth < 768;
      const cardWidth = Math.min(340, window.innerWidth - 24);
      const nextTop = mobile ? window.innerHeight - 24 : Math.min(window.innerHeight - 24, rect.bottom + 12);
      const left = mobile ? 12 : Math.max(12, Math.min(rect.left, window.innerWidth - cardWidth - 12));

      setPosition({
        top: nextTop,
        left,
        mobile
      });
    }

    function handleEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }

    function handleOutside(event) {
      if (triggerRef.current?.contains(event.target)) return;
      if (cardRef.current?.contains(event.target)) return;
      setOpen(false);
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  function openCard() {
    if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
    setOpen(true);
  }

  function closeCard() {
    if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = window.setTimeout(() => setOpen(false), 120);
  }

  return (
    <>
      <span
        ref={triggerRef}
        className={className}
        onMouseEnter={openCard}
        onMouseLeave={closeCard}
        onFocus={openCard}
        onBlur={closeCard}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        {children}
      </span>

      {open && cardContent
        ? createPortal(
            position.mobile ? (
              <div className="fixed inset-0 z-[90] bg-slate-950/30 px-3 pb-3 pt-16 backdrop-blur-[2px]">
                <div className="mx-auto max-w-md rounded-[28px]" onMouseEnter={openCard} onMouseLeave={closeCard}>
                  <div ref={cardRef}>
                    {cardContent}
                  </div>
                </div>
              </div>
            ) : (
              <div
                ref={cardRef}
                className="fixed z-[90]"
                style={{
                  top: position.top,
                  left: position.left,
                  maxWidth: "calc(100vw - 24px)"
                }}
                onMouseEnter={openCard}
                onMouseLeave={closeCard}
              >
                {cardContent}
              </div>
            ),
            document.body
          )
        : null}
    </>
  );
}

export default EmployeeAvailabilityCard;
