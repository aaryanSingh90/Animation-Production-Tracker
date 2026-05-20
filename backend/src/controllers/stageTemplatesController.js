const prisma = require("../utils/prisma");
const { asyncHandler } = require("../utils/http");
const { PIPELINE_TEMPLATES } = require("../utils/constants");
const { ensureDefaultStageTemplates, PRIMARY_STAGE_TEMPLATE_NAMES } = require("../utils/stageTemplates");
const { ensureDefaultStageDefinitions, TRACKING_GROUPS, CURRENT_PIPELINE_STAGE_CODES } = require("../utils/stageDefinitions");

const listStageTemplates = asyncHandler(async (req, res) => {
  const [allTemplates, allStageDefinitions] = await Promise.all([
    ensureDefaultStageTemplates(prisma),
    ensureDefaultStageDefinitions(prisma)
  ]);

  const templateOrder = new Map(PRIMARY_STAGE_TEMPLATE_NAMES.map((name, index) => [name, index]));
  const templates = allTemplates
    .filter((template) => PRIMARY_STAGE_TEMPLATE_NAMES.includes(template.name))
    .sort((a, b) => (templateOrder.get(a.name) ?? Number.MAX_SAFE_INTEGER) - (templateOrder.get(b.name) ?? Number.MAX_SAFE_INTEGER));
  const stageDefinitions = allStageDefinitions.filter((definition) => CURRENT_PIPELINE_STAGE_CODES.includes(definition.code));
  const stageDefinitionsByCode = Object.fromEntries(stageDefinitions.map((definition) => [definition.code, definition]));
  const defaultCodes = stageDefinitions.map((definition) => definition.code);

  return res.json({
    templates,
    stageDefinitions,
    trackingGroups: TRACKING_GROUPS,
    pipelineTemplates: PIPELINE_TEMPLATES,
    projectCreationDefaults: {
      activeStageCodes: defaultCodes,
      lightingMode: "PROJECT",
      renderingMode: "PROJECT",
      hybridCodes: TRACKING_GROUPS.HYBRID,
      hasLighting: Boolean(stageDefinitionsByCode.LIGHTING),
      hasRendering: Boolean(stageDefinitionsByCode.RENDERING)
    }
  });
});

module.exports = {
  listStageTemplates
};
