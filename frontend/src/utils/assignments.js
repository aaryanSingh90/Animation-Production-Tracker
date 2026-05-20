import { getDepartmentLabel } from "./format";
import { isDepartmentMatch } from "./stageDepartmentMap";

export function getEmploymentLabel(value) {
  return value === "FREELANCE" ? "Freelance" : "In-house";
}

export function getEmploymentBadgeClasses(value) {
  return value === "FREELANCE"
    ? "border-blue-200 bg-blue-50 text-blue-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export function getUserDepartmentName(user) {
  return getDepartmentLabel(user);
}

export function buildDepartmentOptions(users = [], recommendedDepartment = null) {
  const unique = new Map();

  if (recommendedDepartment) {
    unique.set(recommendedDepartment.toLowerCase(), recommendedDepartment);
  }

  for (const user of users) {
    const departmentName = getUserDepartmentName(user);
    if (!departmentName || departmentName === "-") continue;
    const key = departmentName.toLowerCase();
    if (!unique.has(key)) unique.set(key, departmentName);
  }

  return Array.from(unique.values()).sort((a, b) => a.localeCompare(b));
}

export function filterUsersByDepartment(users = [], departmentName = "") {
  if (!departmentName) return users;
  return users.filter((user) => isDepartmentMatch(departmentName, getUserDepartmentName(user)));
}

export function countUsersByDepartment(users = [], departmentName = "") {
  return filterUsersByDepartment(users, departmentName).length;
}

export function normalizeAssignmentList(source, fallbackAssignedUser = null) {
  if (Array.isArray(source)) {
    return source
      .map((assignment) => {
        const employee = assignment.employee || assignment.user || null;
        const employeeId = Number(assignment.employeeId || employee?.id || 0);
        if (!Number.isInteger(employeeId) || employeeId <= 0) return null;
        return {
          employeeId,
          roleType: assignment.roleType === "SUPPORT" ? "SUPPORT" : "LEAD",
          departmentId: assignment.departmentId || employee?.departmentId || null,
          employee,
          department: assignment.department || employee?.department || employee?.departmentInfo || null
        };
      })
      .filter(Boolean);
  }

  if (Array.isArray(source?.taskAssignments) && source.taskAssignments.length) {
    return normalizeAssignmentList(source.taskAssignments);
  }

  const assignedUser = source?.assignedUser || fallbackAssignedUser || null;
  if (assignedUser?.id) {
    return [
      {
        employeeId: assignedUser.id,
        roleType: "LEAD",
        departmentId: assignedUser.departmentId || null,
        employee: assignedUser,
        department: assignedUser.department || assignedUser.departmentInfo || null
      }
    ];
  }

  return [];
}

export function getLeadAssignment(source, fallbackAssignedUser = null) {
  const assignments = normalizeAssignmentList(source, fallbackAssignedUser);
  return assignments.find((assignment) => assignment.roleType === "LEAD") || assignments[0] || null;
}

export function sortUsersBySmartAvailability(users = [], summariesByUserId = {}, preferredDepartment = "") {
  function statusRank(status) {
    if (status === "AVAILABLE") return 0;
    if (status === "BUSY") return 1;
    if (status === "LATE") return 2;
    if (status === "OVERLOADED") return 3;
    if (status === "ON_LEAVE") return 4;
    if (status === "OFFLINE") return 5;
    return 6;
  }

  return [...users].sort((left, right) => {
    const leftDepartmentMatch = preferredDepartment && isDepartmentMatch(preferredDepartment, getUserDepartmentName(left)) ? 0 : 1;
    const rightDepartmentMatch = preferredDepartment && isDepartmentMatch(preferredDepartment, getUserDepartmentName(right)) ? 0 : 1;
    if (leftDepartmentMatch !== rightDepartmentMatch) return leftDepartmentMatch - rightDepartmentMatch;

    const leftSummary = summariesByUserId[Number(left.id)] || null;
    const rightSummary = summariesByUserId[Number(right.id)] || null;
    const leftStatusRank = statusRank(leftSummary?.liveStatus || left.availabilityStatus || "AVAILABLE");
    const rightStatusRank = statusRank(rightSummary?.liveStatus || right.availabilityStatus || "AVAILABLE");
    if (leftStatusRank !== rightStatusRank) return leftStatusRank - rightStatusRank;

    const leftPercent = Number(leftSummary?.workloadPercent || 0);
    const rightPercent = Number(rightSummary?.workloadPercent || 0);
    if (leftPercent !== rightPercent) return leftPercent - rightPercent;

    const leftActiveTasks = Number(leftSummary?.activeTasks || 0);
    const rightActiveTasks = Number(rightSummary?.activeTasks || 0);
    if (leftActiveTasks !== rightActiveTasks) return leftActiveTasks - rightActiveTasks;

    const leftTypeRank = left.employmentType === "INHOUSE" ? 0 : 1;
    const rightTypeRank = right.employmentType === "INHOUSE" ? 0 : 1;
    if (leftTypeRank !== rightTypeRank) return leftTypeRank - rightTypeRank;

    return String(left.name || "").localeCompare(String(right.name || ""));
  });
}
