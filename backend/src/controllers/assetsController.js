const prisma = require("../utils/prisma");
const { AppError, asyncHandler } = require("../utils/http");
const { MANAGER_ROLES } = require("../utils/constants");
const { getTrackingDefinitionSnapshot, computeStatusFromChildren } = require("../utils/trackingSetup");
const { recalculateProjectProgress } = require("../utils/progress");
const { createNotification, notifyManagers } = require("../utils/notifications");
const {
  TASK_ASSIGNMENT_INCLUDE,
  syncTaskAssignments,
  notifyTaskAssignmentUsers,
  getAssignedEmployeeIds
} = require("../utils/taskAssignments");
const {
  ARTIST_MUTABLE_STATUSES,
  isApprovedStatus,
  isCompleteStatus,
  isPendingReviewStatus,
  isRetakeStatus,
  normalizePipelineStatus
} = require("../utils/pipelineStatus");

function isManager(role) {
  return MANAGER_ROLES.includes(role);
}

function normalizeAssetType(type) {
  if (!type) return type;
  if (type === "ENVIRONMENT") return "BG";
  return type;
}

function deriveSubCategory(type, subCategory) {
  if (subCategory) return subCategory;
  if (type === "CHARACTER") return "CHARACTER";
  if (type === "PROP") return "PROP";
  if (type === "BG") return "BG";
  return null;
}

function normalizeArchivedFilter(value) {
  const normalized = String(value || "active").toLowerCase();
  if (normalized === "archived") return true;
  if (normalized === "all") return null;
  return false;
}

async function refreshAssetStatus(assetId) {
  const stages = await prisma.assetStage.findMany({
    where: { assetId },
    select: { status: true }
  });

  const status = computeStatusFromChildren(stages.map((stage) => stage.status));

  return prisma.asset.update({
    where: { id: assetId },
    data: { status }
  });
}

const listProjectAssets = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.id);
  const page = Number(req.query.page || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize || 25));
  const status = req.query.status;
  const type = req.query.type;
  const subCategory = req.query.subCategory;
  const search = req.query.search;
  const artistId = req.query.artistId ? Number(req.query.artistId) : null;
  const archivedFilter = normalizeArchivedFilter(req.query.archived);
  const sortBy = String(req.query.sortBy || "order");
  const sortDir = String(req.query.sortDir || "asc").toLowerCase() === "desc" ? "desc" : "asc";

  const where = { projectId };
  if (archivedFilter !== null) where.isArchived = archivedFilter;
  if (status) where.status = status;
  if (type) where.type = type;
  if (subCategory) where.subCategory = subCategory;
  if (search) {
    where.name = {
      contains: String(search),
      mode: "insensitive"
    };
  }
  if (artistId) {
    where.stages = {
      some: {
        OR: [{ assignedUserId: artistId }, { taskAssignments: { some: { employeeId: artistId } } }]
      }
    };
  }

  const orderBy =
    sortBy === "name"
      ? [{ name: sortDir }, { order: "asc" }, { createdAt: "asc" }]
        : sortBy === "status"
          ? [{ status: sortDir }, { order: "asc" }, { createdAt: "asc" }]
          : sortBy === "priority"
            ? [{ priority: sortDir }, { order: "asc" }, { createdAt: "asc" }]
          : sortBy === "updatedAt"
            ? [{ updatedAt: sortDir }, { order: "asc" }]
            : [{ type: "asc" }, { order: sortDir }, { createdAt: "asc" }];

  const [total, items] = await Promise.all([
    prisma.asset.count({ where }),
    prisma.asset.findMany({
      where,
      include: {
        stages: {
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
            },
            ...TASK_ASSIGNMENT_INCLUDE
          },
          orderBy: {
            createdAt: "asc"
          }
        }
      },
      orderBy,
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

const createProjectAsset = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.id);

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError("Project not found", 404);

  const type = normalizeAssetType(req.body.type);
  const order = (await prisma.asset.count({ where: { projectId } })) + 1;

  const asset = await prisma.asset.create({
    data: {
      projectId,
      name: req.body.name,
      type,
      subCategory: deriveSubCategory(type, req.body.subCategory),
      description: req.body.description || null,
      referenceImageUrl: req.body.referenceImageUrl || null,
      priority: Number(req.body.priority || 3),
      order,
      status: normalizePipelineStatus(req.body.status, "YTS")
    }
  });

  const snapshot = await getTrackingDefinitionSnapshot({ prisma, project });
  const stageRows = Array.from(snapshot.assetCodes)
    .map((code) => snapshot.stageDefinitionsByCode.get(code))
    .filter(Boolean)
    .map((definition) => ({
      assetId: asset.id,
      stageDefinitionId: definition.id,
      status: "YTS"
    }));

  if (stageRows.length) {
    await prisma.assetStage.createMany({ data: stageRows });
  }

  const hydrated = await prisma.asset.findUnique({
    where: { id: asset.id },
    include: {
      stages: {
          include: {
            stageDefinition: true,
            assignedUser: {
            select: {
              id: true,
              name: true
            }
          },
          ...TASK_ASSIGNMENT_INCLUDE
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

const updateAsset = asyncHandler(async (req, res) => {
  const assetId = req.params.id;

  const existing = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!existing) throw new AppError("Asset not found", 404);

  const payload = {};
  const fields = ["name", "type", "subCategory", "description", "referenceImageUrl", "status", "order", "priority", "isArchived"];
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      payload[field] = req.body[field] || null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "name") && !payload.name) {
    throw new AppError("Asset name is required", 400);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "type") && !payload.type) {
    throw new AppError("Asset type is required", 400);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "type") && payload.type) {
    payload.type = normalizeAssetType(payload.type);
    if (!Object.prototype.hasOwnProperty.call(payload, "subCategory")) {
      payload.subCategory = deriveSubCategory(payload.type, null);
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, "priority") && payload.priority != null) {
    payload.priority = Number(payload.priority);
  }

  const updated = await prisma.asset.update({
    where: { id: assetId },
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
          },
          ...TASK_ASSIGNMENT_INCLUDE
        },
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });

  return res.json(updated);
});

const deleteAsset = asyncHandler(async (req, res) => {
  const assetId = req.params.id;

  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new AppError("Asset not found", 404);

  await prisma.asset.delete({ where: { id: assetId } });
  await recalculateProjectProgress(asset.projectId);
  return res.json({ success: true });
});

const updateAssetStage = asyncHandler(async (req, res) => {
  const assetStageId = req.params.id;

  const assetStage = await prisma.assetStage.findUnique({
    where: { id: assetStageId },
    include: {
      stageDefinition: true,
      ...TASK_ASSIGNMENT_INCLUDE,
      asset: {
        include: {
          project: true
        }
      }
    }
  });

  if (!assetStage) throw new AppError("Asset stage not found", 404);

  const manager = isManager(req.user.role);
  const previousStatus = assetStage.status;
  const previousAssignedUserId = assetStage.assignedUserId;
  const previousDeadline = assetStage.deadline ? new Date(assetStage.deadline).toISOString() : null;
  const previousAssignedEmployeeIds = getAssignedEmployeeIds(assetStage, assetStage.assignedUserId);
  if (!manager && !previousAssignedEmployeeIds.includes(req.user.id)) {
    throw new AppError("Forbidden", 403);
  }

  const payload = {};

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    payload.status = normalizePipelineStatus(req.body.status);
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

  if (!manager && payload.status && !ARTIST_MUTABLE_STATUSES.has(payload.status)) {
    throw new AppError("Employees can only move asset stages to IP, TEST, or DONE", 403);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "startDate")) {
    payload.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "endDate")) {
    payload.endDate = req.body.endDate ? new Date(req.body.endDate) : null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "startedAt")) {
    payload.startedAt = req.body.startedAt ? new Date(req.body.startedAt) : null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "endedAt")) {
    payload.endedAt = req.body.endedAt ? new Date(req.body.endedAt) : null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "durationMinutes")) {
    payload.durationMinutes = req.body.durationMinutes != null ? Number(req.body.durationMinutes) : null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "isTimerRunning")) {
    payload.isTimerRunning = Boolean(req.body.isTimerRunning);
  }

  if (payload.startedAt && !payload.startDate) {
    payload.startDate = payload.startedAt;
  }
  if (payload.endedAt && !payload.endDate) {
    payload.endDate = payload.endedAt;
  }

  if (payload.status === "IP" && !assetStage.actualStartedAt && !payload.startedAt) {
    const startedAt = new Date();
    payload.startedAt = startedAt;
    payload.startDate = payload.startDate || startedAt;
    payload.actualStartedAt = startedAt;
    payload.isTimerRunning = true;
  } else if (payload.startedAt && !assetStage.actualStartedAt) {
    payload.actualStartedAt = payload.startedAt;
    payload.isTimerRunning = payload.endedAt ? false : true;
  }

  if (isPendingReviewStatus(payload.status)) {
    payload.submittedAt = new Date();
  }

  if (manager && isApprovedStatus(payload.status)) {
    payload.approvedAt = new Date();
    payload.feedback = null;
  }

  if (manager && isRetakeStatus(payload.status || "")) {
    payload.approvedAt = null;
  }

  const effectiveStartedAt = payload.startedAt || assetStage.startedAt || assetStage.actualStartedAt || payload.startDate || assetStage.startDate;
  const explicitEndedAt = payload.endedAt || payload.endDate || null;

  if (isCompleteStatus(payload.status) && effectiveStartedAt && !assetStage.actualDoneAt && !explicitEndedAt) {
    const doneAt = new Date();
    payload.endedAt = doneAt;
    payload.endDate = payload.endDate || doneAt;
    payload.actualDoneAt = doneAt;
    payload.durationMinutes = Math.max(1, Math.round((doneAt.getTime() - new Date(effectiveStartedAt).getTime()) / 60000));
    payload.timeConsumedMin = payload.durationMinutes;
    payload.isTimerRunning = false;
  } else if (effectiveStartedAt && explicitEndedAt) {
    const endedAt = new Date(explicitEndedAt);
    payload.endedAt = endedAt;
    payload.endDate = payload.endDate || endedAt;
    payload.actualDoneAt = endedAt;
    payload.durationMinutes = Math.max(1, Math.round((endedAt.getTime() - new Date(effectiveStartedAt).getTime()) / 60000));
    payload.timeConsumedMin = payload.durationMinutes;
    payload.isTimerRunning = false;
  } else if (effectiveStartedAt && !payload.endedAt && !assetStage.endedAt && !isCompleteStatus(payload.status || assetStage.status)) {
    payload.isTimerRunning = Object.prototype.hasOwnProperty.call(payload, "isTimerRunning") ? payload.isTimerRunning : true;
  }

  const updated = await prisma.assetStage.update({
    where: { id: assetStageId },
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
      },
      ...TASK_ASSIGNMENT_INCLUDE
    }
  });

  let hydrated = updated;
  let addedEmployeeIds = [];

  if (manager && (Object.prototype.hasOwnProperty.call(req.body, "assignments") || Object.prototype.hasOwnProperty.call(payload, "assignedUserId"))) {
    const syncResult = await syncTaskAssignments({
      resourceType: "assetStage",
      recordId: assetStageId,
      projectId: assetStage.asset.projectId,
      assignments: Object.prototype.hasOwnProperty.call(req.body, "assignments")
        ? req.body.assignments
        : payload.assignedUserId
          ? [{ employeeId: Number(payload.assignedUserId), roleType: "LEAD" }]
          : [],
      fallbackAssignedUserId: Object.prototype.hasOwnProperty.call(payload, "assignedUserId") ? payload.assignedUserId : assetStage.assignedUserId,
      assignedById: req.user.id,
      parentModel: "assetStage",
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
        },
        ...TASK_ASSIGNMENT_INCLUDE
      }
    });

    hydrated = syncResult.hydrated || updated;
    addedEmployeeIds = syncResult.addedEmployeeIds || [];
  }

  await refreshAssetStatus(hydrated.assetId);
  await recalculateProjectProgress(assetStage.asset.projectId);

  const stageName = hydrated.stageDefinition?.name || hydrated.stageDefinition?.code || "Asset Stage";
  const assetName = assetStage.asset?.name || "Asset";
  const projectName = assetStage.asset.project?.name || "Project";
  const currentAssignedEmployeeIds = getAssignedEmployeeIds(hydrated, hydrated.assignedUserId);

  if (addedEmployeeIds.length) {
    await notifyTaskAssignmentUsers({
      employeeIds: addedEmployeeIds,
      message: `${req.user.name} assigned you to ${stageName} for ${assetName} in ${projectName}.`,
      relatedProjectId: assetStage.asset.projectId
    });
  } else if (Object.prototype.hasOwnProperty.call(payload, "assignedUserId") && payload.assignedUserId && payload.assignedUserId !== previousAssignedUserId) {
    await createNotification({
      userId: payload.assignedUserId,
      message: `You were assigned ${stageName} for ${assetName} in ${projectName}.`,
      type: "ASSIGNED",
      relatedProjectId: assetStage.asset.projectId
    });
  }

  if (Object.prototype.hasOwnProperty.call(payload, "deadline")) {
    const nextDeadline = payload.deadline ? new Date(payload.deadline).toISOString() : null;
    if (currentAssignedEmployeeIds.length && previousDeadline !== nextDeadline && nextDeadline) {
      await Promise.all(
        currentAssignedEmployeeIds.map((employeeId) =>
          createNotification({
            userId: employeeId,
            message: `Deadline updated for ${stageName} on ${assetName} in ${projectName}.`,
            type: "DEADLINE_WARNING",
            relatedProjectId: assetStage.asset.projectId
          })
        )
      );
    }
  }

  if (isPendingReviewStatus(updated.status) && !isPendingReviewStatus(previousStatus)) {
    await notifyManagers({
      message: `${req.user.name} sent ${stageName} for review on ${assetName} in ${projectName}.`,
      type: "APPROVAL_NEEDED",
      relatedProjectId: assetStage.asset.projectId
    });
  }

  if (manager && currentAssignedEmployeeIds.length && isApprovedStatus(hydrated.status) && !isApprovedStatus(previousStatus)) {
    await Promise.all(
      currentAssignedEmployeeIds.map((employeeId) =>
        createNotification({
          userId: employeeId,
          message: `${stageName} ${hydrated.status === "FINAL" ? "final approved" : "lead approved"} for ${assetName} in ${projectName}.`,
          type: "APPROVED",
          relatedProjectId: assetStage.asset.projectId
        })
      )
    );
  }

  if (manager && currentAssignedEmployeeIds.length && isRetakeStatus(hydrated.status) && previousStatus !== hydrated.status) {
    await Promise.all(
      currentAssignedEmployeeIds.map((employeeId) =>
        createNotification({
          userId: employeeId,
          message: `${stageName} needs a retake on ${assetName} in ${projectName}.${hydrated.feedback ? ` Feedback: ${hydrated.feedback}` : ""}`,
          type: "REJECTED",
          relatedProjectId: assetStage.asset.projectId
        })
      )
    );
  }

  return res.json(hydrated);
});

module.exports = {
  listProjectAssets,
  createProjectAsset,
  updateAsset,
  deleteAsset,
  updateAssetStage
};
