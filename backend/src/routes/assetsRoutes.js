const express = require("express");
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const validate = require("../middleware/validate");
const assetsController = require("../controllers/assetsController");
const {
  idParamSchema,
  stringIdParamSchema,
  createAssetSchema,
  updateAssetSchema,
  updateStageSchema
} = require("../validation/schemas");

const router = express.Router();

router.use(authMiddleware);

router.get("/projects/:id/assets", validate({ params: idParamSchema }), assetsController.listProjectAssets);
router.post(
  "/projects/:id/assets",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ params: idParamSchema, body: createAssetSchema }),
  assetsController.createProjectAsset
);

router.put(
  "/assets/:id",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ params: stringIdParamSchema, body: updateAssetSchema }),
  assetsController.updateAsset
);
router.delete(
  "/assets/:id",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ params: stringIdParamSchema }),
  assetsController.deleteAsset
);

router.put("/asset-stages/:id", validate({ params: stringIdParamSchema, body: updateStageSchema }), assetsController.updateAssetStage);

module.exports = router;
