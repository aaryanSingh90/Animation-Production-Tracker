const CURRENT_PIPELINE_STAGE_CODES = [
  "ANIMATICS",
  "AUDIO",
  "MODELLING",
  "UNWRAPPING",
  "TEXTURING",
  "RIGGING",
  "ANIMATION",
  "FX",
  "LIGHTING",
  "COMPOSITING",
  "EDITING"
];

const DEFAULT_STAGE_DEFINITIONS = [
  {
    code: "ANIMATICS",
    name: "Animatics",
    trackingMode: "SHOT",
    isHybrid: false,
    requiresApproval: true,
    order: 1,
    color: "#8B5CF6",
    icon: "clapperboard"
  },
  {
    code: "AUDIO",
    name: "Audio",
    trackingMode: "PROJECT",
    isHybrid: false,
    requiresApproval: true,
    order: 2,
    color: "#6366F1",
    icon: "music"
  },
  {
    code: "MODELLING",
    name: "Modelling",
    trackingMode: "ASSET",
    isHybrid: false,
    requiresApproval: true,
    order: 3,
    color: "#EC4899",
    icon: "box"
  },
  {
    code: "UNWRAPPING",
    name: "Unwrapping",
    trackingMode: "ASSET",
    isHybrid: false,
    requiresApproval: true,
    order: 4,
    color: "#D946EF",
    icon: "scan"
  },
  {
    code: "TEXTURING",
    name: "Texturing",
    trackingMode: "ASSET",
    isHybrid: false,
    requiresApproval: true,
    order: 5,
    color: "#EF4444",
    icon: "paintbrush"
  },
  {
    code: "RIGGING",
    name: "Rigging",
    trackingMode: "ASSET",
    isHybrid: false,
    requiresApproval: true,
    order: 6,
    color: "#F59E0B",
    icon: "wrench"
  },
  {
    code: "ANIMATION",
    name: "Animation",
    trackingMode: "SHOT",
    isHybrid: false,
    requiresApproval: true,
    order: 7,
    color: "#3B82F6",
    icon: "film"
  },
  {
    code: "FX",
    name: "FX",
    trackingMode: "SHOT",
    isHybrid: false,
    requiresApproval: true,
    order: 8,
    color: "#A855F7",
    icon: "sparkles"
  },
  {
    code: "LIGHTING",
    name: "Lighting",
    trackingMode: "SHOT",
    isHybrid: false,
    requiresApproval: true,
    order: 9,
    color: "#F97316",
    icon: "sun"
  },
  {
    code: "COMPOSITING",
    name: "Composite",
    trackingMode: "PROJECT",
    isHybrid: false,
    requiresApproval: true,
    order: 10,
    color: "#84CC16",
    icon: "layers"
  },
  {
    code: "EDITING",
    name: "Editing",
    trackingMode: "PROJECT",
    isHybrid: false,
    requiresApproval: true,
    order: 11,
    color: "#06B6D4",
    icon: "scissors"
  },
  {
    code: "RENDERING",
    name: "Rendering (Legacy)",
    trackingMode: "PROJECT",
    isHybrid: true,
    requiresApproval: true,
    order: 89,
    color: "#14B8A6",
    icon: "monitor",
    isActive: false
  },
  // Legacy codes kept for backward compatibility with existing projects.
  {
    code: "CHARACTER_MODELLING",
    name: "Character Modelling (Legacy)",
    trackingMode: "ASSET",
    isHybrid: false,
    requiresApproval: true,
    order: 90,
    color: "#EC4899",
    icon: "box",
    isActive: false
  },
  {
    code: "BLENDSHAPES",
    name: "Blendshapes (Legacy)",
    trackingMode: "ASSET",
    isHybrid: false,
    requiresApproval: true,
    order: 91,
    color: "#D946EF",
    icon: "sparkles",
    isActive: false
  },
  {
    code: "BG_MODELLING",
    name: "BG Modelling (Legacy)",
    trackingMode: "ASSET",
    isHybrid: false,
    requiresApproval: true,
    order: 92,
    color: "#10B981",
    icon: "mountain",
    isActive: false
  }
];

const STAGE_CODE_TO_LEGACY_NAME = {
  AUDIO: "AUDIO",
  ANIMATICS: "ANIMATICS",
  MODELLING: "CHARACTER_MODELLING",
  UNWRAPPING: "UNWRAPPING",
  TEXTURING: "TEXTURING",
  RIGGING: "RIGGING",
  ANIMATION: "ANIMATION",
  FX: "FX",
  LIGHTING: "LIGHTING",
  RENDERING: "RENDERING",
  COMPOSITING: "COMPOSITING",
  EDITING: "EDITING",
  // Legacy
  CHARACTER_MODELLING: "CHARACTER_MODELLING",
  BLENDSHAPES: "BLENDSHAPES",
  BG_MODELLING: "BG_MODELLING"
};

const LEGACY_STAGE_NAME_TO_CODE = {
  ...Object.fromEntries(Object.entries(STAGE_CODE_TO_LEGACY_NAME).map(([code, legacy]) => [legacy, code])),
  MODELLING: "MODELLING",
  RENDER: "RENDERING"
};

const TRACKING_GROUPS = {
  PROJECT: ["AUDIO", "COMPOSITING", "EDITING"],
  SHOT: ["ANIMATICS", "ANIMATION", "FX", "LIGHTING"],
  ASSET: ["MODELLING", "UNWRAPPING", "TEXTURING", "RIGGING"],
  HYBRID: ["RENDERING"]
};

function normalizeStageCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function getLegacyStageNameFromCode(code) {
  return STAGE_CODE_TO_LEGACY_NAME[normalizeStageCode(code)] || normalizeStageCode(code);
}

function getStageCodeFromLegacyStageName(legacyStageName) {
  return LEGACY_STAGE_NAME_TO_CODE[String(legacyStageName || "").trim().toUpperCase()] || null;
}

async function ensureDefaultStageDefinitions(prisma) {
  await Promise.all(
    DEFAULT_STAGE_DEFINITIONS.map((definition) =>
      prisma.stageDefinition.upsert({
        where: { code: definition.code },
        create: definition,
        update: {
          name: definition.name,
          trackingMode: definition.trackingMode,
          isHybrid: definition.isHybrid,
          requiresApproval: definition.requiresApproval,
          order: definition.order,
          color: definition.color,
          icon: definition.icon,
          isActive: definition.isActive !== false
        }
      })
    )
  );

  return prisma.stageDefinition.findMany({
    where: { isActive: true },
    orderBy: [{ order: "asc" }, { name: "asc" }]
  });
}

module.exports = {
  CURRENT_PIPELINE_STAGE_CODES,
  DEFAULT_STAGE_DEFINITIONS,
  STAGE_CODE_TO_LEGACY_NAME,
  LEGACY_STAGE_NAME_TO_CODE,
  TRACKING_GROUPS,
  normalizeStageCode,
  getLegacyStageNameFromCode,
  getStageCodeFromLegacyStageName,
  ensureDefaultStageDefinitions
};
