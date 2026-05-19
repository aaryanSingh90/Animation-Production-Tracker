const express = require("express");
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const validate = require("../middleware/validate");
const stagesController = require("../controllers/stagesController");
const {
  idParamSchema,
  stageArtistParamSchema,
  updateStageSchema,
  rejectStageSchema,
  issueSchema,
  extendDeadlineSchema,
  assignArtistSchema
} = require("../validation/schemas");

const router = express.Router();

router.use(authMiddleware);

router.put("/:id", validate({ params: idParamSchema, body: updateStageSchema }), stagesController.updateStage);
router.post("/:id/submit", requireRoles("EMPLOYEE"), validate({ params: idParamSchema }), stagesController.submitStage);
router.post(
  "/:id/approve",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ params: idParamSchema }),
  stagesController.approveStage
);
router.post(
  "/:id/reject",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ params: idParamSchema, body: rejectStageSchema }),
  stagesController.rejectStage
);
router.post("/:id/issue", validate({ params: idParamSchema, body: issueSchema }), stagesController.logIssue);
router.post(
  "/:id/extend-deadline",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ params: idParamSchema, body: extendDeadlineSchema }),
  stagesController.extendDeadline
);
router.post(
  "/:id/assign-artist",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ params: idParamSchema, body: assignArtistSchema }),
  stagesController.assignArtistToStage
);
router.delete(
  "/:id/assign-artist/:userId",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ params: stageArtistParamSchema }),
  stagesController.removeArtistFromStage
);

module.exports = router;
