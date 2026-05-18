let ioInstance;
const userSocketMap = new Map();

function initSocket(io) {
  ioInstance = io;
}

function getSocket() {
  return ioInstance;
}

function trackUserSocket(userId, socketId) {
  const key = String(userId);
  const sockets = userSocketMap.get(key) || new Set();
  sockets.add(socketId);
  userSocketMap.set(key, sockets);
}

function untrackUserSocket(userId, socketId) {
  const key = String(userId);
  const sockets = userSocketMap.get(key);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    userSocketMap.delete(key);
  }
}

function emitToUser(userId, event, payload) {
  if (!ioInstance) return;
  const sockets = userSocketMap.get(String(userId));
  if (!sockets) return;
  for (const socketId of sockets) {
    ioInstance.to(socketId).emit(event, payload);
  }
}

module.exports = {
  initSocket,
  getSocket,
  trackUserSocket,
  untrackUserSocket,
  emitToUser
};
