const express = require("express");
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const reportsController = require("../controllers/reportsController");

const router = express.Router();

router.use(authMiddleware);
router.use(requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"));

router.get("/overview", reportsController.getOverviewReport);
router.get("/deadlines", reportsController.getUpcomingDeadlines);
router.get("/issues", reportsController.getIssuesGrouped);
router.get("/workload", reportsController.getWorkloadReport);

module.exports = router;
