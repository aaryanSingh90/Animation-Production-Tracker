const prisma = require("../utils/prisma");
const { AppError, asyncHandler } = require("../utils/http");

const getNotifications = asyncHandler(async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  return res.json(notifications);
});

const markRead = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification || notification.userId !== req.user.id) {
    throw new AppError("Notification not found", 404);
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true }
  });

  return res.json(updated);
});

const markAllRead = asyncHandler(async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, isRead: false },
    data: { isRead: true }
  });

  return res.json({ message: "All notifications marked as read" });
});

module.exports = {
  getNotifications,
  markRead,
  markAllRead
};
