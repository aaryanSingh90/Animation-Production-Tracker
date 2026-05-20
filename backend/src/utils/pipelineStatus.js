const PIPELINE_STATUSES = ["YTS", "IP", "TEST", "DONE", "APPROVED", "RTK", "FINAL", "LATE"];

const LEGACY_STATUS_MAP = {
  NOT_STARTED: "YTS",
  IN_PROGRESS: "IP",
  SUBMITTED: "TEST",
  APPROVED: "APPROVED",
  REJECTED: "RTK",
  REVISION_REQUIRED: "RTK",
  ISSUE: "LATE",
  EXTENDED: "IP"
};

const STATUS_LABELS = {
  YTS: "Yet To Start",
  IP: "In Progress",
  TEST: "Test Shot",
  DONE: "Done",
  APPROVED: "Lead Approval",
  RTK: "Lead Retake",
  FINAL: "Final Approval",
  LATE: "Late"
};

const COMPLETED_STATUSES = new Set(["DONE", "APPROVED", "FINAL"]);
const APPROVAL_SUCCESS_STATUSES = new Set(["APPROVED", "FINAL"]);
const PENDING_REVIEW_STATUSES = new Set(["TEST", "DONE"]);
const ACTIVE_STAGE_STATUSES = ["YTS", "IP", "TEST", "DONE", "RTK", "LATE"];
const ARTIST_MUTABLE_STATUSES = new Set(["IP", "TEST", "DONE"]);

function normalizePipelineStatus(value, fallback = "YTS") {
  if (!value) return fallback;
  return LEGACY_STATUS_MAP[value] || value;
}

function getStatusLabel(value) {
  return STATUS_LABELS[normalizePipelineStatus(value)] || normalizePipelineStatus(value);
}

function isPendingReviewStatus(value) {
  return PENDING_REVIEW_STATUSES.has(normalizePipelineStatus(value));
}

function isApprovedStatus(value) {
  return APPROVAL_SUCCESS_STATUSES.has(normalizePipelineStatus(value));
}

function isCompleteStatus(value) {
  return COMPLETED_STATUSES.has(normalizePipelineStatus(value));
}

function isRetakeStatus(value) {
  return normalizePipelineStatus(value) === "RTK";
}

function isActiveStatus(value) {
  return ACTIVE_STAGE_STATUSES.includes(normalizePipelineStatus(value));
}

function isLateStatus(value, deadline) {
  const normalized = normalizePipelineStatus(value);
  if (normalized === "LATE") return true;
  if (!deadline) return false;
  if (isCompleteStatus(normalized)) return false;
  return new Date(deadline) < new Date();
}

function withAutoLate(value, deadline) {
  const normalized = normalizePipelineStatus(value);
  if (isLateStatus(normalized, deadline)) return "LATE";
  return normalized;
}

module.exports = {
  ACTIVE_STAGE_STATUSES,
  ARTIST_MUTABLE_STATUSES,
  COMPLETED_STATUSES,
  LEGACY_STATUS_MAP,
  PIPELINE_STATUSES,
  STATUS_LABELS,
  getStatusLabel,
  isActiveStatus,
  isApprovedStatus,
  isCompleteStatus,
  isLateStatus,
  isPendingReviewStatus,
  isRetakeStatus,
  normalizePipelineStatus,
  withAutoLate
};
