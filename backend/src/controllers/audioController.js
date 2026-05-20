const prisma = require("../utils/prisma");
const { AppError, asyncHandler } = require("../utils/http");
const { MANAGER_ROLES } = require("../utils/constants");
const { recalculateProjectProgress } = require("../utils/progress");
const { normalizePipelineStatus } = require("../utils/pipelineStatus");
const { TASK_ASSIGNMENT_INCLUDE, syncTaskAssignments, notifyTaskAssignmentUsers } = require("../utils/taskAssignments");

function isManagerRole(role) {
  return MANAGER_ROLES.includes(role);
}

async function assertAudioProjectAccess(projectId, user) {
  const baseProject = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true }
  });

  if (!baseProject) {
    throw new AppError("Project not found", 404);
  }

  if (isManagerRole(user.role)) return;

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [
        {
          stages: {
            some: {
              isActive: true,
              OR: [
                { assignedUserId: user.id },
                {
                  assignments: {
                    some: { userId: user.id }
                  }
                }
              ]
            }
          }
        },
        {
          audioTasks: {
            some: {
              OR: [
                { assignedUserId: user.id },
                {
                  taskAssignments: {
                    some: {
                      employeeId: user.id
                    }
                  }
                }
              ]
            }
          }
        },
        {
          shots: {
            some: {
              stages: {
                some: {
                  OR: [{ assignedUserId: user.id }, { taskAssignments: { some: { employeeId: user.id } } }]
                }
              }
            }
          }
        },
        {
          assets: {
            some: {
              stages: {
                some: {
                  OR: [{ assignedUserId: user.id }, { taskAssignments: { some: { employeeId: user.id } } }]
                }
              }
            }
          }
        }
      ]
    },
    select: { id: true }
  });

  if (!project) {
    throw new AppError("Forbidden", 403);
  }
}

function buildAudioOrder(sortBy, sortDir) {
  switch (sortBy) {
    case "name":
      return [{ name: sortDir }, { order: "asc" }, { createdAt: "asc" }];
    case "status":
      return [{ status: sortDir }, { order: "asc" }, { createdAt: "asc" }];
    case "startDate":
      return [{ startDate: sortDir }, { order: "asc" }, { createdAt: "asc" }];
    case "endDate":
      return [{ endDate: sortDir }, { order: "asc" }, { createdAt: "asc" }];
    case "createdAt":
    default:
      return [{ createdAt: sortDir }, { order: "asc" }];
  }
}

async function hydrateAudioTask(id) {
  return prisma.audioTask.findUnique({
    where: { id },
    include: {
      assignedUser: {
        select: {
          id: true,
          name: true,
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
      ...TASK_ASSIGNMENT_INCLUDE
    }
  });
}

const listProjectAudio = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.id);
  const page = Number(req.query.page || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize || 50));
  const status = req.query.status;
  const artistId = req.query.artistId ? Number(req.query.artistId) : null;
  const search = req.query.search;
  const sortBy = String(req.query.sortBy || "createdAt");
  const sortDir = String(req.query.sortDir || "desc").toLowerCase() === "asc" ? "asc" : "desc";

  await assertAudioProjectAccess(projectId, req.user);

  const where = { projectId };
  if (status) where.status = status;
  if (artistId) {
    where.OR = [{ assignedUserId: artistId }, { taskAssignments: { some: { employeeId: artistId } } }];
  }
  if (search) {
    where.name = {
      contains: String(search),
      mode: "insensitive"
    };
  }

  const [total, items] = await Promise.all([
    prisma.audioTask.count({ where }),
    prisma.audioTask.findMany({
      where,
      include: {
        assignedUser: {
          select: {
            id: true,
            name: true,
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
        ...TASK_ASSIGNMENT_INCLUDE
      },
      orderBy: buildAudioOrder(sortBy, sortDir),
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);

  return res.json({
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    },
    items
  });
});

const createAudioTask = asyncHandler(async (req, res) => {
  const projectId = Number(req.body.projectId);

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError("Project not found", 404);

  const order = Object.prototype.hasOwnProperty.call(req.body, "order")
    ? Number(req.body.order || 0)
    : (await prisma.audioTask.count({ where: { projectId } })) + 1;

  const created = await prisma.audioTask.create({
    data: {
      projectId,
      name: req.body.name,
      assignedUserId: Object.prototype.hasOwnProperty.call(req.body, "assignedUserId") ? req.body.assignedUserId || null : null,
      status: normalizePipelineStatus(req.body.status, "YTS"),
      startDate: req.body.startDate ? new Date(req.body.startDate) : null,
      endDate: req.body.endDate ? new Date(req.body.endDate) : null,
      notes: req.body.notes || null,
      order
    }
  });

  if (Object.prototype.hasOwnProperty.call(req.body, "assignments") || created.assignedUserId) {
    const { addedEmployeeIds } = await syncTaskAssignments({
      resourceType: "audioTask",
      recordId: created.id,
      projectId,
      assignments: Object.prototype.hasOwnProperty.call(req.body, "assignments")
        ? req.body.assignments
        : created.assignedUserId
          ? [{ employeeId: Number(created.assignedUserId), roleType: "LEAD" }]
          : [],
      fallbackAssignedUserId: created.assignedUserId,
      assignedById: req.user.id,
      parentModel: "audioTask",
      include: {
        assignedUser: {
          select: {
            id: true,
            name: true,
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
        ...TASK_ASSIGNMENT_INCLUDE
      }
    });

    if (addedEmployeeIds.length) {
      await notifyTaskAssignmentUsers({
        employeeIds: addedEmployeeIds,
        message: `${req.user.name} assigned you to audio task ${created.name} in ${project.name}.`,
        relatedProjectId: projectId
      });
    }
  }

  await recalculateProjectProgress(projectId);

  const hydrated = await hydrateAudioTask(created.id);
  return res.status(201).json(hydrated);
});

const updateAudioTask = asyncHandler(async (req, res) => {
  const id = req.params.id;

  const existing = await prisma.audioTask.findUnique({ where: { id } });
  if (!existing) throw new AppError("Audio task not found", 404);

  const payload = {};
  if (Object.prototype.hasOwnProperty.call(req.body, "name")) payload.name = req.body.name;
  if (Object.prototype.hasOwnProperty.call(req.body, "assignedUserId")) payload.assignedUserId = req.body.assignedUserId || null;
  if (Object.prototype.hasOwnProperty.call(req.body, "status")) payload.status = normalizePipelineStatus(req.body.status, existing.status);
  if (Object.prototype.hasOwnProperty.call(req.body, "startDate")) payload.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
  if (Object.prototype.hasOwnProperty.call(req.body, "endDate")) payload.endDate = req.body.endDate ? new Date(req.body.endDate) : null;
  if (Object.prototype.hasOwnProperty.call(req.body, "notes")) payload.notes = req.body.notes || null;
  if (Object.prototype.hasOwnProperty.call(req.body, "order")) payload.order = Number(req.body.order || 0);

  await prisma.audioTask.update({
    where: { id },
    data: payload
  });

  if (Object.prototype.hasOwnProperty.call(req.body, "assignments") || Object.prototype.hasOwnProperty.call(payload, "assignedUserId")) {
    const { addedEmployeeIds } = await syncTaskAssignments({
      resourceType: "audioTask",
      recordId: id,
      projectId: existing.projectId,
      assignments: Object.prototype.hasOwnProperty.call(req.body, "assignments")
        ? req.body.assignments
        : payload.assignedUserId
          ? [{ employeeId: Number(payload.assignedUserId), roleType: "LEAD" }]
          : [],
      fallbackAssignedUserId: Object.prototype.hasOwnProperty.call(payload, "assignedUserId") ? payload.assignedUserId : existing.assignedUserId,
      assignedById: req.user.id,
      parentModel: "audioTask",
      include: {
        assignedUser: {
          select: {
            id: true,
            name: true,
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
        ...TASK_ASSIGNMENT_INCLUDE
      }
    });

    if (addedEmployeeIds.length) {
      const project = await prisma.project.findUnique({
        where: { id: existing.projectId },
        select: { name: true }
      });
      await notifyTaskAssignmentUsers({
        employeeIds: addedEmployeeIds,
        message: `${req.user.name} assigned you to audio task ${payload.name || existing.name} in ${project?.name || "Project"}.`,
        relatedProjectId: existing.projectId
      });
    }
  }

  await recalculateProjectProgress(existing.projectId);

  const hydrated = await hydrateAudioTask(id);
  return res.json(hydrated);
});

const deleteAudioTask = asyncHandler(async (req, res) => {
  const id = req.params.id;

  const existing = await prisma.audioTask.findUnique({ where: { id } });
  if (!existing) throw new AppError("Audio task not found", 404);

  await prisma.audioTask.delete({ where: { id } });
  await recalculateProjectProgress(existing.projectId);

  return res.json({ success: true });
});

module.exports = {
  listProjectAudio,
  createAudioTask,
  updateAudioTask,
  deleteAudioTask
};
