const {
  CURRENT_PIPELINE_STAGE_CODES,
  ensureDefaultStageDefinitions,
  TRACKING_GROUPS,
  normalizeStageCode
} = require("./stageDefinitions");
const {
  isApprovedStatus,
  isRetakeStatus,
  normalizePipelineStatus
} = require("./pipelineStatus");

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
  const normalized = statuses.map((status) => normalizePipelineStatus(status));
  if (!normalized.length) return "YTS";
  if (normalized.every((status) => status === "FINAL")) return "FINAL";
  if (normalized.every((status) => isApprovedStatus(status))) return "APPROVED";
  if (normalized.every((status) => status === "DONE")) return "DONE";
  if (normalized.some((status) => status === "LATE")) return "LATE";
  if (normalized.some((status) => isRetakeStatus(status))) return "RTK";
  if (normalized.some((status) => status === "TEST")) return "TEST";
  if (normalized.some((status) => status === "DONE")) return "DONE";
  if (normalized.some((status) => status === "IP")) return "IP";
  return "YTS";
}

module.exports = {
  TRACKING_GROUPS,
  getTrackingDefinitionSnapshot,
  computeStatusFromChildren
};
