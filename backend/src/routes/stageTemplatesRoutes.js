const express = require("express");
const authMiddleware = require("../middleware/auth");
const stageTemplatesController = require("../controllers/stageTemplatesController");

const router = express.Router();

router.use(authMiddleware);
router.get("/", stageTemplatesController.listStageTemplates);

module.exports = router;
