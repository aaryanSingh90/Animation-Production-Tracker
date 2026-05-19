const express = require("express");
const authMiddleware = require("../middleware/auth");
const validate = require("../middleware/validate");
const trackingController = require("../controllers/trackingController");
const {
  idParamSchema,
  projectStageWorkspaceParamSchema,
  stageWorkspaceQuerySchema
} = require("../validation/schemas");

const router = express.Router();

router.use(authMiddleware);

router.get("/projects/:id/overview", validate({ params: idParamSchema }), trackingController.getProjectOverview);
router.get(
  "/projects/:id/stages/:stageCode/shots",
  validate({ params: projectStageWorkspaceParamSchema, query: stageWorkspaceQuerySchema }),
  trackingController.getStageShotsWorkspace
);
router.get(
  "/projects/:id/stages/:stageCode/assets",
  validate({ params: projectStageWorkspaceParamSchema, query: stageWorkspaceQuerySchema }),
  trackingController.getStageAssetsWorkspace
);
router.get(
  "/projects/:id/stages/:stageCode/project",
  validate({ params: projectStageWorkspaceParamSchema }),
  trackingController.getProjectStageWorkspace
);

module.exports = router;
