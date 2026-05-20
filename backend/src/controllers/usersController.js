const bcrypt = require("bcryptjs");
const prisma = require("../utils/prisma");
const { AppError, asyncHandler } = require("../utils/http");
const { MANAGER_ROLES } = require("../utils/constants");
const { createNotification } = require("../utils/notifications");
const { logActivity } = require("../utils/activities");
const { presentUser } = require("../utils/userPresenter");
const {
  isApprovedStatus,
  isCompleteStatus,
  isLateStatus,
  isPendingReviewStatus,
  isRetakeStatus
} = require("../utils/pipelineStatus");

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
      assignedProjectStages: {
        where: {
          isActive: true
        },
        select: {
          projectId: true
        }
      },
      stageAssignments: {
        where: {
          projectStage: {
            isActive: true
          }
        },
        select: {
          projectStage: {
            select: {
              projectId: true
            }
          }
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
    users.map((user) => {
      const projectIds = new Set();
      for (const stage of user.assignedProjectStages || []) {
        if (stage.projectId) projectIds.add(stage.projectId);
      }
      for (const assignment of user.stageAssignments || []) {
        const projectId = assignment.projectStage?.projectId;
        if (projectId) projectIds.add(projectId);
      }
      const { assignedProjectStages, stageAssignments, ...safeUser } = user;

      return {
        ...presentUser(safeUser),
        team: user.team || null,
        assignedProjectIds: Array.from(projectIds),
        assignedProjectCount: projectIds.size
      };
    })
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
      assignedShotStages: {
        include: {
          shot: {
            include: {
              project: { select: { id: true, name: true } }
            }
          },
          stageDefinition: true
        },
        orderBy: { deadline: "asc" }
      },
      assignedAssetStages: {
        include: {
          asset: {
            include: {
              project: { select: { id: true, name: true } }
            }
          },
          stageDefinition: true
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

  const submittedCount = mergedStages.filter((stage) => isPendingReviewStatus(stage.status) || stage.submittedAt).length;
  const approvedCount = mergedStages.filter((stage) => isApprovedStatus(stage.status)).length;
  const rejectedCount = mergedStages.filter((stage) => isRetakeStatus(stage.status)).length;
  const delayedCount = mergedStages.filter((stage) => isLateStatus(stage.status, stage.deadline)).length;

  const approvalRate = submittedCount === 0 ? 0 : Number(((approvedCount / submittedCount) * 100).toFixed(2));

  const shotStageAssignments = (user.assignedShotStages || []).map((item) => ({
    id: item.id,
    trackingType: "SHOT",
    status: item.status,
    deadline: item.deadline,
    submittedAt: item.submittedAt,
    approvedAt: item.approvedAt,
    stageName: item.stageDefinition?.name || item.stageDefinition?.code || "Shot Stage",
    project: item.shot?.project
  }));

  const assetStageAssignments = (user.assignedAssetStages || []).map((item) => ({
    id: item.id,
    trackingType: "ASSET",
    status: item.status,
    deadline: item.deadline,
    submittedAt: item.submittedAt,
    approvedAt: item.approvedAt,
    stageName: item.stageDefinition?.name || item.stageDefinition?.code || "Asset Stage",
    project: item.asset?.project
  }));

  return res.json({
    ...presentUser(user),
    team: user.team || null,
    assignedProjectStages: mergedStages,
    assignedShotStages: shotStageAssignments,
    assignedAssetStages: assetStageAssignments,
    stageAssignments: undefined,
    stats: {
      submittedCount,
      approvedCount,
      rejectedCount,
      delayedCount,
      approvalRate,
      activeStages:
        mergedStages.filter((stage) => !isApprovedStatus(stage.status)).length +
        shotStageAssignments.filter((stage) => !isApprovedStatus(stage.status)).length +
        assetStageAssignments.filter((stage) => !isApprovedStatus(stage.status)).length,
      completedStages:
        mergedStages.filter((stage) => isApprovedStatus(stage.status)).length +
        shotStageAssignments.filter((stage) => isApprovedStatus(stage.status)).length +
        assetStageAssignments.filter((stage) => isApprovedStatus(stage.status)).length,
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

const resetEmployeePassword = asyncHandler(async (req, res) => {
  const { userId, newPassword, forcePasswordChange = false } = req.body;

  const user = await prisma.user.findUnique({
    where: { id: Number(userId) },
    select: { id: true, name: true, email: true, isActive: true }
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (String(newPassword).length < 8) {
    throw new AppError("Password must be at least 8 characters", 400);
  }

  const passwordHash = await bcrypt.hash(String(newPassword), 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: passwordHash
    }
  });

  return res.json({
    message: forcePasswordChange
      ? "Password reset successfully. Force password change flag is accepted for compatibility."
      : "Password reset successfully"
  });
});

const setEmployeeActiveStatus = asyncHandler(async (req, res) => {
  const { userId, isActive = false } = req.body;

  const user = await prisma.user.findUnique({
    where: { id: Number(userId) },
    select: { id: true, name: true, email: true, isActive: true }
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      isActive: Boolean(isActive)
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

  return res.json({
    message: updated.isActive ? "User reactivated" : "User deactivated",
    user: {
      ...presentUser(updated),
      team: updated.team || null
    }
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

  const [shotStages, assetStages] = await Promise.all([
    prisma.shotStage.findMany({
      where: {
        OR: [{ assignedUserId: userId }, { taskAssignments: { some: { employeeId: userId } } }]
      },
      include: {
        shot: {
          include: {
            project: { select: { id: true, name: true, priority: true } }
          }
        },
        stageDefinition: true,
        taskAssignments: {
          where: { employeeId: userId }
        }
      },
      orderBy: [{ status: "asc" }, { deadline: "asc" }]
    }),
    prisma.assetStage.findMany({
      where: {
        OR: [{ assignedUserId: userId }, { taskAssignments: { some: { employeeId: userId } } }]
      },
      include: {
        asset: {
          include: {
            project: { select: { id: true, name: true, priority: true } }
          }
        },
        stageDefinition: true,
        taskAssignments: {
          where: { employeeId: userId }
        }
      },
      orderBy: [{ status: "asc" }, { deadline: "asc" }]
    })
  ]);

  return res.json({
    projectStages: stages,
    shotStages,
    assetStages
  });
});

function parseSummaryUserIds(rawValue) {
  return Array.from(
    new Set(
      String(rawValue || "")
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  ).slice(0, 200);
}

function labelizeUserRole(role) {
  if (role === "BOSS") return "Studio Lead";
  if (role === "PRODUCTION_MANAGER") return "Production Manager";
  if (role === "COORDINATOR") return "Coordinator";
  return "Artist";
}

function buildShotLabel(shot) {
  return shot?.label || shot?.name || (shot?.shotNumber ? `SH_${String(shot.shotNumber).padStart(3, "0")}` : "Shot");
}

function buildActiveTaskSummary({ type, label, status, projectId, projectName, startedAt, dueDate, completedAt }) {
  return {
    type,
    label,
    status,
    projectId,
    projectName,
    startedAt: startedAt || null,
    dueDate: dueDate || null,
    completedAt: completedAt || null
  };
}

function getAvailabilityState(user, summary) {
  if (!user?.isActive) return "OFFLINE";
  if (user?.availabilityStatus === "ON_LEAVE") return "ON_LEAVE";
  if (user?.availabilityStatus === "OVERLOADED" || summary.workloadPercent >= 85) return "OVERLOADED";
  if (summary.lateTasks > 0) return "LATE";
  if (user?.availabilityStatus === "BUSY" || summary.workloadPercent >= 60 || summary.activeTasks >= 8) return "BUSY";
  return "AVAILABLE";
}

function calculateWorkloadPercent(summary) {
  return Math.min(
    100,
    summary.activeTasks * 10 +
      summary.pendingReviews * 6 +
      summary.lateTasks * 14 +
      summary.finalApprovals * 4
  );
}

const getWorkloadSummaries = asyncHandler(async (req, res) => {
  const userIds = parseSummaryUserIds(req.query.ids);
  if (!userIds.length) {
    return res.json({ items: [] });
  }

  if (!isManager(req.user.role)) {
    if (userIds.length !== 1 || userIds[0] !== req.user.id) {
      throw new AppError("Forbidden", 403);
    }
  }

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      departmentId: true,
      departmentName: true,
      employmentType: true,
      availabilityStatus: true,
      isActive: true,
      department: {
        select: {
          id: true,
          name: true,
          color: true
        }
      }
    }
  });

  const requestedIds = new Set(users.map((user) => user.id));

  const [projectStages, shotStages, assetStages, audioTasks] = await Promise.all([
    prisma.projectStage.findMany({
      where: {
        isActive: true,
        OR: [{ assignedUserId: { in: userIds } }, { assignments: { some: { userId: { in: userIds } } } }]
      },
      select: {
        id: true,
        stageName: true,
        assignedUserId: true,
        status: true,
        startDate: true,
        actualStartedAt: true,
        endDate: true,
        actualDoneAt: true,
        approvedAt: true,
        rejectedAt: true,
        deadline: true,
        updatedAt: true,
        projectId: true,
        project: {
          select: {
            id: true,
            name: true
          }
        },
        assignments: {
          where: { userId: { in: userIds } },
          select: { userId: true }
        }
      }
    }),
    prisma.shotStage.findMany({
      where: {
        OR: [{ assignedUserId: { in: userIds } }, { taskAssignments: { some: { employeeId: { in: userIds } } } }]
      },
      select: {
        id: true,
        status: true,
        assignedUserId: true,
        startDate: true,
        startedAt: true,
        endDate: true,
        endedAt: true,
        actualStartedAt: true,
        actualDoneAt: true,
        submittedAt: true,
        approvedAt: true,
        deadline: true,
        updatedAt: true,
        stageDefinition: {
          select: { code: true, name: true }
        },
        shot: {
          select: {
            id: true,
            label: true,
            name: true,
            shotNumber: true,
            projectId: true,
            project: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        taskAssignments: {
          where: { employeeId: { in: userIds } },
          select: { employeeId: true }
        }
      }
    }),
    prisma.assetStage.findMany({
      where: {
        OR: [{ assignedUserId: { in: userIds } }, { taskAssignments: { some: { employeeId: { in: userIds } } } }]
      },
      select: {
        id: true,
        status: true,
        assignedUserId: true,
        startDate: true,
        startedAt: true,
        endDate: true,
        endedAt: true,
        actualStartedAt: true,
        actualDoneAt: true,
        submittedAt: true,
        approvedAt: true,
        deadline: true,
        updatedAt: true,
        stageDefinition: {
          select: { code: true, name: true }
        },
        asset: {
          select: {
            id: true,
            name: true,
            projectId: true,
            project: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        taskAssignments: {
          where: { employeeId: { in: userIds } },
          select: { employeeId: true }
        }
      }
    }),
    prisma.audioTask.findMany({
      where: {
        OR: [{ assignedUserId: { in: userIds } }, { taskAssignments: { some: { employeeId: { in: userIds } } } }]
      },
      select: {
        id: true,
        name: true,
        status: true,
        assignedUserId: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        updatedAt: true,
        projectId: true,
        project: {
          select: {
            id: true,
            name: true
          }
        },
        taskAssignments: {
          where: { employeeId: { in: userIds } },
          select: { employeeId: true }
        }
      }
    })
  ]);

  const summaries = new Map();
  for (const user of users) {
    summaries.set(user.id, {
      userId: user.id,
      role: labelizeUserRole(user.role),
      rawRole: user.role,
      departmentName: user.department?.name || user.departmentName || null,
      employmentType: user.employmentType,
      availabilityStatus: user.availabilityStatus || "AVAILABLE",
      isActive: user.isActive,
      assignedProjects: 0,
      activeTasks: 0,
      lateTasks: 0,
      pendingReviews: 0,
      finalApprovals: 0,
      activeSince: null,
      expectedFreeDate: null,
      lastCompletedTask: null,
      workloadPercent: 0,
      currentProjects: [],
      hiddenProjectCount: 0,
      _projectIds: new Set(),
      _activeTasks: [],
      _projectTaskMap: new Map()
    });
  }

  function attachTask(userId, task) {
    if (!requestedIds.has(userId) || !summaries.has(userId)) return;
    const summary = summaries.get(userId);
    summary._projectIds.add(task.projectId);

    const isComplete = isCompleteStatus(task.status);
    const isLate = isLateStatus(task.status, task.dueDate);
    const isPendingReview = isPendingReviewStatus(task.status);

    if (!isComplete) {
      summary.activeTasks += 1;
      summary._activeTasks.push(task);
      if (!summary.activeSince || (task.startedAt && new Date(task.startedAt) < new Date(summary.activeSince))) {
        summary.activeSince = task.startedAt || summary.activeSince;
      }
      const freeDateCandidate = task.dueDate || task.completedAt || null;
      if (freeDateCandidate && (!summary.expectedFreeDate || new Date(freeDateCandidate) > new Date(summary.expectedFreeDate))) {
        summary.expectedFreeDate = freeDateCandidate;
      }

      const projectKey = `${task.projectId}`;
      if (!summary._projectTaskMap.has(projectKey)) {
        summary._projectTaskMap.set(projectKey, {
          projectId: task.projectId,
          projectName: task.projectName,
          tasks: []
        });
      }
      summary._projectTaskMap.get(projectKey).tasks.push(task.label);
    }

    if (isLate) summary.lateTasks += 1;
    if (isPendingReview) summary.pendingReviews += 1;
    if (task.status === "FINAL") summary.finalApprovals += 1;

    if (isComplete && task.completedAt) {
      if (!summary.lastCompletedTask || new Date(task.completedAt) > new Date(summary.lastCompletedTask.completedAt)) {
        summary.lastCompletedTask = {
          label: task.label,
          projectName: task.projectName,
          completedAt: task.completedAt
        };
      }
    }
  }

  for (const stage of projectStages) {
    const assigneeIds = new Set([
      ...(stage.assignedUserId ? [stage.assignedUserId] : []),
      ...stage.assignments.map((assignment) => assignment.userId)
    ]);
    const task = buildActiveTaskSummary({
      type: "PROJECT",
      label: stage.stageName,
      status: stage.status,
      projectId: stage.project.id,
      projectName: stage.project.name,
      startedAt: stage.actualStartedAt || stage.startDate,
      dueDate: stage.deadline || stage.endDate,
      completedAt: stage.approvedAt || stage.actualDoneAt || stage.updatedAt
    });
    assigneeIds.forEach((userId) => attachTask(userId, task));
  }

  for (const stage of shotStages) {
    const assigneeIds = new Set([
      ...(stage.assignedUserId ? [stage.assignedUserId] : []),
      ...stage.taskAssignments.map((assignment) => assignment.employeeId)
    ]);
    const task = buildActiveTaskSummary({
      type: "SHOT",
      label: buildShotLabel(stage.shot),
      status: stage.status,
      projectId: stage.shot.project.id,
      projectName: stage.shot.project.name,
      startedAt: stage.startedAt || stage.actualStartedAt || stage.startDate,
      dueDate: stage.deadline || stage.endDate,
      completedAt: stage.approvedAt || stage.actualDoneAt || stage.endedAt || stage.updatedAt
    });
    assigneeIds.forEach((userId) => attachTask(userId, task));
  }

  for (const stage of assetStages) {
    const assigneeIds = new Set([
      ...(stage.assignedUserId ? [stage.assignedUserId] : []),
      ...stage.taskAssignments.map((assignment) => assignment.employeeId)
    ]);
    const task = buildActiveTaskSummary({
      type: "ASSET",
      label: stage.asset?.name || stage.stageDefinition?.name || "Asset",
      status: stage.status,
      projectId: stage.asset.project.id,
      projectName: stage.asset.project.name,
      startedAt: stage.startedAt || stage.actualStartedAt || stage.startDate,
      dueDate: stage.deadline || stage.endDate,
      completedAt: stage.approvedAt || stage.actualDoneAt || stage.endedAt || stage.updatedAt
    });
    assigneeIds.forEach((userId) => attachTask(userId, task));
  }

  for (const taskRow of audioTasks) {
    const assigneeIds = new Set([
      ...(taskRow.assignedUserId ? [taskRow.assignedUserId] : []),
      ...taskRow.taskAssignments.map((assignment) => assignment.employeeId)
    ]);
    const task = buildActiveTaskSummary({
      type: "AUDIO",
      label: taskRow.name || "Audio Task",
      status: taskRow.status,
      projectId: taskRow.project.id,
      projectName: taskRow.project.name,
      startedAt: taskRow.startDate || taskRow.createdAt,
      dueDate: taskRow.endDate,
      completedAt: taskRow.endDate || taskRow.updatedAt
    });
    assigneeIds.forEach((userId) => attachTask(userId, task));
  }

  const items = users.map((user) => {
    const summary = summaries.get(user.id);
    const projectGroups = Array.from(summary._projectTaskMap.values())
      .sort((left, right) => right.tasks.length - left.tasks.length || left.projectName.localeCompare(right.projectName));
    const currentProjects = projectGroups.slice(0, 3).map((group) => ({
      projectId: group.projectId,
      projectName: group.projectName,
      tasks: group.tasks.slice(0, 2),
      hiddenTaskCount: Math.max(group.tasks.length - 2, 0)
    }));
    summary.assignedProjects = summary._projectIds.size;
    summary.hiddenProjectCount = Math.max(projectGroups.length - currentProjects.length, 0);
    summary.currentProjects = currentProjects;
    summary.workloadPercent = calculateWorkloadPercent(summary);
    summary.liveStatus = getAvailabilityState(user, summary);

    delete summary._projectIds;
    delete summary._projectTaskMap;
    delete summary._activeTasks;

    return summary;
  });

  return res.json({ items });
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
  resetEmployeePassword,
  setEmployeeActiveStatus,
  deactivateUser,
  getWorkload,
  getWorkloadSummaries,
  assignUserToStage
};
