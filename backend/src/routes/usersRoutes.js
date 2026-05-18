const express = require("express");
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const usersController = require("../controllers/usersController");

const router = express.Router();

router.use(authMiddleware);

router.get("/", requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"), usersController.listUsers);
router.post("/", requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"), usersController.createUser);
router.get("/:id", usersController.getUserById);
router.put("/:id", usersController.updateUser);
router.delete("/:id", requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"), usersController.deactivateUser);
router.get("/:id/workload", usersController.getWorkload);
router.post("/:id/assign", requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"), usersController.assignUserToStage);

module.exports = router;
