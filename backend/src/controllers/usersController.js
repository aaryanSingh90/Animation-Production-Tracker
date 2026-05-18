const bcrypt = require("bcryptjs");
const prisma = require("../utils/prisma");
const { AppError, asyncHandler } = require("../utils/http");
const { MANAGER_ROLES } = require("../utils/constants");
const { createNotification } = require("../utils/notifications");
const { logActivity } = require("../utils/activities");

function isManager(role) {
  return MANAGER_ROLES.includes(role);
}

const listUsers = asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      isActive: true,
      createdAt: true,
      _count: {
        select: {
          assignedProjectStages: true
        }
      }
    }
  });

  return res.json(users);
});

const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, department } = req.body;

  if (!name || !email || !password || !role) {
    throw new AppError("name, email, password and role are required", 400);
  }

  if (password.length < 8) {
    throw new AppError("Password must be at least 8 characters", 400);
  }

  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase() }
  });
  if (existing) {
    throw new AppError("Email already exists", 409);
  }

  const hashed = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      password: hashed,
      role,
      department
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      isActive: true
    }
  });

  return res.status(201).json(user);
});

const getUserById = asyncHandler(async (req, res) => {
  const userId = Number(req.params.id);
  if (!isManager(req.user.role) && req.user.id !== userId) {
    throw new AppError("Forbidden", 403);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      assignedProjectStages: {
        include: {
          project: { select: { id: true, name: true } }
        },
        orderBy: { deadline: "asc" }
      }
    }
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  const submittedCount = user.assignedProjectStages.filter((stage) => stage.submittedAt).length;
  const approvedCount = user.assignedProjectStages.filter((stage) => stage.status === "APPROVED").length;
  const approvalRate = submittedCount === 0 ? 0 : Number(((approvedCount / submittedCount) * 100).toFixed(2));

  return res.json({
    ...user,
    stats: {
      submittedCount,
      approvedCount,
      approvalRate,
      activeStages: user.assignedProjectStages.filter((stage) => stage.status !== "APPROVED").length
    }
  });
});

const updateUser = asyncHandler(async (req, res) => {
  const userId = Number(req.params.id);
  if (!isManager(req.user.role) && req.user.id !== userId) {
    throw new AppError("Forbidden", 403);
  }

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    throw new AppError("User not found", 404);
  }

  const payload = {};
  const allowedForSelf = ["name", "department"];
  const allowedForManager = ["name", "email", "role", "department", "isActive"];
  const allowed = isManager(req.user.role) ? allowedForManager : allowedForSelf;

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      payload[key] = req.body[key];
    }
  }

  if (payload.email) {
    payload.email = String(payload.email).toLowerCase();
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: payload,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      isActive: true
    }
  });

  return res.json(updated);
});

const deactivateUser = asyncHandler(async (req, res) => {
  const userId = Number(req.params.id);
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    throw new AppError("User not found", 404);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: false }
  });

  return res.json({ message: "User deactivated" });
});

const getWorkload = asyncHandler(async (req, res) => {
  const userId = Number(req.params.id);
  if (!isManager(req.user.role) && req.user.id !== userId) {
    throw new AppError("Forbidden", 403);
  }

  const stages = await prisma.projectStage.findMany({
    where: { assignedUserId: userId },
    include: {
      project: { select: { id: true, name: true, priority: true } }
    },
    orderBy: [{ status: "asc" }, { deadline: "asc" }]
  });

  return res.json(stages);
});

const assignUserToStage = asyncHandler(async (req, res) => {
  const userId = Number(req.params.id);
  const stageId = Number(req.body.stageId);

  if (!stageId) {
    throw new AppError("stageId is required", 400);
  }

  const [user, stage] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.projectStage.findUnique({
      where: { id: stageId },
      include: { project: true }
    })
  ]);

  if (!user || !user.isActive) {
    throw new AppError("User not found", 404);
  }

  if (!stage) {
    throw new AppError("Stage not found", 404);
  }

  const updated = await prisma.projectStage.update({
    where: { id: stageId },
    data: {
      assignedUserId: userId
    }
  });

  await createNotification({
    userId,
    message: `You were assigned ${stage.stageName.replaceAll("_", " ")} for ${stage.project.name}.`,
    type: "ASSIGNED",
    relatedProjectId: stage.projectId,
    relatedStageId: stage.id
  });

  await logActivity({
    projectId: stage.projectId,
    stageId: stage.id,
    actorId: req.user.id,
    eventType: "ASSIGNED",
    message: `${req.user.name} assigned ${user.name} to ${stage.stageName.replaceAll("_", " ")}.`
  });

  return res.json(updated);
});

module.exports = {
  listUsers,
  createUser,
  getUserById,
  updateUser,
  deactivateUser,
  getWorkload,
  assignUserToStage
};
