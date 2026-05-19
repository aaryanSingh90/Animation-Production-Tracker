const express = require("express");
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const validate = require("../middleware/validate");
const stagesController = require("../controllers/stagesController");
const { idParamSchema, updateStageSchema } = require("../validation/schemas");

const router = express.Router();

router.use(authMiddleware);
router.use(requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"));

router.patch("/:id", validate({ params: idParamSchema, body: updateStageSchema }), stagesController.updateStage);
router.delete("/:id", validate({ params: idParamSchema }), stagesController.deactivateProjectStage);

module.exports = router;
