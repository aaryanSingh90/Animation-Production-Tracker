const prisma = require("./prisma");

async function recalculateProjectProgress(projectId) {
  const totalStages = await prisma.projectStage.count({ where: { projectId } });
  const approvedStages = await prisma.projectStage.count({
    where: { projectId, status: "APPROVED" }
  });

  const progressPercent = totalStages === 0 ? 0 : Number(((approvedStages / totalStages) * 100).toFixed(2));

  let overallStatus = "ON_TRACK";
  if (progressPercent === 100) {
    overallStatus = "COMPLETED";
  } else {
    const hasIssue =
      (await prisma.projectStage.count({
        where: {
          projectId,
          OR: [{ status: "ISSUE" }, { isDeadlineMissed: true }]
        }
      })) > 0;
    if (hasIssue) {
      overallStatus = "HAS_ISSUES";
    }
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
