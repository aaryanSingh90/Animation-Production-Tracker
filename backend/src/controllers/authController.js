const bcrypt = require("bcryptjs");
const prisma = require("../utils/prisma");
const { signToken } = require("../utils/jwt");
const { AppError, asyncHandler } = require("../utils/http");

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError("Email and password are required", 400);
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  if (!user || !user.isActive) {
    throw new AppError("Invalid credentials", 401);
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    throw new AppError("Invalid credentials", 401);
  }

  const token = signToken(user);

  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department
    }
  });
});

const logout = asyncHandler(async (req, res) => {
  return res.json({ message: "Logged out" });
});

const me = asyncHandler(async (req, res) => {
  return res.json(req.user);
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new AppError("Current and new password are required", 400);
  }

  if (newPassword.length < 8) {
    throw new AppError("New password must be at least 8 characters", 400);
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const valid = await bcrypt.compare(currentPassword, user.password);

  if (!valid) {
    throw new AppError("Current password is incorrect", 400);
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: req.user.id },
    data: { password: hashed }
  });

  return res.json({ message: "Password updated" });
});

module.exports = {
  login,
  logout,
  me,
  changePassword
};
