const { PrismaClient } = require("@prisma/client");

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__animationTrackerPrisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "info", "warn", "error"]
        : ["warn", "error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__animationTrackerPrisma = prisma;
}

module.exports = prisma;
