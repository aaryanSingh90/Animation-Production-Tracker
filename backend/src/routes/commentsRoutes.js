const express = require("express");
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const validate = require("../middleware/validate");
const commentsController = require("../controllers/commentsController");
const {
  stageCommentParamSchema,
  stringStageCommentParamSchema,
  projectCommentParamSchema,
  commentIdParamSchema,
  createCommentSchema,
  updateCommentSchema
} = require("../validation/schemas");

const router = express.Router();

router.use(authMiddleware);

router.get(
  "/stages/:stageId/comments",
  validate({ params: stageCommentParamSchema }),
  commentsController.getStageComments
);

router.post(
  "/stages/:stageId/comments",
  validate({ params: stageCommentParamSchema, body: createCommentSchema }),
  commentsController.postStageComment
);

router.get(
  "/shot-stages/:stageId/comments",
  validate({ params: stringStageCommentParamSchema }),
  commentsController.getShotStageComments
);

router.post(
  "/shot-stages/:stageId/comments",
  validate({ params: stringStageCommentParamSchema, body: createCommentSchema }),
  commentsController.postShotStageComment
);

router.get(
  "/asset-stages/:stageId/comments",
  validate({ params: stringStageCommentParamSchema }),
  commentsController.getAssetStageComments
);

router.post(
  "/asset-stages/:stageId/comments",
  validate({ params: stringStageCommentParamSchema, body: createCommentSchema }),
  commentsController.postAssetStageComment
);

router.put(
  "/comments/:commentId",
  validate({ params: commentIdParamSchema, body: updateCommentSchema }),
  commentsController.editComment
);

router.delete(
  "/comments/:commentId",
  validate({ params: commentIdParamSchema }),
  commentsController.deleteComment
);

router.get(
  "/projects/:projectId/comments",
  requireRoles("BOSS", "PRODUCTION_MANAGER", "COORDINATOR"),
  validate({ params: projectCommentParamSchema }),
  commentsController.getProjectComments
);

module.exports = router;
