const express = require("express");
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const projectsController = require("../controllers/projectsController");
const stagesController = require("../controllers/stagesController");
const charactersController = require("../controllers/charactersController");

const router = express.Router();

router.use(authMiddleware);

router.get("/my", projectsController.getMyProjects);
router.get("/", requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"), projectsController.listProjects);
router.post("/", requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"), projectsController.createProject);
router.get("/:id", projectsController.getProjectById);
router.put("/:id", requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"), projectsController.updateProject);
router.delete("/:id", requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"), projectsController.deleteProject);
router.get("/:id/stages", stagesController.getProjectStages);
router.post("/:id/characters", requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"), charactersController.linkCharacterToProject);

module.exports = router;
