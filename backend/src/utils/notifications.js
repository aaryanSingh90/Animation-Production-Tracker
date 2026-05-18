const prisma = require("./prisma");
const { emitToUser } = require("./socket");
const { MANAGER_ROLES } = require("./constants");

async function createNotification({ userId, message, type, relatedProjectId = null, relatedStageId = null }) {
  const notification = await prisma.notification.create({
    data: {
      userId,
      message,
      type,
      relatedProjectId,
      relatedStageId
    }
  });

  emitToUser(userId, "notification:new", notification);
  return notification;
}

async function createNotificationIfRecentDuplicateAbsent({ userId, message, type, relatedProjectId = null, relatedStageId = null }) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const exists = await prisma.notification.findFirst({
    where: {
      userId,
      type,
      relatedStageId,
      createdAt: {
        gte: oneHourAgo
      }
    }
  });

  if (exists) return exists;
  return createNotification({ userId, message, type, relatedProjectId, relatedStageId });
}

async function notifyManagers({ message, type, relatedProjectId = null, relatedStageId = null }) {
  const managers = await prisma.user.findMany({
    where: {
      role: { in: MANAGER_ROLES },
      isActive: true
    },
    select: { id: true }
  });

  if (!managers.length) return;
  await Promise.all(
    managers.map((manager) =>
      createNotification({
        userId: manager.id,
        message,
        type,
        relatedProjectId,
        relatedStageId
      })
    )
  );
}

module.exports = {
  createNotification,
  createNotificationIfRecentDuplicateAbsent,
  notifyManagers
};
