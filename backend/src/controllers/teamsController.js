const prisma = require("../utils/prisma");
const { AppError, asyncHandler } = require("../utils/http");
const { isApprovedStatus, isLateStatus, isRetakeStatus, isActiveStatus } = require("../utils/pipelineStatus");

function normalizeDepartmentName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/department/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function ensureLead(leadId) {
  if (!leadId) return null;
  const user = await prisma.user.findUnique({
    where: { id: Number(leadId) },
    select: { id: true, isActive: true, role: true }
  });

  if (!user || !user.isActive) {
    throw new AppError("Team lead not found", 404);
  }

  return user;
}

async function ensureDepartment(departmentId) {
  if (!departmentId) return null;
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true, color: true }
  });

  if (!department) {
    throw new AppError("Department not found", 404);
  }

  return department;
}

async function buildMemberStats(memberIds) {
  if (!memberIds.length) return new Map();

  const [leadStages, assignmentStages] = await Promise.all([
    prisma.projectStage.findMany({
      where: {
        isActive: true,
        assignedUserId: { in: memberIds }
      },
      select: {
        id: true,
        assignedUserId: true,
        status: true
      }
    }),
    prisma.stageAssignment.findMany({
      where: {
        userId: { in: memberIds },
        projectStage: {
          isActive: true
        }
      },
      select: {
        userId: true,
        projectStageId: true,
        projectStage: {
          select: {
            status: true
          }
        }
      }
    })
  ]);

  const stats = new Map();
  for (const memberId of memberIds) {
    stats.set(memberId, {
      taskIds: new Set(),
      approved: 0,
      rejected: 0,
      delayed: 0,
      active: 0
    });
  }

  for (const stage of leadStages) {
    const bucket = stats.get(stage.assignedUserId);
    if (!bucket) continue;
    bucket.taskIds.add(stage.id);
  }

  for (const assignment of assignmentStages) {
    const bucket = stats.get(assignment.userId);
    if (!bucket) continue;
    bucket.taskIds.add(assignment.projectStageId);

    if (isApprovedStatus(assignment.projectStage.status)) bucket.approved += 1;
    if (isRetakeStatus(assignment.projectStage.status)) bucket.rejected += 1;
    if (isActiveStatus(assignment.projectStage.status)) {
      bucket.active += 1;
    }
  }

  for (const bucket of stats.values()) {
    const active = bucket.active || bucket.taskIds.size;
    const overloadThreshold = 6;
    bucket.capacityPercent = Math.min(100, Math.round((active / overloadThreshold) * 100));
  }

  return stats;
}

const listTeams = asyncHandler(async (req, res) => {
  const teams = await prisma.team.findMany({
    where: { isArchived: false },
    include: {
      department: {
        select: {
          id: true,
          name: true,
          color: true
        }
      },
      lead: {
        select: {
          id: true,
          name: true,
          role: true
        }
      },
      members: {
        where: { isActive: true },
        select: {
          id: true,
          employmentType: true,
          availabilityStatus: true
        }
      },
      projects: {
        include: {
          project: {
            select: {
              id: true,
              name: true,
              priority: true,
              progressPercent: true
            }
          }
        }
      },
      _count: {
        select: {
          members: true,
          projects: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  const memberIds = teams.flatMap((team) => team.members.map((member) => member.id));
  const memberStats = await buildMemberStats(memberIds);

  const payload = teams.map((team) => {
    const inhouse = team.members.filter((member) => member.employmentType === "INHOUSE").length;
    const freelance = team.members.filter((member) => member.employmentType === "FREELANCE").length;

    const capacities = team.members
      .map((member) => memberStats.get(member.id)?.capacityPercent || 0)
      .filter((value) => Number.isFinite(value));

    const capacityPercent = capacities.length
      ? Math.round(capacities.reduce((sum, value) => sum + value, 0) / capacities.length)
      : 0;

    return {
      id: team.id,
      name: team.name,
      description: team.description,
      color: team.color,
      department: team.department,
      lead: team.lead,
      memberCount: team._count.members,
      projectCount: team._count.projects,
      inhouseCount: inhouse,
      freelanceCount: freelance,
      capacityPercent,
      members: team.members,
      projects: team.projects.map((item) => ({
        id: item.project.id,
        name: item.project.name,
        priority: item.project.priority,
        progressPercent: item.project.progressPercent,
        assignedAt: item.createdAt
      })),
      createdAt: team.createdAt,
      updatedAt: team.updatedAt
    };
  });

  res.json(payload);
});

const getTeamById = asyncHandler(async (req, res) => {
  const teamId = req.params.id;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      department: {
        select: {
          id: true,
          name: true,
          color: true
        }
      },
      lead: {
        select: {
          id: true,
          name: true,
          role: true,
          employmentType: true
        }
      },
      members: {
        where: {
          isActive: true
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          phone: true,
          joinedAt: true,
          employmentType: true,
          availabilityStatus: true,
          skills: true,
          departmentId: true,
          departmentName: true,
          department: {
            select: {
              id: true,
              name: true,
              color: true
            }
          }
        },
        orderBy: { name: "asc" }
      },
      projects: {
        include: {
          project: {
            select: {
              id: true,
              name: true,
              priority: true,
              progressPercent: true,
              stages: {
                where: { isActive: true },
                select: {
                  id: true,
                  stageName: true,
                  status: true,
                  deadline: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      }
    }
  });

  if (!team || team.isArchived) {
    throw new AppError("Team not found", 404);
  }

  const memberIds = team.members.map((member) => member.id);
  const statsMap = await buildMemberStats(memberIds);

  const members = team.members.map((member) => {
    const stats = statsMap.get(member.id);
    return {
      ...member,
      workload: {
        activeTasks: stats?.taskIds?.size || 0,
        capacityPercent: stats?.capacityPercent || 0,
        approvedCount: stats?.approved || 0,
        rejectedCount: stats?.rejected || 0
      }
    };
  });

  const delayedStages = team.projects.flatMap((projectLink) =>
    (projectLink.project.stages || []).filter((stage) => isLateStatus(stage.status, stage.deadline))
  );

  const avgProgress = team.projects.length
    ? Math.round(team.projects.reduce((sum, link) => sum + (link.project.progressPercent || 0), 0) / team.projects.length)
    : 0;

  return res.json({
    id: team.id,
    name: team.name,
    description: team.description,
    color: team.color,
    department: team.department,
    lead: team.lead,
    memberCount: members.length,
    inhouseCount: members.filter((member) => member.employmentType === "INHOUSE").length,
    freelanceCount: members.filter((member) => member.employmentType === "FREELANCE").length,
    delayedStages: delayedStages.length,
    completionRate: avgProgress,
    members,
    projects: team.projects.map((link) => ({
      id: link.project.id,
      name: link.project.name,
      priority: link.project.priority,
      progressPercent: link.project.progressPercent,
      stageCount: link.project.stages.length,
      assignedAt: link.createdAt
    })),
    createdAt: team.createdAt,
    updatedAt: team.updatedAt
  });
});

const createTeam = asyncHandler(async (req, res) => {
  const { name, description, color, departmentId: rawDepartmentId, leadId } = req.body;

  const departmentId = rawDepartmentId || null;
  const [department, lead] = await Promise.all([ensureDepartment(departmentId), ensureLead(leadId)]);

  const created = await prisma.team.create({
    data: {
      name,
      description: description || null,
      color: color || "#3B82F6",
      departmentId: department?.id || null,
      leadId: lead?.id || null
    },
    include: {
      department: {
        select: { id: true, name: true, color: true }
      },
      lead: {
        select: { id: true, name: true, role: true }
      }
    }
  });

  if (lead?.id) {
    await prisma.user.update({
      where: { id: lead.id },
      data: {
        teamId: created.id,
        departmentId: created.departmentId || undefined,
        departmentName: created.department?.name || undefined
      }
    });
  }

  return res.status(201).json(created);
});

const updateTeam = asyncHandler(async (req, res) => {
  const teamId = req.params.id;
  const current = await prisma.team.findUnique({ where: { id: teamId } });
  if (!current || current.isArchived) {
    throw new AppError("Team not found", 404);
  }

  const payload = {};
  const fields = ["name", "description", "color", "isArchived"];
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      payload[field] = req.body[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "departmentId")) {
    payload.departmentId = req.body.departmentId || null;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "leadId")) {
    payload.leadId = req.body.leadId ? Number(req.body.leadId) : null;
  }

  const [department] = await Promise.all([
    ensureDepartment(payload.departmentId),
    ensureLead(payload.leadId)
  ]);

  if (Object.prototype.hasOwnProperty.call(payload, "departmentId")) {
    payload.departmentId = department?.id || null;
  }

  const updated = await prisma.team.update({
    where: { id: teamId },
    data: payload,
    include: {
      department: {
        select: { id: true, name: true, color: true }
      },
      lead: {
        select: { id: true, name: true, role: true }
      }
    }
  });

  if (payload.leadId) {
    await prisma.user.update({
      where: { id: payload.leadId },
      data: {
        teamId: updated.id,
        departmentId: updated.departmentId || undefined,
        departmentName: updated.department?.name || undefined
      }
    });
  }

  if (Object.prototype.hasOwnProperty.call(payload, "departmentId")) {
    await prisma.user.updateMany({
      where: { teamId: updated.id },
      data: {
        departmentId: updated.departmentId,
        departmentName: updated.department?.name || null
      }
    });
  }

  return res.json(updated);
});

const archiveTeam = asyncHandler(async (req, res) => {
  const teamId = req.params.id;
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team || team.isArchived) {
    throw new AppError("Team not found", 404);
  }

  await prisma.$transaction([
    prisma.team.update({
      where: { id: teamId },
      data: {
        isArchived: true,
        leadId: null
      }
    }),
    prisma.user.updateMany({
      where: { teamId },
      data: { teamId: null }
    }),
    prisma.teamProject.deleteMany({
      where: { teamId }
    })
  ]);

  return res.json({ success: true });
});

const addTeamMember = asyncHandler(async (req, res) => {
  const teamId = req.params.id;
  const userId = Number(req.body.userId);

  const [team, user] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamId },
      include: {
        department: {
          select: { id: true, name: true }
        }
      }
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isActive: true
      }
    })
  ]);

  if (!team || team.isArchived) {
    throw new AppError("Team not found", 404);
  }
  if (!user || !user.isActive) {
    throw new AppError("User not found", 404);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      teamId,
      departmentId: team.departmentId || undefined,
      departmentName: team.department?.name || undefined
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      employmentType: true,
      availabilityStatus: true,
      teamId: true,
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
  });

  return res.json(updated);
});

const removeTeamMember = asyncHandler(async (req, res) => {
  const teamId = req.params.id;
  const userId = Number(req.params.userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, teamId: true }
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (user.teamId !== teamId) {
    throw new AppError("User is not in this team", 400);
  }

  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { leadId: true } });

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { teamId: null }
  });

  if (team?.leadId === userId) {
    await prisma.team.update({ where: { id: teamId }, data: { leadId: null } });
  }

  return res.json(updated);
});

const assignTeamLead = asyncHandler(async (req, res) => {
  const teamId = req.params.id;
  const leadId = req.body.leadId ? Number(req.body.leadId) : null;

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team || team.isArchived) {
    throw new AppError("Team not found", 404);
  }

  if (!leadId) {
    const cleared = await prisma.team.update({
      where: { id: teamId },
      data: { leadId: null }
    });
    return res.json(cleared);
  }

  const lead = await prisma.user.findUnique({
    where: { id: leadId },
    select: { id: true, isActive: true }
  });

  if (!lead || !lead.isActive) {
    throw new AppError("Lead user not found", 404);
  }

  await prisma.user.update({
    where: { id: leadId },
    data: { teamId }
  });

  const updated = await prisma.team.update({
    where: { id: teamId },
    data: { leadId },
    include: {
      lead: {
        select: {
          id: true,
          name: true,
          role: true
        }
      }
    }
  });

  return res.json(updated);
});

const assignTeamToProject = asyncHandler(async (req, res) => {
  const teamId = req.params.id;
  const projectId = Number(req.body.projectId);

  const [team, project] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamId },
      include: {
        department: {
          select: { id: true, name: true }
        },
        members: {
          where: { isActive: true },
          select: { id: true }
        }
      }
    }),
    prisma.project.findUnique({ where: { id: projectId } })
  ]);

  if (!team || team.isArchived) {
    throw new AppError("Team not found", 404);
  }
  if (!project) {
    throw new AppError("Project not found", 404);
  }

  await prisma.teamProject.upsert({
    where: {
      teamId_projectId: {
        teamId,
        projectId
      }
    },
    create: {
      teamId,
      projectId,
      assignedById: req.user.id
    },
    update: {
      assignedById: req.user.id
    }
  });

  const normalizedTeamDepartment = normalizeDepartmentName(team.department?.name);

  const targetStages = await prisma.projectStage.findMany({
    where: {
      projectId,
      isActive: true
    },
    select: {
      id: true,
      assignedUserId: true,
      departmentName: true,
      stageName: true
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }]
  });

  const members = team.members;
  let totalAssignments = 0;

  for (const stage of targetStages) {
    const normalizedStageDepartment = normalizeDepartmentName(stage.departmentName || stage.stageName);
    if (normalizedTeamDepartment && normalizedStageDepartment && !normalizedStageDepartment.includes(normalizedTeamDepartment)) {
      continue;
    }

    const upserts = members.map((member) =>
      prisma.stageAssignment.upsert({
        where: {
          projectStageId_userId: {
            projectStageId: stage.id,
            userId: member.id
          }
        },
        create: {
          projectStageId: stage.id,
          userId: member.id
        },
        update: {}
      })
    );

    if (upserts.length) {
      await prisma.$transaction(upserts);
      totalAssignments += upserts.length;
    }

    if (!stage.assignedUserId && members[0]) {
      await prisma.projectStage.update({
        where: { id: stage.id },
        data: {
          assignedUserId: members[0].id
        }
      });
    }
  }

  return res.json({
    success: true,
    assignedCount: totalAssignments,
    teamId,
    projectId
  });
});

const removeTeamFromProject = asyncHandler(async (req, res) => {
  const teamId = req.params.id;
  const projectId = Number(req.params.projectId);

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: {
        where: { isActive: true },
        select: { id: true }
      }
    }
  });

  if (!team || team.isArchived) {
    throw new AppError("Team not found", 404);
  }

  await prisma.teamProject.deleteMany({
    where: {
      teamId,
      projectId
    }
  });

  const memberIds = team.members.map((member) => member.id);

  if (memberIds.length) {
    const stages = await prisma.projectStage.findMany({
      where: { projectId, isActive: true },
      select: {
        id: true,
        assignedUserId: true
      }
    });

    await prisma.stageAssignment.deleteMany({
      where: {
        userId: { in: memberIds },
        projectStage: {
          projectId,
          isActive: true
        }
      }
    });

    for (const stage of stages) {
      if (stage.assignedUserId && memberIds.includes(stage.assignedUserId)) {
        const fallback = await prisma.stageAssignment.findFirst({
          where: {
            projectStageId: stage.id
          },
          orderBy: {
            createdAt: "asc"
          },
          select: {
            userId: true
          }
        });

        await prisma.projectStage.update({
          where: { id: stage.id },
          data: {
            assignedUserId: fallback?.userId || null
          }
        });
      }
    }
  }

  return res.json({ success: true });
});

module.exports = {
  listTeams,
  getTeamById,
  createTeam,
  updateTeam,
  archiveTeam,
  addTeamMember,
  removeTeamMember,
  assignTeamLead,
  assignTeamToProject,
  removeTeamFromProject
};
