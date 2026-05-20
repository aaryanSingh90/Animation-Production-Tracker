const prisma = require('./prisma');
const { createNotification } = require('./notifications');

const TASK_ASSIGNMENT_INCLUDE = {
  taskAssignments: {
    include: {
      employee: {
        select: {
          id: true,
          name: true,
          employmentType: true,
          departmentId: true,
          departmentName: true,
          department: {
            select: {
              id: true,
              name: true,
              color: true
            }
          }
        }
      },
      department: {
        select: {
          id: true,
          name: true,
          color: true
        }
      },
      assignedBy: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: [{ roleType: 'asc' }, { assignedAt: 'asc' }]
  }
};

function normalizeAssignmentsInput(assignments = [], fallbackAssignedUserId = null, users = []) {
  const usersById = new Map(users.map((user) => [user.id, user]));
  const normalized = [];
  const seen = new Set();

  for (const input of Array.isArray(assignments) ? assignments : []) {
    const employeeId = Number(input.employeeId || input.userId || 0);
    if (!Number.isInteger(employeeId) || employeeId <= 0 || seen.has(employeeId)) continue;
    seen.add(employeeId);

    const employee = usersById.get(employeeId);
    normalized.push({
      employeeId,
      departmentId: input.departmentId || employee?.departmentId || null,
      roleType: input.roleType === 'SUPPORT' ? 'SUPPORT' : 'LEAD'
    });
  }

  if (!normalized.length && fallbackAssignedUserId) {
    const employeeId = Number(fallbackAssignedUserId);
    const employee = usersById.get(employeeId);
    if (Number.isInteger(employeeId) && employeeId > 0) {
      normalized.push({
        employeeId,
        departmentId: employee?.departmentId || null,
        roleType: 'LEAD'
      });
    }
  }

  let leadAssigned = false;
  const withRoles = normalized.map((assignment) => {
    if (assignment.roleType === 'LEAD' && !leadAssigned) {
      leadAssigned = true;
      return assignment;
    }
    return {
      ...assignment,
      roleType: 'SUPPORT'
    };
  });

  if (!leadAssigned && withRoles.length) {
    withRoles[0] = {
      ...withRoles[0],
      roleType: 'LEAD'
    };
  }

  return withRoles;
}

function getPrimaryAssignment(assignments = []) {
  return assignments.find((assignment) => assignment.roleType === 'LEAD') || assignments[0] || null;
}

function getAssignedEmployeeIds(record = {}, fallbackAssignedUserId = null) {
  const ids = new Set();

  for (const assignment of Array.isArray(record.taskAssignments) ? record.taskAssignments : []) {
    const employeeId = Number(assignment?.employeeId || assignment?.employee?.id || 0);
    if (Number.isInteger(employeeId) && employeeId > 0) ids.add(employeeId);
  }

  const fallbackId = Number(record.assignedUserId || record.assignedUser?.id || fallbackAssignedUserId || 0);
  if (Number.isInteger(fallbackId) && fallbackId > 0) ids.add(fallbackId);

  return Array.from(ids);
}

async function syncTaskAssignments({
  resourceType,
  recordId,
  projectId,
  assignments,
  fallbackAssignedUserId,
  assignedById,
  parentModel,
  include
}) {
  const users = await prisma.user.findMany({
    where: {
      id: {
        in: Array.from(
          new Set(
            [fallbackAssignedUserId, ...(Array.isArray(assignments) ? assignments.map((item) => item.employeeId || item.userId) : [])]
              .map((value) => Number(value || 0))
              .filter((value) => Number.isInteger(value) && value > 0)
          )
        )
      },
      isActive: true
    },
    select: {
      id: true,
      name: true,
      departmentId: true,
      departmentName: true,
      employmentType: true
    }
  });

  const normalizedAssignments = normalizeAssignmentsInput(assignments, fallbackAssignedUserId, users);
  const previousAssignments = await prisma.taskAssignment.findMany({
    where: {
      [`${resourceType}Id`]: recordId
    },
    select: {
      employeeId: true
    }
  });

  const primaryAssignment = getPrimaryAssignment(normalizedAssignments);
  const primaryEmployeeId = primaryAssignment?.employeeId || null;

  await prisma.$transaction(async (tx) => {
    await tx.taskAssignment.deleteMany({
      where: {
        [`${resourceType}Id`]: recordId
      }
    });

    if (normalizedAssignments.length) {
      await tx.taskAssignment.createMany({
        data: normalizedAssignments.map((assignment) => ({
          projectId,
          [`${resourceType}Id`]: recordId,
          departmentId: assignment.departmentId || null,
          employeeId: assignment.employeeId,
          roleType: assignment.roleType,
          assignedById: assignedById || null
        }))
      });
    }

    await tx[parentModel].update({
      where: { id: recordId },
      data: {
        assignedUserId: primaryEmployeeId
      }
    });
  });

  const nextAssignedIds = new Set(normalizedAssignments.map((assignment) => assignment.employeeId));
  const previousAssignedIds = new Set(previousAssignments.map((assignment) => assignment.employeeId));

  return {
    hydrated: await prisma[parentModel].findUnique({
      where: { id: recordId },
      include
    }),
    addedEmployeeIds: Array.from(nextAssignedIds).filter((id) => !previousAssignedIds.has(id))
  };
}

async function notifyTaskAssignmentUsers({ employeeIds = [], message, relatedProjectId = null }) {
  await Promise.all(
    employeeIds.map((userId) =>
      createNotification({
        userId,
        message,
        type: 'ASSIGNED',
        relatedProjectId
      })
    )
  );
}

module.exports = {
  TASK_ASSIGNMENT_INCLUDE,
  normalizeAssignmentsInput,
  syncTaskAssignments,
  notifyTaskAssignmentUsers,
  getPrimaryAssignment,
  getAssignedEmployeeIds
};
