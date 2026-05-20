const prisma = require("../utils/prisma");
const { asyncHandler } = require("../utils/http");

function normalizeStatus(status) {
  return String(status || "").trim().toUpperCase() || null;
}

const globalSearch = asyncHandler(async (req, res) => {
  const status = normalizeStatus(req.query.status);
  const assignedUserId = req.query.artist ? Number(req.query.artist) : null;
  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  const departmentFilter = String(req.query.department || "").trim();
  const stageFilter = String(req.query.stage || "").trim().toUpperCase();

  const baseWhere = {};
  if (status) baseWhere.status = status;
  if (assignedUserId) baseWhere.assignedUserId = assignedUserId;

  const [shotEntries, assetEntries, projectEntries] = await Promise.all([
    prisma.shotStage.findMany({
      where: {
        ...baseWhere,
        ...(stageFilter ? { stageDefinition: { code: stageFilter } } : {}),
        shot: {
          ...(projectId ? { projectId } : {})
        },
        ...(departmentFilter
          ? {
              assignedUser: {
                OR: [
                  { departmentName: { contains: departmentFilter, mode: "insensitive" } },
                  { department: { name: { contains: departmentFilter, mode: "insensitive" } } }
                ]
              }
            }
          : {})
      },
      include: {
        shot: {
          include: {
            project: {
              select: { id: true, name: true }
            }
          }
        },
        stageDefinition: {
          select: { code: true, name: true }
        },
        assignedUser: {
          select: {
            id: true,
            name: true,
            departmentName: true,
            department: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 1000
    }),
    prisma.assetStage.findMany({
      where: {
        ...baseWhere,
        ...(stageFilter ? { stageDefinition: { code: stageFilter } } : {}),
        asset: {
          ...(projectId ? { projectId } : {})
        },
        ...(departmentFilter
          ? {
              assignedUser: {
                OR: [
                  { departmentName: { contains: departmentFilter, mode: "insensitive" } },
                  { department: { name: { contains: departmentFilter, mode: "insensitive" } } }
                ]
              }
            }
          : {})
      },
      include: {
        asset: {
          include: {
            project: {
              select: { id: true, name: true }
            }
          }
        },
        stageDefinition: {
          select: { code: true, name: true }
        },
        assignedUser: {
          select: {
            id: true,
            name: true,
            departmentName: true,
            department: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 1000
    }),
    prisma.projectStage.findMany({
      where: {
        ...baseWhere,
        ...(projectId ? { projectId } : {}),
        ...(stageFilter
          ? {
              OR: [
                { stageName: stageFilter },
                { stageDefinition: { code: stageFilter } }
              ]
            }
          : {}),
        ...(departmentFilter
          ? {
              assignedUser: {
                OR: [
                  { departmentName: { contains: departmentFilter, mode: "insensitive" } },
                  { department: { name: { contains: departmentFilter, mode: "insensitive" } } }
                ]
              }
            }
          : {})
      },
      include: {
        project: {
          select: { id: true, name: true }
        },
        stageDefinition: {
          select: { code: true, name: true }
        },
        stageTemplate: {
          select: { name: true }
        },
        assignedUser: {
          select: {
            id: true,
            name: true,
            departmentName: true,
            department: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 1000
    })
  ]);

  return res.json({
    shotEntries,
    assetEntries,
    projectEntries
  });
});

module.exports = {
  globalSearch
};
