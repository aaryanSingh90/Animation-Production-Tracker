const prisma = require("../utils/prisma");
const { AppError, asyncHandler } = require("../utils/http");
const { MANAGER_ROLES } = require("../utils/constants");
const { createNotification } = require("../utils/notifications");
const { displayStageName } = require("../utils/stageTemplates");

function isManagerRole(role) {
  return MANAGER_ROLES.includes(role);
}

function getAssignedUserIds(stage) {
  const ids = new Set();
  if (stage.assignedUserId) ids.add(stage.assignedUserId);
  for (const assignment of stage.assignments || []) {
    ids.add(assignment.userId);
  }
  return Array.from(ids);
}

async function loadStageForAccess(stageId) {
  return prisma.projectStage.findUnique({
    where: { id: stageId },
    include: {
      project: {
        select: {
          id: true,
          name: true
        }
      },
      stageTemplate: true,
      assignments: {
        select: {
          userId: true
        }
      },
      _count: {
        select: {
          comments: true
        }
      }
    }
  });
}

function assertStageAccess(stage, user) {
  if (!stage) {
    throw new AppError("Stage not found", 404);
  }

  if (isManagerRole(user.role)) return;

  const assignedUserIds = getAssignedUserIds(stage);
  if (!assignedUserIds.includes(user.id)) {
    throw new AppError("Forbidden", 403);
  }
}

async function getManagerIds() {
  const managers = await prisma.user.findMany({
    where: {
      role: { in: MANAGER_ROLES },
      isActive: true
    },
    select: { id: true }
  });

  return managers.map((manager) => manager.id);
}

const getStageComments = asyncHandler(async (req, res) => {
  const stageId = Number(req.params.stageId);
  const stage = await loadStageForAccess(stageId);
  assertStageAccess(stage, req.user);

  const comments = await prisma.stageComment.findMany({
    where: {
      projectStageId: stageId,
      parentId: null
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          role: true,
          employmentType: true
        }
      },
      replies: {
        include: {
          author: {
            select: {
              id: true,
              name: true,
              role: true,
              employmentType: true
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  return res.json(comments);
});

const postStageComment = asyncHandler(async (req, res) => {
  const stageId = Number(req.params.stageId);
  const { body, type = "NOTE", parentId } = req.body;

  const stage = await loadStageForAccess(stageId);
  assertStageAccess(stage, req.user);

  const normalizedBody = String(body || "").trim();
  if (!normalizedBody) {
    throw new AppError("Comment body is required", 400);
  }
  if (normalizedBody.length > 2000) {
    throw new AppError("Comment too long (max 2000 characters)", 400);
  }

  if (!isManagerRole(req.user.role) && type === "APPROVAL_NOTE") {
    throw new AppError("Only managers can use approval note comments", 403);
  }

  if (parentId) {
    const parentComment = await prisma.stageComment.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        projectStageId: true,
        authorId: true
      }
    });

    if (!parentComment || parentComment.projectStageId !== stageId) {
      throw new AppError("Parent comment not found for this stage", 400);
    }
  }

  const comment = await prisma.stageComment.create({
    data: {
      projectStageId: stageId,
      authorId: req.user.id,
      body: normalizedBody,
      type,
      parentId: parentId || null,
      isSystemGenerated: false
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          role: true,
          employmentType: true
        }
      },
      replies: {
        include: {
          author: {
            select: {
              id: true,
              name: true,
              role: true,
              employmentType: true
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });

  const stageLabel = displayStageName(stage);
  const projectName = stage.project.name;

  const recipientIds = new Set();

  if (isManagerRole(req.user.role)) {
    const artistIds = getAssignedUserIds(stage).filter((userId) => userId !== req.user.id);
    for (const userId of artistIds) recipientIds.add(userId);
  } else {
    const managerIds = await getManagerIds();
    for (const userId of managerIds) {
      if (userId !== req.user.id) recipientIds.add(userId);
    }
  }

  let replyToAuthorId = null;
  if (parentId) {
    const parent = await prisma.stageComment.findUnique({
      where: { id: parentId },
      select: {
        authorId: true
      }
    });
    if (parent?.authorId && parent.authorId !== req.user.id) {
      replyToAuthorId = parent.authorId;
      recipientIds.delete(parent.authorId);
    }
  }

  const managerCommentAction = type === "FEEDBACK" ? "left feedback on" : "commented on";
  const artistCommentAction = type === "QUESTION" ? "asked a question on" : "commented on";
  const message = isManagerRole(req.user.role)
    ? `${req.user.name} ${managerCommentAction} ${stageLabel} - ${projectName}`
    : `${req.user.name} ${artistCommentAction} ${stageLabel} - ${projectName}`;

  await Promise.all(
    Array.from(recipientIds).map((userId) =>
      createNotification({
        userId,
        message,
        type: "COMMENT",
        relatedProjectId: stage.project.id,
        relatedStageId: stageId
      })
    )
  );

  if (replyToAuthorId) {
    await createNotification({
      userId: replyToAuthorId,
      message: `${req.user.name} replied to your comment on ${stageLabel} - ${projectName}`,
      type: "COMMENT",
      relatedProjectId: stage.project.id,
      relatedStageId: stageId
    });
  }

  return res.status(201).json(comment);
});

const editComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const { body } = req.body;

  const comment = await prisma.stageComment.findUnique({
    where: { id: commentId },
    include: {
      projectStage: {
        include: {
          assignments: {
            select: {
              userId: true
            }
          }
        }
      }
    }
  });

  if (!comment) {
    throw new AppError("Comment not found", 404);
  }

  assertStageAccess(comment.projectStage, req.user);

  const isAuthor = comment.authorId === req.user.id;
  const isManager = isManagerRole(req.user.role);
  if (!isAuthor && !isManager) {
    throw new AppError("Not authorized to edit this comment", 403);
  }

  if (comment.isSystemGenerated) {
    throw new AppError("System comments cannot be edited", 403);
  }

  const normalizedBody = String(body || "").trim();
  if (!normalizedBody) {
    throw new AppError("Comment body is required", 400);
  }
  if (normalizedBody.length > 2000) {
    throw new AppError("Comment too long (max 2000 characters)", 400);
  }

  const updated = await prisma.stageComment.update({
    where: { id: commentId },
    data: {
      body: normalizedBody,
      isEdited: true
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          role: true,
          employmentType: true
        }
      }
    }
  });

  return res.json(updated);
});

const deleteComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;

  const comment = await prisma.stageComment.findUnique({
    where: { id: commentId },
    include: {
      projectStage: {
        include: {
          assignments: {
            select: {
              userId: true
            }
          }
        }
      }
    }
  });

  if (!comment) {
    throw new AppError("Comment not found", 404);
  }

  assertStageAccess(comment.projectStage, req.user);

  const isAuthor = comment.authorId === req.user.id;
  const isManager = isManagerRole(req.user.role);
  if (!isAuthor && !isManager) {
    throw new AppError("Not authorized to delete this comment", 403);
  }

  if (comment.isSystemGenerated) {
    throw new AppError("System comments cannot be deleted", 403);
  }

  await prisma.stageComment.delete({
    where: { id: commentId }
  });

  return res.json({ success: true });
});

const getProjectComments = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.projectId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true }
  });

  if (!project) {
    throw new AppError("Project not found", 404);
  }

  const comments = await prisma.stageComment.findMany({
    where: {
      projectStage: {
        projectId
      }
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          role: true,
          employmentType: true
        }
      },
      projectStage: {
        include: {
          stageTemplate: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 100
  });

  return res.json(
    comments.map((comment) => ({
      ...comment,
      stageDisplayName: displayStageName(comment.projectStage)
    }))
  );
});

module.exports = {
  getStageComments,
  postStageComment,
  editComment,
  deleteComment,
  getProjectComments
};
