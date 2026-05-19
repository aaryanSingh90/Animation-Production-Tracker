const { differenceInCalendarDays, startOfDay } = require("date-fns");
const prisma = require("./prisma");
const { createNotificationIfRecentDuplicateAbsent, notifyManagers } = require("./notifications");
const { displayStageName } = require("./stageTemplates");

function isStageApprovable(status) {
  return status === "APPROVED";
}

async function processStageDeadline(stage) {
  if (stage.isActive === false) {
    return;
  }

  if (!stage.deadline || isStageApprovable(stage.status)) {
    if (stage.isDeadlineMissed) {
      await prisma.projectStage.update({
        where: { id: stage.id },
        data: { isDeadlineMissed: false }
      });
    }
    return;
  }

  const today = startOfDay(new Date());
  const deadlineDay = startOfDay(stage.deadline);
  const dayDiff = differenceInCalendarDays(deadlineDay, today);

  const updates = {};

  if (dayDiff < 0 && !stage.isDeadlineMissed) {
    updates.isDeadlineMissed = true;
  }

  if (Object.keys(updates).length > 0) {
    await prisma.projectStage.update({ where: { id: stage.id }, data: updates });
  }

  const stageName = displayStageName(stage);
  const projectName = stage.project?.name || "Project";

  if (dayDiff <= 2 && dayDiff >= 0) {
    const msg = `${projectName} · ${stageName} deadline in ${dayDiff} day(s).`;
    if (stage.assignedUserId) {
      await createNotificationIfRecentDuplicateAbsent({
        userId: stage.assignedUserId,
        message: msg,
        type: "DEADLINE_WARNING",
        relatedProjectId: stage.projectId,
        relatedStageId: stage.id
      });
    }
    await notifyManagers({
      message: msg,
      type: "DEADLINE_WARNING",
      relatedProjectId: stage.projectId,
      relatedStageId: stage.id
    });
  }

  if (dayDiff < 0) {
    const msg = `${projectName} · ${stageName} missed its deadline.`;
    if (stage.assignedUserId) {
      await createNotificationIfRecentDuplicateAbsent({
        userId: stage.assignedUserId,
        message: msg,
        type: "DEADLINE_MISSED",
        relatedProjectId: stage.projectId,
        relatedStageId: stage.id
      });
    }
    await notifyManagers({
      message: msg,
      type: "DEADLINE_MISSED",
      relatedProjectId: stage.projectId,
      relatedStageId: stage.id
    });
  }
}

async function runDeadlineSweep() {
  const stages = await prisma.projectStage.findMany({
    where: {
      isActive: true,
      deadline: { not: null },
      status: { not: "APPROVED" }
    },
    include: {
      stageTemplate: true,
      project: {
        select: { name: true }
      }
    }
  });

  for (const stage of stages) {
    await processStageDeadline(stage);
  }
}

module.exports = {
  processStageDeadline,
  runDeadlineSweep
};
