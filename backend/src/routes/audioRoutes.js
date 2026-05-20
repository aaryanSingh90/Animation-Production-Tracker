const express = require("express");
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const validate = require("../middleware/validate");
const audioController = require("../controllers/audioController");
const {
  idParamSchema,
  stringIdParamSchema,
  createAudioTaskSchema,
  updateAudioTaskSchema,
  audioTaskQuerySchema
} = require("../validation/schemas");

const router = express.Router();

router.use(authMiddleware);

router.get("/projects/:id/audio", validate({ params: idParamSchema, query: audioTaskQuerySchema }), audioController.listProjectAudio);
router.post(
  "/audio",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ body: createAudioTaskSchema }),
  audioController.createAudioTask
);
router.patch(
  "/audio/:id",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ params: stringIdParamSchema, body: updateAudioTaskSchema }),
  audioController.updateAudioTask
);
router.delete(
  "/audio/:id",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ params: stringIdParamSchema }),
  audioController.deleteAudioTask
);

module.exports = router;
