const express = require("express");
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const validate = require("../middleware/validate");
const projectsController = require("../controllers/projectsController");
const stagesController = require("../controllers/stagesController");
const charactersController = require("../controllers/charactersController");
const { idParamSchema, createProjectSchema, updateProjectSchema, linkCharacterSchema } = require("../validation/schemas");

const router = express.Router();

router.use(authMiddleware);

router.get("/my", projectsController.getMyProjects);
router.get("/", requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"), projectsController.listProjects);
router.post("/", requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"), validate({ body: createProjectSchema }), projectsController.createProject);
router.get("/:id", validate({ params: idParamSchema }), projectsController.getProjectById);
router.put(
  "/:id",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ params: idParamSchema, body: updateProjectSchema }),
  projectsController.updateProject
);
router.delete("/:id", requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"), validate({ params: idParamSchema }), projectsController.deleteProject);
router.get("/:id/stages", validate({ params: idParamSchema }), stagesController.getProjectStages);
router.post(
  "/:id/characters",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ params: idParamSchema, body: linkCharacterSchema }),
  charactersController.linkCharacterToProject
);

module.exports = router;
