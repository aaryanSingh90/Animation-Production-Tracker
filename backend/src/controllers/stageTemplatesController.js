const prisma = require("../utils/prisma");
const { asyncHandler } = require("../utils/http");
const { PIPELINE_TEMPLATES } = require("../utils/constants");
const { ensureDefaultStageTemplates } = require("../utils/stageTemplates");

const listStageTemplates = asyncHandler(async (req, res) => {
  await ensureDefaultStageTemplates(prisma);

  const templates = await prisma.stageTemplate.findMany({
    orderBy: [{ createdAt: "asc" }, { name: "asc" }]
  });

  return res.json({
    templates,
    pipelineTemplates: PIPELINE_TEMPLATES
  });
});

module.exports = {
  listStageTemplates
};
