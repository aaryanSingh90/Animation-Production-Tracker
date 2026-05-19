const prisma = require("../utils/prisma");
const { AppError, asyncHandler } = require("../utils/http");
const { MANAGER_ROLES } = require("../utils/constants");
const { getTrackingDefinitionSnapshot, computeStatusFromChildren } = require("../utils/trackingSetup");
const { recalculateProjectProgress } = require("../utils/progress");

function isManager(role) {
  return MANAGER_ROLES.includes(role);
}

async function refreshShotStatus(shotId) {
  const stages = await prisma.shotStage.findMany({
    where: { shotId },
    select: { status: true }
  });

  const status = computeStatusFromChildren(stages.map((stage) => stage.status));

  return prisma.shot.update({
    where: { id: shotId },
    data: { status }
  });
}

const listProjectShots = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.id);
  const page = Number(req.query.page || 1);
  const pageSize = Math.min(200, Number(req.query.pageSize || 25));
  const status = req.query.status;
  const search = req.query.search;
  const artistId = req.query.artistId ? Number(req.query.artistId) : null;

  const where = {
    projectId
  };

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { name: { contains: String(search), mode: "insensitive" } },
      { shotNumber: Number.isNaN(Number(search)) ? undefined : Number(search) }
    ].filter(Boolean);
  }

  if (artistId) {
    where.stages = {
      some: {
        assignedUserId: artistId
      }
    };
  }

  const [total, items] = await Promise.all([
    prisma.shot.count({ where }),
    prisma.shot.findMany({
      where,
      include: {
        stages: {
          include: {
            stageDefinition: true,
            assignedUser: {
              select: {
                id: true,
                name: true,
                role: true,
                departmentId: true,
                departmentName: true,
                department: {
                  select: { id: true, name: true, color: true }
                }
              }
            }
          },
          orderBy: {
            createdAt: "asc"
          }
        }
      },
      orderBy: [{ order: "asc" }, { shotNumber: "asc" }],
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

const createProjectShot = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.id);

  const project = await prisma.project.findUnique({
    where: { id: projectId }
  });
  if (!project) throw new AppError("Project not found", 404);

  const existingMax = await prisma.shot.aggregate({
    where: { projectId },
    _max: {
      shotNumber: true,
      order: true
    }
  });

  const shotNumber = req.body.shotNumber || (existingMax._max.shotNumber || 0) + 1;
  const order = req.body.order || (existingMax._max.order || 0) + 1;

  const shot = await prisma.shot.create({
    data: {
      projectId,
      shotNumber,
      order,
      name: req.body.name || `Shot ${String(shotNumber).padStart(3, "0")}`,
      description: req.body.description || null,
      duration: req.body.duration ? Number(req.body.duration) : null,
      status: req.body.status || "NOT_STARTED"
    }
  });

  const snapshot = await getTrackingDefinitionSnapshot({ prisma, project });
  const stageRows = Array.from(snapshot.shotCodes)
    .map((code) => snapshot.stageDefinitionsByCode.get(code))
    .filter(Boolean)
    .map((definition) => ({
      shotId: shot.id,
      stageDefinitionId: definition.id,
      status: "NOT_STARTED"
    }));

  if (stageRows.length) {
    await prisma.shotStage.createMany({ data: stageRows });
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      totalShots: {
        increment: 1
      }
    }
  });

  const hydrated = await prisma.shot.findUnique({
    where: { id: shot.id },
    include: {
      stages: {
        include: {
          stageDefinition: true,
          assignedUser: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });

  await recalculateProjectProgress(projectId);

  return res.status(201).json(hydrated);
});

const updateShot = asyncHandler(async (req, res) => {
  const shotId = req.params.id;

  const existing = await prisma.shot.findUnique({ where: { id: shotId } });
  if (!existing) throw new AppError("Shot not found", 404);

  const payload = {};
  const fields = ["shotNumber", "name", "description", "duration", "order", "status"];
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      payload[field] = req.body[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "duration")) {
    payload.duration = payload.duration ? Number(payload.duration) : null;
  }

  const updated = await prisma.shot.update({
    where: { id: shotId },
    data: payload,
    include: {
      stages: {
        include: {
          stageDefinition: true,
          assignedUser: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });

  return res.json(updated);
});

const deleteShot = asyncHandler(async (req, res) => {
  const shotId = req.params.id;

  const shot = await prisma.shot.findUnique({ where: { id: shotId } });
  if (!shot) throw new AppError("Shot not found", 404);

  await prisma.shot.delete({ where: { id: shotId } });

  await prisma.project.update({
    where: { id: shot.projectId },
    data: {
      totalShots: {
        decrement: 1
      }
    }
  });

  await recalculateProjectProgress(shot.projectId);

  return res.json({ success: true });
});

const updateShotStage = asyncHandler(async (req, res) => {
  const shotStageId = req.params.id;

  const shotStage = await prisma.shotStage.findUnique({
    where: { id: shotStageId },
    include: {
      shot: {
        include: {
          project: true
        }
      },
      stageDefinition: true
    }
  });

  if (!shotStage) throw new AppError("Shot stage not found", 404);

  const manager = isManager(req.user.role);
  if (!manager && shotStage.assignedUserId !== req.user.id) {
    throw new AppError("Forbidden", 403);
  }

  const payload = {};

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    payload.status = req.body.status;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "deadline")) {
    payload.deadline = req.body.deadline ? new Date(req.body.deadline) : null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "notes")) {
    payload.notes = req.body.notes;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "feedback")) {
    payload.feedback = req.body.feedback;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "assignedUserId") && manager) {
    payload.assignedUserId = req.body.assignedUserId ? Number(req.body.assignedUserId) : null;
  }

  if (!manager && Object.keys(payload).some((key) => !["status", "notes", "feedback"].includes(key))) {
    throw new AppError("Employees can only update status or notes", 403);
  }

  if (!manager && payload.status && !["IN_PROGRESS", "SUBMITTED"].includes(payload.status)) {
    throw new AppError("Employees can only move shot stages to IN_PROGRESS or SUBMITTED", 403);
  }

  if (payload.status === "SUBMITTED") {
    payload.submittedAt = new Date();
  }

  if (manager && payload.status === "APPROVED") {
    payload.approvedAt = new Date();
    payload.feedback = null;
  }

  if (manager && ["REJECTED", "REVISION_REQUIRED"].includes(payload.status || "")) {
    payload.approvedAt = null;
  }

  const updated = await prisma.shotStage.update({
    where: { id: shotStageId },
    data: payload,
    include: {
      stageDefinition: true,
      assignedUser: {
        select: {
          id: true,
          name: true,
          departmentId: true,
          departmentName: true,
          department: {
            select: { id: true, name: true, color: true }
          }
        }
      }
    }
  });

  await refreshShotStatus(updated.shotId);
  await recalculateProjectProgress(shotStage.shot.projectId);

  return res.json(updated);
});

const bulkAssignShotStages = asyncHandler(async (req, res) => {
  const shotStageIds = Array.from(new Set(req.body.shotStageIds || []));
  const userId = Object.prototype.hasOwnProperty.call(req.body, "userId") ? req.body.userId : null;

  if (!shotStageIds.length) {
    throw new AppError("shotStageIds are required", 400);
  }

  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
      select: { id: true, isActive: true }
    });
    if (!user || !user.isActive) {
      throw new AppError("Assigned artist not found or inactive", 404);
    }
  }

  const stages = await prisma.shotStage.findMany({
    where: {
      id: {
        in: shotStageIds
      }
    },
    select: {
      id: true,
      shotId: true
    }
  });

  if (!stages.length) {
    throw new AppError("No shot stages found", 404);
  }

  await prisma.shotStage.updateMany({
    where: {
      id: {
        in: stages.map((stage) => stage.id)
      }
    },
    data: {
      assignedUserId: userId ? Number(userId) : null
    }
  });

  return res.json({
    success: true,
    updatedCount: stages.length,
    shotCount: new Set(stages.map((stage) => stage.shotId)).size
  });
});

const bulkUpdateShotStages = asyncHandler(async (req, res) => {
  const shotStageIds = Array.from(new Set(req.body.shotStageIds || []));

  if (!shotStageIds.length) {
    throw new AppError("shotStageIds are required", 400);
  }

  const stages = await prisma.shotStage.findMany({
    where: {
      id: {
        in: shotStageIds
      }
    },
    select: {
      id: true,
      shotId: true,
      shot: {
        select: {
          projectId: true
        }
      }
    }
  });

  if (!stages.length) {
    throw new AppError("No shot stages found", 404);
  }

  const payload = {};

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    payload.status = req.body.status;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "deadline")) {
    payload.deadline = req.body.deadline ? new Date(req.body.deadline) : null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "assignedUserId")) {
    payload.assignedUserId = req.body.assignedUserId ? Number(req.body.assignedUserId) : null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "notes")) {
    payload.notes = req.body.notes || null;
  }

  if (!Object.keys(payload).length) {
    throw new AppError("At least one update field is required", 400);
  }

  if (payload.status === "SUBMITTED") {
    payload.submittedAt = new Date();
  }
  if (payload.status === "APPROVED") {
    payload.approvedAt = new Date();
    payload.feedback = null;
  }
  if (["REJECTED", "REVISION_REQUIRED"].includes(payload.status || "")) {
    payload.approvedAt = null;
  }

  await prisma.shotStage.updateMany({
    where: {
      id: {
        in: stages.map((stage) => stage.id)
      }
    },
    data: payload
  });

  const uniqueShotIds = Array.from(new Set(stages.map((stage) => stage.shotId)));
  const uniqueProjectIds = Array.from(new Set(stages.map((stage) => stage.shot.projectId)));

  await Promise.all(uniqueShotIds.map((shotId) => refreshShotStatus(shotId)));
  await Promise.all(uniqueProjectIds.map((projectId) => recalculateProjectProgress(projectId)));

  return res.json({
    success: true,
    updatedCount: stages.length,
    shotCount: uniqueShotIds.length
  });
});

module.exports = {
  listProjectShots,
  createProjectShot,
  updateShot,
  deleteShot,
  updateShotStage,
  bulkAssignShotStages,
  bulkUpdateShotStages
};
