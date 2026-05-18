const express = require("express");
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const validate = require("../middleware/validate");
const charactersController = require("../controllers/charactersController");
const { idParamSchema, characterStageParamSchema } = require("../validation/schemas");

const router = express.Router();

router.use(authMiddleware);
router.use(requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"));

router.get("/", charactersController.listCharacters);
router.post("/", charactersController.createCharacter);
router.get("/:id", validate({ params: idParamSchema }), charactersController.getCharacterById);
router.put("/:id", validate({ params: idParamSchema }), charactersController.updateCharacter);
router.put("/:id/stages/:stageName", validate({ params: characterStageParamSchema }), charactersController.updateCharacterStage);

module.exports = router;
