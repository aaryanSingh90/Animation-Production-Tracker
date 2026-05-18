const express = require("express");
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const issuesController = require("../controllers/issuesController");

const router = express.Router();

router.use(authMiddleware);

router.get("/", requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"), issuesController.listIssues);

module.exports = router;
