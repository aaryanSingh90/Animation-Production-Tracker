const { z } = require("zod");
const { Prisma } = require("@prisma/client");

class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function normalizeError(error) {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      message: error.message,
      details: error.details
    };
  }

  if (error instanceof z.ZodError) {
    return {
      statusCode: 400,
      message: "Validation failed",
      details: error.flatten()
    };
  }

  if (error.name === "TokenExpiredError") {
    return {
      statusCode: 401,
      message: "Token expired"
    };
  }

  if (error.name === "JsonWebTokenError") {
    return {
      statusCode: 401,
      message: "Invalid token"
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return {
        statusCode: 409,
        message: "A unique field already exists"
      };
    }

    return {
      statusCode: 400,
      message: "Database request failed"
    };
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return {
      statusCode: 503,
      message: "Database is unavailable"
    };
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return {
      statusCode: 400,
      message: "Invalid database payload"
    };
  }

  return {
    statusCode: 500,
    message: "Internal server error"
  };
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  const normalized = normalizeError(error);
  const isProduction = process.env.NODE_ENV === "production";

  const payload = {
    message: normalized.message
  };

  if (normalized.details && !isProduction) {
    payload.details = normalized.details;
  }

  if (!isProduction && normalized.statusCode >= 500) {
    payload.stack = error.stack;
  }

  return res.status(normalized.statusCode).json(payload);
}

module.exports = {
  AppError,
  asyncHandler,
  errorHandler
};
