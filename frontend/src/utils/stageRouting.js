export const STAGE_SLUG_TO_CODE = {
  audio: "AUDIO",
  animatics: "ANIMATICS",
  texturing: "TEXTURING",
  animation: "ANIMATION",
  lighting: "LIGHTING",
  render: "RENDERING",
  rendering: "RENDERING",
  "character-modelling": "CHARACTER_MODELLING",
  "character-modeling": "CHARACTER_MODELLING",
  blendshapes: "BLENDSHAPES",
  "bg-modelling": "BG_MODELLING",
  "bg-modeling": "BG_MODELLING",
  rigging: "RIGGING",
  comping: "COMPOSITING",
  compositing: "COMPOSITING",
  editing: "EDITING"
};

export const STAGE_CODE_TO_SLUG = Object.fromEntries(Object.entries(STAGE_SLUG_TO_CODE).map(([slug, code]) => [code, slug]));

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
