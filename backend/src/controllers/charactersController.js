const prisma = require("../utils/prisma");
const { AppError, asyncHandler } = require("../utils/http");
const { CHARACTER_STAGES } = require("../utils/constants");
const { logActivity } = require("../utils/activities");

const listCharacters = asyncHandler(async (req, res) => {
  const characters = await prisma.character.findMany({
    include: {
      stages: {
        include: {
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
          }
        }
      },
      projectLinks: {
        include: {
          project: {
            select: { id: true, name: true, priority: true }
          }
        }
      }
    },
    orderBy: { name: "asc" }
  });

  return res.json(characters);
});

const createCharacter = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name) {
    throw new AppError("name is required", 400);
  }

  const character = await prisma.character.create({
    data: {
      name,
      stages: {
        createMany: {
          data: CHARACTER_STAGES.map((stageName) => ({
            stageName,
            status: "NOT_STARTED"
          }))
        }
      }
    },
    include: {
      stages: true
    }
  });

  return res.status(201).json(character);
});

const getCharacterById = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const character = await prisma.character.findUnique({
    where: { id },
    include: {
      stages: {
        include: {
          assignedUser: {
            select: { id: true, name: true }
          }
        }
      },
      projectLinks: {
        include: {
          project: {
            select: { id: true, name: true, priority: true }
          }
        }
      }
    }
  });

  if (!character) {
    throw new AppError("Character not found", 404);
  }

  return res.json(character);
});

const updateCharacter = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { name } = req.body;

  const character = await prisma.character.update({
    where: { id },
    data: {
      ...(name ? { name } : {})
    }
  });

  return res.json(character);
});

const updateCharacterStage = asyncHandler(async (req, res) => {
  const characterId = Number(req.params.id);
  const stageName = req.params.stageName;
  const { status, deadline, assignedUserId, notes } = req.body;

  if (!CHARACTER_STAGES.includes(stageName)) {
    throw new AppError("Invalid character stage name", 400);
  }

  const existing = await prisma.characterStage.findUnique({
    where: {
      characterId_stageName: {
        characterId,
        stageName
      }
    }
  });

  if (!existing) {
    throw new AppError("Character stage not found", 404);
  }

  const updated = await prisma.characterStage.update({
    where: {
      characterId_stageName: {
        characterId,
        stageName
      }
    },
    data: {
      ...(status ? { status } : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body, "deadline")
        ? { deadline: deadline ? new Date(deadline) : null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body, "assignedUserId")
        ? { assignedUserId: assignedUserId ? Number(assignedUserId) : null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body, "notes") ? { notes } : {})
    },
    include: {
      character: true,
      assignedUser: {
        select: { id: true, name: true }
      }
    }
  });

  return res.json(updated);
});

const linkCharacterToProject = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.id);
  const { characterId } = req.body;

  if (!characterId) {
    throw new AppError("characterId is required", 400);
  }

  const [project, character] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.character.findUnique({ where: { id: Number(characterId) } })
  ]);

  if (!project) throw new AppError("Project not found", 404);
  if (!character) throw new AppError("Character not found", 404);

  const link = await prisma.projectCharacter.upsert({
    where: {
      projectId_characterId: {
        projectId,
        characterId: Number(characterId)
      }
    },
    create: {
      projectId,
      characterId: Number(characterId)
    },
    update: {}
  });

  await logActivity({
    projectId,
    actorId: req.user.id,
    eventType: "CHARACTER_LINKED",
    message: `${req.user.name} linked character ${character.name} to ${project.name}.`
  });

  return res.status(201).json(link);
});

module.exports = {
  listCharacters,
  createCharacter,
  getCharacterById,
  updateCharacter,
  updateCharacterStage,
  linkCharacterToProject
};
