const prisma = require("../utils/prisma");
const { verifyToken } = require("../utils/jwt");
const { AppError, asyncHandler } = require("../utils/http");
const { presentUser } = require("../utils/userPresenter");

const authMiddleware = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new AppError("Unauthorized", 401);
  }

  const token = header.split(" ")[1];
  let payload;

  try {
    payload = verifyToken(token);
  } catch (error) {
    throw new AppError("Invalid or expired token", 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: Number(payload.sub) },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      departmentId: true,
      departmentName: true,
      employmentType: true,
      isActive: true,
      department: {
        select: {
          id: true,
          name: true,
          color: true
        }
      }
    }
  });

  if (!user || !user.isActive) {
    throw new AppError("Unauthorized", 401);
  }

  req.user = presentUser(user);
  next();
});

module.exports = authMiddleware;
