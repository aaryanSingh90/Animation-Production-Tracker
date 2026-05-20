const express = require("express");
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const validate = require("../middleware/validate");
const clientsController = require("../controllers/clientsController");
const { idParamSchema, createClientSchema, updateClientSchema } = require("../validation/schemas");

const router = express.Router();

router.use(authMiddleware);
router.use(requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"));

router.get("/", clientsController.listClients);
router.post("/", validate({ body: createClientSchema }), clientsController.createClient);
router.get("/:id", validate({ params: idParamSchema }), clientsController.getClientById);
router.put("/:id", validate({ params: idParamSchema, body: updateClientSchema }), clientsController.updateClient);

module.exports = router;
