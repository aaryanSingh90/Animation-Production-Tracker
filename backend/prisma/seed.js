const bcrypt = require("bcryptjs");
const { addDays, subDays } = require("date-fns");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const PROJECT_STAGES = [
  "AUDIO",
  "ANIMATICS",
  "CHARACTER_MODELLING_BLENDSHAPES",
  "BG_MODELLING",
  "RIGGING",
  "TEXTURING",
  "ANIMATION",
  "LIGHTING",
  "RENDER",
  "COMPOSITING",
  "EDITING"
];

const STAGE_DEFAULTS = {
  AUDIO: "Audio Department",
  ANIMATICS: "Animatics Department",
  CHARACTER_MODELLING_BLENDSHAPES: "Character Modelling & Blendshapes",
  BG_MODELLING: "BG Modelling Department",
  RIGGING: "Rigging Department",
  TEXTURING: "Texturing Department",
  ANIMATION: "Animation Department",
  LIGHTING: "Lighting Department",
  RENDER: "Render Department",
  COMPOSITING: "Compositing Department",
  EDITING: "Editing Department"
};

const DEFAULT_DEPARTMENTS = [
  { name: "Audio Department", color: "#6366F1" },
  { name: "Animatics Department", color: "#8B5CF6" },
  { name: "Character Modelling & Blendshapes", color: "#EC4899" },
  { name: "BG Modelling Department", color: "#10B981" },
  { name: "Rigging Department", color: "#F59E0B" },
  { name: "Texturing Department", color: "#EF4444" },
  { name: "Animation Department", color: "#3B82F6" },
  { name: "Lighting Department", color: "#F97316" },
  { name: "Render Department", color: "#14B8A6" },
  { name: "Compositing Department", color: "#84CC16" },
  { name: "Editing Department", color: "#06B6D4" },
  { name: "Administration", color: "#0F172A" },
  { name: "Production", color: "#334155" },
  { name: "Pipeline", color: "#1D4ED8" }
];

const CHARACTER_STAGES = ["REFERENCE", "MODELLING", "BLENDSHAPES", "TEXTURING", "RIGGING"];

const projectsSeed = [
  { name: "Lakdi Ki Kathi", priority: 1 },
  { name: "Bandar Mama", priority: 2 },
  { name: "Hathi Raja", priority: 3 },
  { name: "Chanda Mama", priority: 4 },
  { name: "Johny Johny", priority: 5 },
  { name: "Twinkle Twinkle (Hindi)", priority: 6 },
  { name: "Baa Baa Black Sheep (Hindi)", priority: 7 },
  { name: "Jack and Jill (Hindi)", priority: 8 },
  { name: "Rain Rain Go Away (Hindi)", priority: 9 },
  { name: "Machli Jal Ki Rani", priority: 10 }
];

const charactersSeed = ["Raja", "Rani", "Hathi", "Bandar", "Lakdi", "Chanda", "Baby", "Machli", "Jack", "Jill"];

function stageStatusByProject(projectIndex, stageIndex) {
  if (projectIndex === 0) {
    if (stageIndex < 5) return "APPROVED";
    if (stageIndex < 8) return "IN_PROGRESS";
    if (stageIndex === 8) return "ISSUE";
    return "NOT_STARTED";
  }

  if (projectIndex === 1) {
    if (stageIndex < 2) return "IN_PROGRESS";
    return "NOT_STARTED";
  }

  if (projectIndex === 2) {
    if (stageIndex < 10) return "APPROVED";
    if (stageIndex < 11) return "SUBMITTED";
    return "IN_PROGRESS";
  }

  if (projectIndex === 3) {
    return "NOT_STARTED";
  }

  if (projectIndex === 4) {
    if (stageIndex < 4) return "APPROVED";
    if (stageIndex < 8) return "IN_PROGRESS";
    return "NOT_STARTED";
  }

  if (projectIndex % 2 === 0) {
    if (stageIndex < 3) return "APPROVED";
    if (stageIndex < 7) return "IN_PROGRESS";
    return "NOT_STARTED";
  }

  if (stageIndex < 2) return "APPROVED";
  if (stageIndex < 5) return "IN_PROGRESS";
  return "NOT_STARTED";
}

function makeDeadline(projectIndex, stageIndex) {
  const offset = projectIndex * 2 + stageIndex - 6;
  return addDays(new Date(), offset);
}

async function recalcProgress(projectId) {
  const total = await prisma.projectStage.count({ where: { projectId } });
  const approved = await prisma.projectStage.count({ where: { projectId, status: "APPROVED" } });
  const progress = total ? Number(((approved / total) * 100).toFixed(2)) : 0;

  const hasIssues =
    (await prisma.projectStage.count({
      where: {
        projectId,
        OR: [{ status: "ISSUE" }, { isDeadlineMissed: true }]
      }
    })) > 0;

  let overallStatus = "ON_TRACK";
  if (progress === 100) overallStatus = "COMPLETED";
  if (hasIssues) overallStatus = "HAS_ISSUES";

  await prisma.project.update({
    where: { id: projectId },
    data: {
      progressPercent: progress,
      overallStatus
    }
  });
}

async function main() {
  const defaultPassword = await bcrypt.hash("password123", 10);

  await prisma.activityLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.issueLog.deleteMany();
  await prisma.stageDepartmentAssignment.deleteMany();
  await prisma.stageAssignment.deleteMany();
  await prisma.projectCharacter.deleteMany();
  await prisma.characterStage.deleteMany();
  await prisma.character.deleteMany();
  await prisma.projectStage.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();

  const departments = new Map();
  for (const department of DEFAULT_DEPARTMENTS) {
    const record = await prisma.department.create({
      data: {
        name: department.name,
        color: department.color
      }
    });
    departments.set(record.name, record);
  }

  const users = await Promise.all([
    prisma.user.create({
      data: {
        name: "Studio Boss",
        email: "boss@studio.com",
        password: defaultPassword,
        role: "BOSS",
        departmentId: departments.get("Administration").id,
        departmentName: "Administration",
        employmentType: "INHOUSE"
      }
    }),
    prisma.user.create({
      data: {
        name: "Production Manager",
        email: "manager@studio.com",
        password: defaultPassword,
        role: "PRODUCTION_MANAGER",
        departmentId: departments.get("Production").id,
        departmentName: "Production",
        employmentType: "INHOUSE"
      }
    }),
    prisma.user.create({
      data: {
        name: "Pipeline Coordinator",
        email: "coordinator@studio.com",
        password: defaultPassword,
        role: "COORDINATOR",
        departmentId: departments.get("Pipeline").id,
        departmentName: "Pipeline",
        employmentType: "INHOUSE"
      }
    }),
    prisma.user.create({
      data: {
        name: "Rahul Kumar",
        email: "artist1@studio.com",
        password: defaultPassword,
        role: "EMPLOYEE",
        departmentId: departments.get("Animation Department").id,
        departmentName: "Animation Department",
        employmentType: "INHOUSE"
      }
    }),
    prisma.user.create({
      data: {
        name: "Priya Singh",
        email: "artist2@studio.com",
        password: defaultPassword,
        role: "EMPLOYEE",
        departmentId: departments.get("Rigging Department").id,
        departmentName: "Rigging Department",
        employmentType: "INHOUSE"
      }
    }),
    prisma.user.create({
      data: {
        name: "Amit Sharma",
        email: "artist3@studio.com",
        password: defaultPassword,
        role: "EMPLOYEE",
        departmentId: departments.get("BG Modelling Department").id,
        departmentName: "BG Modelling Department",
        employmentType: "FREELANCE"
      }
    }),
    prisma.user.create({
      data: {
        name: "Neha Patel",
        email: "artist4@studio.com",
        password: defaultPassword,
        role: "EMPLOYEE",
        departmentId: departments.get("Compositing Department").id,
        departmentName: "Compositing Department",
        employmentType: "FREELANCE"
      }
    }),
    prisma.user.create({
      data: {
        name: "Vikram Das",
        email: "artist5@studio.com",
        password: defaultPassword,
        role: "EMPLOYEE",
        departmentId: departments.get("Character Modelling & Blendshapes").id,
        departmentName: "Character Modelling & Blendshapes",
        employmentType: "INHOUSE"
      }
    })
  ]);

  const managerIds = users.filter((u) => ["BOSS", "PRODUCTION_MANAGER", "COORDINATOR"].includes(u.role)).map((u) => u.id);
  const artists = users.filter((u) => u.role === "EMPLOYEE");
  const artistIds = artists.map((u) => u.id);

  const createdProjects = [];

  for (let projectIndex = 0; projectIndex < projectsSeed.length; projectIndex += 1) {
    const seed = projectsSeed[projectIndex];

    const project = await prisma.project.create({
      data: {
        name: seed.name,
        priority: seed.priority,
        audioReceivedDate: subDays(new Date(), 28 - projectIndex * 2),
        overallStatus: "ON_TRACK"
      }
    });

    for (let stageIndex = 0; stageIndex < PROJECT_STAGES.length; stageIndex += 1) {
      const stageName = PROJECT_STAGES[stageIndex];
      const status = stageStatusByProject(projectIndex, stageIndex);
      const assignedUserId = artistIds[(projectIndex + stageIndex) % artistIds.length];
      const deadline = makeDeadline(projectIndex, stageIndex);
      const isMissed = deadline < new Date() && status !== "APPROVED";

      const submittedAt = status === "SUBMITTED" || status === "APPROVED" ? subDays(new Date(), 1) : null;
      const approvedAt = status === "APPROVED" ? new Date() : null;

      const stageRecord = await prisma.projectStage.create({
        data: {
          projectId: project.id,
          stageName,
          departmentName: STAGE_DEFAULTS[stageName] || null,
          status,
          assignedUserId,
          deadline,
          isDeadlineMissed: isMissed,
          submittedAt,
          approvedAt,
          notes: `Stage notes for ${stageName.toLowerCase().replaceAll("_", " ")}`
        }
      });

      const stageDepartment = departments.get(STAGE_DEFAULTS[stageName]);
      if (stageDepartment) {
        await prisma.stageDepartmentAssignment.create({
          data: {
            projectStageId: stageRecord.id,
            departmentId: stageDepartment.id
          }
        });
      }

      const extraArtistIds = [];
      if (stageName === "CHARACTER_MODELLING_BLENDSHAPES") {
        extraArtistIds.push(artistIds[(projectIndex + stageIndex + 1) % artistIds.length]);
      }
      if (stageName === "ANIMATION") {
        extraArtistIds.push(artistIds[(projectIndex + stageIndex + 1) % artistIds.length]);
        extraArtistIds.push(artistIds[(projectIndex + stageIndex + 2) % artistIds.length]);
      }
      if (stageName === "RIGGING" && projectIndex % 2 === 0) {
        extraArtistIds.push(artistIds[(projectIndex + stageIndex + 3) % artistIds.length]);
      }

      const allAssigned = Array.from(new Set([assignedUserId, ...extraArtistIds]));
      await prisma.stageAssignment.createMany({
        data: allAssigned.map((userId) => ({
          projectStageId: stageRecord.id,
          userId
        })),
        skipDuplicates: true
      });
    }

    createdProjects.push(project);
    await recalcProgress(project.id);
  }

  const lakdiStage = await prisma.projectStage.findFirst({
    where: {
      project: { name: "Lakdi Ki Kathi" },
      stageName: "LIGHTING"
    }
  });

  if (lakdiStage) {
    await prisma.issueLog.create({
      data: {
        projectStageId: lakdiStage.id,
        issueType: "SOFTWARE_CRASH",
        description: "Renderer crashed repeatedly during final light pass.",
        originalDeadline: lakdiStage.deadline,
        newDeadline: addDays(lakdiStage.deadline || new Date(), 2),
        extensionReason: "Need extra render farm window after crash logs investigation.",
        loggedById: managerIds[1]
      }
    });

    await prisma.projectStage.update({
      where: { id: lakdiStage.id },
      data: {
        status: "EXTENDED",
        deadline: addDays(lakdiStage.deadline || new Date(), 2)
      }
    });
  }

  const createdCharacters = [];
  for (let i = 0; i < charactersSeed.length; i += 1) {
    const character = await prisma.character.create({
      data: {
        name: charactersSeed[i]
      }
    });

    for (let stageIndex = 0; stageIndex < CHARACTER_STAGES.length; stageIndex += 1) {
      const stageName = CHARACTER_STAGES[stageIndex];
      const status = stageIndex < 2 ? "APPROVED" : stageIndex < 4 ? "IN_PROGRESS" : "NOT_STARTED";
      await prisma.characterStage.create({
        data: {
          characterId: character.id,
          stageName,
          status,
          deadline: addDays(new Date(), stageIndex + i - 3),
          assignedUserId: artistIds[(i + stageIndex) % artistIds.length],
          notes: `Character ${character.name} ${stageName.toLowerCase()} notes`
        }
      });
    }

    createdCharacters.push(character);
  }

  for (let i = 0; i < createdCharacters.length; i += 1) {
    const char = createdCharacters[i];
    const firstProject = createdProjects[i % createdProjects.length];
    const secondProject = createdProjects[(i + 3) % createdProjects.length];

    await prisma.projectCharacter.create({
      data: {
        projectId: firstProject.id,
        characterId: char.id
      }
    });

    if (secondProject.id !== firstProject.id) {
      await prisma.projectCharacter.create({
        data: {
          projectId: secondProject.id,
          characterId: char.id
        }
      });
    }
  }

  const submittedStages = await prisma.projectStage.findMany({
    where: { status: "SUBMITTED" },
    include: { project: true, assignedUser: true }
  });

  for (const stage of submittedStages) {
    for (const managerId of managerIds) {
      await prisma.notification.create({
        data: {
          userId: managerId,
          message: `${stage.assignedUser?.name || "Artist"} submitted ${stage.stageName.replaceAll("_", " ")} for ${stage.project.name}.`,
          type: "APPROVAL_NEEDED",
          relatedProjectId: stage.projectId,
          relatedStageId: stage.id
        }
      });
    }
  }

  console.log("Seed complete");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
