const MANAGER_ROLES = ["BOSS", "PRODUCTION_MANAGER", "COORDINATOR"];

const STAGE_DEFAULTS = [
  {
    stageName: "AUDIO",
    departmentName: "Audio Department",
    recommendedArtists: 2
  },
  {
    stageName: "ANIMATICS",
    departmentName: "Animatics Department",
    recommendedArtists: 3
  },
  {
    stageName: "CHARACTER_MODELLING",
    departmentName: "Character Modelling Department",
    recommendedArtists: 3
  },
  {
    stageName: "BLENDSHAPES",
    departmentName: "Blendshapes Department",
    recommendedArtists: 2
  },
  {
    stageName: "BG_MODELLING",
    departmentName: "BG Modelling Department",
    recommendedArtists: 3
  },
  {
    stageName: "RIGGING",
    departmentName: "Rigging Department",
    recommendedArtists: 3
  },
  {
    stageName: "TEXTURING",
    departmentName: "Texturing Department",
    recommendedArtists: 3
  },
  {
    stageName: "ANIMATION",
    departmentName: "Animation Department",
    recommendedArtists: 10
  },
  {
    stageName: "LIGHTING",
    departmentName: "Lighting Department",
    recommendedArtists: 4
  },
  {
    stageName: "RENDER",
    departmentName: "Render Department",
    recommendedArtists: 1
  },
  {
    stageName: "COMPOSITING",
    departmentName: "Compositing Department",
    recommendedArtists: 2
  },
  {
    stageName: "EDITING",
    departmentName: "Editing Department",
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
