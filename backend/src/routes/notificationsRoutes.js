const express = require("express");
const authMiddleware = require("../middleware/auth");
const notificationsController = require("../controllers/notificationsController");

const router = express.Router();

router.use(authMiddleware);

router.get("/", notificationsController.getNotifications);
router.put("/:id/read", notificationsController.markRead);
router.put("/read-all", notificationsController.markAllRead);

module.exports = router;
