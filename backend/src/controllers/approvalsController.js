const prisma = require("../utils/prisma");
const { asyncHandler } = require("../utils/http");
const { displayStageName } = require("../utils/stageTemplates");
const { isMissingTrackingSchemaError } = require("../utils/prismaCompat");

function toNormalized(value) {
  return String(value || "").trim().toLowerCase();
}

function includesNormalized(value, filter) {
  if (!filter) return true;
  return toNormalized(value).includes(filter);
}

function deriveSequenceFromShotCode(code) {
  const value = String(code || "").trim();
  if (!value) return null;

  const withPrefix = value.match(/^([A-Za-z0-9]+)[_-]SH\d+/i);
  if (withPrefix?.[1]) return withPrefix[1].toUpperCase();
  if (value.includes("_")) return value.split("_")[0].toUpperCase();
  if (value.includes("-")) return value.split("-")[0].toUpperCase();
  return "MAIN";
}

function stageDisplayFromDefinition(stageDefinition, fallback = "Stage") {
  if (stageDefinition?.name) return stageDefinition.name;
  if (stageDefinition?.code === "RENDER") return "Rendering";
  if (stageDefinition?.code === "COMPOSITING") return "Composite";
  if (stageDefinition?.code) return stageDefinition.code.replaceAll("_", " ");
  return fallback;
}

const getApprovalQueue = asyncHandler(async (req, res) => {
  const projectFilter = toNormalized(req.query.projectName);
  const artistFilter = toNormalized(req.query.artistName);
  const stageFilter = toNormalized(req.query.stageName);

  let projectStages = [];
  let shotStages = [];
  let assetStages = [];

  try {
    [projectStages, shotStages, assetStages] = await Promise.all([
      prisma.projectStage.findMany({
        where: {
          status: "SUBMITTED",
          isActive: true
        },
        include: {
          stageTemplate: true,
          stageDefinition: true,
          project: {
            select: { id: true, name: true, priority: true }
          },
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
                  }
                }
              }
            }
          }
        }
      }),
      prisma.shotStage.findMany({
        where: {
          status: "SUBMITTED"
        },
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
          shot: {
            select: {
              id: true,
              label: true,
              name: true,
              shotNumber: true,
              project: {
                select: {
                  id: true,
                  name: true,
                  priority: true
                }
              }
            }
          }
        }
      }),
      prisma.assetStage.findMany({
        where: {
          status: "SUBMITTED"
        },
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
          asset: {
            select: {
              id: true,
              name: true,
              type: true,
              project: {
                select: {
                  id: true,
                  name: true,
                  priority: true
                }
              }
            }
          }
        }
      })
    ]);
  } catch (error) {
    if (!isMissingTrackingSchemaError(error)) {
      throw error;
    }

    try {
      projectStages = await prisma.projectStage.findMany({
        where: {
          status: "SUBMITTED",
          isActive: true
        },
        include: {
          stageTemplate: true,
          project: {
            select: { id: true, name: true, priority: true }
          },
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
                  }
                }
              }
            }
          }
        }
      });
    } catch (legacyError) {
      if (!isMissingTrackingSchemaError(legacyError)) {
        throw legacyError;
      }

      projectStages = await prisma.projectStage.findMany({
        where: {
          status: "SUBMITTED"
        },
        select: {
          id: true,
          stageName: true,
          status: true,
          deadline: true,
          notes: true,
          feedback: true,
          submittedAt: true,
          updatedAt: true,
          assignedUser: {
            select: {
              id: true,
              name: true
            }
          },
          project: {
            select: { id: true, name: true, priority: true }
          }
        }
      });
    }
  }

  const queueRows = [
    ...projectStages.map((stage) => {
      const assignedUser =
        stage.assignedUser ||
        (stage.assignments || []).find((assignment) => assignment.userId)?.user ||
        null;

      return {
        id: stage.id,
        queueKey: `project:${stage.id}`,
        resource: "project",
        trackingType: "PROJECT",
        status: stage.status,
        project: stage.project,
        stageName: stage.stageName,
        stageCode: stage.stageDefinition?.code || stage.stageName,
        stageDisplayName: displayStageName(stage),
        assignedUser,
        submittedAt: stage.submittedAt || stage.updatedAt,
        deadline: stage.deadline,
        notes: stage.notes,
        feedback: stage.feedback,
        shot: null,
        asset: null
      };
    }),
    ...shotStages.map((stage) => {
      const shotCode = stage.shot?.label || stage.shot?.name || (Number.isInteger(stage.shot?.shotNumber) ? `SH${String(stage.shot.shotNumber).padStart(3, "0")}` : null);
      return {
        id: stage.id,
        queueKey: `shot:${stage.id}`,
        resource: "shot",
        trackingType: "SHOT",
        status: stage.status,
        project: stage.shot?.project || null,
        stageName: stage.stageDefinition?.code || "SHOT_STAGE",
        stageCode: stage.stageDefinition?.code || null,
        stageDisplayName: stageDisplayFromDefinition(stage.stageDefinition, "Shot Stage"),
        assignedUser: stage.assignedUser || null,
        submittedAt: stage.submittedAt || stage.updatedAt,
        deadline: stage.deadline,
        notes: stage.notes,
        feedback: stage.feedback,
        shot: {
          id: stage.shot?.id || null,
          shotNumber: stage.shot?.shotNumber || null,
          label: stage.shot?.label || null,
          name: stage.shot?.name || null,
          shotCode,
          sequence: deriveSequenceFromShotCode(shotCode)
        },
        asset: null
      };
    }),
    ...assetStages.map((stage) => ({
      id: stage.id,
      queueKey: `asset:${stage.id}`,
      resource: "asset",
      trackingType: "ASSET",
      status: stage.status,
      project: stage.asset?.project || null,
      stageName: stage.stageDefinition?.code || "ASSET_STAGE",
      stageCode: stage.stageDefinition?.code || null,
      stageDisplayName: stageDisplayFromDefinition(stage.stageDefinition, "Asset Stage"),
      assignedUser: stage.assignedUser || null,
      submittedAt: stage.submittedAt || stage.updatedAt,
      deadline: stage.deadline,
      notes: stage.notes,
      feedback: stage.feedback,
      shot: null,
      asset: {
        id: stage.asset?.id || null,
        name: stage.asset?.name || "Asset",
        type: stage.asset?.type || null
      }
    }))
  ]
    .filter((item) => {
      const byProject = includesNormalized(item.project?.name, projectFilter);
      const byArtist = includesNormalized(item.assignedUser?.name, artistFilter);
      const byStage =
        !stageFilter ||
        includesNormalized(item.stageDisplayName, stageFilter) ||
        includesNormalized(item.stageCode, stageFilter) ||
        includesNormalized(item.stageName, stageFilter);

      return byProject && byArtist && byStage;
    })
    .sort((a, b) => new Date(a.submittedAt || 0).getTime() - new Date(b.submittedAt || 0).getTime());

  return res.json(queueRows);
});

module.exports = {
  getApprovalQueue
};
