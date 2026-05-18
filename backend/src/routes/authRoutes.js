const express = require("express");
const authMiddleware = require("../middleware/auth");
const validate = require("../middleware/validate");
const authController = require("../controllers/authController");
const { loginSchema, registerSchema, changePasswordSchema } = require("../validation/schemas");

const router = express.Router();

router.post("/login", validate({ body: loginSchema }), authController.login);
router.post("/register", validate({ body: registerSchema }), authController.register);
router.post("/logout", authMiddleware, authController.logout);
router.get("/me", authMiddleware, authController.me);
router.post("/change-password", authMiddleware, validate({ body: changePasswordSchema }), authController.changePassword);

module.exports = router;
