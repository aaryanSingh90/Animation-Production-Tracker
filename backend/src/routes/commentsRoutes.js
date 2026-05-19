const express = require("express");
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const validate = require("../middleware/validate");
const commentsController = require("../controllers/commentsController");
const {
  stageCommentParamSchema,
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
