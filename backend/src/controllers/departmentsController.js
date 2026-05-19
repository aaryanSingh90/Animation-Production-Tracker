const prisma = require("../utils/prisma");
const { AppError, asyncHandler } = require("../utils/http");
const { ACTIVE_STAGE_STATUSES } = require("../utils/constants");
const { presentUser } = require("../utils/userPresenter");

function buildMemberSummary(user) {
  const stageMap = new Map();

  for (const stage of user.assignedProjectStages || []) {
    stageMap.set(stage.id, {
      id: stage.id,
      stageName: stage.stageName,
      status: stage.status,
      project: stage.project
    });
  }

  for (const assignment of user.stageAssignments || []) {
    const stage = assignment.projectStage;
    if (!stageMap.has(stage.id)) {
      stageMap.set(stage.id, {
        id: stage.id,
        stageName: stage.stageName,
        status: stage.status,
        project: stage.project
      });
    }
  }

  return {
    ...presentUser(user),
    activeAssignments: Array.from(stageMap.values()),
    activeAssignmentsCount: stageMap.size
  };
}

const listDepartments = asyncHandler(async (req, res) => {
  const departments = await prisma.department.findMany({
    include: {
      employees: {
        where: {
          isActive: true
        },
        select: {
          id: true,
          employmentType: true
        }
      },
      _count: {
        select: {
          stageAssignments: true
        }
      }
    },
    orderBy: {
      name: "asc"
    }
  });

  return res.json(
    departments.map((department) => {
      const inhouseCount = department.employees.filter((member) => member.employmentType === "INHOUSE").length;
      const freelanceCount = department.employees.filter((member) => member.employmentType === "FREELANCE").length;

      return {
        id: department.id,
        name: department.name,
        description: department.description,
        color: department.color,
        createdAt: department.createdAt,
        updatedAt: department.updatedAt,
        memberCount: department.employees.length,
        inhouseCount,
        freelanceCount,
        assignedStageCount: department._count.stageAssignments
      };
    })
  );
});

const getDepartmentById = asyncHandler(async (req, res) => {
  const id = req.params.id;

  const department = await prisma.department.findUnique({
    where: { id },
    include: {
      employees: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          employmentType: true,
          departmentId: true,
          departmentName: true,
          isActive: true,
          department: {
            select: {
              id: true,
              name: true,
              color: true
            }
          },
          assignedProjectStages: {
            where: {
              status: {
                in: ACTIVE_STAGE_STATUSES
              }
            },
            select: {
              id: true,
              stageName: true,
              status: true,
              project: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          },
          stageAssignments: {
            where: {
              projectStage: {
                status: {
                  in: ACTIVE_STAGE_STATUSES
                }
              }
            },
            select: {
              projectStage: {
                select: {
                  id: true,
                  stageName: true,
                  status: true,
                  project: {
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
      },
      stageAssignments: {
        include: {
          projectStage: {
            select: {
              id: true,
              stageName: true,
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
          assignedAt: "desc"
        }
      }
    }
  });

  if (!department) {
    throw new AppError("Department not found", 404);
  }

  const members = department.employees.map((member) =>
    buildMemberSummary({
      ...member,
      stageAssignments: (member.stageAssignments || []).map((assignment) => ({
        projectStage: assignment.projectStage
      }))
    })
  );

  const inhouseCount = members.filter((member) => member.employmentType === "INHOUSE").length;
  const freelanceCount = members.filter((member) => member.employmentType === "FREELANCE").length;

  return res.json({
    id: department.id,
    name: department.name,
    description: department.description,
    color: department.color,
    createdAt: department.createdAt,
    updatedAt: department.updatedAt,
    memberCount: members.length,
    inhouseCount,
    freelanceCount,
    members,
    assignedStages: department.stageAssignments.map((assignment) => ({
      id: assignment.id,
      assignedAt: assignment.assignedAt,
      projectId: assignment.projectStage.project.id,
      projectName: assignment.projectStage.project.name,
      stageId: assignment.projectStage.id,
      stageName: assignment.projectStage.stageName
    }))
  });
});

const createDepartment = asyncHandler(async (req, res) => {
  const { name, description, color } = req.body;

  const department = await prisma.department.create({
    data: {
      name,
      description: description || null,
      color: color || "#10B981"
    }
  });

  return res.status(201).json(department);
});

const updateDepartment = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
    payload.name = req.body.name;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "description")) {
    payload.description = req.body.description || null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "color")) {
    payload.color = req.body.color || "#10B981";
  }

  const current = await prisma.department.findUnique({ where: { id } });
  if (!current) {
    throw new AppError("Department not found", 404);
  }

  const updated = await prisma.department.update({
    where: { id },
    data: payload
  });

  if (payload.name) {
    await prisma.user.updateMany({
      where: {
        departmentId: id
      },
      data: {
        departmentName: payload.name
      }
    });
  }

  return res.json(updated);
});

const deleteDepartment = asyncHandler(async (req, res) => {
  const id = req.params.id;

  const department = await prisma.department.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          employees: true
        }
      }
    }
  });

  if (!department) {
    throw new AppError("Department not found", 404);
  }

  if (department._count.employees > 0) {
    throw new AppError("Department has members. Remove members before deleting this department.", 400);
  }

  await prisma.department.delete({ where: { id } });
  return res.json({ success: true });
});

const addDepartmentMember = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const userId = Number(req.body.userId);

  const [department, user] = await Promise.all([
    prisma.department.findUnique({ where: { id } }),
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            color: true
          }
        }
      }
    })
  ]);

  if (!department) {
    throw new AppError("Department not found", 404);
  }

  if (!user || !user.isActive) {
    throw new AppError("User not found", 404);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      departmentId: department.id,
      departmentName: department.name
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      employmentType: true,
      departmentId: true,
      departmentName: true,
      isActive: true,
      department: {
        select: {
          id: true,
          name: true,
          color: true
        }
      }
    }
  });

  return res.json(presentUser(updated));
});

const removeDepartmentMember = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const userId = Number(req.params.userId);

  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (user.departmentId !== id) {
    throw new AppError("User is not a member of this department", 400);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      departmentId: null,
      departmentName: null
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      employmentType: true,
      departmentId: true,
      departmentName: true,
      isActive: true,
      department: {
        select: {
          id: true,
          name: true,
          color: true
        }
      }
    }
  });

  return res.json(presentUser(updated));
});

const listDepartmentMembers = asyncHandler(async (req, res) => {
  const id = req.params.id;

  const department = await prisma.department.findUnique({
    where: { id },
    select: { id: true }
  });

  if (!department) {
    throw new AppError("Department not found", 404);
  }

  const members = await prisma.user.findMany({
    where: {
      departmentId: id,
      isActive: true
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      employmentType: true,
      departmentId: true,
      departmentName: true,
      isActive: true,
      department: {
        select: {
          id: true,
          name: true,
          color: true
        }
      },
      assignedProjectStages: {
        where: {
          status: {
            in: ACTIVE_STAGE_STATUSES
          }
        },
        select: {
          id: true,
          stageName: true,
          status: true,
          project: {
            select: {
              id: true,
              name: true
            }
          }
        }
      },
      stageAssignments: {
        where: {
          projectStage: {
            status: {
              in: ACTIVE_STAGE_STATUSES
            }
          }
        },
        select: {
          projectStage: {
            select: {
              id: true,
              stageName: true,
              status: true,
              project: {
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

  return res.json(
    members.map((member) =>
      buildMemberSummary({
        ...member,
        stageAssignments: (member.stageAssignments || []).map((assignment) => ({
          projectStage: assignment.projectStage
        }))
      })
    )
  );
});

module.exports = {
  listDepartments,
  createDepartment,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
  addDepartmentMember,
  removeDepartmentMember,
  listDepartmentMembers
};
