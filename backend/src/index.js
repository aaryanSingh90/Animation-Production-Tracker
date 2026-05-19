require("dotenv").config();

const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cron = require("node-cron");
const { Server } = require("socket.io");

const prisma = require("./utils/prisma");
const { verifyToken } = require("./utils/jwt");
const { initSocket, trackUserSocket, untrackUserSocket } = require("./utils/socket");
const { errorHandler } = require("./utils/http");
const { runDeadlineSweep } = require("./utils/deadlines");
const { requestLogger, errorLogger, write } = require("./utils/logger");
const { ensureUniversalAdmin } = require("./utils/bootstrapAdmin");
const sanitizeInput = require("./middleware/sanitize");

const authRoutes = require("./routes/authRoutes");
const usersRoutes = require("./routes/usersRoutes");
const projectsRoutes = require("./routes/projectsRoutes");
const stagesRoutes = require("./routes/stagesRoutes");
const charactersRoutes = require("./routes/charactersRoutes");
const approvalsRoutes = require("./routes/approvalsRoutes");
const notificationsRoutes = require("./routes/notificationsRoutes");
const reportsRoutes = require("./routes/reportsRoutes");
const issuesRoutes = require("./routes/issuesRoutes");
const departmentsRoutes = require("./routes/departmentsRoutes");
const stageTemplatesRoutes = require("./routes/stageTemplatesRoutes");
const projectStagesRoutes = require("./routes/projectStagesRoutes");
const commentsRoutes = require("./routes/commentsRoutes");
const teamsRoutes = require("./routes/teamsRoutes");
const workforceRoutes = require("./routes/workforceRoutes");
const assignmentsRoutes = require("./routes/assignmentsRoutes");
const shotsRoutes = require("./routes/shotsRoutes");
const assetsRoutes = require("./routes/assetsRoutes");
const trackingRoutes = require("./routes/trackingRoutes");

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.CLIENT_URL || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  "http://localhost:5173",
  "http://localhost:3000"
].filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

app.set("trust proxy", 1);
app.use(
  helmet({
    crossOriginResourcePolicy: false
  })
);
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(sanitizeInput);
app.use((req, res, next) => {
  console.log(req.method, req.originalUrl);
  next();
});
app.use(requestLogger);

const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 400,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many requests, please try again later."
  }
});

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many authentication attempts, try again in 15 minutes."
  }
});

app.use("/api", apiRateLimiter);
app.use("/api/auth", authRateLimiter);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/employees", usersRoutes);
app.use("/api/projects", projectsRoutes);
app.use("/api/stages", stagesRoutes);
app.use("/api/characters", charactersRoutes);
app.use("/api/approvals", approvalsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/issues", issuesRoutes);
app.use("/api/departments", departmentsRoutes);
app.use("/api/stage-templates", stageTemplatesRoutes);
app.use("/api/project-stages", projectStagesRoutes);
app.use("/api/teams", teamsRoutes);
app.use("/api/workforce", workforceRoutes);
app.use("/api/assignments", assignmentsRoutes);
app.use("/api", shotsRoutes);
app.use("/api", assetsRoutes);
app.use("/api", trackingRoutes);
app.use("/api", commentsRoutes);

app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

app.use((error, req, res, next) => {
  errorLogger(error, req);
  next(error);
});

app.use(errorHandler);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length ? allowedOrigins : true,
    methods: ["GET", "POST"],
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

const deadlineTask = cron.schedule("0 9 * * *", async () => {
  try {
    await runDeadlineSweep();
    write("info", "deadline_sweep_completed", { source: "cron" });
  } catch (error) {
    write("error", "deadline_sweep_failed", { source: "cron", message: error.message });
  }
});

async function deadlineSweepOnStartup() {
  try {
    await runDeadlineSweep();
    write("info", "deadline_sweep_completed", { source: "startup" });
  } catch (error) {
    write("error", "deadline_sweep_failed", { source: "startup", message: error.message });
  }
}

const PORT = Number(process.env.PORT || 5000);

async function startServer() {
  try {
    const admin = await ensureUniversalAdmin();
    write("info", "universal_admin_ready", {
      id: admin.id,
      email: admin.email,
      role: admin.role
    });
  } catch (error) {
    write("error", "universal_admin_failed", {
      message: error.message
    });
  }

  await deadlineSweepOnStartup();

  server.listen(PORT, () => {
    write("info", "server_started", {
      port: PORT,
      mode: process.env.NODE_ENV || "development"
    });
  });
}

startServer();

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  write("info", "shutdown_started", { signal });

  try {
    deadlineTask.stop();
    io.close();

    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    await prisma.$disconnect();
    write("info", "shutdown_completed", { signal });
    process.exit(0);
  } catch (error) {
    write("error", "shutdown_failed", { signal, message: error.message });
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
