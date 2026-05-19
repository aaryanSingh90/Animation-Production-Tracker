const { addDays, differenceInCalendarDays, startOfDay, subDays, format } = require("date-fns");
const prisma = require("../utils/prisma");
const { asyncHandler } = require("../utils/http");
const { ACTIVE_STAGE_STATUSES } = require("../utils/constants");
const { displayStageName } = require("../utils/stageTemplates");

const STATUS_COLORS = {
  "On Track": "#10B981",
  Delayed: "#EF4444",
  Complete: "#3B82F6",
  "Has Issues": "#F59E0B"
};

function calculateExpectedProgress(project) {
  if (!project.stages.length) return 0;

  const deadlines = project.stages.filter((stage) => stage.deadline).map((stage) => new Date(stage.deadline));
  if (!deadlines.length) return project.progressPercent;

  const start = new Date(project.audioReceivedDate);
  const end = deadlines.sort((a, b) => a.getTime() - b.getTime())[deadlines.length - 1];
  const totalDays = Math.max(differenceInCalendarDays(end, start), 1);
  const elapsedDays = differenceInCalendarDays(new Date(), start);
  const ratio = Math.max(0, Math.min(1, elapsedDays / totalDays));

  return ratio * 100;
}

function projectIsDelayed(project) {
  return project.stages.some(
    (stage) =>
      stage.isDeadlineMissed ||
      (stage.deadline && new Date(stage.deadline) < new Date() && stage.status !== "APPROVED")
  );
}

const getOverviewReport = asyncHandler(async (req, res) => {
  const projects = await prisma.project.findMany({
    include: {
      stages: {
        where: { isActive: true },
        include: {
          stageTemplate: true,
          assignedUser: {
            select: { id: true, name: true }
          }
        }
      }
    },
    orderBy: { priority: "asc" }
  });

  const totalProjects = projects.length;
  const delayedProjects = projects.filter(projectIsDelayed);
  const completedProjects = projects.filter((project) => project.progressPercent === 100);
  const projectsWithIssues = projects.filter((project) =>
    project.stages.some((stage) => stage.status === "ISSUE" || stage.status === "EXTENDED")
  );

  const onTrackProjects = projects.filter((project) => {
    if (projectIsDelayed(project)) return false;
    const expected = calculateExpectedProgress(project);
    return project.progressPercent >= expected - 10;
  });

  const pendingApprovals = await prisma.projectStage.count({
    where: { status: "SUBMITTED", isActive: true }
  });

  const stageApprovals = await prisma.projectStage.findMany({
    where: {
      isActive: true,
      approvedAt: {
        gte: subDays(startOfDay(new Date()), 29)
      }
    },
    select: {
      approvedAt: true
    }
  });

  const approvalTrend = [];
  const approvalsOverTime = [];
  for (let i = 29; i >= 0; i -= 1) {
    const day = subDays(startOfDay(new Date()), i);
    const key = format(day, "yyyy-MM-dd");
    const count = stageApprovals.filter((item) => item.approvedAt && format(item.approvedAt, "yyyy-MM-dd") === key).length;
    approvalTrend.push({ date: key, approvals: count });
    approvalsOverTime.push({ date: key, count });
  }

  const completionByProject = projects.map((project) => ({
    projectId: project.id,
    name: project.name,
    progressPercent: project.progressPercent
  }));
  const completionPerProject = completionByProject.map((project) => ({
    name: project.name,
    completion: project.progressPercent
  }));

  const statusBreakdown = [
    { name: "On Track", value: onTrackProjects.length },
    { name: "Delayed", value: delayedProjects.length },
    { name: "Complete", value: completedProjects.length },
    { name: "Has Issues", value: projectsWithIssues.length }
  ];
  const projectStatusBreakdown = statusBreakdown.map((item) => ({
    ...item,
    color: STATUS_COLORS[item.name]
  }));

  const groupedIssues = await prisma.issueLog.groupBy({
    by: ["issueType"],
    _count: { issueType: true }
  });

  const issuesByType = groupedIssues.map((item) => ({
    name: item.issueType.replaceAll("_", " "),
    value: item._count.issueType
  }));

  const workloads = await prisma.user.findMany({
    where: {
      role: "EMPLOYEE",
      isActive: true
    },
    select: {
      id: true,
      name: true,
      employmentType: true,
      assignedProjectStages: {
        where: {
          status: {
            in: ACTIVE_STAGE_STATUSES
          }
        },
        select: {
          id: true
        }
      },
      stageAssignments: {
        where: {
          projectStage: {
            status: {
              in: ACTIVE_STAGE_STATUSES
            }
          }
        },
        select: {
          projectStageId: true
        }
      }
    },
    orderBy: { name: "asc" }
  });

  const workloadPerArtist = workloads.map((user) => {
    const taskIds = new Set(user.assignedProjectStages.map((stage) => stage.id));
    for (const assignment of user.stageAssignments) {
      taskIds.add(assignment.projectStageId);
    }

    return {
      name: user.name,
      activeTasks: taskIds.size
    };
  });

  const upcomingStages = await prisma.projectStage.findMany({
    where: {
      isActive: true,
      deadline: {
        gte: startOfDay(new Date()),
        lte: addDays(startOfDay(new Date()), 7)
      },
      status: {
        not: "APPROVED"
      }
    },
    include: {
      project: {
        select: { name: true }
      },
      stageTemplate: true,
      assignedUser: {
        select: { name: true }
      }
    },
    orderBy: { deadline: "asc" }
  });

  const upcomingDeadlines = upcomingStages.map((stage) => ({
    projectName: stage.project.name,
    stageName: stage.stageName,
    stageDisplayName: displayStageName(stage),
    deadline: stage.deadline,
    assignedTo: stage.assignedUser?.name || "Unassigned"
  }));

  return res.json({
    totals: {
      totalProjects,
      onTrackPercent: totalProjects ? Number(((onTrackProjects.length / totalProjects) * 100).toFixed(2)) : 0,
      delayedPercent: totalProjects ? Number(((delayedProjects.length / totalProjects) * 100).toFixed(2)) : 0,
      completePercent: totalProjects ? Number(((completedProjects.length / totalProjects) * 100).toFixed(2)) : 0,
      pendingApprovals
    },
    statusBreakdown,
    completionByProject,
    approvalTrend,
    projectStatusBreakdown,
    completionPerProject,
    approvalsOverTime,
    issuesByType,
    workloadPerArtist,
    upcomingDeadlines
  });
});

const getUpcomingDeadlines = asyncHandler(async (req, res) => {
  const today = startOfDay(new Date());
  const sevenDaysLater = addDays(today, 7);

  const stages = await prisma.projectStage.findMany({
    where: {
      isActive: true,
      deadline: {
        gte: today,
        lte: sevenDaysLater
      },
      status: {
        in: ACTIVE_STAGE_STATUSES
      }
    },
    include: {
      project: {
        select: { id: true, name: true, priority: true }
      },
      stageTemplate: true,
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
    orderBy: { deadline: "asc" }
  });

  return res.json(
    stages.map((stage) => ({
      ...stage,
      stageDisplayName: displayStageName(stage)
    }))
  );
});

const getIssuesGrouped = asyncHandler(async (req, res) => {
  const grouped = await prisma.issueLog.groupBy({
    by: ["issueType"],
    _count: {
      issueType: true
    }
  });

  const detailed = await prisma.issueLog.findMany({
    include: {
      projectStage: {
        include: {
          project: {
            select: { id: true, name: true }
          }
        }
      },
      loggedBy: {
        select: { id: true, name: true }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return res.json({
    grouped: grouped.map((item) => ({
      issueType: item.issueType,
      count: item._count.issueType
    })),
    detailed
  });
});

const getWorkloadReport = asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      role: true,
      departmentId: true,
      departmentName: true,
      department: {
        select: {
          id: true,
          name: true,
          color: true
        }
      },
      employmentType: true,
      assignedProjectStages: {
        where: {
          isActive: true,
          status: {
            in: ACTIVE_STAGE_STATUSES
          }
        },
        select: {
          id: true,
          stageName: true,
          status: true,
          project: {
            select: { id: true, name: true }
          }
        }
      },
      stageAssignments: {
        where: {
          projectStage: {
            isActive: true,
            status: {
              in: ACTIVE_STAGE_STATUSES
            }
          }
        },
        select: {
          projectStage: {
            select: {
              id: true,
              stageName: true,
              status: true,
              project: {
                select: { id: true, name: true }
              }
            }
          }
        }
      }
    }
  });

  const workloads = users.map((user) => {
    const taskMap = new Map();
    for (const stage of user.assignedProjectStages) {
      taskMap.set(stage.id, stage);
    }
    for (const assignment of user.stageAssignments) {
      const stage = assignment.projectStage;
      if (!taskMap.has(stage.id)) {
        taskMap.set(stage.id, stage);
      }
    }
    const tasks = Array.from(taskMap.values());

    return {
      id: user.id,
      name: user.name,
      role: user.role,
      department: user.department?.name || user.departmentName || null,
      employmentType: user.employmentType,
      activeTaskCount: tasks.length,
      tasks
    };
  });

  return res.json(workloads);
});

const getTeamCompositionReport = asyncHandler(async (req, res) => {
  const artists = await prisma.user.findMany({
    where: {
      isActive: true,
      role: "EMPLOYEE"
    },
    select: {
      id: true,
      employmentType: true
    }
  });

  const inhouse = artists.filter((artist) => artist.employmentType === "INHOUSE").length;
  const freelance = artists.filter((artist) => artist.employmentType === "FREELANCE").length;

  const activeAssignments = await prisma.stageAssignment.findMany({
    where: {
      projectStage: {
        isActive: true,
        status: {
          in: ACTIVE_STAGE_STATUSES
        }
      },
      user: {
        isActive: true
      }
    },
    include: {
      user: {
        select: {
          employmentType: true,
          departmentName: true,
          department: {
            select: {
              id: true,
              name: true,
              color: true
            }
          }
        }
      },
      projectStage: {
        select: {
          departmentName: true,
          stageName: true
        }
      }
    }
  });

  const byDepartmentMap = new Map();
  for (const assignment of activeAssignments) {
    const department =
      assignment.user.department?.name ||
      assignment.user.departmentName ||
      assignment.projectStage.departmentName ||
      assignment.projectStage.stageName.replaceAll("_", " ");
    if (!byDepartmentMap.has(department)) {
      byDepartmentMap.set(department, {
        department,
        inhouseUsers: new Set(),
        freelanceUsers: new Set()
      });
    }

    const bucket = byDepartmentMap.get(department);
    if (assignment.user.employmentType === "INHOUSE") {
      bucket.inhouseUsers.add(assignment.userId);
    } else {
      bucket.freelanceUsers.add(assignment.userId);
    }
  }

  return res.json({
    inhouse,
    freelance,
    byDepartment: Array.from(byDepartmentMap.values())
      .map((bucket) => ({
        department: bucket.department,
        inhouse: bucket.inhouseUsers.size,
        freelance: bucket.freelanceUsers.size
      }))
      .sort((a, b) => a.department.localeCompare(b.department))
  });
});

module.exports = {
  getOverviewReport,
  getUpcomingDeadlines,
  getIssuesGrouped,
  getWorkloadReport,
  getTeamCompositionReport
};
