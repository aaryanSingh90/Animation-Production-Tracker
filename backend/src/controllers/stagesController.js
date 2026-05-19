const prisma = require("../utils/prisma");
const { AppError, asyncHandler } = require("../utils/http");
const { MANAGER_ROLES } = require("../utils/constants");
const { createNotification, notifyManagers } = require("../utils/notifications");
const { recalculateProjectProgress } = require("../utils/progress");
const { processStageDeadline } = require("../utils/deadlines");
const { logActivity } = require("../utils/activities");
const { displayStageName, resolveLegacyStageNameFromTemplateName } = require("../utils/stageTemplates");
const { getDepartmentForStage, isDepartmentMatch, normalizeStageCode } = require("../constants/stageDepartmentMap");

function isManager(role) {
  return MANAGER_ROLES.includes(role);
}

function getStageAssignedUserIds(stage) {
  const ids = new Set();
  if (stage.assignedUserId) ids.add(stage.assignedUserId);
  for (const assignment of stage.assignments || []) {
    ids.add(assignment.userId);
  }
  return Array.from(ids);
}

function isUserAssigned(stage, userId) {
  return getStageAssignedUserIds(stage).includes(userId);
}

function stageLabel(stage) {
  return displayStageName(stage);
}

async function getStageWithProject(stageId) {
  const stage = await prisma.projectStage.findUnique({
    where: { id: Number(stageId) },
    include: {
      project: true,
      stageTemplate: true,
      assignedUser: {
        select: {
          id: true,
          name: true,
          role: true
        }
      },
      assignments: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              departmentId: true,
              departmentName: true,
              department: {
                select: {
                  id: true,
                  name: true,
                  color: true
                }
              },
              employmentType: true
            }
          }
        }
      },
      departmentAssignments: {
        include: {
          department: {
            select: {
              id: true,
              name: true,
              color: true
            }
          }
        }
      }
    }
  });

  if (!stage) {
    throw new AppError("Stage not found", 404);
  }

  return stage;
}

const getProjectStages = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.id);

  const where = {
    projectId,
    isActive: true
  };
  if (!isManager(req.user.role)) {
    where.OR = [
      { assignedUserId: req.user.id },
      {
        assignments: {
          some: {
            userId: req.user.id
          }
        }
      }
    ];
  }

  const stages = await prisma.projectStage.findMany({
    where,
    include: {
      stageTemplate: true,
      _count: {
        select: {
          comments: true
        }
      },
      assignedUser: {
        select: {
          id: true,
          name: true,
          departmentId: true,
          departmentName: true,
          department: {
            select: {
              id: true,
              name: true,
              color: true
            }
          }
        }
      },
      assignments: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              departmentId: true,
              departmentName: true,
              department: {
                select: {
                  id: true,
                  name: true,
                  color: true
                }
              },
              employmentType: true
            }
          }
        }
      },
      departmentAssignments: {
        include: {
          department: {
            select: { id: true, name: true, color: true }
          }
        }
      },
      issueLogs: {
        include: {
          loggedBy: {
            select: { id: true, name: true }
          }
        },
        orderBy: { createdAt: "desc" }
      }
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }]
  });

  return res.json(stages);
});

const updateStage = asyncHandler(async (req, res) => {
  const stageId = Number(req.params.id);
  const stage = await getStageWithProject(stageId);

  if (!isManager(req.user.role)) {
    if (!isUserAssigned(stage, req.user.id)) {
      throw new AppError("Forbidden", 403);
    }

    const allowed = ["status", "notes"];
    for (const key of Object.keys(req.body)) {
      if (!allowed.includes(key)) {
        throw new AppError("Employees can only update status and notes", 403);
      }
    }

    if (req.body.status && req.body.status !== "IN_PROGRESS") {
      throw new AppError("Employees can only move stage to IN_PROGRESS", 403);
    }
  }

  const data = {};

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    data.status = req.body.status;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "deadline")) {
    data.deadline = req.body.deadline ? new Date(req.body.deadline) : null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "assignedUserId")) {
    data.assignedUserId = req.body.assignedUserId ? Number(req.body.assignedUserId) : null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "notes")) {
    data.notes = req.body.notes;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "order")) {
    data.order = Number(req.body.order);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "isActive")) {
    data.isActive = Boolean(req.body.isActive);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "customName")) {
    data.customName = req.body.customName || null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "stageTemplateId")) {
    data.stageTemplateId = req.body.stageTemplateId || null;
    if (data.stageTemplateId) {
      const template = await prisma.stageTemplate.findUnique({
        where: { id: data.stageTemplateId }
      });
      if (!template) {
        throw new AppError("Stage template not found", 404);
      }
      data.stageName = template.legacyStageName || resolveLegacyStageNameFromTemplateName(template.name) || "CUSTOM";
      if (!Object.prototype.hasOwnProperty.call(req.body, "customName")) {
        data.customName = null;
      }
      if (!Object.prototype.hasOwnProperty.call(req.body, "departmentName")) {
        data.departmentName = getDepartmentForStage(data.stageName) || `${template.name} Department`;
      }
    }
  }

  const nextStageName = data.stageName || stage.stageName;
  const nextCustomName = Object.prototype.hasOwnProperty.call(data, "customName") ? data.customName : stage.customName;
  const nextIsActive = Object.prototype.hasOwnProperty.call(data, "isActive") ? data.isActive : stage.isActive;

  if (nextIsActive) {
    if (nextStageName !== "CUSTOM") {
      const duplicate = await prisma.projectStage.findFirst({
        where: {
          id: { not: stageId },
          projectId: stage.projectId,
          isActive: true,
          stageName: nextStageName
        },
        select: { id: true }
      });
      if (duplicate) {
        throw new AppError("Stage already exists in this project pipeline", 400);
      }
    } else if (nextCustomName) {
      const duplicateCustom = await prisma.projectStage.findFirst({
        where: {
          id: { not: stageId },
          projectId: stage.projectId,
          isActive: true,
          stageName: "CUSTOM",
          customName: nextCustomName
        },
        select: { id: true }
      });
      if (duplicateCustom) {
        throw new AppError("Custom stage already exists in this project pipeline", 400);
      }
    }
  }

  if (data.status === "APPROVED") data.approvedAt = new Date();
  if (data.status === "REJECTED") data.rejectedAt = new Date();

  const updated = await prisma.projectStage.update({
    where: { id: stageId },
    data,
    include: {
      project: true,
      assignedUser: {
        select: { id: true, name: true }
      },
      assignments: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              departmentId: true,
              departmentName: true,
              department: {
                select: { id: true, name: true, color: true }
              },
              employmentType: true
            }
          }
        }
      },
      departmentAssignments: {
        include: {
          department: {
            select: { id: true, name: true, color: true }
          }
        }
      },
      stageTemplate: true
    }
  });

  if (Object.prototype.hasOwnProperty.call(data, "assignedUserId") && data.assignedUserId) {
    await prisma.stageAssignment.upsert({
      where: {
        projectStageId_userId: {
          projectStageId: stageId,
          userId: data.assignedUserId
        }
      },
      create: {
        projectStageId: stageId,
        userId: data.assignedUserId
      },
      update: {}
    });
  }

  await processStageDeadline(updated);
  await recalculateProjectProgress(updated.projectId);

  await logActivity({
    projectId: updated.projectId,
    stageId: updated.id,
    actorId: req.user.id,
    eventType: "STAGE_UPDATED",
    message: `${req.user.name} updated ${stageLabel(updated)} on ${updated.project.name}.`
  });

  if (Object.prototype.hasOwnProperty.call(data, "assignedUserId") && data.assignedUserId) {
    await createNotification({
      userId: data.assignedUserId,
      message: `You were assigned ${stageLabel(updated)} in ${updated.project.name}.`,
      type: "ASSIGNED",
      relatedProjectId: updated.projectId,
      relatedStageId: updated.id
    });
  }

  return res.json(updated);
});

const deactivateProjectStage = asyncHandler(async (req, res) => {
  const stageId = Number(req.params.id);
  const stage = await getStageWithProject(stageId);

  const updated = await prisma.projectStage.update({
    where: { id: stageId },
    data: {
      isActive: false
    },
    include: {
      project: true,
      stageTemplate: true
    }
  });

  await recalculateProjectProgress(updated.projectId);

  await logActivity({
    projectId: updated.projectId,
    stageId: updated.id,
    actorId: req.user.id,
    eventType: "STAGE_DEACTIVATED",
    message: `${req.user.name} deactivated ${stageLabel(stage)} on ${updated.project.name}.`
  });

  return res.json({ success: true, stage: updated });
});

const submitStage = asyncHandler(async (req, res) => {
  const stage = await getStageWithProject(req.params.id);

  if (!isUserAssigned(stage, req.user.id)) {
    throw new AppError("Only assigned employee can submit this stage", 403);
  }

  const updated = await prisma.projectStage.update({
    where: { id: stage.id },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date()
    },
    include: {
      project: true,
      assignedUser: {
        select: { id: true, name: true }
      },
      assignments: true
    }
  });

  const assignedUserIds = getStageAssignedUserIds(updated);
  for (const userId of assignedUserIds) {
    if (userId === req.user.id) continue;
    await createNotification({
      userId,
      message: `${req.user.name} submitted ${stageLabel(updated)} for ${updated.project.name}.`,
      type: "APPROVAL_NEEDED",
      relatedProjectId: updated.projectId,
      relatedStageId: updated.id
    });
  }

  await notifyManagers({
    message: `${req.user.name} submitted ${stageLabel(updated)} for ${updated.project.name}.`,
    type: "APPROVAL_NEEDED",
    relatedProjectId: updated.projectId,
    relatedStageId: updated.id
  });

  await recalculateProjectProgress(updated.projectId);
  await processStageDeadline(updated);

  await logActivity({
    projectId: updated.projectId,
    stageId: updated.id,
    actorId: req.user.id,
    eventType: "STAGE_SUBMITTED",
    message: `${req.user.name} submitted ${stageLabel(updated)}.`
  });

  return res.json(updated);
});

const approveStage = asyncHandler(async (req, res) => {
  const stage = await getStageWithProject(req.params.id);

  const updated = await prisma.projectStage.update({
    where: { id: stage.id },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      rejectedAt: null,
      feedback: null,
      isDeadlineMissed: false
    },
    include: {
      project: true,
      assignedUser: {
        select: { id: true, name: true }
      },
      assignments: true
    }
  });

  await prisma.stageComment.create({
    data: {
      projectStageId: updated.id,
      authorId: req.user.id,
      body: `Stage approved by ${req.user.name} on ${new Date().toLocaleDateString("en-GB")}.`,
      type: "APPROVAL_NOTE",
      isSystemGenerated: true
    }
  });

  const assignedUserIds = getStageAssignedUserIds(updated);
  await Promise.all(
    assignedUserIds.map((userId) =>
      createNotification({
        userId,
        message: `${stageLabel(updated)} approved for ${updated.project.name}.`,
        type: "APPROVED",
        relatedProjectId: updated.projectId,
        relatedStageId: updated.id
      })
    )
  );

  await recalculateProjectProgress(updated.projectId);

  await logActivity({
    projectId: updated.projectId,
    stageId: updated.id,
    actorId: req.user.id,
    eventType: "STAGE_APPROVED",
    message: `${req.user.name} approved ${stageLabel(updated)}.`
  });

  return res.json(updated);
});

const rejectStage = asyncHandler(async (req, res) => {
  const { feedback } = req.body;
  if (!feedback) {
    throw new AppError("feedback is required", 400);
  }

  const stage = await getStageWithProject(req.params.id);

  const updated = await prisma.projectStage.update({
    where: { id: stage.id },
    data: {
      status: "REJECTED",
      rejectedAt: new Date(),
      feedback,
      approvedAt: null
    },
    include: {
      project: true,
      assignedUser: {
        select: { id: true, name: true }
      },
      assignments: true
    }
  });

  await prisma.stageComment.create({
    data: {
      projectStageId: updated.id,
      authorId: req.user.id,
      body: feedback || "Stage rejected. Please revise and resubmit.",
      type: "FEEDBACK",
      isSystemGenerated: false
    }
  });

  const assignedUserIds = getStageAssignedUserIds(updated);
  await Promise.all(
    assignedUserIds.map((userId) =>
      createNotification({
        userId,
        message: `${stageLabel(updated)} rejected for ${updated.project.name}. Feedback: ${feedback}`,
        type: "REJECTED",
        relatedProjectId: updated.projectId,
        relatedStageId: updated.id
      })
    )
  );

  await recalculateProjectProgress(updated.projectId);
  await processStageDeadline(updated);

  await logActivity({
    projectId: updated.projectId,
    stageId: updated.id,
    actorId: req.user.id,
    eventType: "STAGE_REJECTED",
    message: `${req.user.name} rejected ${stageLabel(updated)}.`
  });

  return res.json(updated);
});

const assignArtistToStage = asyncHandler(async (req, res) => {
  const stageId = Number(req.params.id);
  const userId = Number(req.body.userId);

  const [stage, user] = await Promise.all([
    prisma.projectStage.findUnique({
      where: { id: stageId },
      include: {
        project: true,
        stageDefinition: {
          select: {
            code: true
          }
        }
      }
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        departmentId: true,
        departmentName: true,
        department: {
          select: { id: true, name: true, color: true }
        },
        employmentType: true,
        isActive: true
      }
    })
  ]);

  if (!stage) throw new AppError("Stage not found", 404);
  if (!user || !user.isActive) throw new AppError("User not found", 404);

  const stageCode = normalizeStageCode(stage.stageDefinition?.code || stage.stageName);
  const requiredDepartment = getDepartmentForStage(stageCode);
  const userDepartmentName = user.department?.name || user.departmentName || "";
  if (requiredDepartment && !isDepartmentMatch(requiredDepartment, userDepartmentName)) {
    throw new AppError(`Only ${requiredDepartment} artists can be assigned to this stage`, 400);
  }

  const existing = await prisma.stageAssignment.findUnique({
    where: {
      projectStageId_userId: {
        projectStageId: stageId,
        userId
      }
    }
  });

  if (existing) {
    throw new AppError("Artist already assigned to this stage", 400);
  }

  const assignment = await prisma.stageAssignment.create({
    data: {
      projectStageId: stageId,
      userId
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          departmentId: true,
          departmentName: true,
          department: {
            select: { id: true, name: true, color: true }
          },
          employmentType: true
        }
      }
    }
  });

  if (!stage.assignedUserId) {
    await prisma.projectStage.update({
      where: { id: stageId },
      data: { assignedUserId: userId }
    });
  }

  await createNotification({
    userId,
    message: `You were assigned ${stageLabel(stage)} in ${stage.project.name}.`,
    type: "ASSIGNED",
    relatedProjectId: stage.projectId,
    relatedStageId: stage.id
  });

  await logActivity({
    projectId: stage.projectId,
    stageId: stage.id,
    actorId: req.user.id,
    eventType: "ASSIGNED",
    message: `${req.user.name} assigned ${user.name} to ${stageLabel(stage)}.`
  });

  return res.json(assignment);
});

const removeArtistFromStage = asyncHandler(async (req, res) => {
  const stageId = Number(req.params.id);
  const userId = Number(req.params.userId);

  const stage = await prisma.projectStage.findUnique({
    where: { id: stageId },
    include: {
      project: true,
      assignments: true
    }
  });
  if (!stage) throw new AppError("Stage not found", 404);

  await prisma.stageAssignment.delete({
    where: {
      projectStageId_userId: {
        projectStageId: stageId,
        userId
      }
    }
  });

  if (stage.assignedUserId === userId) {
    const remaining = stage.assignments.filter((assignment) => assignment.userId !== userId);
    await prisma.projectStage.update({
      where: { id: stageId },
      data: {
        assignedUserId: remaining[0]?.userId || null
      }
    });
  }

  await logActivity({
    projectId: stage.projectId,
    stageId: stage.id,
    actorId: req.user.id,
    eventType: "ASSIGNED",
    message: `${req.user.name} removed an artist from ${stageLabel(stage)}.`
  });

  return res.json({ success: true });
});

const assignDepartmentToStage = asyncHandler(async (req, res) => {
  const stageId = Number(req.params.id);
  const { departmentId } = req.body;

  const [stage, department] = await Promise.all([
    prisma.projectStage.findUnique({
      where: { id: stageId },
      include: {
        project: true
      }
    }),
    prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        employees: {
          where: { isActive: true },
          select: { id: true, name: true }
        }
      }
    })
  ]);

  if (!stage) {
    throw new AppError("Stage not found", 404);
  }
  if (!department) {
    throw new AppError("Department not found", 404);
  }

  const results = await Promise.allSettled(
    department.employees.map((employee) =>
      prisma.stageAssignment.upsert({
        where: {
          projectStageId_userId: {
            projectStageId: stageId,
            userId: employee.id
          }
        },
        create: {
          projectStageId: stageId,
          userId: employee.id
        },
        update: {}
      })
    )
  );

  await prisma.stageDepartmentAssignment.upsert({
    where: {
      projectStageId_departmentId: {
        projectStageId: stageId,
        departmentId
      }
    },
    create: {
      projectStageId: stageId,
      departmentId
    },
    update: {}
  });

  const firstAssigned = department.employees[0]?.id || null;
  if (!stage.assignedUserId && firstAssigned) {
    await prisma.projectStage.update({
      where: { id: stageId },
      data: {
        assignedUserId: firstAssigned
      }
    });
  }

  await logActivity({
    projectId: stage.projectId,
    stageId: stage.id,
    actorId: req.user.id,
    eventType: "DEPARTMENT_ASSIGNED",
    message: `${req.user.name} assigned ${department.name} to ${stageLabel(stage)}.`
  });

  const updatedStage = await prisma.projectStage.findUnique({
    where: { id: stageId },
    include: {
      project: {
        select: { id: true, name: true }
      },
      assignments: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              employmentType: true,
              departmentId: true,
              departmentName: true,
              department: {
                select: { id: true, name: true, color: true }
              }
            }
          }
        }
      },
      departmentAssignments: {
        include: {
          department: {
            select: { id: true, name: true, color: true }
          }
        }
      }
    }
  });

  return res.json({
    assigned: results.filter((item) => item.status === "fulfilled").length,
    department: department.name,
    stage: updatedStage
  });
});

const removeDepartmentFromStage = asyncHandler(async (req, res) => {
  const stageId = Number(req.params.id);
  const { departmentId } = req.params;

  const [stage, department] = await Promise.all([
    prisma.projectStage.findUnique({
      where: { id: stageId },
      include: {
        project: true,
        assignments: true
      }
    }),
    prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        employees: {
          where: { isActive: true },
          select: { id: true }
        }
      }
    })
  ]);

  if (!stage) {
    throw new AppError("Stage not found", 404);
  }
  if (!department) {
    throw new AppError("Department not found", 404);
  }

  const memberIds = department.employees.map((employee) => employee.id);
  if (memberIds.length) {
    await prisma.stageAssignment.deleteMany({
      where: {
        projectStageId: stageId,
        userId: {
          in: memberIds
        }
      }
    });
  }

  await prisma.stageDepartmentAssignment.deleteMany({
    where: {
      projectStageId: stageId,
      departmentId
    }
  });

  if (stage.assignedUserId && memberIds.includes(stage.assignedUserId)) {
    const remaining = stage.assignments.filter((assignment) => !memberIds.includes(assignment.userId));
    await prisma.projectStage.update({
      where: { id: stageId },
      data: {
        assignedUserId: remaining[0]?.userId || null
      }
    });
  }

  await logActivity({
    projectId: stage.projectId,
    stageId: stage.id,
    actorId: req.user.id,
    eventType: "DEPARTMENT_REMOVED",
    message: `${req.user.name} removed ${department.name} from ${stageLabel(stage)}.`
  });

  return res.json({ success: true });
});

const logIssue = asyncHandler(async (req, res) => {
  const stage = await getStageWithProject(req.params.id);
  const {
    issueType,
    description,
    extendDeadline = false,
    newDeadline,
    extensionReason
  } = req.body;

  if (!issueType || !description) {
    throw new AppError("issueType and description are required", 400);
  }

  if (extendDeadline) {
    if (!newDeadline || !extensionReason) {
      throw new AppError("newDeadline and extensionReason are required when extending deadline", 400);
    }

    if (stage.deadline && new Date(newDeadline) <= new Date(stage.deadline)) {
      throw new AppError("newDeadline must be after original deadline", 400);
    }
  }

  const issue = await prisma.issueLog.create({
    data: {
      projectStageId: stage.id,
      issueType,
      description,
      originalDeadline: stage.deadline,
      newDeadline: extendDeadline ? new Date(newDeadline) : null,
      extensionReason: extendDeadline ? extensionReason : null,
      loggedById: req.user.id
    }
  });

  const stageUpdate = {
    status: extendDeadline ? "EXTENDED" : "ISSUE"
  };

  if (extendDeadline) {
    stageUpdate.deadline = new Date(newDeadline);
  }

  const updatedStage = await prisma.projectStage.update({
    where: { id: stage.id },
    data: stageUpdate,
    include: {
      project: true
    }
  });

  await notifyManagers({
    message: `Issue logged in ${updatedStage.project.name} · ${stageLabel(updatedStage)}.`,
    type: "ISSUE_LOGGED",
    relatedProjectId: updatedStage.projectId,
    relatedStageId: updatedStage.id
  });

  await recalculateProjectProgress(updatedStage.projectId);
  await processStageDeadline(updatedStage);

  await logActivity({
    projectId: updatedStage.projectId,
    stageId: updatedStage.id,
    actorId: req.user.id,
    eventType: "ISSUE_LOGGED",
    message: `${req.user.name} logged issue on ${stageLabel(updatedStage)}.`
  });

  return res.status(201).json({ issue, stage: updatedStage });
});

const extendDeadline = asyncHandler(async (req, res) => {
  const stage = await getStageWithProject(req.params.id);
  const { newDeadline, reason } = req.body;

  if (!newDeadline || !reason) {
    throw new AppError("newDeadline and reason are required", 400);
  }

  if (stage.deadline && new Date(newDeadline) <= new Date(stage.deadline)) {
    throw new AppError("newDeadline must be after original deadline", 400);
  }

  await prisma.issueLog.create({
    data: {
      projectStageId: stage.id,
      issueType: "OTHER",
      description: "Deadline extended by manager",
      originalDeadline: stage.deadline,
      newDeadline: new Date(newDeadline),
      extensionReason: reason,
      loggedById: req.user.id
    }
  });

  const updated = await prisma.projectStage.update({
    where: { id: stage.id },
    data: {
      deadline: new Date(newDeadline),
      status: "EXTENDED",
      isDeadlineMissed: false
    },
    include: {
      project: true,
      assignedUser: {
        select: { id: true, name: true }
      },
      assignments: true
    }
  });

  const assignedUserIds = getStageAssignedUserIds(updated);
  await Promise.all(
    assignedUserIds.map((userId) =>
      createNotification({
        userId,
        message: `Deadline extended for ${stageLabel(updated)} in ${updated.project.name}.`,
        type: "ASSIGNED",
        relatedProjectId: updated.projectId,
        relatedStageId: updated.id
      })
    )
  );

  await recalculateProjectProgress(updated.projectId);
  await processStageDeadline(updated);

  await logActivity({
    projectId: updated.projectId,
    stageId: updated.id,
    actorId: req.user.id,
    eventType: "DEADLINE_EXTENDED",
    message: `${req.user.name} extended deadline for ${stageLabel(updated)}.`
  });

  return res.json(updated);
});

module.exports = {
  getProjectStages,
  updateStage,
  deactivateProjectStage,
  submitStage,
  approveStage,
  rejectStage,
  assignArtistToStage,
  removeArtistFromStage,
  assignDepartmentToStage,
  removeDepartmentFromStage,
  logIssue,
  extendDeadline
};
