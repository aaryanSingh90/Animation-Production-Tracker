const prisma = require("../utils/prisma");
const { AppError, asyncHandler } = require("../utils/http");
const { STAGE_DEFAULTS, MANAGER_ROLES } = require("../utils/constants");
const { recalculateProjectProgress } = require("../utils/progress");
const { logActivity } = require("../utils/activities");
const { ensureDefaultStageTemplates, resolveLegacyStageNameFromTemplateName } = require("../utils/stageTemplates");

function isManager(role) {
  return MANAGER_ROLES.includes(role);
}

function normalizeStageName(rawStageName) {
  if (!rawStageName) return null;
  return String(rawStageName).trim().toUpperCase();
}

async function buildStageRecordsFromInput(stageInputs = []) {
  await ensureDefaultStageTemplates(prisma);

  const stageTemplates = await prisma.stageTemplate.findMany();
  const templateById = new Map(stageTemplates.map((template) => [template.id, template]));
  const templateByLegacy = new Map(stageTemplates.filter((template) => template.legacyStageName).map((template) => [template.legacyStageName, template]));

  const resolved = [];
  const seenStageNames = new Set();
  const seenCustomNames = new Set();

  for (let index = 0; index < stageInputs.length; index += 1) {
    const input = stageInputs[index];
    const template = input.stageTemplateId ? templateById.get(input.stageTemplateId) : null;

    let stageName = normalizeStageName(input.stageName) || template?.legacyStageName || resolveLegacyStageNameFromTemplateName(template?.name || "");
    if (!stageName && input.customName) {
      stageName = "CUSTOM";
    }

    if (!stageName) {
      throw new AppError("Unable to resolve stageName for one of the requested stages", 400);
    }

    if (stageName !== "CUSTOM" && seenStageNames.has(stageName)) {
      throw new AppError(`Duplicate stage '${stageName}' in project pipeline`, 400);
    }
    seenStageNames.add(stageName);

    const normalizedCustomName = input.customName ? String(input.customName).trim().toLowerCase() : "";
    if (stageName === "CUSTOM") {
      if (!normalizedCustomName) {
        throw new AppError("customName is required for custom stages", 400);
      }
      if (seenCustomNames.has(normalizedCustomName)) {
        throw new AppError(`Duplicate custom stage '${input.customName}' in project pipeline`, 400);
      }
      seenCustomNames.add(normalizedCustomName);
    }

    const stageTemplate = template || templateByLegacy.get(stageName) || null;
    const defaultStageMeta = STAGE_DEFAULTS.find((item) => item.stageName === stageName);

    resolved.push({
      stageName,
      stageTemplateId: stageTemplate?.id || null,
      customName: input.customName || null,
      departmentName: defaultStageMeta?.departmentName || (stageTemplate ? `${stageTemplate.name} Department` : null),
      order: Number.isInteger(input.order) ? input.order : index + 1,
      status: input.status || "NOT_STARTED",
      deadline: input.deadline ? new Date(input.deadline) : null,
      assignedUserId: input.assignedUserId ? Number(input.assignedUserId) : null,
      notes: input.notes || null,
      isActive: input.isActive !== false
    });
  }

  return resolved;
}

const listProjects = asyncHandler(async (req, res) => {
  const { search, sortBy = "priority", sortOrder = "asc", artistId, filterStatus } = req.query;

  const where = {};

  if (search) {
    where.name = {
      contains: search,
      mode: "insensitive"
    };
  }

  if (artistId) {
    where.stages = {
      some: {
        isActive: true,
        OR: [
          { assignedUserId: Number(artistId) },
          {
            assignments: {
              some: {
                userId: Number(artistId)
              }
            }
          }
        ]
      }
    };
  }

  const projects = await prisma.project.findMany({
    where,
    include: {
      stages: {
        where: { isActive: true },
        include: {
          stageTemplate: true,
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
          }
        },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }]
      },
      projectCharacters: {
        include: {
          character: true
        }
      }
    }
  });

  let filtered = projects;

  if (filterStatus === "completed") {
    filtered = filtered.filter((project) => project.progressPercent === 100);
  } else if (filterStatus === "delayed") {
    filtered = filtered.filter((project) =>
      project.stages.some((stage) => stage.isDeadlineMissed || (stage.deadline && new Date(stage.deadline) < new Date() && stage.status !== "APPROVED"))
    );
  } else if (filterStatus === "issues") {
    filtered = filtered.filter((project) => project.stages.some((stage) => stage.status === "ISSUE"));
  } else if (filterStatus === "on-track") {
    filtered = filtered.filter((project) => !project.stages.some((stage) => stage.isDeadlineMissed));
  }

  const sortable = {
    priority: (a, b) => a.priority - b.priority,
    progress: (a, b) => a.progressPercent - b.progressPercent,
    deadline: (a, b) => {
      const aDeadline = getNearestDeadline(a.stages);
      const bDeadline = getNearestDeadline(b.stages);
      if (!aDeadline && !bDeadline) return 0;
      if (!aDeadline) return 1;
      if (!bDeadline) return -1;
      return aDeadline.getTime() - bDeadline.getTime();
    }
  };

  const comparator = sortable[sortBy] || sortable.priority;
  filtered.sort(comparator);
  if (sortOrder === "desc") {
    filtered.reverse();
  }

  return res.json(filtered);
});

function getNearestDeadline(stages) {
  const upcoming = stages
    .filter((stage) => stage.isActive !== false && stage.deadline)
    .map((stage) => new Date(stage.deadline))
    .sort((a, b) => a.getTime() - b.getTime());
  return upcoming[0] || null;
}

const createProject = asyncHandler(async (req, res) => {
  const { name, priority, audioReceivedDate, description, stages } = req.body;
  if (!name || !priority) {
    throw new AppError("name and priority are required", 400);
  }

  const requestedStages = Array.isArray(stages) && stages.length
    ? stages
    : STAGE_DEFAULTS.map((stage, index) => ({
        stageName: stage.stageName,
        order: index + 1
      }));

  const stageRecords = await buildStageRecordsFromInput(requestedStages);

  const project = await prisma.project.create({
    data: {
      name,
      description: description || null,
      priority: Number(priority),
      audioReceivedDate: audioReceivedDate ? new Date(audioReceivedDate) : new Date(),
      overallStatus: "ON_TRACK",
      stages: {
        createMany: { data: stageRecords }
      }
    },
    include: {
      stages: {
        where: { isActive: true },
        include: {
          stageTemplate: true,
          assignedUser: {
            select: { id: true, name: true }
          }
        },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }]
      }
    }
  });

  await recalculateProjectProgress(project.id);

  await logActivity({
    projectId: project.id,
    actorId: req.user.id,
    eventType: "PROJECT_CREATED",
    message: `${req.user.name} created project ${project.name}.`
  });

  return res.status(201).json(project);
});

const getProjectById = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      stages: {
        where: { isActive: true },
        include: {
          stageTemplate: true,
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
          assignments: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  role: true,
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
      },
      projectCharacters: {
        include: {
          character: {
            include: {
              stages: {
                include: {
                  assignedUser: {
                    select: { id: true, name: true }
                  }
                }
              }
            }
          }
        }
      },
      activityLogs: {
        include: {
          actor: {
            select: { id: true, name: true }
          }
        },
        orderBy: { createdAt: "desc" },
        take: 50
      }
    }
  });

  if (!project) {
    throw new AppError("Project not found", 404);
  }

  if (!isManager(req.user.role)) {
    const assigned = project.stages.some(
      (stage) => stage.assignedUserId === req.user.id || stage.assignments?.some((assignment) => assignment.userId === req.user.id)
    );
    if (!assigned) {
      throw new AppError("Forbidden", 403);
    }
  }

  const issueLogs = project.stages.flatMap((stage) =>
    stage.issueLogs.map((issue) => ({
      ...issue,
      stageName: stage.stageName,
      stageDisplayName: stage.customName || stage.stageTemplate?.name || stage.stageName,
      stageId: stage.id
    }))
  );

  return res.json({
    ...project,
    issueLogs
  });
});

const updateProject = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const payload = {};
  const fields = ["name", "priority", "audioReceivedDate", "description"];

  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      payload[field] = req.body[field];
    }
  }

  if (payload.priority) {
    payload.priority = Number(payload.priority);
  }

  if (payload.audioReceivedDate) {
    payload.audioReceivedDate = new Date(payload.audioReceivedDate);
  }

  const project = await prisma.project.update({
    where: { id },
    data: payload
  });

  await logActivity({
    projectId: id,
    actorId: req.user.id,
    eventType: "PROJECT_UPDATED",
    message: `${req.user.name} updated project ${project.name}.`
  });

  return res.json(project);
});

const deleteProject = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await prisma.project.delete({ where: { id } });
  return res.json({ message: "Project deleted" });
});

const addProjectStage = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.id);
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new AppError("Project not found", 404);
  }

  const [record] = await buildStageRecordsFromInput([req.body]);

  if (record.stageName !== "CUSTOM") {
    const duplicateStage = await prisma.projectStage.findFirst({
      where: {
        projectId,
        isActive: true,
        stageName: record.stageName
      },
      select: { id: true }
    });
    if (duplicateStage) {
      throw new AppError("Stage already exists in this project pipeline", 400);
    }
  } else if (record.customName) {
    const duplicateCustom = await prisma.projectStage.findFirst({
      where: {
        projectId,
        isActive: true,
        stageName: "CUSTOM",
        customName: record.customName
      },
      select: { id: true }
    });
    if (duplicateCustom) {
      throw new AppError("Custom stage already exists in this project pipeline", 400);
    }
  }

  const maxOrder = await prisma.projectStage.aggregate({
    where: { projectId },
    _max: { order: true }
  });

  const stage = await prisma.projectStage.create({
    data: {
      projectId,
      ...record,
      order: Number.isInteger(req.body.order) ? req.body.order : (maxOrder._max.order || 0) + 1
    },
    include: {
      stageTemplate: true,
      assignedUser: {
        select: { id: true, name: true }
      },
      assignments: {
        include: {
          user: {
            select: { id: true, name: true, employmentType: true, departmentId: true, departmentName: true }
          }
        }
      }
    }
  });

  await recalculateProjectProgress(projectId);
  await logActivity({
    projectId,
    stageId: stage.id,
    actorId: req.user.id,
    eventType: "STAGE_CREATED",
    message: `${req.user.name} added stage ${(stage.customName || stage.stageTemplate?.name || stage.stageName).replaceAll("_", " ")} to ${project.name}.`
  });

  return res.status(201).json(stage);
});

const getMyProjects = asyncHandler(async (req, res) => {
  const projects = await prisma.project.findMany({
    where: {
      stages: {
        some: {
          isActive: true,
          OR: [
            { assignedUserId: req.user.id },
            {
              assignments: {
                some: {
                  userId: req.user.id
                }
              }
            }
          ]
        }
      }
    },
    include: {
      stages: {
        where: {
          isActive: true,
          OR: [
            { assignedUserId: req.user.id },
            {
              assignments: {
                some: {
                  userId: req.user.id
                }
              }
            }
          ]
        },
        include: {
          stageTemplate: true,
          assignedUser: {
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
          }
        },
        orderBy: [{ order: "asc" }, { deadline: "asc" }]
      }
    },
    orderBy: { priority: "asc" }
  });

  return res.json(projects);
});

module.exports = {
  listProjects,
  createProject,
  getProjectById,
  updateProject,
  deleteProject,
  addProjectStage,
  getMyProjects
};
