const prisma = require("../utils/prisma");
const { asyncHandler, AppError } = require("../utils/http");
const { isApprovedStatus, isLateStatus, isRetakeStatus, isActiveStatus } = require("../utils/pipelineStatus");

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .trim();
}

function buildEmployeeHealth(employee, now = new Date()) {
  const stageMap = new Map();

  for (const stage of employee.assignedProjectStages || []) {
    stageMap.set(stage.id, stage);
  }

  for (const assignment of employee.stageAssignments || []) {
    if (!stageMap.has(assignment.projectStage.id)) {
      stageMap.set(assignment.projectStage.id, assignment.projectStage);
    }
  }

  const stages = Array.from(stageMap.values());
  const activeStages = stages.filter((stage) => isActiveStatus(stage.status));

  const activeTaskCount = activeStages.length;
  const projectIds = new Set(activeStages.map((stage) => stage.project.id));
  const delayedCount = activeStages.filter((stage) => isLateStatus(stage.status, stage.deadline)).length;

  const capacityPercent = Math.min(100, Math.round((activeTaskCount / 6) * 100));

  let performance = "Available";
  if (!employee.isActive) performance = "Inactive";
  else if (activeTaskCount === 0) performance = "Idle";
  else if (capacityPercent >= 90) performance = "Overloaded";
  else if (delayedCount > 0) performance = "Delayed";
  else if (capacityPercent >= 70) performance = "On Track";

  const uniqueStages = Array.from(new Set(activeStages.map((stage) => stage.customName || stage.stageTemplate?.name || stage.stageName)));
  const uniqueProjects = Array.from(new Set(activeStages.map((stage) => stage.project.name)));

  return {
    activeTaskCount,
    activeProjectCount: projectIds.size,
    delayedCount,
    capacityPercent,
    performance,
    activeStages,
    uniqueStages,
    uniqueProjects
  };
}

const getWorkforceOverview = asyncHandler(async (req, res) => {
  const { search, departmentId, teamId, role, availability, status, workload, sortBy = "name", sortDir = "asc" } = req.query;

  const where = {
    role: {
      in: ["EMPLOYEE", "COORDINATOR", "PRODUCTION_MANAGER", "BOSS"]
    }
  };

  if (role && role !== "ALL") {
    where.role = role;
  }

  if (departmentId) {
    where.departmentId = departmentId;
  }

  if (teamId) {
    where.teamId = teamId;
  }

  if (availability && availability !== "ALL") {
    where.availabilityStatus = availability;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } }
    ];
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      joinedAt: true,
      isActive: true,
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
      },
      team: {
        select: {
          id: true,
          name: true,
          color: true,
          leadId: true
        }
      },
      assignedProjectStages: {
        where: {
          isActive: true
        },
        select: {
          id: true,
          stageName: true,
          customName: true,
          deadline: true,
          status: true,
          stageTemplate: {
            select: { name: true }
          },
          project: {
            select: {
              id: true,
              name: true
            }
          }
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
              id: true,
              stageName: true,
              customName: true,
              deadline: true,
              status: true,
              stageTemplate: {
                select: { name: true }
              },
              project: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      }
    }
  });

  let employees = users.map((user) => {
    const health = buildEmployeeHealth(user);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      joinedAt: user.joinedAt,
      isActive: user.isActive,
      employmentType: user.employmentType,
      availabilityStatus: user.availabilityStatus,
      skills: user.skills || [],
      departmentId: user.department?.id || user.departmentId,
      departmentName: user.department?.name || user.departmentName || "Unassigned",
      departmentColor: user.department?.color || "#64748B",
      team: user.team || null,
      activeTaskCount: health.activeTaskCount,
      activeProjectCount: health.activeProjectCount,
      delayedCount: health.delayedCount,
      capacityPercent: health.capacityPercent,
      performance: health.performance,
      currentProjects: health.uniqueProjects,
      currentStages: health.uniqueStages
    };
  });

  if (status && status !== "ALL") {
    const normalized = normalizeText(status);
    employees = employees.filter((employee) => normalizeText(employee.performance) === normalized);
  }

  if (workload && workload !== "ALL") {
    employees = employees.filter((employee) => {
      if (workload === "IDLE") return employee.activeTaskCount === 0;
      if (workload === "LOW") return employee.capacityPercent > 0 && employee.capacityPercent < 40;
      if (workload === "MEDIUM") return employee.capacityPercent >= 40 && employee.capacityPercent < 75;
      if (workload === "HIGH") return employee.capacityPercent >= 75 && employee.capacityPercent < 90;
      if (workload === "OVERLOADED") return employee.capacityPercent >= 90;
      return true;
    });
  }

  const sorter = {
    name: (a, b) => a.name.localeCompare(b.name),
    workload: (a, b) => b.capacityPercent - a.capacityPercent,
    projects: (a, b) => b.activeProjectCount - a.activeProjectCount,
    tasks: (a, b) => b.activeTaskCount - a.activeTaskCount,
    status: (a, b) => a.performance.localeCompare(b.performance)
  };

  employees.sort(sorter[sortBy] || sorter.name);
  if (sortDir === "desc") employees.reverse();

  const activeArtists = employees.filter((employee) => employee.isActive).length;
  const overloadedArtists = employees.filter((employee) => employee.performance === "Overloaded").length;
  const freelancers = employees.filter((employee) => employee.employmentType === "FREELANCE").length;
  const idleArtists = employees.filter((employee) => employee.performance === "Idle").length;

  const activeTeams = await prisma.team.count({
    where: { isArchived: false }
  });

  return res.json({
    metrics: {
      totalEmployees: employees.length,
      activeArtists,
      overloadedArtists,
      freelancers,
      idleArtists,
      activeTeams
    },
    employees
  });
});

const getWorkforceHeatmap = asyncHandler(async (req, res) => {
  const [departments, teams] = await Promise.all([
    prisma.department.findMany({
      include: {
        employees: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            role: true,
            employmentType: true,
            availabilityStatus: true,
            assignedProjectStages: {
              where: {
                isActive: true
              },
              select: {
                id: true,
                status: true,
                deadline: true
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
                    id: true,
                    status: true,
                    deadline: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { name: "asc" }
    }),
    prisma.team.findMany({
      where: { isArchived: false },
      include: {
        members: {
          where: { isActive: true },
          select: {
            id: true,
            availabilityStatus: true,
            assignedProjectStages: {
              where: {
                isActive: true
              },
              select: { id: true }
            },
            stageAssignments: {
              where: {
                projectStage: {
                  isActive: true
                }
              },
              select: { projectStageId: true }
            }
          }
        }
      }
    })
  ]);

  const now = new Date();

  const departmentHeatmap = departments.map((department) => {
    let totalTasks = 0;
    let delayedTasks = 0;
    let overloadedMembers = 0;

    for (const member of department.employees) {
      const taskSet = new Set(member.assignedProjectStages.map((stage) => stage.id));
      for (const assignment of member.stageAssignments) {
        taskSet.add(assignment.projectStage.id);
      }

      totalTasks += taskSet.size;

      const delayed = member.assignedProjectStages.filter(
        (stage) => isLateStatus(stage.status, stage.deadline)
      ).length;
      delayedTasks += delayed;

      const utilization = Math.round((taskSet.size / 6) * 100);
      if (utilization >= 90 || member.availabilityStatus === "OVERLOADED") {
        overloadedMembers += 1;
      }
    }

    const utilizationPercent = department.employees.length
      ? Math.min(100, Math.round((totalTasks / Math.max(1, department.employees.length * 6)) * 100))
      : 0;

    return {
      id: department.id,
      name: department.name,
      color: department.color,
      employeeCount: department.employees.length,
      totalTasks,
      delayedTasks,
      overloadedMembers,
      utilizationPercent,
      health:
        utilizationPercent >= 85 || delayedTasks > 2
          ? "critical"
          : utilizationPercent >= 60
          ? "watch"
          : "healthy"
    };
  });

  const teamCapacity = teams.map((team) => {
    const memberLoads = team.members.map((member) => {
      const taskSet = new Set(member.assignedProjectStages.map((stage) => stage.id));
      for (const assignment of member.stageAssignments) {
        taskSet.add(assignment.projectStageId);
      }
      return taskSet.size;
    });

    const utilization = memberLoads.length
      ? Math.min(100, Math.round((memberLoads.reduce((sum, load) => sum + load, 0) / (memberLoads.length * 6)) * 100))
      : 0;

    return {
      id: team.id,
      name: team.name,
      color: team.color,
      memberCount: team.members.length,
      capacityPercent: utilization
    };
  });

  return res.json({
    departments: departmentHeatmap,
    teams: teamCapacity
  });
});

const getEmployeeProfile = asyncHandler(async (req, res) => {
  const userId = Number(req.params.id);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      department: {
        select: {
          id: true,
          name: true,
          color: true
        }
      },
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
      assignedProjectStages: {
        where: { isActive: true },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              priority: true
            }
          },
          stageTemplate: {
            select: { name: true }
          }
        },
        orderBy: [{ deadline: "asc" }]
      },
      stageAssignments: {
        where: {
          projectStage: {
            isActive: true
          }
        },
        include: {
          projectStage: {
            include: {
              project: {
                select: {
                  id: true,
                  name: true,
                  priority: true
                }
              },
              stageTemplate: {
                select: { name: true }
              }
            }
          }
        }
      }
    }
  });

  if (!user || !user.isActive) {
    throw new AppError("Employee not found", 404);
  }

  const health = buildEmployeeHealth(user);

  return res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    joinedAt: user.joinedAt,
    employmentType: user.employmentType,
    availabilityStatus: user.availabilityStatus,
    skills: user.skills || [],
    department: user.department,
    team: user.team,
    stats: {
      activeProjects: health.activeProjectCount,
      activeStages: health.activeTaskCount,
      completedStages: [...user.assignedProjectStages, ...user.stageAssignments.map((entry) => entry.projectStage)].filter(
        (stage) => isApprovedStatus(stage.status)
      ).length,
      rejectedCount: health.activeStages.filter((stage) => isRetakeStatus(stage.status)).length,
      delayedCount: health.delayedCount,
      capacityPercent: health.capacityPercent,
      performance: health.performance
    },
    currentProjects: health.uniqueProjects,
    currentStages: health.uniqueStages,
    assignments: health.activeStages
  });
});

module.exports = {
  getWorkforceOverview,
  getWorkforceHeatmap,
  getEmployeeProfile
};
