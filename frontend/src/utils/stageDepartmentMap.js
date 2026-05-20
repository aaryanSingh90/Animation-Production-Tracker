export const STAGE_DEPARTMENT_MAP = {
  AUDIO: "Audio Department",
  ANIMATICS: "Animation Department",
  MODELLING: "Modelling Department",
  UNWRAPPING: "Texturing Department",
  FX: "Animation Department",
  COMPOSITING: "Compositing Department",
  EDITING: "Editing Department",
  // Backward compatibility
  CHARACTER_MODELLING: "Modelling Department",
  BLENDSHAPES: "Modelling Department",
  BG_MODELLING: "Modelling Department",
  RIGGING: "Rigging Department",
  TEXTURING: "Texturing Department",
  LIGHTING: "Lighting Department",
  ANIMATION: "Animation Department",
  RENDERING: "Lighting Department",
  RENDER: "Lighting Department"
};

export function normalizeStageCode(value) {
  const code = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (code === "RENDER") return "RENDERING";
  return code;
}

export function normalizeDepartmentName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/department/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function stageDepartmentFromCode(stageCode) {
  return STAGE_DEPARTMENT_MAP[normalizeStageCode(stageCode)] || null;
}

export function isDepartmentMatch(expectedDepartmentName, actualDepartmentName) {
  const expected = normalizeDepartmentName(expectedDepartmentName);
  const actual = normalizeDepartmentName(actualDepartmentName);
  if (!expected || !actual) return false;
  return expected === actual || expected.includes(actual) || actual.includes(expected);
}
