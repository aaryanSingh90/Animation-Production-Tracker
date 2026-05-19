const prisma = require("../utils/prisma");
const { AppError, asyncHandler } = require("../utils/http");
const { getDepartmentForStage, normalizeStageCode } = require("../constants/stageDepartmentMap");

function stageDisplayName(stage) {
  return stage.customName || stage.stageTemplate?.name || stage.stageName;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/department/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function getEmployeeLoad(userId) {
  const [leadStages, assignments] = await Promise.all([
    prisma.projectStage.findMany({
      where: {
        isActive: true,
        assignedUserId: userId
      },
      select: { id: true }
    }),
    prisma.stageAssignment.findMany({
      where: {
        userId,
        projectStage: {
          isActive: true,
          status: {
            in: ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "REJECTED", "ISSUE", "EXTENDED"]
          }
        }
      },
      select: {
        projectStageId: true
      }
    })
  ]);

  const stageIds = new Set(leadStages.map((stage) => stage.id));
  for (const assignment of assignments) {
    stageIds.add(assignment.projectStageId);
  }

  return stageIds.size;
}

const getRecommendations = asyncHandler(async (req, res) => {
  const stageId = Number(req.params.stageId);

  const stage = await prisma.projectStage.findUnique({
    where: { id: stageId },
    include: {
      stageTemplate: {
        select: {
          name: true
        }
      },
      stageDefinition: {
        select: {
          code: true
        }
      },
      project: {
        select: {
          id: true,
          name: true
        }
      },
      assignments: {
        select: {
          userId: true
        }
      }
    }
  });

  if (!stage) {
    throw new AppError("Stage not found", 404);
  }

  const assignedIds = new Set(stage.assignments.map((assignment) => assignment.userId));
  if (stage.assignedUserId) assignedIds.add(stage.assignedUserId);

  const mappedDepartment = getDepartmentForStage(normalizeStageCode(stage.stageDefinition?.code || stage.stageName));
  const departmentHint = normalize(mappedDepartment || stage.departmentName || stage.stageName);

  const employees = await prisma.user.findMany({
    where: {
      isActive: true,
      role: {
        in: ["EMPLOYEE", "COORDINATOR"]
      }
    },
    select: {
      id: true,
      name: true,
      email: true,
      employmentType: true,
      availabilityStatus: true,
      departmentId: true,
      departmentName: true,
      department: {
        select: {
          id: true,
          name: true,
          color: true
        }
      },
      skills: true,
      team: {
        select: {
          id: true,
          name: true,
          color: true
        }
      }
    }
  });

  const recommendations = [];

  for (const employee of employees) {
    const currentLoad = await getEmployeeLoad(employee.id);
    const utilization = Math.min(100, Math.round((currentLoad / 6) * 100));

    const departmentName = employee.department?.name || employee.departmentName || "";
    const departmentScore = normalize(departmentName).includes(departmentHint) || departmentHint.includes(normalize(departmentName)) ? 30 : 0;

    const skillScore = (employee.skills || []).some((skill) => normalize(skill).includes(departmentHint)) ? 20 : 0;
    const loadScore = Math.max(0, 60 - utilization);
    const availabilityScore = employee.availabilityStatus === "AVAILABLE" ? 20 : employee.availabilityStatus === "BUSY" ? 8 : 0;
    const assignedPenalty = assignedIds.has(employee.id) ? -100 : 0;

    const score = departmentScore + skillScore + loadScore + availabilityScore + assignedPenalty;

    recommendations.push({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      team: employee.team,
      department: employee.department || (employee.departmentName ? { name: employee.departmentName } : null),
      employmentType: employee.employmentType,
      availabilityStatus: employee.availabilityStatus,
      currentLoad,
      utilization,
      score,
      reason: [
        departmentScore ? "Department match" : null,
        skillScore ? "Skill match" : null,
        utilization < 70 ? "Low workload" : null,
        employee.availabilityStatus === "AVAILABLE" ? "Available now" : null
      ].filter(Boolean)
    });
  }

  recommendations.sort((a, b) => b.score - a.score);

  return res.json({
    stage: {
      id: stage.id,
      projectId: stage.projectId,
      projectName: stage.project.name,
      stageName: stage.stageName,
      stageDisplayName: stageDisplayName(stage),
      departmentName: stage.departmentName,
      deadline: stage.deadline
    },
    recommendations
  });
});

const smartAssign = asyncHandler(async (req, res) => {
  const { projectStageId, userId, teamId } = req.body;
  const stageId = Number(projectStageId);

  if (!stageId) {
    throw new AppError("projectStageId is required", 400);
  }

  const stage = await prisma.projectStage.findUnique({
    where: { id: stageId },
    include: {
      project: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!stage) {
    throw new AppError("Stage not found", 404);
  }

  if (teamId) {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: {
          where: {
            isActive: true
          },
          select: { id: true }
        }
      }
    });

    if (!team || team.isArchived) {
      throw new AppError("Team not found", 404);
    }

    const memberIds = team.members.map((member) => member.id);
    if (!memberIds.length) {
      throw new AppError("Team has no active members", 400);
    }

    await prisma.$transaction(
      memberIds.map((memberId) =>
        prisma.stageAssignment.upsert({
          where: {
            projectStageId_userId: {
              projectStageId: stageId,
              userId: memberId
            }
          },
          create: {
            projectStageId: stageId,
            userId: memberId
          },
          update: {}
        })
      )
    );

    await prisma.projectStage.update({
      where: { id: stageId },
      data: {
        assignedUserId: stage.assignedUserId || memberIds[0]
      }
    });

    return res.json({
      success: true,
      type: "team",
      assignedCount: memberIds.length,
      teamId,
      stageId
    });
  }

  const normalizedUserId = Number(userId);
  if (!normalizedUserId) {
    throw new AppError("userId or teamId is required", 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: normalizedUserId },
    select: {
      id: true,
      isActive: true,
      name: true
    }
  });

  if (!user || !user.isActive) {
    throw new AppError("User not found", 404);
  }

  await prisma.stageAssignment.upsert({
    where: {
      projectStageId_userId: {
        projectStageId: stageId,
        userId: normalizedUserId
      }
    },
    create: {
      projectStageId: stageId,
      userId: normalizedUserId
    },
    update: {}
  });

  await prisma.projectStage.update({
    where: { id: stageId },
    data: {
      assignedUserId: stage.assignedUserId || normalizedUserId
    }
  });

  return res.json({
    success: true,
    type: "user",
    userId: normalizedUserId,
    stageId
  });
});

const getAssignmentsBoard = asyncHandler(async (req, res) => {
  const [projects, teams] = await Promise.all([
    prisma.project.findMany({
      include: {
        stages: {
          where: { isActive: true },
          include: {
            stageTemplate: {
              select: {
                name: true
              }
            },
            assignedUser: {
              select: {
                id: true,
                name: true,
                team: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            },
            assignments: {
              select: {
                userId: true
              }
            }
          },
          orderBy: [{ order: "asc" }, { createdAt: "asc" }]
        }
      },
      orderBy: { priority: "asc" }
    }),
    prisma.team.findMany({
      where: { isArchived: false },
      select: {
        id: true,
        name: true,
        color: true,
        departmentId: true,
        department: {
          select: {
            id: true,
            name: true
          }
        },
        members: {
          where: { isActive: true },
          select: { id: true, name: true }
        }
      },
      orderBy: { name: "asc" }
    })
  ]);

  const assignmentBoard = projects.map((project) => ({
    id: project.id,
    name: project.name,
    priority: project.priority,
    progressPercent: project.progressPercent,
    stages: project.stages.map((stage) => ({
      id: stage.id,
      stageName: stage.stageName,
      stageDisplayName: stageDisplayName(stage),
      departmentName: stage.departmentName,
      status: stage.status,
      deadline: stage.deadline,
      assignedUser: stage.assignedUser,
      assignmentCount: stage.assignments.length,
      isUnassigned: !stage.assignments.length && !stage.assignedUserId
    }))
  }));

  return res.json({
    projects: assignmentBoard,
    teams
  });
});

module.exports = {
  getRecommendations,
  smartAssign,
  getAssignmentsBoard
};
