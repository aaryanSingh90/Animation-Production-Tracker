const express = require("express");
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const validate = require("../middleware/validate");
const departmentsController = require("../controllers/departmentsController");
const {
  departmentIdParamSchema,
  departmentMemberParamSchema,
  createDepartmentSchema,
  updateDepartmentSchema,
  departmentMemberSchema
} = require("../validation/schemas");

const router = express.Router();

router.use(authMiddleware);
router.use(requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"));

router.get("/", departmentsController.listDepartments);
router.post("/", validate({ body: createDepartmentSchema }), departmentsController.createDepartment);
router.get("/:id", validate({ params: departmentIdParamSchema }), departmentsController.getDepartmentById);
router.put(
  "/:id",
  validate({ params: departmentIdParamSchema, body: updateDepartmentSchema }),
  departmentsController.updateDepartment
);
router.delete("/:id", validate({ params: departmentIdParamSchema }), departmentsController.deleteDepartment);

router.get("/:id/members", validate({ params: departmentIdParamSchema }), departmentsController.listDepartmentMembers);
router.post(
  "/:id/members",
  validate({ params: departmentIdParamSchema, body: departmentMemberSchema }),
  departmentsController.addDepartmentMember
);
router.delete(
  "/:id/members/:userId",
  validate({ params: departmentMemberParamSchema }),
  departmentsController.removeDepartmentMember
);

module.exports = router;
