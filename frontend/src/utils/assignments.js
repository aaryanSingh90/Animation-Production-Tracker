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
