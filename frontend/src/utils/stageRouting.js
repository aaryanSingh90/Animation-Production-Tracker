export const STAGE_SLUG_TO_CODE = {
  audio: "AUDIO",
  animatics: "ANIMATICS",
  modelling: "MODELLING",
  "character-modelling": "MODELLING",
  "character-modeling": "MODELLING",
  unwrapping: "UNWRAPPING",
  texturing: "TEXTURING",
  rigging: "RIGGING",
  animation: "ANIMATION",
  fx: "FX",
  lighting: "LIGHTING",
  comping: "COMPOSITING",
  compositing: "COMPOSITING",
  editing: "EDITING",
  // Backward compatibility
  render: "RENDERING",
  rendering: "RENDERING",
  blendshapes: "BLENDSHAPES",
  "bg-modelling": "BG_MODELLING",
  "bg-modeling": "BG_MODELLING"
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
  COMPOSITING: "compositing",
  EDITING: "editing",
  // Legacy
  CHARACTER_MODELLING: "character-modelling",
  BLENDSHAPES: "blendshapes",
  BG_MODELLING: "bg-modelling",
  RENDERING: "rendering"
};

export function stageCodeFromSlug(slug) {
  return STAGE_SLUG_TO_CODE[String(slug || "").toLowerCase()] || null;
}

export function stageSlugFromCode(code) {
  return STAGE_CODE_TO_SLUG[String(code || "").toUpperCase()] || null;
}

export function stageLabelFromSlug(slug) {
  const code = stageCodeFromSlug(slug);
  if (!code) return String(slug || "Stage");
  return code
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
