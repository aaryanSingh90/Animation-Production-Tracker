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
    stageName: "CHARACTER_MODELLING_BLENDSHAPES",
    departmentName: "Character Modelling & Blendshapes",
    recommendedArtists: 3
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

const CHARACTER_STAGES = ["REFERENCE", "MODELLING", "BLENDSHAPES", "TEXTURING", "RIGGING"];

const ACTIVE_STAGE_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "REJECTED", "ISSUE", "EXTENDED"];

module.exports = {
  MANAGER_ROLES,
  PROJECT_STAGES,
  STAGE_DEFAULTS,
  CHARACTER_STAGES,
  ACTIVE_STAGE_STATUSES
};
