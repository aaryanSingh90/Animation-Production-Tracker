const express = require("express");
const authMiddleware = require("../middleware/auth");
const authController = require("../controllers/authController");

const router = express.Router();

router.post("/login", authController.login);
router.post("/logout", authMiddleware, authController.logout);
router.get("/me", authMiddleware, authController.me);
router.post("/change-password", authMiddleware, authController.changePassword);

module.exports = router;
