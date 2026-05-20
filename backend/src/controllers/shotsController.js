const prisma = require("../utils/prisma");
const { AppError, asyncHandler } = require("../utils/http");
const { MANAGER_ROLES } = require("../utils/constants");
const { getTrackingDefinitionSnapshot, computeStatusFromChildren } = require("../utils/trackingSetup");
const { recalculateProjectProgress } = require("../utils/progress");
const { normalizeStageCode } = require("../utils/stageDefinitions");
const { createNotification, notifyManagers } = require("../utils/notifications");
const {
  TASK_ASSIGNMENT_INCLUDE,
  syncTaskAssignments,
  notifyTaskAssignmentUsers,
  getAssignedEmployeeIds
} = require("../utils/taskAssignments");
const {
  ARTIST_MUTABLE_STATUSES,
  isApprovedStatus,
  isCompleteStatus,
  isPendingReviewStatus,
  isRetakeStatus,
  normalizePipelineStatus
} = require("../utils/pipelineStatus");

function isManager(role) {
  return MANAGER_ROLES.includes(role);
}

function shotLabel(shot) {
  if (shot?.name) return shot.name;
  if (Number.isInteger(shot?.shotNumber)) return `Shot ${String(shot.shotNumber).padStart(3, "0")}`;
  return "Shot";
}

function shotLabelByNumber(shotNumber) {
  return `Shot_${String(shotNumber).padStart(2, "0")}`;
}

function resolveShotSeconds(frameStart, frameEnd) {
  if (!Number.isFinite(frameStart) || !Number.isFinite(frameEnd) || frameEnd < frameStart) return null;
  return Number(((frameEnd - frameStart + 1) / 24).toFixed(2));
}

function resolveDurationMinutesFromRange(startValue, endValue) {
  if (!startValue || !endValue) return null;
  const startedAt = new Date(startValue).getTime();
  const endedAt = new Date(endValue).getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) return null;
  return Math.max(1, Math.round((endedAt - startedAt) / 60000));
}

function normalizeNullableString(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

async function refreshShotStatus(shotId) {
  const stages = await prisma.shotStage.findMany({
    where: { shotId },
    select: { status: true }
  });

  const status = computeStatusFromChildren(stages.map((stage) => stage.status));

  return prisma.shot.update({
    where: { id: shotId },
    data: { status }
  });
}

const listProjectShots = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.id);
  const page = Number(req.query.page || 1);
  const pageSize = Math.min(200, Number(req.query.pageSize || 25));
  const status = req.query.status;
  const search = req.query.search;
  const artistId = req.query.artistId ? Number(req.query.artistId) : null;

  const where = {
    projectId
  };

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { name: { contains: String(search), mode: "insensitive" } },
      { shotNumber: Number.isNaN(Number(search)) ? undefined : Number(search) }
    ].filter(Boolean);
  }

  if (artistId) {
    where.stages = {
      some: {
        OR: [{ assignedUserId: artistId }, { taskAssignments: { some: { employeeId: artistId } } }]
      }
    };
  }

  const [total, items] = await Promise.all([
    prisma.shot.count({ where }),
    prisma.shot.findMany({
      where,
      include: {
        stages: {
          include: {
            stageDefinition: true,
            assignedUser: {
              select: {
                id: true,
                name: true,
                role: true,
                departmentId: true,
                departmentName: true,
                department: {
                  select: { id: true, name: true, color: true }
                }
              }
            },
            ...TASK_ASSIGNMENT_INCLUDE
          },
          orderBy: {
            createdAt: "asc"
          }
        }
      },
      orderBy: [{ order: "asc" }, { shotNumber: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);

  return res.json({
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    },
    items
  });
});

const createProjectShot = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.id);

  const project = await prisma.project.findUnique({
    where: { id: projectId }
  });
  if (!project) throw new AppError("Project not found", 404);

  const existingMax = await prisma.shot.aggregate({
    where: { projectId },
    _max: {
      shotNumber: true,
      order: true
    }
  });

  const shotNumber = req.body.shotNumber || (existingMax._max.shotNumber || 0) + 1;
  const order = req.body.order || (existingMax._max.order || 0) + 1;
  const frameStart = Number.isInteger(req.body.frameStart) ? Number(req.body.frameStart) : 101;
  const frameEnd = Number(req.body.frameEnd);

  if (!Number.isFinite(frameEnd) || frameEnd < frameStart) {
    throw new AppError("frameEnd must be greater than or equal to frameStart", 400);
  }

  const seconds = resolveShotSeconds(frameStart, frameEnd);
  const label = req.body.label || shotLabelByNumber(shotNumber);

  const shot = await prisma.shot.create({
    data: {
      projectId,
      shotNumber,
      order,
      label,
      frameStart,
      frameEnd,
      seconds,
      name: req.body.name || label,
      description: req.body.description || null,
      duration: req.body.duration ? Number(req.body.duration) : seconds,
      priority: Number(req.body.priority || 3),
      status: normalizePipelineStatus(req.body.status, "YTS")
    }
  });

  const snapshot = await getTrackingDefinitionSnapshot({ prisma, project });
  const stageRows = Array.from(snapshot.shotCodes)
    .map((code) => snapshot.stageDefinitionsByCode.get(code))
    .filter(Boolean)
    .map((definition) => ({
      shotId: shot.id,
      stageDefinitionId: definition.id,
      status: "YTS"
    }));

  if (stageRows.length) {
    await prisma.shotStage.createMany({ data: stageRows });
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      totalShots: {
        increment: 1
      }
    }
  });

  const hydrated = await prisma.shot.findUnique({
    where: { id: shot.id },
    include: {
      stages: {
        include: {
          stageDefinition: true,
          assignedUser: {
            select: {
              id: true,
              name: true
            }
          },
          ...TASK_ASSIGNMENT_INCLUDE
        },
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });

  await recalculateProjectProgress(projectId);

  return res.status(201).json(hydrated);
});

const bulkCreateProjectShots = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.id);
  const { shots } = req.body;

  const project = await prisma.project.findUnique({
    where: { id: projectId }
  });
  if (!project) throw new AppError("Project not found", 404);

  if (!Array.isArray(shots) || shots.length === 0) {
    throw new AppError("shots array is required", 400);
  }

  const existingMax = await prisma.shot.aggregate({
    where: { projectId },
    _max: {
      shotNumber: true,
      order: true
    }
  });

  const startShotNumber = (existingMax._max.shotNumber || 0) + 1;
  const startOrder = (existingMax._max.order || 0) + 1;

  const snapshot = await getTrackingDefinitionSnapshot({ prisma, project });
  const stageDefinitionIds = Array.from(snapshot.shotCodes)
    .map((code) => snapshot.stageDefinitionsByCode.get(code)?.id)
    .filter(Boolean);

  const created = await prisma.$transaction(
    shots.map((shotInput, index) => {
      const shotNumber = startShotNumber + index;
      const order = startOrder + index;
      const frameStart = Number.isInteger(shotInput?.frameStart) ? Number(shotInput.frameStart) : 101;
      const frameEnd = Number(shotInput?.frameEnd);

      if (!Number.isFinite(frameEnd) || frameEnd < frameStart) {
        throw new AppError(`Invalid frame range for shot ${shotNumber}`, 400);
      }

      const seconds = resolveShotSeconds(frameStart, frameEnd);
      const label = shotLabelByNumber(shotNumber);

      return prisma.shot.create({
        data: {
          projectId,
          shotNumber,
          order,
          label,
          frameStart,
          frameEnd,
          seconds,
          name: label,
          duration: seconds,
          priority: Number(shotInput?.priority || 3),
          status: "YTS",
          stages: {
            create: stageDefinitionIds.map((stageDefinitionId) => ({
              stageDefinitionId,
              status: "YTS"
            }))
          }
        },
        include: {
          stages: {
            include: {
              stageDefinition: true
            },
            orderBy: {
              createdAt: "asc"
            }
          }
        }
      });
    })
  );

  await prisma.project.update({
    where: { id: projectId },
    data: {
      totalShots: {
        increment: created.length
      }
    }
  });

  await recalculateProjectProgress(projectId);

  return res.status(201).json(created);
});

const updateShot = asyncHandler(async (req, res) => {
  const shotId = req.params.id;

  const existing = await prisma.shot.findUnique({ where: { id: shotId } });
  if (!existing) throw new AppError("Shot not found", 404);

  const payload = {};
  const fields = [
    "shotNumber",
    "label",
    "name",
    "description",
    "duration",
    "order",
    "priority",
    "status",
    "frameStart",
    "frameEnd",
    "seconds",
    "audioStatus",
    "audioWorkflowStatus",
    "finalOutput",
    "finalOutputName",
    "finalOutputVersion",
    "finalOutputApprovalStatus",
    "finalOutputDeliveryDate",
    "finalOutputClientReview",
    "finalOutputNotes"
  ];
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      payload[field] = req.body[field];
    }
  }

  const nextFrameStart = Object.prototype.hasOwnProperty.call(payload, "frameStart")
    ? Number(payload.frameStart)
    : existing.frameStart ?? 101;
  const nextFrameEnd = Object.prototype.hasOwnProperty.call(payload, "frameEnd")
    ? Number(payload.frameEnd)
    : existing.frameEnd;

  if (Object.prototype.hasOwnProperty.call(payload, "frameStart") || Object.prototype.hasOwnProperty.call(payload, "frameEnd")) {
    if (!Number.isFinite(nextFrameEnd) || nextFrameEnd < nextFrameStart) {
      throw new AppError("Invalid frame range", 400);
    }
    payload.seconds = resolveShotSeconds(nextFrameStart, nextFrameEnd);
    if (!Object.prototype.hasOwnProperty.call(payload, "duration")) {
      payload.duration = payload.seconds;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "duration")) {
    payload.duration = payload.duration ? Number(payload.duration) : null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "seconds")) {
    payload.seconds = payload.seconds ? Number(payload.seconds) : null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "name") && !payload.name) {
    const numberForName = payload.shotNumber || existing.shotNumber;
    payload.name = payload.label || existing.label || shotLabelByNumber(numberForName);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "label") && !payload.label) {
    payload.label = shotLabelByNumber(payload.shotNumber || existing.shotNumber);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "audioStatus")) {
    payload.audioStatus = payload.audioStatus || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "audioWorkflowStatus")) {
    payload.audioWorkflowStatus = normalizeNullableString(payload.audioWorkflowStatus);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "finalOutput")) {
    payload.finalOutput = normalizeNullableString(payload.finalOutput);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "finalOutputName")) {
    payload.finalOutputName = normalizeNullableString(payload.finalOutputName);
    if (!Object.prototype.hasOwnProperty.call(payload, "finalOutput")) {
      payload.finalOutput = payload.finalOutputName;
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, "finalOutputVersion")) {
    payload.finalOutputVersion = normalizeNullableString(payload.finalOutputVersion);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "finalOutputApprovalStatus")) {
    payload.finalOutputApprovalStatus = payload.finalOutputApprovalStatus || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "finalOutputDeliveryDate")) {
    payload.finalOutputDeliveryDate = payload.finalOutputDeliveryDate ? new Date(payload.finalOutputDeliveryDate) : null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "finalOutputClientReview")) {
    payload.finalOutputClientReview = normalizeNullableString(payload.finalOutputClientReview);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "finalOutputNotes")) {
    payload.finalOutputNotes = normalizeNullableString(payload.finalOutputNotes);
  }

  const updated = await prisma.shot.update({
    where: { id: shotId },
    data: payload,
    include: {
      stages: {
        include: {
          stageDefinition: true,
          assignedUser: {
            select: {
              id: true,
              name: true
            }
          },
          ...TASK_ASSIGNMENT_INCLUDE
        },
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });

  return res.json(updated);
});

const deleteShot = asyncHandler(async (req, res) => {
  const shotId = req.params.id;

  const shot = await prisma.shot.findUnique({ where: { id: shotId } });
  if (!shot) throw new AppError("Shot not found", 404);

  await prisma.shot.delete({ where: { id: shotId } });

  await prisma.project.update({
    where: { id: shot.projectId },
    data: {
      totalShots: {
        decrement: 1
      }
    }
  });

  await recalculateProjectProgress(shot.projectId);

  return res.json({ success: true });
});

const updateShotStage = asyncHandler(async (req, res) => {
  const shotStageId = req.params.id;

  const shotStage = await prisma.shotStage.findUnique({
    where: { id: shotStageId },
    include: {
      ...TASK_ASSIGNMENT_INCLUDE,
      shot: {
        include: {
          project: true
        }
      },
      stageDefinition: true
    }
  });

  if (!shotStage) throw new AppError("Shot stage not found", 404);

  const manager = isManager(req.user.role);
  const previousStatus = shotStage.status;
  const previousAssignedUserId = shotStage.assignedUserId;
  const previousDeadline = shotStage.deadline ? new Date(shotStage.deadline).toISOString() : null;
  const previousAssignedEmployeeIds = getAssignedEmployeeIds(shotStage, shotStage.assignedUserId);
  if (!manager && !previousAssignedEmployeeIds.includes(req.user.id)) {
    throw new AppError("Forbidden", 403);
  }

  const payload = {};

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    payload.status = normalizePipelineStatus(req.body.status);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "deadline")) {
    payload.deadline = req.body.deadline ? new Date(req.body.deadline) : null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "notes")) {
    payload.notes = req.body.notes;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "feedback")) {
    payload.feedback = req.body.feedback;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "startDate")) {
    payload.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "endDate")) {
    payload.endDate = req.body.endDate ? new Date(req.body.endDate) : null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "startedAt")) {
    payload.startedAt = req.body.startedAt ? new Date(req.body.startedAt) : null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "endedAt")) {
    payload.endedAt = req.body.endedAt ? new Date(req.body.endedAt) : null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "durationMinutes")) {
    payload.durationMinutes = req.body.durationMinutes ? Number(req.body.durationMinutes) : null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "isTimerRunning")) {
    payload.isTimerRunning = Boolean(req.body.isTimerRunning);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "assignedUserId") && manager) {
    payload.assignedUserId = req.body.assignedUserId ? Number(req.body.assignedUserId) : null;
  }

  if (!manager && Object.keys(payload).some((key) => !["status", "notes", "feedback"].includes(key))) {
    throw new AppError("Employees can only update status or notes", 403);
  }

  if (!manager && payload.status && !ARTIST_MUTABLE_STATUSES.has(payload.status)) {
    throw new AppError("Employees can only move shot stages to IP, TEST, or DONE", 403);
  }

  if (payload.status === "IP" && !shotStage.actualStartedAt) {
    payload.actualStartedAt = new Date();
  }
  if (payload.status === "IP" && !shotStage.startedAt) {
    payload.startedAt = payload.startedAt || new Date();
  }
  if (payload.status === "IP" && !Object.prototype.hasOwnProperty.call(payload, "isTimerRunning")) {
    payload.isTimerRunning = true;
  }
  if (payload.startedAt && !payload.endedAt && !Object.prototype.hasOwnProperty.call(payload, "isTimerRunning")) {
    payload.isTimerRunning = true;
  }

  if (isPendingReviewStatus(payload.status)) {
    payload.submittedAt = new Date();
  }

  if (manager && isApprovedStatus(payload.status)) {
    payload.approvedAt = new Date();
    payload.feedback = null;
  }

  if (manager && isRetakeStatus(payload.status || "")) {
    payload.approvedAt = null;
  }

  if (isCompleteStatus(payload.status) && shotStage.actualStartedAt && !shotStage.actualDoneAt) {
    const doneAt = new Date();
    payload.actualDoneAt = doneAt;
    payload.timeConsumedMin = Math.max(1, Math.round((doneAt.getTime() - new Date(shotStage.actualStartedAt).getTime()) / 60000));
  }
  if (isCompleteStatus(payload.status) && !payload.endedAt) {
    payload.endedAt = new Date();
  }

  const resolvedStartedAt = Object.prototype.hasOwnProperty.call(payload, "startedAt")
    ? payload.startedAt
    : shotStage.startedAt || shotStage.actualStartedAt || shotStage.startDate || null;
  const resolvedEndedAt = Object.prototype.hasOwnProperty.call(payload, "endedAt")
    ? payload.endedAt
    : shotStage.endedAt || shotStage.actualDoneAt || shotStage.endDate || null;
  const derivedDurationMinutes = resolveDurationMinutesFromRange(resolvedStartedAt, resolvedEndedAt);

  if (!Object.prototype.hasOwnProperty.call(payload, "durationMinutes") && derivedDurationMinutes) {
    payload.durationMinutes = derivedDurationMinutes;
  }
  if (payload.durationMinutes && !payload.timeConsumedMin) {
    payload.timeConsumedMin = payload.durationMinutes;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "endedAt") && payload.endedAt && !Object.prototype.hasOwnProperty.call(payload, "isTimerRunning")) {
    payload.isTimerRunning = false;
  }

  const updated = await prisma.shotStage.update({
    where: { id: shotStageId },
    data: payload,
    include: {
      stageDefinition: true,
      assignedUser: {
        select: {
          id: true,
          name: true,
          departmentId: true,
          departmentName: true,
          department: {
            select: { id: true, name: true, color: true }
          }
        }
      },
      ...TASK_ASSIGNMENT_INCLUDE
    }
  });

  let hydrated = updated;
  let addedEmployeeIds = [];

  if (manager && (Object.prototype.hasOwnProperty.call(req.body, "assignments") || Object.prototype.hasOwnProperty.call(payload, "assignedUserId"))) {
    const syncResult = await syncTaskAssignments({
      resourceType: "shotStage",
      recordId: shotStageId,
      projectId: shotStage.shot.projectId,
      assignments: Object.prototype.hasOwnProperty.call(req.body, "assignments")
        ? req.body.assignments
        : payload.assignedUserId
          ? [{ employeeId: Number(payload.assignedUserId), roleType: "LEAD" }]
          : [],
      fallbackAssignedUserId: Object.prototype.hasOwnProperty.call(payload, "assignedUserId") ? payload.assignedUserId : shotStage.assignedUserId,
      assignedById: req.user.id,
      parentModel: "shotStage",
      include: {
        stageDefinition: true,
        assignedUser: {
          select: {
            id: true,
            name: true,
            departmentId: true,
            departmentName: true,
            department: {
              select: { id: true, name: true, color: true }
            }
          }
        },
        ...TASK_ASSIGNMENT_INCLUDE
      }
    });

    hydrated = syncResult.hydrated || updated;
    addedEmployeeIds = syncResult.addedEmployeeIds || [];
  }

  await refreshShotStatus(hydrated.shotId);
  await recalculateProjectProgress(shotStage.shot.projectId);

  const stageName = hydrated.stageDefinition?.name || hydrated.stageDefinition?.code || "Shot Stage";
  const shotName = shotLabel(shotStage.shot);
  const projectName = shotStage.shot.project?.name || "Project";
  const currentAssignedEmployeeIds = getAssignedEmployeeIds(hydrated, hydrated.assignedUserId);

  if (addedEmployeeIds.length) {
    await notifyTaskAssignmentUsers({
      employeeIds: addedEmployeeIds,
      message: `${req.user.name} assigned you to ${stageName} for ${shotName} in ${projectName}.`,
      relatedProjectId: shotStage.shot.projectId
    });
  } else if (Object.prototype.hasOwnProperty.call(payload, "assignedUserId") && payload.assignedUserId && payload.assignedUserId !== previousAssignedUserId) {
    await createNotification({
      userId: payload.assignedUserId,
      message: `You were assigned ${stageName} for ${shotName} in ${projectName}.`,
      type: "ASSIGNED",
      relatedProjectId: shotStage.shot.projectId
    });
  }

  if (Object.prototype.hasOwnProperty.call(payload, "deadline")) {
    const nextDeadline = payload.deadline ? new Date(payload.deadline).toISOString() : null;
    if (currentAssignedEmployeeIds.length && previousDeadline !== nextDeadline && nextDeadline) {
      await Promise.all(
        currentAssignedEmployeeIds.map((employeeId) =>
          createNotification({
            userId: employeeId,
            message: `Deadline updated for ${stageName} on ${shotName} in ${projectName}.`,
            type: "DEADLINE_WARNING",
            relatedProjectId: shotStage.shot.projectId
          })
        )
      );
    }
  }

  if (isPendingReviewStatus(hydrated.status) && !isPendingReviewStatus(previousStatus)) {
    await notifyManagers({
      message: `${req.user.name} sent ${stageName} for review on ${shotName} in ${projectName}.`,
      type: "APPROVAL_NEEDED",
      relatedProjectId: shotStage.shot.projectId
    });
  }

  if (manager && currentAssignedEmployeeIds.length && isApprovedStatus(hydrated.status) && !isApprovedStatus(previousStatus)) {
    await Promise.all(
      currentAssignedEmployeeIds.map((employeeId) =>
        createNotification({
          userId: employeeId,
          message: `${stageName} ${hydrated.status === "FINAL" ? "final approved" : "lead approved"} for ${shotName} in ${projectName}.`,
          type: "APPROVED",
          relatedProjectId: shotStage.shot.projectId
        })
      )
    );
  }

  if (manager && currentAssignedEmployeeIds.length && isRetakeStatus(hydrated.status) && previousStatus !== hydrated.status) {
    await Promise.all(
      currentAssignedEmployeeIds.map((employeeId) =>
        createNotification({
          userId: employeeId,
          message: `${stageName} needs a retake on ${shotName} in ${projectName}.${hydrated.feedback ? ` Feedback: ${hydrated.feedback}` : ""}`,
          type: "REJECTED",
          relatedProjectId: shotStage.shot.projectId
        })
      )
    );
  }

  return res.json(hydrated);
});

const bulkAssignShotStages = asyncHandler(async (req, res) => {
  const shotStageIds = Array.from(new Set(req.body.shotStageIds || []));
  const userId = Object.prototype.hasOwnProperty.call(req.body, "userId") ? req.body.userId : null;

  if (!shotStageIds.length) {
    throw new AppError("shotStageIds are required", 400);
  }

  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
      select: { id: true, isActive: true }
    });
    if (!user || !user.isActive) {
      throw new AppError("Assigned artist not found or inactive", 404);
    }
  }

  const stages = await prisma.shotStage.findMany({
    where: {
      id: {
        in: shotStageIds
      }
    },
    select: {
      id: true,
      shotId: true,
      shot: {
        select: {
          projectId: true
        }
      }
    }
  });

  if (!stages.length) {
    throw new AppError("No shot stages found", 404);
  }

  await prisma.shotStage.updateMany({
    where: {
      id: {
        in: stages.map((stage) => stage.id)
      }
    },
    data: {
      assignedUserId: userId ? Number(userId) : null
    }
  });

  await prisma.taskAssignment.deleteMany({
    where: {
      shotStageId: {
        in: stages.map((stage) => stage.id)
      }
    }
  });

  if (userId) {
    await prisma.taskAssignment.createMany({
      data: stages.map((stage) => ({
        projectId: stage.shot.projectId,
        shotStageId: stage.id,
        employeeId: Number(userId),
        roleType: "LEAD",
        assignedById: req.user.id
      }))
    });
  }

  if (userId) {
    const stageRows = await prisma.shotStage.findMany({
      where: {
        id: {
          in: stages.map((stage) => stage.id)
        }
      },
      include: {
        shot: {
          include: {
            project: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        stageDefinition: {
          select: {
            code: true,
            name: true
          }
        }
      }
    });

    const grouped = new Map();
    for (const row of stageRows) {
      const key = `${row.shot?.projectId || "0"}::${row.stageDefinition?.code || "SHOT"}`;
      const current = grouped.get(key) || {
        projectId: row.shot?.projectId,
        projectName: row.shot?.project?.name || "Project",
        stageName: row.stageDefinition?.name || row.stageDefinition?.code || "Shot Stage",
        count: 0
      };
      current.count += 1;
      grouped.set(key, current);
    }

    await Promise.all(
      Array.from(grouped.values()).map((entry) =>
        createNotification({
          userId: Number(userId),
          message: `You were assigned ${entry.count} shot${entry.count > 1 ? "s" : ""} for ${entry.stageName} in ${entry.projectName}.`,
          type: "ASSIGNED",
          relatedProjectId: entry.projectId || null
        })
      )
    );
  }

  return res.json({
    success: true,
    updatedCount: stages.length,
    shotCount: new Set(stages.map((stage) => stage.shotId)).size
  });
});

const bulkUpdateShotStages = asyncHandler(async (req, res) => {
  const shotStageIds = Array.from(new Set(req.body.shotStageIds || []));

  if (!shotStageIds.length) {
    throw new AppError("shotStageIds are required", 400);
  }

  const stages = await prisma.shotStage.findMany({
    where: {
      id: {
        in: shotStageIds
      }
    },
    select: {
      id: true,
      shotId: true,
      shot: {
        select: {
          projectId: true
        }
      }
    }
  });

  if (!stages.length) {
    throw new AppError("No shot stages found", 404);
  }

  const payload = {};

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    payload.status = normalizePipelineStatus(req.body.status);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "deadline")) {
    payload.deadline = req.body.deadline ? new Date(req.body.deadline) : null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "assignedUserId")) {
    payload.assignedUserId = req.body.assignedUserId ? Number(req.body.assignedUserId) : null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "notes")) {
    payload.notes = req.body.notes || null;
  }

  if (!Object.keys(payload).length) {
    throw new AppError("At least one update field is required", 400);
  }

  if (isPendingReviewStatus(payload.status)) {
    payload.submittedAt = new Date();
  }
  if (isApprovedStatus(payload.status)) {
    payload.approvedAt = new Date();
    payload.feedback = null;
  }
  if (isRetakeStatus(payload.status || "")) {
    payload.approvedAt = null;
  }

  await prisma.shotStage.updateMany({
    where: {
      id: {
        in: stages.map((stage) => stage.id)
      }
    },
    data: payload
  });

  if (Object.prototype.hasOwnProperty.call(payload, "assignedUserId")) {
    await prisma.taskAssignment.deleteMany({
      where: {
        shotStageId: {
          in: stages.map((stage) => stage.id)
        }
      }
    });

    if (payload.assignedUserId) {
      await prisma.taskAssignment.createMany({
        data: stages.map((stage) => ({
          projectId: stage.shot.projectId,
          shotStageId: stage.id,
          employeeId: payload.assignedUserId,
          roleType: "LEAD",
          assignedById: req.user.id
        }))
      });
    }
  }

  const uniqueShotIds = Array.from(new Set(stages.map((stage) => stage.shotId)));
  const uniqueProjectIds = Array.from(new Set(stages.map((stage) => stage.shot.projectId)));

  await Promise.all(uniqueShotIds.map((shotId) => refreshShotStatus(shotId)));
  await Promise.all(uniqueProjectIds.map((projectId) => recalculateProjectProgress(projectId)));

  return res.json({
    success: true,
    updatedCount: stages.length,
    shotCount: uniqueShotIds.length
  });
});

const rangeAssignShotStages = asyncHandler(async (req, res) => {
  const projectId = Number(req.body.projectId);
  const stageCode = normalizeStageCode(req.body.stageCode);
  const rawStart = Number(req.body.startShotNumber);
  const rawEnd = Number(req.body.endShotNumber);
  const startShotNumber = Math.min(rawStart, rawEnd);
  const endShotNumber = Math.max(rawStart, rawEnd);
  const sequence = req.body.sequence ? String(req.body.sequence).trim() : null;
  const userId = Object.prototype.hasOwnProperty.call(req.body, "userId") ? req.body.userId : null;

  const stageDefinition = await prisma.stageDefinition.findUnique({
    where: { code: stageCode },
    select: { id: true }
  });

  if (!stageDefinition) {
    throw new AppError("Stage definition not found", 404);
  }

  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
      select: { id: true, isActive: true }
    });
    if (!user || !user.isActive) {
      throw new AppError("Assigned artist not found or inactive", 404);
    }
  }

  const where = {
    stageDefinitionId: stageDefinition.id,
    shot: {
      projectId,
      shotNumber: {
        gte: startShotNumber,
        lte: endShotNumber
      }
    }
  };

  if (sequence) {
    where.shot = {
      ...where.shot,
      name: {
        contains: sequence,
        mode: "insensitive"
      }
    };
  }

  const stages = await prisma.shotStage.findMany({
    where,
    select: {
      id: true,
      shotId: true
    }
  });

  if (!stages.length) {
    return res.json({
      success: true,
      updatedCount: 0,
      shotCount: 0
    });
  }

  await prisma.shotStage.updateMany({
    where: {
      id: {
        in: stages.map((stage) => stage.id)
      }
    },
    data: {
      assignedUserId: userId ? Number(userId) : null
    }
  });

  await prisma.taskAssignment.deleteMany({
    where: {
      shotStageId: {
        in: stages.map((stage) => stage.id)
      }
    }
  });

  if (userId) {
    await prisma.taskAssignment.createMany({
      data: stages.map((stage) => ({
        projectId,
        shotStageId: stage.id,
        employeeId: Number(userId),
        roleType: "LEAD",
        assignedById: req.user.id
      }))
    });
  }

  if (userId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true }
    });

    await createNotification({
      userId: Number(userId),
      message: `You were assigned ${stages.length} shot${stages.length > 1 ? "s" : ""} for ${stageCode.replaceAll("_", " ")} in ${project?.name || "Project"}.`,
      type: "ASSIGNED",
      relatedProjectId: project?.id || null
    });
  }

  return res.json({
    success: true,
    updatedCount: stages.length,
    shotCount: new Set(stages.map((stage) => stage.shotId)).size
  });
});

module.exports = {
  listProjectShots,
  createProjectShot,
  bulkCreateProjectShots,
  updateShot,
  deleteShot,
  updateShotStage,
  bulkAssignShotStages,
  bulkUpdateShotStages,
  rangeAssignShotStages
};
