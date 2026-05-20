const prisma = require("../utils/prisma");
const { AppError, asyncHandler } = require("../utils/http");
const { isApprovedStatus, isLateStatus } = require("../utils/pipelineStatus");

function normalizeOptionalText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function normalizeClientPayload(payload) {
  const normalized = {};
  const fields = ["name", "companyName", "email", "phone", "address", "notes"];

  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;
    if (field === "name") {
      normalized.name = String(payload.name).trim();
      continue;
    }
    normalized[field] = normalizeOptionalText(payload[field]);
  }

  return normalized;
}

function mapProjectSummary(project) {
  const stages = project.stages || [];
  const totalStages = stages.length;
  const approvedStages = stages.filter((stage) => isApprovedStatus(stage.status)).length;
  const hasIssues = stages.some((stage) => isLateStatus(stage.status, stage.deadline));
  const isDelayed = stages.some((stage) => isLateStatus(stage.status, stage.deadline));

  return {
    id: project.id,
    name: project.name,
    priority: project.priority,
    client: project.client,
    clientId: project.clientId,
    progressPercent: Number(project.progressPercent || 0),
    overallStatus: project.overallStatus,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    counts: {
      shots: project._count?.shots || 0,
      assets: project._count?.assets || 0,
      stages: totalStages,
      approvedStages
    },
    hasIssues,
    isDelayed
  };
}

function buildClientStats(projects) {
  const totalProjects = projects.length;
  const activeProjects = projects.filter((project) => Number(project.progressPercent || 0) < 100).length;
  const totalShots = projects.reduce((sum, project) => sum + (project._count?.shots || 0), 0);
  const totalAssets = projects.reduce((sum, project) => sum + (project._count?.assets || 0), 0);
  const avgProgress = totalProjects
    ? Number((projects.reduce((sum, project) => sum + Number(project.progressPercent || 0), 0) / totalProjects).toFixed(1))
    : 0;

  return {
    totalProjects,
    activeProjects,
    totalShots,
    totalAssets,
    avgProgress
  };
}

const listClients = asyncHandler(async (_req, res) => {
  const clients = await prisma.client.findMany({
    include: {
      projects: {
        select: {
          id: true,
          name: true,
          priority: true,
          client: true,
          clientId: true,
          progressPercent: true,
          overallStatus: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              shots: true,
              assets: true
            }
          },
          stages: {
            where: { isActive: true },
            select: {
              status: true,
              deadline: true
            }
          }
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
      }
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }]
  });

  const payload = clients.map((client) => {
    const stats = buildClientStats(client.projects);
    return {
      id: client.id,
      name: client.name,
      companyName: client.companyName,
      email: client.email,
      phone: client.phone,
      address: client.address,
      notes: client.notes,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
      stats
    };
  });

  return res.json(payload);
});

const getClientById = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      projects: {
        select: {
          id: true,
          name: true,
          priority: true,
          client: true,
          clientId: true,
          progressPercent: true,
          overallStatus: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              shots: true,
              assets: true
            }
          },
          stages: {
            where: { isActive: true },
            select: {
              id: true,
              stageName: true,
              status: true,
              deadline: true,
              order: true
            },
            orderBy: [{ order: "asc" }, { createdAt: "asc" }]
          }
        },
        orderBy: [{ priority: "asc" }, { updatedAt: "desc" }]
      }
    }
  });

  if (!client) {
    throw new AppError("Client not found", 404);
  }

  return res.json({
    id: client.id,
    name: client.name,
    companyName: client.companyName,
    email: client.email,
    phone: client.phone,
    address: client.address,
    notes: client.notes,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
    stats: buildClientStats(client.projects),
    projects: client.projects.map(mapProjectSummary)
  });
});

const createClient = asyncHandler(async (req, res) => {
  const data = normalizeClientPayload(req.body);
  const existing = await prisma.client.findFirst({
    where: {
      name: {
        equals: data.name,
        mode: "insensitive"
      }
    },
    select: { id: true }
  });

  if (existing) {
    throw new AppError("Client with this name already exists", 409);
  }

  const client = await prisma.client.create({
    data
  });

  return res.status(201).json(client);
});

const updateClient = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const data = normalizeClientPayload(req.body);

  if (data.name) {
    const duplicate = await prisma.client.findFirst({
      where: {
        id: { not: id },
        name: {
          equals: data.name,
          mode: "insensitive"
        }
      },
      select: { id: true }
    });
    if (duplicate) {
      throw new AppError("Client with this name already exists", 409);
    }
  }

  const client = await prisma.client.update({
    where: { id },
    data
  });

  return res.json(client);
});

module.exports = {
  listClients,
  getClientById,
  createClient,
  updateClient
};
