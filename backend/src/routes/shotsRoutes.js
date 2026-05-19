const express = require("express");
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const validate = require("../middleware/validate");
const shotsController = require("../controllers/shotsController");
const {
  idParamSchema,
  stringIdParamSchema,
  createShotSchema,
  updateShotSchema,
  updateStageSchema,
  bulkShotAssignSchema,
  bulkShotUpdateSchema
} = require("../validation/schemas");

const router = express.Router();

router.use(authMiddleware);

router.get("/projects/:id/shots", validate({ params: idParamSchema }), shotsController.listProjectShots);
router.post(
  "/projects/:id/shots",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ params: idParamSchema, body: createShotSchema }),
  shotsController.createProjectShot
);

router.put(
  "/shots/:id",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ params: stringIdParamSchema, body: updateShotSchema }),
  shotsController.updateShot
);
router.post(
  "/shots/bulk-assign",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ body: bulkShotAssignSchema }),
  shotsController.bulkAssignShotStages
);
router.post(
  "/shots/bulk-update",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ body: bulkShotUpdateSchema }),
  shotsController.bulkUpdateShotStages
);
router.delete(
  "/shots/:id",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ params: stringIdParamSchema }),
  shotsController.deleteShot
);

router.put("/shot-stages/:id", validate({ params: stringIdParamSchema, body: updateStageSchema }), shotsController.updateShotStage);

module.exports = router;
