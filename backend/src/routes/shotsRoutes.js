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
  updateStageSchema
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
router.delete(
  "/shots/:id",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ params: stringIdParamSchema }),
  shotsController.deleteShot
);

router.put("/shot-stages/:id", validate({ params: stringIdParamSchema, body: updateStageSchema }), shotsController.updateShotStage);

module.exports = router;
