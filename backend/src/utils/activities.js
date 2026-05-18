const prisma = require("./prisma");

async function logActivity({ projectId, stageId = null, actorId = null, eventType, message }) {
  if (!projectId || !eventType || !message) return;
  await prisma.activityLog.create({
    data: {
      projectId,
      stageId,
      actorId,
      eventType,
      message
    }
  });
}

module.exports = {
  logActivity
};
