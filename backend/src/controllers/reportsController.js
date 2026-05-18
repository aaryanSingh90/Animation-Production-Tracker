const { addDays, differenceInCalendarDays, startOfDay, subDays, format } = require("date-fns");
const prisma = require("../utils/prisma");
const { asyncHandler } = require("../utils/http");
const { ACTIVE_STAGE_STATUSES } = require("../utils/constants");

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
      stages: true
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
    where: { status: "SUBMITTED" }
  });

  const stageApprovals = await prisma.projectStage.findMany({
    where: {
      approvedAt: {
        gte: subDays(startOfDay(new Date()), 29)
      }
    },
    select: {
      approvedAt: true
    }
  });

  const approvalTrend = [];
  for (let i = 29; i >= 0; i -= 1) {
    const day = subDays(startOfDay(new Date()), i);
    const key = format(day, "yyyy-MM-dd");
    const count = stageApprovals.filter((item) => item.approvedAt && format(item.approvedAt, "yyyy-MM-dd") === key).length;
    approvalTrend.push({ date: key, approvals: count });
  }

  const completionByProject = projects.map((project) => ({
    projectId: project.id,
    name: project.name,
    progressPercent: project.progressPercent
  }));

  const statusBreakdown = [
    { name: "On Track", value: onTrackProjects.length },
    { name: "Delayed", value: delayedProjects.length },
    { name: "Complete", value: completedProjects.length },
    { name: "Has Issues", value: projectsWithIssues.length }
  ];

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
    approvalTrend
  });
});

const getUpcomingDeadlines = asyncHandler(async (req, res) => {
  const today = startOfDay(new Date());
  const sevenDaysLater = addDays(today, 7);

  const stages = await prisma.projectStage.findMany({
    where: {
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
      assignedUser: {
        select: { id: true, name: true, department: true }
      }
    },
    orderBy: { deadline: "asc" }
  });

  return res.json(stages);
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
      department: true,
      assignedProjectStages: {
        where: {
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
      }
    }
  });

  const workloads = users.map((user) => ({
    id: user.id,
    name: user.name,
    role: user.role,
    department: user.department,
    activeTaskCount: user.assignedProjectStages.length,
    tasks: user.assignedProjectStages
  }));

  return res.json(workloads);
});

module.exports = {
  getOverviewReport,
  getUpcomingDeadlines,
  getIssuesGrouped,
  getWorkloadReport
};
