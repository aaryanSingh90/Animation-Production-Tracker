import { format, formatDistanceToNow } from "date-fns";
import { getStatusLabel, normalizeStatus } from "./constants";

export function formatDate(value) {
  if (!value) return "-";
  return format(new Date(value), "dd/MM/yyyy");
}

export function formatDateInput(value) {
  if (!value) return "";
  return format(new Date(value), "yyyy-MM-dd");
}

export function formatDateTimeInput(value) {
  if (!value) return "";
  return format(new Date(value), "yyyy-MM-dd'T'HH:mm");
}

export function formatRelative(value) {
  if (!value) return "";
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

export function labelize(value) {
  if (!value) return "";
  const normalizedStatus = normalizeStatus(value, "");
  if (normalizedStatus && normalizedStatus !== value) {
    return getStatusLabel(normalizedStatus);
  }
  if (["YTS", "IP", "TEST", "DONE", "APPROVED", "RTK", "FINAL", "LATE"].includes(value)) {
    return getStatusLabel(value);
  }
  if (value === "COMPOSITING") return "Composite";
  if (value === "RENDER" || value === "RENDERING") return "Rendering";
  return value.replaceAll("_", " ");
}

export function initials(name = "") {
  const parts = name.split(" ").filter(Boolean);
  return (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
}

export function formatDurationMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return "-";
  if (minutes < 60) return `${minutes} min`;

  const totalHours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (totalHours < 24) {
    return remainingMinutes ? `${totalHours} hr ${remainingMinutes} min` : `${totalHours} hr`;
  }

  const days = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;
  if (remainingHours > 0) {
    return `${days} day${days === 1 ? "" : "s"} ${remainingHours} hr`;
  }
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function getDepartmentLabel(user) {
  if (!user) return "-";
  if (typeof user.department === "string" && user.department) return user.department;
  if (user.departmentInfo?.name) return user.departmentInfo.name;
  if (user.department?.name) return user.department.name;
  if (user.departmentName) return user.departmentName;
  return "-";
}

export function getStageDisplayName(stage) {
  if (!stage) return "Stage";
  if (stage.customName) return stage.customName;
  if (stage.stageTemplate?.name) return stage.stageTemplate.name;
  if (stage.stageDefinition?.name) return stage.stageDefinition.name;
  return labelize(stage.stageName || "Stage");
}
