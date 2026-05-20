const prisma = require("../utils/prisma");
const { AppError, asyncHandler } = require("../utils/http");
const { MANAGER_ROLES } = require("../utils/constants");
const { getTrackingDefinitionSnapshot, computeStatusFromChildren } = require("../utils/trackingSetup");
const { recalculateProjectProgress } = require("../utils/progress");
const { createNotification, notifyManagers } = require("../utils/notifications");

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
  const pageSize = Math.min(200, Number(req.query.pageSize || 25));
  const status = req.query.status;
  const type = req.query.type;
  const search = req.query.search;
  const artistId = req.query.artistId ? Number(req.query.artistId) : null;

  const where = { projectId };
  if (status) where.status = status;
  if (type) where.type = type;
  if (search) {
    where.name = {
      contains: String(search),
      mode: "insensitive"
    };
  }
  if (artistId) {
    where.stages = {
      some: {
        assignedUserId: artistId
      }
    };
  }

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
            }
          },
          orderBy: {
            createdAt: "asc"
          }
        }
      },
      orderBy: [{ type: "asc" }, { order: "asc" }, { createdAt: "asc" }],
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
      order,
      status: req.body.status || "NOT_STARTED"
    }
  });

  const snapshot = await getTrackingDefinitionSnapshot({ prisma, project });
  const stageRows = Array.from(snapshot.assetCodes)
    .map((code) => snapshot.stageDefinitionsByCode.get(code))
    .filter(Boolean)
    .map((definition) => ({
      assetId: asset.id,
      stageDefinitionId: definition.id,
      status: "NOT_STARTED"
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

const updateAsset = asyncHandler(async (req, res) => {
  const assetId = req.params.id;

  const existing = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!existing) throw new AppError("Asset not found", 404);

  const payload = {};
  const fields = ["name", "type", "subCategory", "description", "referenceImageUrl", "status", "order"];
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
  if (!manager && assetStage.assignedUserId !== req.user.id) {
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
    throw new AppError("Employees can only move asset stages to IN_PROGRESS or SUBMITTED", 403);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "startDate")) {
    payload.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "endDate")) {
    payload.endDate = req.body.endDate ? new Date(req.body.endDate) : null;
  }

  if (payload.status === "IN_PROGRESS" && !assetStage.actualStartedAt) {
    payload.actualStartedAt = new Date();
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

  if (payload.status === "APPROVED" && assetStage.actualStartedAt && !assetStage.actualDoneAt) {
    const doneAt = new Date();
    payload.actualDoneAt = doneAt;
    payload.timeConsumedMin = Math.max(1, Math.round((doneAt.getTime() - new Date(assetStage.actualStartedAt).getTime()) / 60000));
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
      }
    }
  });

  await refreshAssetStatus(updated.assetId);
  await recalculateProjectProgress(assetStage.asset.projectId);

  const stageName = updated.stageDefinition?.name || updated.stageDefinition?.code || "Asset Stage";
  const assetName = assetStage.asset?.name || "Asset";
  const projectName = assetStage.asset.project?.name || "Project";

  if (Object.prototype.hasOwnProperty.call(payload, "assignedUserId") && payload.assignedUserId && payload.assignedUserId !== previousAssignedUserId) {
    await createNotification({
      userId: payload.assignedUserId,
      message: `You were assigned ${stageName} for ${assetName} in ${projectName}.`,
      type: "ASSIGNED",
      relatedProjectId: assetStage.asset.projectId
    });
  }

  if (Object.prototype.hasOwnProperty.call(payload, "deadline")) {
    const nextDeadline = payload.deadline ? new Date(payload.deadline).toISOString() : null;
    if (updated.assignedUserId && previousDeadline !== nextDeadline && nextDeadline) {
      await createNotification({
        userId: updated.assignedUserId,
        message: `Deadline updated for ${stageName} on ${assetName} in ${projectName}.`,
        type: "DEADLINE_WARNING",
        relatedProjectId: assetStage.asset.projectId
      });
    }
  }

  if (updated.status === "SUBMITTED" && previousStatus !== "SUBMITTED") {
    await notifyManagers({
      message: `${req.user.name} submitted ${stageName} for ${assetName} in ${projectName}.`,
      type: "APPROVAL_NEEDED",
      relatedProjectId: assetStage.asset.projectId
    });
  }

  if (manager && updated.assignedUserId && updated.status === "APPROVED" && previousStatus !== "APPROVED") {
    await createNotification({
      userId: updated.assignedUserId,
      message: `${stageName} approved for ${assetName} in ${projectName}.`,
      type: "APPROVED",
      relatedProjectId: assetStage.asset.projectId
    });
  }

  if (manager && updated.assignedUserId && ["REJECTED", "REVISION_REQUIRED"].includes(updated.status) && previousStatus !== updated.status) {
    await createNotification({
      userId: updated.assignedUserId,
      message: `${stageName} was sent back for revision on ${assetName} in ${projectName}.${updated.feedback ? ` Feedback: ${updated.feedback}` : ""}`,
      type: "REJECTED",
      relatedProjectId: assetStage.asset.projectId
    });
  }

  return res.json(updated);
});

module.exports = {
  listProjectAssets,
  createProjectAsset,
  updateAsset,
  deleteAsset,
  updateAssetStage
};
