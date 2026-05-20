const bcrypt = require("bcryptjs");
const { addDays, subDays } = require("date-fns");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const PROJECT_STAGES = [
  "AUDIO",
  "ANIMATICS",
  "MODELLING",
  "UNWRAPPING",
  "TEXTURING",
  "RIGGING",
  "ANIMATION",
  "LIGHTING",
  "RENDERING",
  "FX",
  "COMPOSITING",
  "EDITING"
];

const STAGE_DEFAULTS = {
  AUDIO: "Audio Department",
  ANIMATICS: "Animatics Department",
  MODELLING: "Character Modelling Department",
  UNWRAPPING: "Texturing Department",
  TEXTURING: "Texturing Department",
  RIGGING: "Rigging Department",
  ANIMATION: "Animation Department",
  LIGHTING: "Lighting Department",
  RENDERING: "Render Department",
  FX: "Animation Department",
  COMPOSITING: "Compositing Department",
  EDITING: "Editing Department"
};

const DEFAULT_STAGE_TEMPLATES = [
  { name: "Audio", legacyStageName: "AUDIO", color: "#6366F1" },
  { name: "Animatics", legacyStageName: "ANIMATICS", color: "#8B5CF6" },
  { name: "Modelling", legacyStageName: "MODELLING", color: "#EC4899" },
  { name: "Unwrapping", legacyStageName: "UNWRAPPING", color: "#D946EF" },
  { name: "Rigging", legacyStageName: "RIGGING", color: "#F59E0B" },
  { name: "Texturing", legacyStageName: "TEXTURING", color: "#EF4444" },
  { name: "Animation", legacyStageName: "ANIMATION", color: "#3B82F6" },
  { name: "FX", legacyStageName: "FX", color: "#A855F7" },
  { name: "Lighting", legacyStageName: "LIGHTING", color: "#F97316" },
  { name: "Rendering", legacyStageName: "RENDERING", color: "#14B8A6" },
  { name: "Comping", legacyStageName: "COMPOSITING", color: "#84CC16" },
  { name: "Editing", legacyStageName: "EDITING", color: "#06B6D4" },
  {
    name: "Character Modelling & Blendshapes",
    legacyStageName: "CHARACTER_MODELLING_BLENDSHAPES",
    color: "#EC4899"
  }
];

const DEFAULT_DEPARTMENTS = [
  { name: "Audio Department", color: "#6366F1" },
  { name: "Animatics Department", color: "#8B5CF6" },
  { name: "Character Modelling Department", color: "#EC4899" },
  { name: "Blendshapes Department", color: "#D946EF" },
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

const DEFAULT_TEAMS = [
  { name: "Animation Team Alpha", department: "Animation Department", color: "#3B82F6" },
  { name: "Rigging Squad A", department: "Rigging Department", color: "#F59E0B" },
  { name: "Lighting Unit East", department: "Lighting Department", color: "#F97316" },
  { name: "Compositing Crew", department: "Compositing Department", color: "#84CC16" }
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
  const total = await prisma.projectStage.count({ where: { projectId, isActive: true } });
  const approved = await prisma.projectStage.count({ where: { projectId, isActive: true, status: "APPROVED" } });
  const progress = total ? Number(((approved / total) * 100).toFixed(2)) : 0;

  const hasIssues =
    (await prisma.projectStage.count({
      where: {
        projectId,
        isActive: true,
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
  await prisma.teamProject.deleteMany();
  await prisma.team.deleteMany();
  await prisma.stageTemplate.deleteMany();
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

  const stageTemplates = new Map();
  for (const template of DEFAULT_STAGE_TEMPLATES) {
    const record = await prisma.stageTemplate.upsert({
      where: { name: template.name },
      create: template,
      update: {
        legacyStageName: template.legacyStageName,
        color: template.color
      }
    });
    stageTemplates.set(record.legacyStageName, record);
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
        departmentId: departments.get("Character Modelling Department").id,
        departmentName: "Character Modelling Department",
        employmentType: "INHOUSE"
      }
    })
  ]);

  const managerIds = users.filter((u) => ["BOSS", "PRODUCTION_MANAGER", "COORDINATOR"].includes(u.role)).map((u) => u.id);
  const artists = users.filter((u) => u.role === "EMPLOYEE");
  const artistIds = artists.map((u) => u.id);

  const createdTeams = new Map();
  for (const teamSeed of DEFAULT_TEAMS) {
    const record = await prisma.team.create({
      data: {
        name: teamSeed.name,
        color: teamSeed.color,
        departmentId: departments.get(teamSeed.department)?.id || null
      }
    });
    createdTeams.set(teamSeed.name, record);
  }

  if (artists[0]) {
    await prisma.user.update({
      where: { id: artists[0].id },
      data: {
        teamId: createdTeams.get("Animation Team Alpha")?.id || null,
        availabilityStatus: "BUSY"
      }
    });
  }
  if (artists[1]) {
    await prisma.user.update({
      where: { id: artists[1].id },
      data: {
        teamId: createdTeams.get("Rigging Squad A")?.id || null,
        availabilityStatus: "AVAILABLE"
      }
    });
  }
  if (artists[2]) {
    await prisma.user.update({
      where: { id: artists[2].id },
      data: {
        teamId: createdTeams.get("Animation Team Alpha")?.id || null,
        availabilityStatus: "OVERLOADED"
      }
    });
  }
  if (artists[3]) {
    await prisma.user.update({
      where: { id: artists[3].id },
      data: {
        teamId: createdTeams.get("Compositing Crew")?.id || null,
        availabilityStatus: "BUSY"
      }
    });
  }
  if (artists[4]) {
    await prisma.user.update({
      where: { id: artists[4].id },
      data: {
        teamId: createdTeams.get("Lighting Unit East")?.id || null,
        availabilityStatus: "AVAILABLE"
      }
    });
  }

  if (artists[0]) {
    await prisma.team.update({
      where: { id: createdTeams.get("Animation Team Alpha").id },
      data: { leadId: artists[0].id }
    });
  }
  if (artists[1]) {
    await prisma.team.update({
      where: { id: createdTeams.get("Rigging Squad A").id },
      data: { leadId: artists[1].id }
    });
  }

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
          stageTemplateId: stageTemplates.get(stageName)?.id || null,
          order: stageIndex + 1,
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
      if (stageName === "CHARACTER_MODELLING" || stageName === "BLENDSHAPES" || stageName === "CHARACTER_MODELLING_BLENDSHAPES") {
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

    if (projectIndex % 2 === 0) {
      await prisma.teamProject.upsert({
        where: {
          teamId_projectId: {
            teamId: createdTeams.get("Animation Team Alpha").id,
            projectId: project.id
          }
        },
        create: {
          teamId: createdTeams.get("Animation Team Alpha").id,
          projectId: project.id,
          assignedById: managerIds[1]
        },
        update: {}
      });
    }
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
