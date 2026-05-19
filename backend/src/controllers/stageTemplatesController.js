const prisma = require("../utils/prisma");
const { asyncHandler } = require("../utils/http");
const { PIPELINE_TEMPLATES } = require("../utils/constants");
const { ensureDefaultStageTemplates } = require("../utils/stageTemplates");
const { ensureDefaultStageDefinitions, TRACKING_GROUPS } = require("../utils/stageDefinitions");

const listStageTemplates = asyncHandler(async (req, res) => {
  const [templates, stageDefinitions] = await Promise.all([
    ensureDefaultStageTemplates(prisma),
    ensureDefaultStageDefinitions(prisma)
  ]);

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
