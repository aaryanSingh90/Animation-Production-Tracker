const express = require("express");
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const approvalsController = require("../controllers/approvalsController");

const router = express.Router();

router.use(authMiddleware);
router.use(requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"));

router.get("/", approvalsController.getApprovalQueue);

module.exports = router;
