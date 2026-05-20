const {
  CURRENT_PIPELINE_STAGE_CODES,
  ensureDefaultStageDefinitions,
  TRACKING_GROUPS,
  normalizeStageCode
} = require("./stageDefinitions");

function buildActiveCodeSet(project, stageDefinitions) {
  if (Array.isArray(project?.activeStageCodes) && project.activeStageCodes.length) {
    return new Set(project.activeStageCodes.map((code) => normalizeStageCode(code)).filter(Boolean));
  }

  return new Set(CURRENT_PIPELINE_STAGE_CODES.map((code) => normalizeStageCode(code)));
}

function resolveTrackingCodesByMode({ project, stageDefinitions }) {
  const activeCodes = buildActiveCodeSet(project, stageDefinitions);
  const shotCodes = new Set();
  const assetCodes = new Set();
  const projectCodes = new Set();

  for (const definition of stageDefinitions) {
    const code = normalizeStageCode(definition.code);
    if (!activeCodes.has(code)) continue;

    if (definition.isHybrid) {
      if (code === "LIGHTING") {
        if (project.lightingMode === "SHOT") shotCodes.add(code);
        else projectCodes.add(code);
      } else if (code === "RENDERING") {
        if (project.renderingMode === "SHOT") shotCodes.add(code);
        else projectCodes.add(code);
      }
      continue;
    }

    if (definition.trackingMode === "PROJECT") projectCodes.add(code);
    if (definition.trackingMode === "SHOT") shotCodes.add(code);
    if (definition.trackingMode === "ASSET") assetCodes.add(code);
  }

  return {
    activeCodes,
    projectCodes,
    shotCodes,
    assetCodes,
    stageDefinitionsByCode: new Map(stageDefinitions.map((definition) => [normalizeStageCode(definition.code), definition]))
  };
}

async function getTrackingDefinitionSnapshot({ prisma, project }) {
  const stageDefinitions = await ensureDefaultStageDefinitions(prisma);
  return resolveTrackingCodesByMode({ project, stageDefinitions });
}

function computeStatusFromChildren(statuses = []) {
  if (!statuses.length) return "NOT_STARTED";
  if (statuses.every((status) => status === "APPROVED")) return "APPROVED";
  if (statuses.some((status) => status === "REJECTED" || status === "REVISION_REQUIRED")) return "REVISION_REQUIRED";
  if (statuses.some((status) => status === "ISSUE")) return "ISSUE";
  if (statuses.some((status) => status === "EXTENDED")) return "EXTENDED";
  if (statuses.some((status) => status === "SUBMITTED")) return "SUBMITTED";
  if (statuses.some((status) => status === "IN_PROGRESS")) return "IN_PROGRESS";
  return "NOT_STARTED";
}

module.exports = {
  TRACKING_GROUPS,
  getTrackingDefinitionSnapshot,
  computeStatusFromChildren
};
