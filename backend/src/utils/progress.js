const prisma = require("./prisma");
const { isCompleteStatus, isLateStatus } = require("./pipelineStatus");
const { getTrackingDefinitionSnapshot, ensureProjectShotStageCoverage } = require("./trackingSetup");
const { normalizeStageCode } = require("./stageDefinitions");

async function recalculateProjectProgress(projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      activeStageCodes: true,
      lightingMode: true,
      renderingMode: true
    }
  });

  if (!project) return 0;

  const snapshot = await getTrackingDefinitionSnapshot({ prisma, project });
  await ensureProjectShotStageCoverage({ prisma, projectId, snapshot });

  const now = new Date();
  const [projectStages, audioTasks, shotStages, assetStages] = await Promise.all([
    prisma.projectStage.findMany({
      where: { projectId, isActive: true },
      select: {
        stageName: true,
        status: true,
        deadline: true,
        isDeadlineMissed: true,
        stageDefinition: {
          select: {
            code: true
          }
        }
      }
    }),
    prisma.audioTask.findMany({
      where: { projectId },
      select: {
        status: true,
        endDate: true
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

  const projectStagesWithoutAudio = projectStages.filter((stage) => {
    const code = normalizeStageCode(stage.stageDefinition?.code || stage.stageName || "");
    if (audioTasks.length && code === "AUDIO") return false;
    if (snapshot.projectCodes.size) {
      return snapshot.projectCodes.has(code);
    }
    return true;
  });

  const allStages = [
    ...projectStagesWithoutAudio,
    ...audioTasks.map((task) => ({
      status: task.status,
      deadline: task.endDate,
      isDeadlineMissed: false
    })),
    ...shotStages,
    ...assetStages
  ];
  const totalStages = allStages.length;
  const approvedStages = allStages.filter((stage) => isCompleteStatus(stage.status)).length;
  const progressPercent = totalStages === 0 ? 0 : Number(((approvedStages / totalStages) * 100).toFixed(2));

  const hasIssues = allStages.some((stage) => isLateStatus(stage.status, stage.deadline) || stage.isDeadlineMissed === true);
  const hasDelayed = allStages.some(
    (stage) => stage.deadline && new Date(stage.deadline) < now && !isCompleteStatus(stage.status)
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
