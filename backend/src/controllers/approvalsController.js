const prisma = require("../utils/prisma");
const { asyncHandler } = require("../utils/http");

const getApprovalQueue = asyncHandler(async (req, res) => {
  const { projectName, artistName, stageName } = req.query;

  const stages = await prisma.projectStage.findMany({
    where: {
      status: "SUBMITTED",
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
            assignedUser: {
              name: {
                contains: artistName,
                mode: "insensitive"
              }
            }
          }
        : {})
    },
    include: {
      project: {
        select: { id: true, name: true, priority: true }
      },
      assignedUser: {
        select: { id: true, name: true, department: true }
      }
    },
    orderBy: { submittedAt: "asc" }
  });

  return res.json(stages);
});

module.exports = {
  getApprovalQueue
};
