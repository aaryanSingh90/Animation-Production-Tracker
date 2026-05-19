const express = require("express");
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const validate = require("../middleware/validate");
const workforceController = require("../controllers/workforceController");
const { idParamSchema } = require("../validation/schemas");

const router = express.Router();

router.use(authMiddleware);
router.use(requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"));

router.get("/overview", workforceController.getWorkforceOverview);
router.get("/heatmap", workforceController.getWorkforceHeatmap);
router.get("/employees/:id", validate({ params: idParamSchema }), workforceController.getEmployeeProfile);

module.exports = router;
