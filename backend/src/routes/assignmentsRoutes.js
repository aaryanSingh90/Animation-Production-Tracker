const express = require("express");
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const validate = require("../middleware/validate");
const assignmentsController = require("../controllers/assignmentsController");
const { assignmentRecommendationParamSchema, smartAssignSchema } = require("../validation/schemas");

const router = express.Router();

router.use(authMiddleware);
router.use(requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"));

router.get("/board", assignmentsController.getAssignmentsBoard);
router.get("/recommendations/:stageId", validate({ params: assignmentRecommendationParamSchema }), assignmentsController.getRecommendations);
router.post("/smart-assign", validate({ body: smartAssignSchema }), assignmentsController.smartAssign);

module.exports = router;
