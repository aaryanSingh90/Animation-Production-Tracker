require("dotenv").config();

const http = require("http");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const cron = require("node-cron");
const { Server } = require("socket.io");

const prisma = require("./utils/prisma");
const { verifyToken } = require("./utils/jwt");
const { initSocket, trackUserSocket, untrackUserSocket } = require("./utils/socket");
const { errorHandler, AppError } = require("./utils/http");
const { runDeadlineSweep } = require("./utils/deadlines");

const authRoutes = require("./routes/authRoutes");
const usersRoutes = require("./routes/usersRoutes");
const projectsRoutes = require("./routes/projectsRoutes");
const stagesRoutes = require("./routes/stagesRoutes");
const charactersRoutes = require("./routes/charactersRoutes");
const approvalsRoutes = require("./routes/approvalsRoutes");
const notificationsRoutes = require("./routes/notificationsRoutes");
const reportsRoutes = require("./routes/reportsRoutes");

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  process.env.CLIENT_URL || "http://localhost:5173",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/projects", projectsRoutes);
app.use("/api/stages", stagesRoutes);
app.use("/api/characters", charactersRoutes);
app.use("/api/approvals", approvalsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/reports", reportsRoutes);

app.use((req, res, next) => {
  next(new AppError("Route not found", 404));
});

app.use(errorHandler);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  }
});

initSocket(io);

io.on("connection", (socket) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      socket.disconnect(true);
      return;
    }

    const payload = verifyToken(token);
    const userId = Number(payload.sub);
    if (!userId) {
      socket.disconnect(true);
      return;
    }

    socket.data.userId = userId;
    trackUserSocket(userId, socket.id);

    socket.on("disconnect", () => {
      untrackUserSocket(userId, socket.id);
    });
  } catch (error) {
    socket.disconnect(true);
  }
});

cron.schedule("0 9 * * *", async () => {
  try {
    await runDeadlineSweep();
  } catch (error) {
    console.error("Cron deadline sweep failed", error);
  }
});

runDeadlineSweep().catch((error) => {
  console.error("Startup deadline sweep failed", error);
});

const PORT = Number(process.env.PORT || 4000);

server.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
