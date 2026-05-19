const bcrypt = require("bcryptjs");
const prisma = require("../utils/prisma");
const { AppError, asyncHandler } = require("../utils/http");
const { MANAGER_ROLES } = require("../utils/constants");
const { createNotification } = require("../utils/notifications");
const { logActivity } = require("../utils/activities");
const { presentUser } = require("../utils/userPresenter");

function isManager(role) {
  return MANAGER_ROLES.includes(role);
}

async function resolveDepartmentInfo({ departmentId, departmentName }) {
  if (!departmentId) {
    return {
      departmentId: null,
      departmentName: departmentName || null
    };
  }

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true }
  });

  if (!department) {
    throw new AppError("Department not found", 404);
  }

  return {
    departmentId: department.id,
    departmentName: department.name
  };
}

async function resolveTeam(teamId) {
  if (!teamId) return null;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      isArchived: true,
      departmentId: true,
      department: {
        select: { id: true, name: true }
      }
    }
  });

  if (!team || team.isArchived) {
    throw new AppError("Team not found", 404);
  }

  return team;
}

const listUsers = asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      joinedAt: true,
      departmentId: true,
      departmentName: true,
      teamId: true,
      availabilityStatus: true,
      skills: true,
      employmentType: true,
      isActive: true,
      createdAt: true,
      team: {
        select: {
          id: true,
          name: true,
          color: true
        }
      },
      department: {
        select: {
          id: true,
          name: true,
          color: true
        }
      },
      _count: {
        select: {
          assignedProjectStages: true
        }
      }
    }
  });

  return res.json(
    users.map((user) => ({
      ...presentUser(user),
      team: user.team || null
    }))
  );
});

const createUser = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    role,
    phone,
    teamId: rawTeamId,
    departmentId: rawDepartmentId,
    departmentName: rawDepartmentName,
    department: legacyDepartment,
    employmentType = "INHOUSE",
    availabilityStatus = "AVAILABLE",
    skills
  } = req.body;

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

  let departmentId = rawDepartmentId || null;
  if (departmentId === "") departmentId = null;

  let teamId = rawTeamId || null;
  if (teamId === "") teamId = null;

  let departmentName = rawDepartmentName || legacyDepartment || null;

  const team = await resolveTeam(teamId);
  if (team?.departmentId && !departmentId) {
    departmentId = team.departmentId;
    departmentName = team.department?.name || departmentName;
  }

  const department = await resolveDepartmentInfo({
    departmentId,
    departmentName
  });

  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      password: hashed,
      role,
      phone: phone || null,
      departmentId: department.departmentId,
      departmentName: department.departmentName,
      teamId,
      employmentType,
      availabilityStatus,
      skills: Array.isArray(skills) ? skills.filter(Boolean) : []
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      joinedAt: true,
      departmentId: true,
      departmentName: true,
      teamId: true,
      availabilityStatus: true,
      skills: true,
      employmentType: true,
      isActive: true,
      team: {
        select: {
          id: true,
          name: true,
          color: true
        }
      },
      department: {
        select: {
          id: true,
          name: true,
          color: true
        }
      }
    }
  });

  return res.status(201).json({
    ...presentUser(user),
    team: user.team || null
  });
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
      phone: true,
      joinedAt: true,
      departmentId: true,
      departmentName: true,
      teamId: true,
      availabilityStatus: true,
      skills: true,
      team: {
        select: {
          id: true,
          name: true,
          color: true,
          leadId: true,
          lead: {
            select: {
              id: true,
              name: true
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
      employmentType: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      assignedProjectStages: {
        include: {
          project: { select: { id: true, name: true } }
        },
        orderBy: { deadline: "asc" }
      },
      stageAssignments: {
        include: {
          projectStage: {
            include: {
              project: { select: { id: true, name: true } }
            }
          }
        }
      }
    }
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  const stageMap = new Map();
  for (const stage of user.assignedProjectStages) {
    stageMap.set(stage.id, stage);
  }
  for (const assignment of user.stageAssignments) {
    if (!stageMap.has(assignment.projectStage.id)) {
      stageMap.set(assignment.projectStage.id, assignment.projectStage);
    }
  }

  const mergedStages = Array.from(stageMap.values()).sort((a, b) => {
    const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
    const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
    return aDeadline - bDeadline;
  });

  const submittedCount = mergedStages.filter((stage) => stage.submittedAt).length;
  const approvedCount = mergedStages.filter((stage) => stage.status === "APPROVED").length;
  const rejectedCount = mergedStages.filter((stage) => stage.status === "REJECTED").length;
  const delayedCount = mergedStages.filter(
    (stage) => stage.deadline && new Date(stage.deadline) < new Date() && stage.status !== "APPROVED"
  ).length;

  const approvalRate = submittedCount === 0 ? 0 : Number(((approvedCount / submittedCount) * 100).toFixed(2));

  return res.json({
    ...presentUser(user),
    team: user.team || null,
    assignedProjectStages: mergedStages,
    stageAssignments: undefined,
    stats: {
      submittedCount,
      approvedCount,
      rejectedCount,
      delayedCount,
      approvalRate,
      activeStages: mergedStages.filter((stage) => stage.status !== "APPROVED").length,
      completedStages: mergedStages.filter((stage) => stage.status === "APPROVED").length,
      productivityScore: Math.max(0, Math.min(100, Math.round(approvalRate - delayedCount * 3 + 10)))
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
  const allowedForSelf = ["name", "departmentId", "departmentName", "teamId", "availabilityStatus", "phone"];
  const allowedForManager = [
    "name",
    "email",
    "role",
    "departmentId",
    "departmentName",
    "teamId",
    "employmentType",
    "availabilityStatus",
    "skills",
    "phone",
    "isActive",
    "password"
  ];
  const allowed = isManager(req.user.role) ? allowedForManager : allowedForSelf;

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      payload[key] = req.body[key];
    }
  }

  if (payload.email) {
    payload.email = String(payload.email).toLowerCase();
  }

  if (Object.prototype.hasOwnProperty.call(payload, "teamId")) {
    if (payload.teamId === "") payload.teamId = null;
    const team = await resolveTeam(payload.teamId);
    if (team?.departmentId && !Object.prototype.hasOwnProperty.call(payload, "departmentId")) {
      payload.departmentId = team.departmentId;
      payload.departmentName = team.department?.name || payload.departmentName || null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "departmentId")) {
    if (payload.departmentId === "") payload.departmentId = null;

    const department = await resolveDepartmentInfo({
      departmentId: payload.departmentId,
      departmentName: payload.departmentName
    });

    payload.departmentId = department.departmentId;
    payload.departmentName = department.departmentName;
  }

  if (payload.employmentType && !["INHOUSE", "FREELANCE"].includes(payload.employmentType)) {
    throw new AppError("Invalid employmentType", 400);
  }

  if (payload.availabilityStatus && !["AVAILABLE", "BUSY", "ON_LEAVE", "OVERLOADED"].includes(payload.availabilityStatus)) {
    throw new AppError("Invalid availabilityStatus", 400);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "skills")) {
    if (!Array.isArray(payload.skills)) {
      throw new AppError("skills must be an array", 400);
    }
    payload.skills = payload.skills.filter(Boolean);
  }

  if (payload.password) {
    if (String(payload.password).length < 8) {
      throw new AppError("Password must be at least 8 characters", 400);
    }
    payload.password = await bcrypt.hash(String(payload.password), 10);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: payload,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      joinedAt: true,
      departmentId: true,
      departmentName: true,
      teamId: true,
      availabilityStatus: true,
      skills: true,
      employmentType: true,
      isActive: true,
      team: {
        select: {
          id: true,
          name: true,
          color: true
        }
      },
      department: {
        select: {
          id: true,
          name: true,
          color: true
        }
      }
    }
  });

  return res.json({
    ...presentUser(updated),
    team: updated.team || null
  });
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
    where: {
      isActive: true,
      OR: [
        { assignedUserId: userId },
        {
          assignments: {
            some: {
              userId
            }
          }
        }
      ]
    },
    include: {
      project: { select: { id: true, name: true, priority: true } },
      assignments: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              employmentType: true,
              departmentId: true,
              departmentName: true,
              department: {
                select: { id: true, name: true, color: true }
              }
            }
          }
        }
      }
    },
    orderBy: [{ status: "asc" }, { deadline: "asc" }]
  });

  return res.json(stages);
});

const assignUserToStage = asyncHandler(async (req, res) => {
  const userId = Number(req.params.id);
  const stageId = Number(req.body.stageId || req.body.projectStageId);

  if (!stageId) {
    throw new AppError("stageId or projectStageId is required", 400);
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
    },
    include: {
      assignments: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              employmentType: true,
              departmentId: true,
              departmentName: true,
              department: {
                select: { id: true, name: true, color: true }
              }
            }
          }
        }
      }
    }
  });

  await prisma.stageAssignment.upsert({
    where: {
      projectStageId_userId: {
        projectStageId: stageId,
        userId
      }
    },
    create: {
      projectStageId: stageId,
      userId
    },
    update: {}
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
