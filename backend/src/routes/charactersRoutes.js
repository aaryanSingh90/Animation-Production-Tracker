const express = require("express");
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const charactersController = require("../controllers/charactersController");

const router = express.Router();

router.use(authMiddleware);
router.use(requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"));

router.get("/", charactersController.listCharacters);
router.post("/", charactersController.createCharacter);
router.get("/:id", charactersController.getCharacterById);
router.put("/:id", charactersController.updateCharacter);
router.put("/:id/stages/:stageName", charactersController.updateCharacterStage);

module.exports = router;
