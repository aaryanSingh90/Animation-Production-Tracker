import { format, formatDistanceToNow } from "date-fns";

export function formatDate(value) {
  if (!value) return "-";
  return format(new Date(value), "dd/MM/yyyy");
}

export function formatDateInput(value) {
  if (!value) return "";
  return format(new Date(value), "yyyy-MM-dd");
}

export function formatRelative(value) {
  if (!value) return "";
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

export function labelize(value) {
  if (!value) return "";
  if (value === "COMPOSITING") return "Composite";
  if (value === "RENDER" || value === "RENDERING") return "Rendering";
  return value.replaceAll("_", " ");
}

export function initials(name = "") {
  const parts = name.split(" ").filter(Boolean);
  return (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
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
