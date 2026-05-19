const prisma = require("./prisma");

async function recalculateProjectProgress(projectId) {
  const now = new Date();
  const [projectStages, shotStages, assetStages] = await Promise.all([
    prisma.projectStage.findMany({
      where: { projectId, isActive: true },
      select: {
        status: true,
        deadline: true,
        isDeadlineMissed: true
      }
    }),
    prisma.shotStage.findMany({
      where: { shot: { projectId } },
      select: {
        status: true,
        deadline: true
      }
    }),
    prisma.assetStage.findMany({
      where: { asset: { projectId } },
      select: {
        status: true,
        deadline: true
      }
    })
  ]);

  const allStages = [...projectStages, ...shotStages, ...assetStages];
  const totalStages = allStages.length;
  const approvedStages = allStages.filter((stage) => stage.status === "APPROVED").length;
  const progressPercent = totalStages === 0 ? 0 : Number(((approvedStages / totalStages) * 100).toFixed(2));

  const hasIssues = allStages.some((stage) => stage.status === "ISSUE" || stage.isDeadlineMissed === true);
  const hasDelayed = allStages.some(
    (stage) => stage.deadline && new Date(stage.deadline) < now && stage.status !== "APPROVED"
  );

  let overallStatus = "ON_TRACK";
  if (progressPercent === 100 && totalStages > 0) {
    overallStatus = "COMPLETED";
  } else if (hasIssues) {
    overallStatus = "HAS_ISSUES";
  } else if (hasDelayed) {
    overallStatus = "DELAYED";
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      progressPercent,
      overallStatus
    }
  });

  return progressPercent;
}

module.exports = {
  recalculateProjectProgress
};
