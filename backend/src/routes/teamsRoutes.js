const express = require("express");
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const validate = require("../middleware/validate");
const teamsController = require("../controllers/teamsController");
const {
  teamIdParamSchema,
  teamMemberParamSchema,
  teamProjectParamSchema,
  createTeamSchema,
  updateTeamSchema,
  teamMemberSchema,
  teamProjectSchema,
  teamLeadSchema
} = require("../validation/schemas");

const router = express.Router();

router.use(authMiddleware);
router.use(requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"));

router.get("/", teamsController.listTeams);
router.post("/", validate({ body: createTeamSchema }), teamsController.createTeam);
router.get("/:id", validate({ params: teamIdParamSchema }), teamsController.getTeamById);
router.put("/:id", validate({ params: teamIdParamSchema, body: updateTeamSchema }), teamsController.updateTeam);
router.delete("/:id", validate({ params: teamIdParamSchema }), teamsController.archiveTeam);

router.post("/:id/members", validate({ params: teamIdParamSchema, body: teamMemberSchema }), teamsController.addTeamMember);
router.delete("/:id/members/:userId", validate({ params: teamMemberParamSchema }), teamsController.removeTeamMember);
router.post("/:id/lead", validate({ params: teamIdParamSchema, body: teamLeadSchema }), teamsController.assignTeamLead);

router.post("/:id/projects", validate({ params: teamIdParamSchema, body: teamProjectSchema }), teamsController.assignTeamToProject);
router.delete("/:id/projects/:projectId", validate({ params: teamProjectParamSchema }), teamsController.removeTeamFromProject);

module.exports = router;
