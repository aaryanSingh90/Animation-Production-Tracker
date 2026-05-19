const DEFAULT_STAGE_DEFINITIONS = [
  {
    code: "AUDIO",
    name: "Audio",
    trackingMode: "PROJECT",
    isHybrid: false,
    requiresApproval: true,
    order: 1,
    color: "#6366F1",
    icon: "music"
  },
  {
    code: "ANIMATICS",
    name: "Animatics",
    trackingMode: "SHOT",
    isHybrid: false,
    requiresApproval: true,
    order: 2,
    color: "#8B5CF6",
    icon: "clapperboard"
  },
  {
    code: "CHARACTER_MODELLING",
    name: "Character Modelling",
    trackingMode: "ASSET",
    isHybrid: false,
    requiresApproval: true,
    order: 3,
    color: "#EC4899",
    icon: "box"
  },
  {
    code: "BLENDSHAPES",
    name: "Blendshapes",
    trackingMode: "ASSET",
    isHybrid: false,
    requiresApproval: true,
    order: 4,
    color: "#D946EF",
    icon: "sparkles"
  },
  {
    code: "BG_MODELLING",
    name: "BG Modelling",
    trackingMode: "ASSET",
    isHybrid: false,
    requiresApproval: true,
    order: 5,
    color: "#10B981",
    icon: "mountain"
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
    code: "TEXTURING",
    name: "Texturing",
    trackingMode: "SHOT",
    isHybrid: false,
    requiresApproval: true,
    order: 7,
    color: "#EF4444",
    icon: "paintbrush"
  },
  {
    code: "ANIMATION",
    name: "Animation",
    trackingMode: "SHOT",
    isHybrid: false,
    requiresApproval: true,
    order: 8,
    color: "#3B82F6",
    icon: "film"
  },
  {
    code: "LIGHTING",
    name: "Lighting",
    trackingMode: "PROJECT",
    isHybrid: true,
    requiresApproval: true,
    order: 9,
    color: "#F97316",
    icon: "sun"
  },
  {
    code: "RENDERING",
    name: "Rendering",
    trackingMode: "PROJECT",
    isHybrid: true,
    requiresApproval: true,
    order: 10,
    color: "#14B8A6",
    icon: "monitor"
  },
  {
    code: "COMPOSITING",
    name: "Compositing",
    trackingMode: "PROJECT",
    isHybrid: false,
    requiresApproval: true,
    order: 11,
    color: "#84CC16",
    icon: "layers"
  },
  {
    code: "EDITING",
    name: "Editing",
    trackingMode: "PROJECT",
    isHybrid: false,
    requiresApproval: true,
    order: 12,
    color: "#06B6D4",
    icon: "scissors"
  }
];

const STAGE_CODE_TO_LEGACY_NAME = {
  AUDIO: "AUDIO",
  ANIMATICS: "ANIMATICS",
  CHARACTER_MODELLING: "CHARACTER_MODELLING",
  BLENDSHAPES: "BLENDSHAPES",
  BG_MODELLING: "BG_MODELLING",
  RIGGING: "RIGGING",
  TEXTURING: "TEXTURING",
  ANIMATION: "ANIMATION",
  LIGHTING: "LIGHTING",
  RENDERING: "RENDER",
  COMPOSITING: "COMPOSITING",
  EDITING: "EDITING"
};

const LEGACY_STAGE_NAME_TO_CODE = Object.fromEntries(
  Object.entries(STAGE_CODE_TO_LEGACY_NAME).map(([code, legacy]) => [legacy, code])
);

const TRACKING_GROUPS = {
  PROJECT: ["AUDIO", "COMPOSITING", "EDITING"],
  SHOT: ["ANIMATICS", "TEXTURING", "ANIMATION"],
  ASSET: ["CHARACTER_MODELLING", "BLENDSHAPES", "BG_MODELLING", "RIGGING"],
  HYBRID: ["LIGHTING", "RENDERING"]
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
          isActive: true
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
  DEFAULT_STAGE_DEFINITIONS,
  STAGE_CODE_TO_LEGACY_NAME,
  LEGACY_STAGE_NAME_TO_CODE,
  TRACKING_GROUPS,
  normalizeStageCode,
  getLegacyStageNameFromCode,
  getStageCodeFromLegacyStageName,
  ensureDefaultStageDefinitions
};
