export const EMPLOYEE_AVAILABILITY_META = {
  AVAILABLE: {
    label: "Available",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500"
  },
  BUSY: {
    label: "Busy",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-500"
  },
  OVERLOADED: {
    label: "Overloaded",
    tone: "border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-500"
  },
  LATE: {
    label: "Late",
    tone: "border-orange-200 bg-orange-50 text-orange-700",
    dot: "bg-orange-500"
  },
  OFFLINE: {
    label: "Offline",
    tone: "border-slate-200 bg-slate-100 text-slate-600",
    dot: "bg-slate-400"
  },
  ON_LEAVE: {
    label: "On Leave",
    tone: "border-violet-200 bg-violet-50 text-violet-700",
    dot: "bg-violet-500"
  }
};

export function getEmployeeAvailabilityMeta(status) {
  return EMPLOYEE_AVAILABILITY_META[status] || EMPLOYEE_AVAILABILITY_META.AVAILABLE;
}

export function formatEmployeeAvailabilityLabel(status) {
  return getEmployeeAvailabilityMeta(status).label;
}

export function getWorkloadTone(percent) {
  const value = Number(percent || 0);
  if (value >= 85) {
    return {
      bar: "bg-rose-500",
      rail: "bg-rose-100",
      text: "text-rose-700"
    };
  }

  if (value >= 60) {
    return {
      bar: "bg-amber-500",
      rail: "bg-amber-100",
      text: "text-amber-700"
    };
  }

  return {
    bar: "bg-emerald-500",
    rail: "bg-emerald-100",
    text: "text-emerald-700"
  };
}

export function getOverloadWarning(summary) {
  if (!summary) return "";
  if (summary.liveStatus === "OVERLOADED") {
    return `This artist already has ${summary.activeTasks || 0} active tasks.`;
  }
  if (summary.liveStatus === "LATE" && summary.lateTasks > 0) {
    return `This artist has ${summary.lateTasks} late task${summary.lateTasks === 1 ? "" : "s"}.`;
  }
  return "";
}
