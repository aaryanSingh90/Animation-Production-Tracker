export const STATUS_META = {
  YTS: {
    shortKey: "YTS",
    label: "Yet To Start",
    background: "#E2E8F0",
    text: "#334155",
    border: "#CBD5E1",
    dot: "#64748B"
  },
  IP: {
    shortKey: "IP",
    label: "In Progress",
    background: "#2563EB",
    text: "#FFFFFF",
    border: "#1D4ED8",
    dot: "#BFDBFE"
  },
  TEST: {
    shortKey: "TEST",
    label: "Test Shot",
    background: "#7C3AED",
    text: "#FFFFFF",
    border: "#6D28D9",
    dot: "#DDD6FE"
  },
  DONE: {
    shortKey: "DONE",
    label: "Done",
    background: "#0F766E",
    text: "#FFFFFF",
    border: "#115E59",
    dot: "#99F6E4"
  },
  APPROVED: {
    shortKey: "APPROVED",
    label: "Lead Approval",
    background: "#16A34A",
    text: "#FFFFFF",
    border: "#15803D",
    dot: "#BBF7D0"
  },
  RTK: {
    shortKey: "RTK",
    label: "Lead Retake",
    background: "#EA580C",
    text: "#FFFFFF",
    border: "#C2410C",
    dot: "#FED7AA"
  },
  FINAL: {
    shortKey: "FINAL",
    label: "Final Approval",
    background: "#FACC15",
    text: "#111827",
    border: "#EAB308",
    dot: "#FEF08A"
  },
  LATE: {
    shortKey: "LATE",
    label: "Late",
    background: "#B91C1C",
    text: "#FFFFFF",
    border: "#991B1B",
    dot: "#FCA5A5"
  }
};

export const LEGACY_STATUS_MAP = {
  NOT_STARTED: "YTS",
  IN_PROGRESS: "IP",
  SUBMITTED: "TEST",
  APPROVED: "APPROVED",
  REJECTED: "RTK",
  REVISION_REQUIRED: "RTK",
  ISSUE: "LATE",
  EXTENDED: "IP"
};

export const STAGE_STATUSES = ["YTS", "IP", "TEST", "DONE", "APPROVED", "RTK", "FINAL", "LATE"];
export const STATUS_COLORS = Object.fromEntries(
  Object.entries(STATUS_META).map(([key, value]) => [key, value.background])
);

export const COMPLETE_STATUSES = ["DONE", "APPROVED", "FINAL"];
export const APPROVED_STATUSES = ["APPROVED", "FINAL"];
export const PENDING_APPROVAL_STATUSES = ["TEST", "DONE"];
export const ACTIVE_STATUSES = ["YTS", "IP", "TEST", "DONE", "RTK", "LATE"];

export function normalizeStatus(status, fallback = "YTS") {
  if (!status) return fallback;
  return LEGACY_STATUS_MAP[status] || status;
}

export function getStatusMeta(status) {
  const normalized = normalizeStatus(status);
  return STATUS_META[normalized] || STATUS_META.YTS;
}

export function getStatusLabel(status) {
  return getStatusMeta(status).label;
}

export function getStatusOptionLabel(status) {
  const meta = getStatusMeta(status);
  return `${meta.shortKey} • ${meta.label}`;
}

export function isCompleteStatus(status) {
  return COMPLETE_STATUSES.includes(normalizeStatus(status));
}

export function isApprovedStatus(status) {
  return APPROVED_STATUSES.includes(normalizeStatus(status));
}

export function isPendingReviewStatus(status) {
  return PENDING_APPROVAL_STATUSES.includes(normalizeStatus(status));
}

export function isRetakeStatus(status) {
  return normalizeStatus(status) === "RTK";
}

export function isLateStatus(status, deadline) {
  const normalized = normalizeStatus(status);
  if (normalized === "LATE") return true;
  if (!deadline) return false;
  if (isCompleteStatus(normalized)) return false;
  return new Date(deadline) < new Date();
}

export const PROJECT_STAGES = [
  "ANIMATICS",
  "AUDIO",
  "MODELLING",
  "UNWRAPPING",
  "TEXTURING",
  "RIGGING",
  "ANIMATION",
  "FX",
  "LIGHTING",
  "COMPOSITING",
  "EDITING",
  "CHARACTER_MODELLING",
  "BLENDSHAPES",
  "BG_MODELLING",
  "RENDER"
];

export const CHARACTER_STAGES = ["REFERENCE", "MODELLING", "BLENDSHAPES", "TEXTURING", "RIGGING"];

export const MANAGER_ROLES = ["BOSS", "PRODUCTION_MANAGER", "COORDINATOR"];

export const ISSUE_TYPES = [
  "TECHNICAL",
  "SOFTWARE_CRASH",
  "ASSET_MISSING",
  "HARDWARE_FAILURE",
  "ARTIST_UNAVAILABLE",
  "OTHER"
];
