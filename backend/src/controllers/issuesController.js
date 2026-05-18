const prisma = require("../utils/prisma");
const { asyncHandler } = require("../utils/http");

const listIssues = asyncHandler(async (req, res) => {
  const issues = await prisma.issueLog.findMany({
    include: {
      loggedBy: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      },
      projectStage: {
        include: {
          project: {
            select: {
              id: true,
              name: true,
              priority: true
            }
          }
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return res.json(issues);
});

module.exports = {
  listIssues
};
