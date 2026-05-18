const express = require("express");
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const stagesController = require("../controllers/stagesController");

const router = express.Router();

router.use(authMiddleware);

router.put("/:id", stagesController.updateStage);
router.post("/:id/submit", requireRoles("EMPLOYEE"), stagesController.submitStage);
router.post("/:id/approve", requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"), stagesController.approveStage);
router.post("/:id/reject", requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"), stagesController.rejectStage);
router.post("/:id/issue", stagesController.logIssue);
router.post("/:id/extend-deadline", requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"), stagesController.extendDeadline);

module.exports = router;
