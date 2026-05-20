export const STAGE_SLUG_TO_CODE = {
  audio: "AUDIO",
  animatics: "ANIMATICS",
  modelling: "MODELLING",
  "character-modelling": "MODELLING",
  "character-modeling": "MODELLING",
  blendshapes: "MODELLING",
  unwrapping: "UNWRAPPING",
  texturing: "TEXTURING",
  rigging: "RIGGING",
  animation: "ANIMATION",
  fx: "FX",
  lighting: "LIGHTING",
  composite: "COMPOSITING",
  comping: "COMPOSITING",
  compositing: "COMPOSITING",
  editing: "EDITING",
  // Backward compatibility
  render: "RENDERING",
  rendering: "RENDERING",
  "bg-modelling": "MODELLING",
  "bg-modeling": "MODELLING"
};

export const STAGE_CODE_TO_SLUG = {
  AUDIO: "audio",
  ANIMATICS: "animatics",
  MODELLING: "modelling",
  UNWRAPPING: "unwrapping",
  TEXTURING: "texturing",
  RIGGING: "rigging",
  ANIMATION: "animation",
  FX: "fx",
  LIGHTING: "lighting",
  COMPOSITING: "composite",
  EDITING: "editing",
  // Legacy
  CHARACTER_MODELLING: "character-modelling",
  BLENDSHAPES: "blendshapes",
  BG_MODELLING: "bg-modelling",
  RENDERING: "rendering"
};

export const STAGE_SLUG_TO_LABEL = {
  audio: "Audio",
  animatics: "Animatics",
  modelling: "Modelling",
  "character-modelling": "Character Modelling",
  "character-modeling": "Character Modelling",
  blendshapes: "Blendshapes",
  unwrapping: "Unwrapping",
  texturing: "Texturing",
  rigging: "Rigging",
  animation: "Animation",
  fx: "FX",
  lighting: "Lighting",
  composite: "Composite",
  render: "Rendering",
  rendering: "Rendering",
  comping: "Composite",
  compositing: "Composite",
  editing: "Editing",
  "bg-modelling": "BG Modelling",
  "bg-modeling": "BG Modelling"
};

export const STAGE_SLUG_TO_WORKSPACE_VARIANT = {
  "character-modelling": "CHARACTER",
  "character-modeling": "CHARACTER",
  blendshapes: "CHARACTER_BLENDSHAPES",
  "bg-modelling": "BG",
  "bg-modeling": "BG"
};

export const MODELLING_CATEGORY_SLUG_TO_VARIANT = {
  characters: "CHARACTER",
  blendshapes: "CHARACTER_BLENDSHAPES",
  props: "PROP",
  bg: "BG"
};

export const MODELLING_VARIANT_TO_CATEGORY_SLUG = {
  CHARACTER: "characters",
  CHARACTER_BLENDSHAPES: "blendshapes",
  PROP: "props",
  BG: "bg"
};

export const MODELLING_VARIANT_TO_LABEL = {
  CHARACTER: "Characters",
  CHARACTER_BLENDSHAPES: "Character Blendshapes",
  PROP: "Props",
  BG: "BG Assets"
};

export function stageCodeFromSlug(slug) {
  return STAGE_SLUG_TO_CODE[String(slug || "").toLowerCase()] || null;
}

export function stageSlugFromCode(code) {
  return STAGE_CODE_TO_SLUG[String(code || "").toUpperCase()] || null;
}

export function stageLabelFromSlug(slug) {
  const normalizedSlug = String(slug || "").toLowerCase();
  if (STAGE_SLUG_TO_LABEL[normalizedSlug]) {
    return STAGE_SLUG_TO_LABEL[normalizedSlug];
  }
  const code = stageCodeFromSlug(slug);
  if (!code) return String(slug || "Stage");
  return code
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function stageWorkspaceVariantFromSlug(slug) {
  return STAGE_SLUG_TO_WORKSPACE_VARIANT[String(slug || "").toLowerCase()] || null;
}

export function modellingCategoryVariantFromSlug(slug) {
  return MODELLING_CATEGORY_SLUG_TO_VARIANT[String(slug || "").toLowerCase()] || null;
}

export function modellingCategorySlugFromVariant(variant) {
  return MODELLING_VARIANT_TO_CATEGORY_SLUG[String(variant || "").toUpperCase()] || null;
}

export function modellingCategoryLabelFromVariant(variant) {
  return MODELLING_VARIANT_TO_LABEL[String(variant || "").toUpperCase()] || "Modelling";
}

export function buildStageWorkspacePath(projectId, stageSlugOrCode) {
  const rawValue = String(stageSlugOrCode || "").trim();
  if (!rawValue) return `/projects/${projectId}`;

  const normalizedSlug = rawValue.toLowerCase();
  const slug = STAGE_SLUG_TO_CODE[normalizedSlug]
    ? normalizedSlug
    : stageSlugFromCode(rawValue.toUpperCase()) || normalizedSlug;

  return `/projects/${projectId}/workspace/${slug}`;
}

export function buildModellingCategoryPath(projectId, variantOrSlug) {
  return buildAssetCategoryPath(projectId, "MODELLING", variantOrSlug);
}

export function buildAssetCategoryPath(projectId, stageSlugOrCode, variantOrSlug) {
  const stageRaw = String(stageSlugOrCode || "").trim();
  const stageSlug = STAGE_SLUG_TO_CODE[stageRaw.toLowerCase()]
    ? stageRaw.toLowerCase()
    : stageSlugFromCode(stageRaw.toUpperCase()) || stageRaw.toLowerCase();

  const rawVariant = String(variantOrSlug || "").trim();
  if (!rawVariant) return `/projects/${projectId}/workspace/${stageSlug}`;

  const normalizedVariant = rawVariant.toLowerCase();
  const categorySlug = MODELLING_CATEGORY_SLUG_TO_VARIANT[normalizedVariant]
    ? normalizedVariant
    : modellingCategorySlugFromVariant(rawVariant.toUpperCase()) || normalizedVariant;

  return `/projects/${projectId}/${stageSlug}/${categorySlug}`;
}
