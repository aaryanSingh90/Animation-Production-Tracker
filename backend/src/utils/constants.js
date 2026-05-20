const MANAGER_ROLES = ["BOSS", "PRODUCTION_MANAGER", "COORDINATOR"];
const { getDepartmentForStage } = require("../constants/stageDepartmentMap");
const { ACTIVE_STAGE_STATUSES } = require("./pipelineStatus");

const STAGE_DEFAULTS = [
  {
    stageName: "ANIMATICS",
    departmentName: getDepartmentForStage("ANIMATICS"),
    recommendedArtists: 3
  },
  {
    stageName: "AUDIO",
    departmentName: getDepartmentForStage("AUDIO"),
    recommendedArtists: 2
  },
  {
    stageName: "MODELLING",
    departmentName: getDepartmentForStage("MODELLING"),
    recommendedArtists: 3
  },
  {
    stageName: "UNWRAPPING",
    departmentName: getDepartmentForStage("UNWRAPPING"),
    recommendedArtists: 2
  },
  {
    stageName: "TEXTURING",
    departmentName: getDepartmentForStage("TEXTURING"),
    recommendedArtists: 3
  },
  {
    stageName: "RIGGING",
    departmentName: getDepartmentForStage("RIGGING"),
    recommendedArtists: 3
  },
  {
    stageName: "ANIMATION",
    departmentName: getDepartmentForStage("ANIMATION"),
    recommendedArtists: 10
  },
  {
    stageName: "FX",
    departmentName: getDepartmentForStage("FX"),
    recommendedArtists: 4
  },
  {
    stageName: "LIGHTING",
    departmentName: getDepartmentForStage("LIGHTING"),
    recommendedArtists: 4
  },
  {
    stageName: "COMPOSITING",
    departmentName: getDepartmentForStage("COMPOSITING"),
    recommendedArtists: 2
  },
  {
    stageName: "EDITING",
    departmentName: getDepartmentForStage("EDITING"),
    recommendedArtists: 2
  }
];

const PROJECT_STAGES = STAGE_DEFAULTS.map((stage) => stage.stageName);

const PIPELINE_TEMPLATES = [
  {
    id: "template_2d",
    name: "2D Template",
    stages: ["ANIMATICS", "AUDIO", "ANIMATION", "COMPOSITING", "EDITING"]
  },
  {
    id: "template_3d",
    name: "3D Template",
    stages: ["ANIMATICS", "AUDIO", "MODELLING", "UNWRAPPING", "TEXTURING", "RIGGING", "ANIMATION", "FX", "LIGHTING", "COMPOSITING", "EDITING"]
  },
  {
    id: "template_full",
    name: "Full Studio Template",
    stages: [
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
    ]
  }
];

function humanizeStageName(stageName) {
  if (!stageName) return "Stage";
  if (stageName === "COMPOSITING") return "Composite";
  if (stageName === "RENDER" || stageName === "RENDERING") return "Rendering";
  return stageName.replaceAll("_", " ");
}

const CHARACTER_STAGES = ["REFERENCE", "MODELLING", "BLENDSHAPES", "TEXTURING", "RIGGING"];

module.exports = {
  MANAGER_ROLES,
  PROJECT_STAGES,
  STAGE_DEFAULTS,
  PIPELINE_TEMPLATES,
  humanizeStageName,
  CHARACTER_STAGES,
  ACTIVE_STAGE_STATUSES
};
