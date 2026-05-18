const { randomUUID } = require("crypto");

function write(level, message, meta = {}) {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta
  };

  if (level === "error") {
    console.error(JSON.stringify(payload));
  } else {
    console.log(JSON.stringify(payload));
  }
}

function requestLogger(req, res, next) {
  const start = Date.now();
  req.requestId = randomUUID();

  write("info", "request_started", {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip
  });

  res.on("finish", () => {
    write("info", "request_finished", {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - start
    });
  });

  next();
}

function errorLogger(error, req) {
  write("error", "request_failed", {
    requestId: req?.requestId,
    method: req?.method,
    path: req?.originalUrl,
    statusCode: error.statusCode || 500,
    name: error.name,
    errorMessage: error.message,
    stack: process.env.NODE_ENV === "production" ? undefined : error.stack
  });
}

module.exports = {
  write,
  requestLogger,
  errorLogger
};
