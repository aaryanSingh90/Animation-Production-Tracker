const MANAGER_ROLES = ["BOSS", "PRODUCTION_MANAGER", "COORDINATOR"];
const { getDepartmentForStage } = require("../constants/stageDepartmentMap");

const STAGE_DEFAULTS = [
  {
    stageName: "AUDIO",
    departmentName: getDepartmentForStage("AUDIO"),
    recommendedArtists: 2
  },
  {
    stageName: "ANIMATICS",
    departmentName: getDepartmentForStage("ANIMATICS"),
    recommendedArtists: 3
  },
  {
    stageName: "CHARACTER_MODELLING",
    departmentName: getDepartmentForStage("CHARACTER_MODELLING"),
    recommendedArtists: 3
  },
  {
    stageName: "BLENDSHAPES",
    departmentName: getDepartmentForStage("BLENDSHAPES"),
    recommendedArtists: 2
  },
  {
    stageName: "BG_MODELLING",
    departmentName: getDepartmentForStage("BG_MODELLING"),
    recommendedArtists: 3
  },
  {
    stageName: "RIGGING",
    departmentName: getDepartmentForStage("RIGGING"),
    recommendedArtists: 3
  },
  {
    stageName: "TEXTURING",
    departmentName: getDepartmentForStage("TEXTURING"),
    recommendedArtists: 3
  },
  {
    stageName: "ANIMATION",
    departmentName: getDepartmentForStage("ANIMATION"),
    recommendedArtists: 10
  },
  {
    stageName: "LIGHTING",
    departmentName: getDepartmentForStage("LIGHTING"),
    recommendedArtists: 4
  },
  {
    stageName: "RENDER",
    departmentName: getDepartmentForStage("RENDERING"),
    recommendedArtists: 1
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
    stages: ["AUDIO", "ANIMATICS", "ANIMATION", "EDITING"]
  },
  {
    id: "template_3d",
    name: "3D Template",
    stages: ["AUDIO", "CHARACTER_MODELLING", "RIGGING", "ANIMATION", "LIGHTING", "RENDER", "COMPOSITING", "EDITING"]
  },
  {
    id: "template_full",
    name: "Full Studio Template",
    stages: [
      "AUDIO",
      "ANIMATICS",
      "CHARACTER_MODELLING",
      "BLENDSHAPES",
      "BG_MODELLING",
      "RIGGING",
      "TEXTURING",
      "ANIMATION",
      "LIGHTING",
      "RENDER",
      "COMPOSITING",
      "EDITING"
    ]
  }
];

function humanizeStageName(stageName) {
  if (!stageName) return "Stage";
  if (stageName === "COMPOSITING") return "Comping";
  if (stageName === "RENDER") return "Rendering";
  return stageName.replaceAll("_", " ");
}

const CHARACTER_STAGES = ["REFERENCE", "MODELLING", "BLENDSHAPES", "TEXTURING", "RIGGING"];

const ACTIVE_STAGE_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "REJECTED", "REVISION_REQUIRED", "ISSUE", "EXTENDED"];

module.exports = {
  MANAGER_ROLES,
  PROJECT_STAGES,
  STAGE_DEFAULTS,
  PIPELINE_TEMPLATES,
  humanizeStageName,
  CHARACTER_STAGES,
  ACTIVE_STAGE_STATUSES
};
