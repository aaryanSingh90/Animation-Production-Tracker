const prisma = require("../utils/prisma");
const { AppError, asyncHandler } = require("../utils/http");
const { STAGE_DEFAULTS, MANAGER_ROLES } = require("../utils/constants");
const { recalculateProjectProgress } = require("../utils/progress");
const { logActivity } = require("../utils/activities");

function isManager(role) {
  return MANAGER_ROLES.includes(role);
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
        include: {
          assignedUser: {
            select: { id: true, name: true }
          },
          assignments: {
            include: {
              user: {
                select: { id: true, name: true, department: true, employmentType: true }
              }
            }
          }
        },
        orderBy: { createdAt: "asc" }
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
    .filter((stage) => stage.deadline)
    .map((stage) => new Date(stage.deadline))
    .sort((a, b) => a.getTime() - b.getTime());
  return upcoming[0] || null;
}

const createProject = asyncHandler(async (req, res) => {
  const { name, priority, audioReceivedDate, description } = req.body;
  if (!name || !priority) {
    throw new AppError("name and priority are required", 400);
  }

  const project = await prisma.project.create({
    data: {
      name,
      description: description || null,
      priority: Number(priority),
      audioReceivedDate: audioReceivedDate ? new Date(audioReceivedDate) : new Date(),
      overallStatus: "ON_TRACK",
      stages: {
        createMany: {
          data: STAGE_DEFAULTS.map((stage) => ({
            stageName: stage.stageName,
            departmentName: stage.departmentName,
            status: "NOT_STARTED"
          }))
        }
      }
    },
    include: {
      stages: true
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
        include: {
          assignedUser: {
            select: { id: true, name: true, role: true, department: true }
          },
          assignments: {
            include: {
              user: {
                select: { id: true, name: true, role: true, department: true, employmentType: true }
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

const getMyProjects = asyncHandler(async (req, res) => {
  const projects = await prisma.project.findMany({
    where: {
      stages: {
        some: {
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
          assignedUser: {
            select: { id: true, name: true }
          },
          assignments: {
            include: {
              user: {
                select: { id: true, name: true, employmentType: true, department: true }
              }
            }
          }
        },
        orderBy: { deadline: "asc" }
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
  getMyProjects
};
