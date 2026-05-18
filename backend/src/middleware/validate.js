const { z } = require("zod");
const { AppError } = require("../utils/http");

function validate({ body, query, params }) {
  return (req, res, next) => {
    try {
      if (body) {
        req.body = body.parse(req.body);
      }
      if (query) {
        req.query = query.parse(req.query);
      }
      if (params) {
        req.params = params.parse(req.params);
      }
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new AppError("Validation failed", 400, {
          issues: error.issues
        });
      }
      throw error;
    }
  };
}

module.exports = validate;
