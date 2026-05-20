const express = require("express");
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const validate = require("../middleware/validate");
const usersController = require("../controllers/usersController");
const {
  idParamSchema,
  createUserSchema,
  assignUserSchema,
  resetEmployeePasswordSchema,
  setEmployeeActiveSchema
} = require("../validation/schemas");

const router = express.Router();

router.use(authMiddleware);

router.get("/", requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"), usersController.listUsers);
router.get("/workload-summaries", usersController.getWorkloadSummaries);
router.post("/", requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"), validate({ body: createUserSchema }), usersController.createUser);
router.post(
  "/reset-password",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ body: resetEmployeePasswordSchema }),
  usersController.resetEmployeePassword
);
router.post(
  "/deactivate",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ body: setEmployeeActiveSchema }),
  usersController.setEmployeeActiveStatus
);
router.get("/:id", validate({ params: idParamSchema }), usersController.getUserById);
router.put("/:id", validate({ params: idParamSchema }), usersController.updateUser);
router.delete("/:id", requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"), validate({ params: idParamSchema }), usersController.deactivateUser);
router.get("/:id/workload", validate({ params: idParamSchema }), usersController.getWorkload);
router.post(
  "/:id/assign",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ params: idParamSchema, body: assignUserSchema }),
  usersController.assignUserToStage
);

module.exports = router;
