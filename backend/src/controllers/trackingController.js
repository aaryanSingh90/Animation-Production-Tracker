const prisma = require("../utils/prisma");
const { asyncHandler, AppError } = require("../utils/http");
const { getTrackingDefinitionSnapshot } = require("../utils/trackingSetup");
const { getLegacyStageNameFromCode, normalizeStageCode } = require("../utils/stageDefinitions");
const { MANAGER_ROLES } = require("../utils/constants");

function applyPagination(value, fallback, max = 200) {
  return Math.min(max, Math.max(1, Number(value || fallback)));
}

function stageDisplayName(item) {
  return item?.customName || item?.stageTemplate?.name || item?.stageDefinition?.name || item?.stageName;
}

function normalizeOverviewStageCode(value) {
  const code = normalizeStageCode(value);
  if (code === "RENDER") return "RENDERING";
  return code;
}

function isManagerRole(role) {
  return MANAGER_ROLES.includes(role);
}

async function assertProjectAccess(projectId, user) {
  const baseProject = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true }
  });

  if (!baseProject) {
    throw new AppError("Project not found", 404);
  }

  if (isManagerRole(user.role)) return;

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [
        {
          stages: {
            some: {
              isActive: true,
              OR: [
                { assignedUserId: user.id },
                {
                  assignments: {
                    some: { userId: user.id }
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
                  assignedUserId: user.id
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
                  assignedUserId: user.id
                }
              }
            }
          }
        }
      ]
    },
    select: { id: true }
  });

  if (!project) {
    throw new AppError("Forbidden", 403);
  }
}

const getProjectOverview = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.id);

  await assertProjectAccess(projectId, req.user);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      stages: {
        where: { isActive: true },
        include: {
          stageDefinition: true,
          stageTemplate: true,
          assignedUser: {
            select: {
              id: true,
              name: true
            }
          },
          assignments: {
            select: {
              userId: true
            }
          }
        }
      },
      shots: {
        include: {
          stages: {
            include: {
              stageDefinition: true,
              assignedUser: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      },
      assets: {
        include: {
          stages: {
            include: {
              stageDefinition: true,
              assignedUser: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!project) throw new AppError("Project not found", 404);

  const now = new Date();
  const snapshot = await getTrackingDefinitionSnapshot({ prisma, project });

  const projectStages = project.stages || [];
  const shotStages = project.shots.flatMap((shot) => shot.stages || []);
  const assetStages = project.assets.flatMap((asset) => asset.stages || []);

  const delayedTasks = [...projectStages, ...shotStages, ...assetStages].filter(
    (stage) => stage.deadline && new Date(stage.deadline) < now && stage.status !== "APPROVED"
  );

  const pendingApprovals = [...projectStages, ...shotStages, ...assetStages].filter((stage) => stage.status === "SUBMITTED");

  const stageSummaryMap = new Map();

  for (const stage of projectStages) {
    const code = normalizeOverviewStageCode(stage.stageDefinition?.code || stage.stageName);
    if (!stageSummaryMap.has(code)) {
      stageSummaryMap.set(code, {
        stageCode: code,
        stageName: stageDisplayName(stage),
        trackingMode: "PROJECT",
        total: 1,
        approved: 0,
        submitted: 0,
        inProgress: 0,
        delayed: 0,
        status: stage.status
      });
    }

    const bucket = stageSummaryMap.get(code);
    if (stage.status === "APPROVED") bucket.approved += 1;
    if (stage.status === "SUBMITTED") bucket.submitted += 1;
    if (stage.status === "IN_PROGRESS") bucket.inProgress += 1;
    if (stage.deadline && new Date(stage.deadline) < now && stage.status !== "APPROVED") bucket.delayed += 1;
  }

  for (const stage of shotStages) {
    const code = normalizeOverviewStageCode(stage.stageDefinition?.code || stage.stageName);
    if (!stageSummaryMap.has(code)) {
      stageSummaryMap.set(code, {
        stageCode: code,
        stageName: stageDisplayName(stage),
        trackingMode: "SHOT",
        total: 0,
        approved: 0,
        submitted: 0,
        inProgress: 0,
        delayed: 0,
        status: "NOT_STARTED"
      });
    }

    const bucket = stageSummaryMap.get(code);
    bucket.trackingMode = "SHOT";
    bucket.total += 1;
    if (stage.status === "APPROVED") bucket.approved += 1;
    if (stage.status === "SUBMITTED") bucket.submitted += 1;
    if (stage.status === "IN_PROGRESS") bucket.inProgress += 1;
    if (stage.deadline && new Date(stage.deadline) < now && stage.status !== "APPROVED") bucket.delayed += 1;
  }

  for (const stage of assetStages) {
    const code = normalizeOverviewStageCode(stage.stageDefinition?.code || stage.stageName);
    if (!stageSummaryMap.has(code)) {
      stageSummaryMap.set(code, {
        stageCode: code,
        stageName: stageDisplayName(stage),
        trackingMode: "ASSET",
        total: 0,
        approved: 0,
        submitted: 0,
        inProgress: 0,
        delayed: 0,
        status: "NOT_STARTED"
      });
    }

    const bucket = stageSummaryMap.get(code);
    bucket.trackingMode = "ASSET";
    bucket.total += 1;
    if (stage.status === "APPROVED") bucket.approved += 1;
    if (stage.status === "SUBMITTED") bucket.submitted += 1;
    if (stage.status === "IN_PROGRESS") bucket.inProgress += 1;
    if (stage.deadline && new Date(stage.deadline) < now && stage.status !== "APPROVED") bucket.delayed += 1;
  }

  const projectStageProgress = projectStages.length
    ? Math.round((projectStages.filter((stage) => stage.status === "APPROVED").length / projectStages.length) * 100)
    : 0;

  const shotStageProgress = shotStages.length
    ? Math.round((shotStages.filter((stage) => stage.status === "APPROVED").length / shotStages.length) * 100)
    : 0;

  const assetStageProgress = assetStages.length
    ? Math.round((assetStages.filter((stage) => stage.status === "APPROVED").length / assetStages.length) * 100)
    : 0;

  for (const code of snapshot.activeCodes) {
    if (stageSummaryMap.has(code)) continue;
    const definition = snapshot.stageDefinitionsByCode.get(code);
    const trackingMode = snapshot.projectCodes.has(code)
      ? "PROJECT"
      : snapshot.shotCodes.has(code)
        ? "SHOT"
        : snapshot.assetCodes.has(code)
          ? "ASSET"
          : definition?.trackingMode || "PROJECT";

    stageSummaryMap.set(code, {
      stageCode: code,
      stageName: definition?.name || code,
      trackingMode,
      total: 0,
      approved: 0,
      submitted: 0,
      inProgress: 0,
      delayed: 0,
      status: "NOT_STARTED"
    });
  }

  const stageSummaries = Array.from(stageSummaryMap.values()).map((item) => ({
    ...item,
    completionPercent: item.total ? Math.round((item.approved / item.total) * 100) : item.status === "APPROVED" ? 100 : 0
  }));

  const completed =
    projectStages.filter((stage) => stage.status === "APPROVED").length +
    shotStages.filter((stage) => stage.status === "APPROVED").length +
    assetStages.filter((stage) => stage.status === "APPROVED").length;

  const total = projectStages.length + shotStages.length + assetStages.length;
  const overallProgress = total ? Math.round((completed / total) * 100) : 0;

  return res.json({
    project: {
      id: project.id,
      name: project.name,
      client: project.client,
      priority: project.priority,
      totalShots: project.totalShots,
      totalAssets: project.assets.length,
      lightingMode: project.lightingMode,
      renderingMode: project.renderingMode,
      activeStageCodes: project.activeStageCodes,
      shotStageCodes: Array.from(snapshot.shotCodes),
      assetStageCodes: Array.from(snapshot.assetCodes),
      projectStageCodes: Array.from(snapshot.projectCodes)
    },
    progress: {
      overallProgress,
      projectStageProgress,
      shotStageProgress,
      assetStageProgress
    },
    stageSummaries,
    delayedTasksCount: delayedTasks.length,
    pendingApprovalsCount: pendingApprovals.length,
    delayedTasks,
    pendingApprovals
  });
});

const getStageShotsWorkspace = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.id);
  const stageCode = normalizeStageCode(req.params.stageCode);
  const page = applyPagination(req.query.page, 1, 1000);
  const pageSize = applyPagination(req.query.pageSize, 25, 200);
  const status = req.query.status;
  const artistId = req.query.artistId ? Number(req.query.artistId) : null;
  const search = req.query.search;
  const sequence = req.query.sequence;
  const unassigned = req.query.unassigned === true || req.query.unassigned === "true";
  const overdue = req.query.overdue === true || req.query.overdue === "true";
  const sortBy = req.query.sortBy || "shotNumber";
  const sortDir = req.query.sortDir === "desc" ? "desc" : "asc";

  await assertProjectAccess(projectId, req.user);

  const stageDefinition = await prisma.stageDefinition.findUnique({
    where: { code: stageCode },
    select: {
      id: true,
      code: true,
      name: true,
      trackingMode: true,
      isHybrid: true
    }
  });

  if (!stageDefinition) throw new AppError("Stage definition not found", 404);

  const where = {
    stageDefinitionId: stageDefinition.id,
    shot: {
      projectId
    }
  };

  if (status) where.status = status;
  if (artistId) where.assignedUserId = artistId;
  if (unassigned) where.assignedUserId = null;
  if (overdue) {
    where.deadline = { lt: new Date() };
    if (!status) {
      where.status = { not: "APPROVED" };
    }
  }
  if (sequence) {
    where.shot = {
      ...where.shot,
      OR: [
        {
          name: {
            contains: String(sequence),
            mode: "insensitive"
          }
        },
        {
          label: {
            contains: String(sequence),
            mode: "insensitive"
          }
        }
      ]
    };
  }
  if (search) {
    const shotSearch = [
      { shot: { name: { contains: String(search), mode: "insensitive" } } },
      { shot: { label: { contains: String(search), mode: "insensitive" } } },
      { shot: { shotNumber: Number.isNaN(Number(search)) ? undefined : Number(search) } }
    ].filter(Boolean);
    where.OR = where.OR ? [...where.OR, ...shotSearch] : shotSearch;
  }

  let orderBy = [{ shot: { order: "asc" } }, { shot: { shotNumber: "asc" } }];
  if (sortBy === "deadline") {
    orderBy = [{ deadline: sortDir }, { shot: { order: "asc" } }];
  } else if (sortBy === "priority") {
    orderBy = [{ shot: { order: sortDir } }, { shot: { shotNumber: "asc" } }];
  } else if (sortBy === "status") {
    orderBy = [{ status: sortDir }, { shot: { order: "asc" } }];
  } else if (sortBy === "artist") {
    orderBy = [{ assignedUserId: sortDir }, { shot: { order: "asc" } }];
  } else if (sortBy === "shotNumber") {
    orderBy = [{ shot: { shotNumber: sortDir } }, { shot: { order: "asc" } }];
  }

  const [total, items] = await Promise.all([
    prisma.shotStage.count({ where }),
    prisma.shotStage.findMany({
      where,
      include: {
        shot: {
          select: {
            id: true,
            shotNumber: true,
            label: true,
            name: true,
            frameStart: true,
            frameEnd: true,
            seconds: true,
            order: true,
            status: true
          }
        },
        stageDefinition: true,
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
        }
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);

  return res.json({
    stage: stageDefinition,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    },
    items
  });
});

const getStageAssetsWorkspace = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.id);
  const stageCode = normalizeStageCode(req.params.stageCode);
  const page = applyPagination(req.query.page, 1, 1000);
  const pageSize = applyPagination(req.query.pageSize, 25, 200);
  const status = req.query.status;
  const artistId = req.query.artistId ? Number(req.query.artistId) : null;
  const search = req.query.search;
  const type = req.query.type;
  const subCategory = req.query.subCategory;

  await assertProjectAccess(projectId, req.user);

  const stageDefinition = await prisma.stageDefinition.findUnique({
    where: { code: stageCode },
    select: {
      id: true,
      code: true,
      name: true,
      trackingMode: true,
      isHybrid: true
    }
  });

  if (!stageDefinition) throw new AppError("Stage definition not found", 404);

  const where = {
    stageDefinitionId: stageDefinition.id,
    asset: {
      projectId
    }
  };

  if (status) where.status = status;
  if (artistId) where.assignedUserId = artistId;
  if (type) {
    where.asset = {
      ...where.asset,
      type
    };
  }
  if (subCategory) {
    where.asset = {
      ...where.asset,
      subCategory
    };
  }
  if (search) {
    where.asset = {
      ...where.asset,
      name: {
        contains: String(search),
        mode: "insensitive"
      }
    };
  }

  const [total, items] = await Promise.all([
    prisma.assetStage.count({ where }),
    prisma.assetStage.findMany({
      where,
      include: {
        asset: {
          select: {
            id: true,
            name: true,
            type: true,
            subCategory: true,
            referenceImageUrl: true,
            status: true
          }
        },
        stageDefinition: true,
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
        }
      },
      orderBy: [{ asset: { name: "asc" } }, { createdAt: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);

  return res.json({
    stage: stageDefinition,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    },
    items
  });
});

const getProjectStageWorkspace = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.id);
  const stageCode = normalizeStageCode(req.params.stageCode);
  const legacyStageName = getLegacyStageNameFromCode(stageCode);

  await assertProjectAccess(projectId, req.user);

  const rows = await prisma.projectStage.findMany({
    where: {
      projectId,
      isActive: true,
      OR: [
        {
          stageDefinition: {
            code: stageCode
          }
        },
        {
          stageName: {
            equals: legacyStageName,
            mode: "insensitive"
          }
        },
        {
          stageName: {
            equals: stageCode,
            mode: "insensitive"
          }
        }
      ]
    },
    include: {
      stageDefinition: true,
      stageTemplate: true,
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
              }
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
    orderBy: [{ order: "asc" }, { createdAt: "asc" }]
  });

  return res.json({
    stageCode,
    stageName: stageDisplayName(rows[0]),
    items: rows
  });
});

module.exports = {
  getProjectOverview,
  getStageShotsWorkspace,
  getStageAssetsWorkspace,
  getProjectStageWorkspace
};
