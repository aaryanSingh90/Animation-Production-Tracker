const PRIMARY_STAGE_TEMPLATE_NAMES = [
  "Audio",
  "Animatics",
  "Modelling",
  "Unwrapping",
  "Texturing",
  "Rigging",
  "Animation",
  "FX",
  "Lighting",
  "Rendering",
  "Compositing",
  "Editing"
];

const DEFAULT_STAGE_TEMPLATES = [
  { name: "Audio", legacyStageName: "AUDIO", color: "#6366F1" },
  { name: "Animatics", legacyStageName: "ANIMATICS", color: "#8B5CF6" },
  { name: "Modelling", legacyStageName: "MODELLING", color: "#EC4899" },
  { name: "Unwrapping", legacyStageName: "UNWRAPPING", color: "#D946EF" },
  { name: "Texturing", legacyStageName: "TEXTURING", color: "#EF4444" },
  { name: "Rigging", legacyStageName: "RIGGING", color: "#F59E0B" },
  { name: "Animation", legacyStageName: "ANIMATION", color: "#3B82F6" },
  { name: "FX", legacyStageName: "FX", color: "#A855F7" },
  { name: "Lighting", legacyStageName: "LIGHTING", color: "#F97316" },
  { name: "Rendering", legacyStageName: "RENDERING", color: "#14B8A6" },
  { name: "Compositing", legacyStageName: "COMPOSITING", color: "#84CC16" },
  { name: "Editing", legacyStageName: "EDITING", color: "#06B6D4" },
  // Legacy
  { name: "Character Modelling", legacyStageName: "CHARACTER_MODELLING", color: "#EC4899" },
  { name: "Blendshapes", legacyStageName: "BLENDSHAPES", color: "#D946EF" },
  { name: "BG Modelling", legacyStageName: "BG_MODELLING", color: "#10B981" },
  { name: "Comping", legacyStageName: "COMPOSITING", color: "#84CC16" },
  {
    name: "Character Modelling & Blendshapes",
    legacyStageName: "CHARACTER_MODELLING_BLENDSHAPES",
    color: "#EC4899"
  }
];

const LEGACY_STAGE_NAME_BY_TEMPLATE = {
  audio: "AUDIO",
  animatics: "ANIMATICS",
  modelling: "MODELLING",
  unwrapping: "UNWRAPPING",
  fx: "FX",
  "character modelling": "CHARACTER_MODELLING",
  blendshapes: "BLENDSHAPES",
  "bg modelling": "BG_MODELLING",
  rigging: "RIGGING",
  texturing: "TEXTURING",
  animation: "ANIMATION",
  lighting: "LIGHTING",
  render: "RENDERING",
  rendering: "RENDERING",
  comping: "COMPOSITING",
  compositing: "COMPOSITING",
  editing: "EDITING",
  "character modelling & blendshapes": "CHARACTER_MODELLING_BLENDSHAPES"
};

function resolveLegacyStageNameFromTemplateName(name) {
  if (!name) return null;
  return LEGACY_STAGE_NAME_BY_TEMPLATE[String(name).trim().toLowerCase()] || null;
}

function displayStageName(stage) {
  if (!stage) return "Stage";
  if (stage.customName) return stage.customName;
  if (stage.stageTemplate?.name) return stage.stageTemplate.name;
  if (stage.stageName === "COMPOSITING") return "Comping";
  if (stage.stageName === "RENDER" || stage.stageName === "RENDERING") return "Rendering";
  return String(stage.stageName || "Stage").replaceAll("_", " ");
}

async function ensureDefaultStageTemplates(prisma) {
  await Promise.all(
    DEFAULT_STAGE_TEMPLATES.map((template) =>
      prisma.stageTemplate.upsert({
        where: { name: template.name },
        create: template,
        update: {
          legacyStageName: template.legacyStageName,
          color: template.color
        }
      })
    )
  );

  return prisma.stageTemplate.findMany({
    orderBy: [{ createdAt: "asc" }, { name: "asc" }]
  });
}

module.exports = {
  DEFAULT_STAGE_TEMPLATES,
  PRIMARY_STAGE_TEMPLATE_NAMES,
  resolveLegacyStageNameFromTemplateName,
  displayStageName,
  ensureDefaultStageTemplates
};
