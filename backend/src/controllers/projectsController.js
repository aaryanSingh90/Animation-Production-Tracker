const prisma = require("../utils/prisma");
const { AppError, asyncHandler } = require("../utils/http");
const { STAGE_DEFAULTS, MANAGER_ROLES } = require("../utils/constants");
const { recalculateProjectProgress } = require("../utils/progress");
const { logActivity } = require("../utils/activities");
const { ensureDefaultStageTemplates, resolveLegacyStageNameFromTemplateName } = require("../utils/stageTemplates");
const { isMissingTrackingSchemaError } = require("../utils/prismaCompat");
const { TASK_ASSIGNMENT_INCLUDE } = require("../utils/taskAssignments");
const {
  ensureDefaultStageDefinitions,
  TRACKING_GROUPS,
  normalizeStageCode,
  getLegacyStageNameFromCode,
  getStageCodeFromLegacyStageName
} = require("../utils/stageDefinitions");
const {
  isApprovedStatus,
  isLateStatus,
  isPendingReviewStatus,
  isRetakeStatus,
  normalizePipelineStatus
} = require("../utils/pipelineStatus");

function isManager(role) {
  return MANAGER_ROLES.includes(role);
}

function normalizeStageName(rawStageName) {
  if (!rawStageName) return null;
  return String(rawStageName).trim().toUpperCase();
}

function usesAdvancedTrackingConfig(payload = {}) {
  return (
    Array.isArray(payload.activeStageCodes) ||
    Object.prototype.hasOwnProperty.call(payload, "totalShots") ||
    Object.prototype.hasOwnProperty.call(payload, "lightingMode") ||
    Object.prototype.hasOwnProperty.call(payload, "renderingMode") ||
    Object.prototype.hasOwnProperty.call(payload, "client") ||
    Object.prototype.hasOwnProperty.call(payload, "startDate") ||
    Object.prototype.hasOwnProperty.call(payload, "dueDate")
  );
}

function buildDepartmentLookup() {
  const map = new Map();
  for (const item of STAGE_DEFAULTS) {
    map.set(item.stageName, item.departmentName);
  }
  return map;
}

const BLUEPRINT_ACTIVE_CODES = [
  "ANIMATICS",
  "AUDIO",
  "MODELLING",
  "UNWRAPPING",
  "TEXTURING",
  "RIGGING",
  "ANIMATION",
  "FX",
  "LIGHTING",
  "COMPOSITING",
  "EDITING"
];

function deriveSequenceFromShotCode(code) {
  const value = String(code || "").trim();
  if (!value) return null;

  const withPrefix = value.match(/^([A-Za-z0-9]+)[_-]SH\d+/i);
  if (withPrefix?.[1]) return withPrefix[1].toUpperCase();
  if (value.includes("_")) return value.split("_")[0].toUpperCase();
  if (value.includes("-")) return value.split("-")[0].toUpperCase();
  return "MAIN";
}

async function resolveClientReference({ client, clientId }) {
  const parsedClientId = clientId ? Number(clientId) : null;
  const trimmedClientName = client ? String(client).trim() : "";

  if (parsedClientId) {
    const clientRecord = await prisma.client.findUnique({
      where: { id: parsedClientId },
      select: { id: true, name: true }
    });

    if (!clientRecord) {
      throw new AppError("Selected client does not exist", 400);
    }

    return {
      clientId: clientRecord.id,
      clientName: clientRecord.name
    };
  }

  if (!trimmedClientName) {
    return {
      clientId: null,
      clientName: null
    };
  }

  return {
    clientId: null,
    clientName: trimmedClientName
  };
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
      status: normalizePipelineStatus(input.status, "YTS"),
      deadline: input.deadline ? new Date(input.deadline) : null,
      assignedUserId: input.assignedUserId ? Number(input.assignedUserId) : null,
      notes: input.notes || null,
      isActive: input.isActive !== false
    });
  }

  return resolved;
}

async function initializeDynamicTracking({
  projectId,
  totalShots = 0,
  lightingMode = "SHOT",
  renderingMode = "PROJECT",
  activeStageCodes = []
}) {
  const [stageDefinitions, stageTemplates] = await Promise.all([
    ensureDefaultStageDefinitions(prisma),
    ensureDefaultStageTemplates(prisma)
  ]);

  const templateByLegacy = new Map(
    stageTemplates.filter((template) => template.legacyStageName).map((template) => [template.legacyStageName, template])
  );
  const definitionsByCode = new Map(stageDefinitions.map((definition) => [normalizeStageCode(definition.code), definition]));
  const departmentLookup = buildDepartmentLookup();

  const requestedCodes = new Set(
    (activeStageCodes.length ? activeStageCodes : BLUEPRINT_ACTIVE_CODES).map((code) => normalizeStageCode(code))
  );

  const filteredDefinitions = stageDefinitions
    .filter((definition) => definition.isActive && requestedCodes.has(normalizeStageCode(definition.code)))
    .sort((a, b) => a.order - b.order);

  const createProjectStagesForCodes = [];
  const createShotStagesForCodes = [];
  const createAssetStagesForCodes = [];

  for (const definition of filteredDefinitions) {
    const code = normalizeStageCode(definition.code);

    if (definition.isHybrid) {
      if (code === "LIGHTING") {
        if (lightingMode === "SHOT") createShotStagesForCodes.push(code);
        else createProjectStagesForCodes.push(code);
      } else if (code === "RENDERING") {
        if (renderingMode === "SHOT") createShotStagesForCodes.push(code);
        else createProjectStagesForCodes.push(code);
      }
      continue;
    }

    if (definition.trackingMode === "PROJECT") createProjectStagesForCodes.push(code);
    if (definition.trackingMode === "SHOT") createShotStagesForCodes.push(code);
    if (definition.trackingMode === "ASSET") createAssetStagesForCodes.push(code);
  }

  const projectStageRows = createProjectStagesForCodes.map((code, index) => {
    const definition = definitionsByCode.get(code);
    const legacyStageName = getLegacyStageNameFromCode(code);
    const stageTemplate = templateByLegacy.get(legacyStageName) || null;

    return {
      projectId,
      stageName: legacyStageName,
      trackingMode: "PROJECT",
      stageDefinitionId: definition?.id || null,
      stageTemplateId: stageTemplate?.id || null,
      customName: null,
      order: index + 1,
      departmentName: departmentLookup.get(legacyStageName) || `${definition?.name || "General"} Department`,
      status: "YTS",
      isActive: true
    };
  });

  if (projectStageRows.length) {
    await prisma.projectStage.createMany({ data: projectStageRows });
  }

  const shotsToCreate = Math.max(0, Number(totalShots) || 0);
  const createdShots = [];

  if (shotsToCreate > 0) {
    for (let index = 0; index < shotsToCreate; index += 1) {
      const shotNumber = index + 1;
      const label = `Shot_${String(shotNumber).padStart(2, "0")}`;
      const frameStart = 101;
      const frameEnd = 124;
      const seconds = Number(((frameEnd - frameStart + 1) / 24).toFixed(2));
      const shot = await prisma.shot.create({
        data: {
          projectId,
          shotNumber,
          label,
          frameStart,
          frameEnd,
          seconds,
          name: label,
          duration: seconds,
          order: shotNumber,
          status: "YTS"
        }
      });
      createdShots.push(shot);
    }
  }

  if (createdShots.length && createShotStagesForCodes.length) {
    const shotStageRows = [];
    for (const shot of createdShots) {
      for (const code of createShotStagesForCodes) {
        const definition = definitionsByCode.get(code);
        if (!definition) continue;
        shotStageRows.push({
          shotId: shot.id,
          stageDefinitionId: definition.id,
          status: "YTS"
        });
      }
    }
    if (shotStageRows.length) {
      await prisma.shotStage.createMany({ data: shotStageRows });
    }
  }

  return {
    createdProjectStageCodes: createProjectStagesForCodes,
    createdShotStageCodes: createShotStagesForCodes,
    createdAssetStageCodes: createAssetStagesForCodes,
    shotCount: shotsToCreate
  };
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

  let projects;

  try {
    projects = await prisma.project.findMany({
      where,
      include: {
        stages: {
          where: { isActive: true },
          include: {
            stageTemplate: true,
            stageDefinition: true,
            _count: {
              select: { comments: true }
            },
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
        shots: {
          include: {
            stages: {
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
              },
              orderBy: {
                createdAt: "asc"
              }
            }
          },
          orderBy: [{ order: "asc" }, { shotNumber: "asc" }]
        },
        assets: {
          include: {
            stages: {
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
              },
              orderBy: {
                createdAt: "asc"
              }
            }
          },
          orderBy: { createdAt: "asc" }
        },
        projectCharacters: {
          include: {
            character: true
          }
        },
        clientRef: {
          select: {
            id: true,
            name: true,
            companyName: true
          }
        },
        _count: {
          select: {
            shots: true,
            assets: true
          }
        }
      }
    });
  } catch (error) {
    if (!isMissingTrackingSchemaError(error)) {
      throw error;
    }

    try {
      const legacyProjects = await prisma.project.findMany({
        where,
        include: {
          stages: {
            where: { isActive: true },
            include: {
              stageTemplate: true,
              _count: {
                select: { comments: true }
              },
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

      projects = legacyProjects.map(withLegacyTrackingDefaults);
    } catch (legacyError) {
      if (!isMissingTrackingSchemaError(legacyError)) {
        throw legacyError;
      }

      const fallbackWhere = {};
      if (search) {
        fallbackWhere.name = {
          contains: search,
          mode: "insensitive"
        };
      }
      if (artistId) {
        fallbackWhere.stages = {
          some: {
            assignedUserId: Number(artistId)
          }
        };
      }

      const ultraLegacyProjects = await prisma.project.findMany({
        where: fallbackWhere,
        select: {
          id: true,
          name: true,
          priority: true,
          audioReceivedDate: true,
          description: true,
          progressPercent: true,
          overallStatus: true,
          createdAt: true,
          updatedAt: true,
          stages: {
            select: {
              id: true,
              projectId: true,
              stageName: true,
              status: true,
              deadline: true,
              assignedUserId: true,
              submittedAt: true,
              approvedAt: true,
              rejectedAt: true,
              notes: true,
              feedback: true,
              createdAt: true,
              updatedAt: true,
              assignedUser: {
                select: { id: true, name: true }
              }
            },
            orderBy: { createdAt: "asc" }
          }
        }
      });

      projects = ultraLegacyProjects.map(withUltraLegacyTrackingDefaults);
    }
  }

  let filtered = projects;

  if (filterStatus === "completed") {
    filtered = filtered.filter((project) => project.progressPercent === 100);
  } else if (filterStatus === "delayed") {
    filtered = filtered.filter((project) =>
      project.stages.some((stage) => stage.isDeadlineMissed || isLateStatus(stage.status, stage.deadline))
    );
  } else if (filterStatus === "issues") {
    filtered = filtered.filter((project) => project.stages.some((stage) => isLateStatus(stage.status, stage.deadline)));
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

  return res.json(filtered.map(withClientPresentation));
});

function getNearestDeadline(stages) {
  const upcoming = stages
    .filter((stage) => stage.isActive !== false && stage.deadline)
    .map((stage) => new Date(stage.deadline))
    .sort((a, b) => a.getTime() - b.getTime());
  return upcoming[0] || null;
}

function withLegacyTrackingDefaults(project) {
  if (!project) return project;
  const count = project._count || {};

  return {
    ...project,
    shots: Array.isArray(project.shots) ? project.shots : [],
    assets: Array.isArray(project.assets) ? project.assets : [],
    _count: {
      ...count,
      shots: count.shots ?? (Array.isArray(project.shots) ? project.shots.length : 0),
      assets: count.assets ?? (Array.isArray(project.assets) ? project.assets.length : 0)
    }
  };
}

function withUltraLegacyTrackingDefaults(project) {
  if (!project) return project;
  return {
    id: project.id,
    name: project.name,
    priority: project.priority,
    audioReceivedDate: project.audioReceivedDate || null,
    description: project.description || null,
    progressPercent: Number(project.progressPercent || 0),
    overallStatus: project.overallStatus || "ON_TRACK",
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    stages: (project.stages || []).map((stage) => ({
      ...stage,
      assignments: [],
      _count: { comments: 0 },
      isActive: true
    })),
    shots: [],
    assets: [],
    projectCharacters: [],
    _count: { shots: 0, assets: 0 }
  };
}

function withClientPresentation(project) {
  if (!project) return project;
  const resolvedClientName = project.clientRef?.name || project.client || null;
  return {
    ...project,
    client: resolvedClientName,
    clientId: project.clientId ?? project.clientRef?.id ?? null,
    clientInfo: project.clientRef
      ? {
          id: project.clientRef.id,
          name: project.clientRef.name,
          companyName: project.clientRef.companyName || null
        }
      : null
  };
}

const createProject = asyncHandler(async (req, res) => {
  const {
    name,
    client,
    clientId,
    priority,
    audioReceivedDate,
    description,
    stages,
    activeStageCodes = [],
    totalShots = 0,
    lightingMode = "SHOT",
    renderingMode = "PROJECT",
    startDate,
    dueDate
  } = req.body;
  if (!name || !priority) {
    throw new AppError("name and priority are required", 400);
  }

  const advancedTracking = usesAdvancedTrackingConfig(req.body);
  const resolvedClient = await resolveClientReference({ client, clientId });
  let project;

  if (advancedTracking) {
    const safeLightingMode = "SHOT";
    const safeRenderingMode = renderingMode === "SHOT" ? "SHOT" : "PROJECT";
    const normalizedActiveCodes = Array.from(
      new Set(
        ((activeStageCodes || []).length ? activeStageCodes : BLUEPRINT_ACTIVE_CODES)
          .map((code) => normalizeStageCode(code))
          .filter(Boolean)
      )
    );

    project = await prisma.project.create({
      data: {
        name,
        client: resolvedClient.clientName || null,
        clientId: resolvedClient.clientId,
        description: description || null,
        priority: Number(priority),
        audioReceivedDate: audioReceivedDate ? new Date(audioReceivedDate) : new Date(),
        startDate: startDate ? new Date(startDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        totalShots: Math.max(0, Number(totalShots) || 0),
        activeStageCodes: normalizedActiveCodes,
        lightingMode: safeLightingMode,
        renderingMode: safeRenderingMode,
        overallStatus: "ON_TRACK"
      }
    });

    await initializeDynamicTracking({
      projectId: project.id,
      totalShots: project.totalShots,
      lightingMode: safeLightingMode,
      renderingMode: safeRenderingMode,
      activeStageCodes: normalizedActiveCodes
    });
  } else {
    const requestedStages = Array.isArray(stages) && stages.length
      ? stages
      : STAGE_DEFAULTS.map((stage, index) => ({
          stageName: stage.stageName,
          order: index + 1
        }));

    const stageRecords = await buildStageRecordsFromInput(requestedStages);

    project = await prisma.project.create({
      data: {
        name,
        client: resolvedClient.clientName || null,
        clientId: resolvedClient.clientId,
        description: description || null,
        priority: Number(priority),
        audioReceivedDate: audioReceivedDate ? new Date(audioReceivedDate) : new Date(),
        startDate: startDate ? new Date(startDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        totalShots: Math.max(0, Number(totalShots) || 0),
        activeStageCodes: Array.from(
          new Set(
            requestedStages
              .map((item) => normalizeStageCode(getStageCodeFromLegacyStageName(item.stageName) || item.stageName))
              .filter(Boolean)
          )
        ),
        lightingMode: "SHOT",
        renderingMode: renderingMode === "SHOT" ? "SHOT" : "PROJECT",
        overallStatus: "ON_TRACK",
        stages: {
          createMany: { data: stageRecords }
        }
      }
    });
  }

  const hydratedProject = await prisma.project.findUnique({
    where: { id: project.id },
    include: {
      stages: {
        where: { isActive: true },
        include: {
          stageTemplate: true,
          stageDefinition: true,
          _count: {
            select: { comments: true }
          },
          assignedUser: {
            select: { id: true, name: true }
          }
        },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }]
      },
      shots: {
        orderBy: [{ order: "asc" }, { shotNumber: "asc" }]
      },
      assets: {
        orderBy: { createdAt: "asc" }
      },
      clientRef: {
        select: {
          id: true,
          name: true,
          companyName: true
        }
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

  return res.status(201).json(withClientPresentation(hydratedProject));
});

const getProjectById = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  let project;

  try {
    project = await prisma.project.findUnique({
      where: { id },
      include: {
        stages: {
          where: { isActive: true },
          include: {
            stageTemplate: true,
            stageDefinition: true,
            _count: {
              select: { comments: true }
            },
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
        shots: {
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
                }
              },
              orderBy: {
                createdAt: "asc"
              }
            }
          },
          orderBy: [{ order: "asc" }, { shotNumber: "asc" }]
        },
        assets: {
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
                }
              },
              orderBy: {
                createdAt: "asc"
              }
            }
          },
          orderBy: { createdAt: "asc" }
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
        },
        clientRef: {
          select: {
            id: true,
            name: true,
            companyName: true
          }
        }
      }
    });
  } catch (error) {
    if (!isMissingTrackingSchemaError(error)) {
      throw error;
    }

    const legacyProject = await prisma.project.findUnique({
      where: { id },
      include: {
        stages: {
          where: { isActive: true },
          include: {
            stageTemplate: true,
            _count: {
              select: { comments: true }
            },
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

    project = withLegacyTrackingDefaults(legacyProject);
  }

  if (!project) {
    throw new AppError("Project not found", 404);
  }

  if (!isManager(req.user.role)) {
    const projectStageAssigned = project.stages.some(
      (stage) => stage.assignedUserId === req.user.id || stage.assignments?.some((assignment) => assignment.userId === req.user.id)
    );

    const shotStageAssigned = (project.shots || []).some((shot) =>
      (shot.stages || []).some((stage) => stage.assignedUserId === req.user.id || stage.taskAssignments?.some((assignment) => assignment.employeeId === req.user.id))
    );

    const assetStageAssigned = (project.assets || []).some((asset) =>
      (asset.stages || []).some((stage) => stage.assignedUserId === req.user.id || stage.taskAssignments?.some((assignment) => assignment.employeeId === req.user.id))
    );

    if (!projectStageAssigned && !shotStageAssigned && !assetStageAssigned) {
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

  return res.json(withClientPresentation({
    ...project,
    issueLogs
  }));
});

const updateProject = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const payload = {};
  const fields = [
    "name",
    "client",
    "clientId",
    "priority",
    "audioReceivedDate",
    "description",
    "startDate",
    "dueDate",
    "totalShots",
    "activeStageCodes",
    "lightingMode",
    "renderingMode"
  ];

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
  if (Object.prototype.hasOwnProperty.call(payload, "startDate")) {
    payload.startDate = payload.startDate ? new Date(payload.startDate) : null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "dueDate")) {
    payload.dueDate = payload.dueDate ? new Date(payload.dueDate) : null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "totalShots")) {
    payload.totalShots = Math.max(0, Number(payload.totalShots) || 0);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "activeStageCodes")) {
    payload.activeStageCodes = Array.from(
      new Set((payload.activeStageCodes || []).map((code) => normalizeStageCode(code)).filter(Boolean))
    );
  }
  if (Object.prototype.hasOwnProperty.call(payload, "lightingMode")) {
    payload.lightingMode = "SHOT";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "renderingMode")) {
    payload.renderingMode = payload.renderingMode === "SHOT" ? "SHOT" : "PROJECT";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "client") || Object.prototype.hasOwnProperty.call(payload, "clientId")) {
    const resolvedClient = await resolveClientReference({
      client: payload.client,
      clientId: payload.clientId
    });
    payload.client = resolvedClient.clientName;
    payload.clientId = resolvedClient.clientId;
  }

  const project = await prisma.project.update({
    where: { id },
    data: payload,
    include: {
      clientRef: {
        select: {
          id: true,
          name: true,
          companyName: true
        }
      }
    }
  });

  await logActivity({
    projectId: id,
    actorId: req.user.id,
    eventType: "PROJECT_UPDATED",
    message: `${req.user.name} updated project ${project.name}.`
  });

  return res.json(withClientPresentation(project));
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
  const stageCode = getStageCodeFromLegacyStageName(record.stageName);
  const stageDefinition = stageCode
    ? await prisma.stageDefinition.findUnique({
        where: { code: stageCode },
        select: { id: true }
      })
    : null;

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
      trackingMode: "PROJECT",
      stageDefinitionId: stageDefinition?.id || null,
      order: Number.isInteger(req.body.order) ? req.body.order : (maxOrder._max.order || 0) + 1
    },
    include: {
      stageTemplate: true,
      stageDefinition: true,
      _count: {
        select: { comments: true }
      },
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
      OR: [
        {
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
        {
          shots: {
            some: {
              stages: {
                some: {
                  OR: [{ assignedUserId: req.user.id }, { taskAssignments: { some: { employeeId: req.user.id } } }]
                }
              }
            }
          }
        },
        {
          assets: {
            some: {
              stages: {
                some: {
                  OR: [{ assignedUserId: req.user.id }, { taskAssignments: { some: { employeeId: req.user.id } } }]
                }
              }
            }
          }
        }
      ]
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
          _count: {
            select: { comments: true }
          },
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
      },
      shots: {
        where: {
          stages: {
            some: {
              OR: [{ assignedUserId: req.user.id }, { taskAssignments: { some: { employeeId: req.user.id } } }]
            }
          }
        },
        include: {
          stages: {
            where: {
              OR: [{ assignedUserId: req.user.id }, { taskAssignments: { some: { employeeId: req.user.id } } }]
            },
            include: {
              stageDefinition: true,
              taskAssignments: true
            }
          }
        },
        orderBy: [{ order: "asc" }, { shotNumber: "asc" }]
      },
      assets: {
        where: {
          stages: {
            some: {
              OR: [{ assignedUserId: req.user.id }, { taskAssignments: { some: { employeeId: req.user.id } } }]
            }
          }
        },
        include: {
          stages: {
            where: {
              OR: [{ assignedUserId: req.user.id }, { taskAssignments: { some: { employeeId: req.user.id } } }]
            },
            include: {
              stageDefinition: true,
              taskAssignments: true
            }
          }
        },
        orderBy: { createdAt: "asc" }
      }
    },
    orderBy: { priority: "asc" }
  });

  return res.json(projects);
});

const getMyTasks = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const projectIdFilter = req.query.projectId ? Number(req.query.projectId) : null;
  const statusFilter = req.query.status ? String(req.query.status).toUpperCase() : null;

  let projectStages = [];
  let shotStages = [];
  let assetStages = [];

  try {
    [projectStages, shotStages, assetStages] = await Promise.all([
      prisma.projectStage.findMany({
        where: {
          isActive: true,
          ...(projectIdFilter ? { projectId: projectIdFilter } : {}),
          ...(statusFilter ? { status: statusFilter } : {}),
          OR: [
            { assignedUserId: userId },
            {
              assignments: {
                some: {
                  userId
                }
              }
            }
          ]
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              priority: true
            }
          },
          stageTemplate: {
            select: {
              name: true
            }
          },
          stageDefinition: {
            select: {
              code: true,
              name: true
            }
          },
          assignments: {
            where: {
              userId
            },
            select: {
              createdAt: true,
              user: {
                select: {
                  employmentType: true
                }
              }
            }
          },
          _count: {
            select: {
              comments: true
            }
          }
        },
        orderBy: [{ deadline: "asc" }, { order: "asc" }, { createdAt: "asc" }]
      }),
      prisma.shotStage.findMany({
        where: {
          OR: [{ assignedUserId: userId }, { taskAssignments: { some: { employeeId: userId } } }],
          ...(statusFilter ? { status: statusFilter } : {}),
          shot: {
            ...(projectIdFilter ? { projectId: projectIdFilter } : {})
          }
        },
        include: {
          shot: {
            include: {
              project: {
                select: {
                  id: true,
                  name: true,
                  priority: true
                }
              }
            }
          },
          stageDefinition: {
            select: {
              code: true,
              name: true
            }
          },
          taskAssignments: {
            where: { employeeId: userId },
            select: {
              assignedAt: true,
              roleType: true,
              employee: {
                select: {
                  employmentType: true
                }
              }
            }
          },
          _count: {
            select: {
              comments: true
            }
          }
        },
        orderBy: [{ deadline: "asc" }, { updatedAt: "desc" }]
      }),
      prisma.assetStage.findMany({
        where: {
          OR: [{ assignedUserId: userId }, { taskAssignments: { some: { employeeId: userId } } }],
          ...(statusFilter ? { status: statusFilter } : {}),
          asset: {
            ...(projectIdFilter ? { projectId: projectIdFilter } : {})
          }
        },
        include: {
          asset: {
            include: {
              project: {
                select: {
                  id: true,
                  name: true,
                  priority: true
                }
              }
            }
          },
          stageDefinition: {
            select: {
              code: true,
              name: true
            }
          },
          taskAssignments: {
            where: { employeeId: userId },
            select: {
              assignedAt: true,
              roleType: true,
              employee: {
                select: {
                  employmentType: true
                }
              }
            }
          },
          _count: {
            select: {
              comments: true
            }
          }
        },
        orderBy: [{ deadline: "asc" }, { updatedAt: "desc" }]
      })
    ]);
  } catch (error) {
    if (!isMissingTrackingSchemaError(error)) {
      throw error;
    }

    projectStages = await prisma.projectStage.findMany({
      where: {
        ...(projectIdFilter ? { projectId: projectIdFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        assignedUserId: userId
      },
      select: {
        id: true,
        projectId: true,
        stageName: true,
        status: true,
        deadline: true,
        notes: true,
        feedback: true,
        assignedUserId: true,
        submittedAt: true,
        approvedAt: true,
        createdAt: true,
        updatedAt: true,
        project: {
          select: {
            id: true,
            name: true,
            priority: true
          }
        }
      },
      orderBy: [{ deadline: "asc" }, { createdAt: "asc" }]
    });
  }

  const tasks = [
    ...projectStages.map((stage) => ({
      id: stage.id,
      trackingType: "PROJECT",
      resource: "project",
      projectId: stage.projectId,
      projectName: stage.project.name,
      projectPriority: stage.project.priority,
      stageName: stage.customName || stage.stageTemplate?.name || stage.stageDefinition?.name || stage.stageName,
      stageCode: stage.stageDefinition?.code || stage.stageName,
      shotId: null,
      shotNumber: null,
      shotCode: null,
      sequence: null,
      assetId: null,
      assetName: null,
      assetType: null,
      departmentName: stage.departmentName || null,
      status: stage.status,
      deadline: stage.deadline,
      notes: stage.notes,
      feedback: stage.feedback,
      assignedAt: stage.assignments?.[0]?.createdAt || (stage.assignedUserId === userId ? stage.updatedAt : stage.createdAt),
      submittedAt: stage.submittedAt,
      approvedAt: stage.approvedAt,
      commentCount: stage._count?.comments || 0,
      isOverdue: isLateStatus(stage.status, stage.deadline),
      assignmentType: stage.assignments?.[0]?.user?.employmentType || req.user.employmentType || "INHOUSE"
    })),
    ...shotStages.map((stage) => {
      const shotCode = stage.shot?.label || stage.shot?.name || (stage.shot?.shotNumber ? `SH${String(stage.shot.shotNumber).padStart(3, "0")}` : null);
      return {
        id: stage.id,
        trackingType: "SHOT",
        resource: "shot",
        projectId: stage.shot?.projectId,
        projectName: stage.shot?.project?.name || "Project",
        projectPriority: stage.shot?.project?.priority || 0,
        stageName: stage.stageDefinition?.name || stage.stageDefinition?.code || "Shot Stage",
        stageCode: stage.stageDefinition?.code || null,
        shotId: stage.shotId,
        shotNumber: stage.shot?.shotNumber || null,
        shotCode,
        sequence: deriveSequenceFromShotCode(shotCode),
        assetId: null,
        assetName: null,
        assetType: null,
        departmentName: null,
        status: stage.status,
        deadline: stage.deadline,
        notes: stage.notes,
        feedback: stage.feedback,
        assignedAt: stage.taskAssignments?.[0]?.assignedAt || stage.updatedAt,
        submittedAt: stage.submittedAt,
        approvedAt: stage.approvedAt,
        commentCount: stage._count?.comments || 0,
        isOverdue: isLateStatus(stage.status, stage.deadline),
        assignmentType: stage.taskAssignments?.[0]?.employee?.employmentType || req.user.employmentType || "INHOUSE"
      };
    }),
    ...assetStages.map((stage) => ({
      id: stage.id,
      trackingType: "ASSET",
      resource: "asset",
      projectId: stage.asset?.projectId,
      projectName: stage.asset?.project?.name || "Project",
      projectPriority: stage.asset?.project?.priority || 0,
      stageName: stage.stageDefinition?.name || stage.stageDefinition?.code || "Asset Stage",
      stageCode: stage.stageDefinition?.code || null,
      shotId: null,
      shotNumber: null,
      shotCode: null,
      sequence: null,
      assetId: stage.assetId,
      assetName: stage.asset?.name || "Asset",
      assetType: stage.asset?.type || null,
      departmentName: null,
      status: stage.status,
      deadline: stage.deadline,
      notes: stage.notes,
      feedback: stage.feedback,
      assignedAt: stage.taskAssignments?.[0]?.assignedAt || stage.updatedAt,
      submittedAt: stage.submittedAt,
      approvedAt: stage.approvedAt,
      commentCount: stage._count?.comments || 0,
      isOverdue: isLateStatus(stage.status, stage.deadline),
      assignmentType: stage.taskAssignments?.[0]?.employee?.employmentType || req.user.employmentType || "INHOUSE"
    }))
  ].sort((a, b) => {
    const aTime = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;
    return a.projectPriority - b.projectPriority;
  });

  const now = new Date();
  const summary = {
    total: tasks.length,
    overdue: tasks.filter((task) => isLateStatus(task.status, task.deadline)).length,
    inProgress: tasks.filter((task) => task.status === "IP").length,
    submitted: tasks.filter((task) => isPendingReviewStatus(task.status)).length,
    approved: tasks.filter((task) => isApprovedStatus(task.status)).length,
    rejected: tasks.filter((task) => isRetakeStatus(task.status)).length
  };

  return res.json({ tasks, summary });
});

module.exports = {
  listProjects,
  createProject,
  getProjectById,
  updateProject,
  deleteProject,
  addProjectStage,
  getMyProjects,
  getMyTasks
};
