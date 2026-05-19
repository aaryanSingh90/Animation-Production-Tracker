const prisma = require("../utils/prisma");
const { AppError, asyncHandler } = require("../utils/http");
const { MANAGER_ROLES } = require("../utils/constants");
const { getTrackingDefinitionSnapshot, computeStatusFromChildren } = require("../utils/trackingSetup");
const { recalculateProjectProgress } = require("../utils/progress");

function isManager(role) {
  return MANAGER_ROLES.includes(role);
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
      orderBy: [{ createdAt: "asc" }],
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

  const asset = await prisma.asset.create({
    data: {
      projectId,
      name: req.body.name,
      type: req.body.type,
      description: req.body.description || null,
      referenceImageUrl: req.body.referenceImageUrl || null,
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
  const fields = ["name", "type", "description", "referenceImageUrl", "status"];
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

  return res.json(updated);
});

module.exports = {
  listProjectAssets,
  createProjectAsset,
  updateAsset,
  deleteAsset,
  updateAssetStage
};
