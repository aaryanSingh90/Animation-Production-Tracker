const prisma = require("../utils/prisma");
const { asyncHandler } = require("../utils/http");
const { displayStageName } = require("../utils/stageTemplates");

const getApprovalQueue = asyncHandler(async (req, res) => {
  const { projectName, artistName, stageName } = req.query;

  const stages = await prisma.projectStage.findMany({
    where: {
      status: "SUBMITTED",
      isActive: true,
      ...(stageName ? { stageName } : {}),
      ...(projectName
        ? {
            project: {
              name: {
                contains: projectName,
                mode: "insensitive"
              }
            }
          }
        : {}),
      ...(artistName
        ? {
            OR: [
              {
                assignedUser: {
                  name: {
                    contains: artistName,
                    mode: "insensitive"
                  }
                }
              },
              {
                assignments: {
                  some: {
                    user: {
                      name: {
                        contains: artistName,
                        mode: "insensitive"
                      }
                    }
                  }
                }
              }
            ]
          }
        : {})
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
            select: { id: true, name: true }
          }
        }
      }
    },
    orderBy: { submittedAt: "asc" }
  });

  return res.json(
    stages.map((stage) => ({
      ...stage,
      assignedUser:
        stage.assignedUser ||
        stage.assignments.find((assignment) => assignment.userId)?.user ||
        null,
      stageDisplayName: displayStageName(stage)
    }))
  );
});

module.exports = {
  getApprovalQueue
};
