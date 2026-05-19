const bcrypt = require("bcryptjs");
const prisma = require("./prisma");

async function ensureUniversalAdmin() {
  const email = (process.env.UNIVERSAL_ADMIN_EMAIL || "admin@animationtracker.com").toLowerCase();
  const password = process.env.UNIVERSAL_ADMIN_PASSWORD || "Admin@12345";
  const name = process.env.UNIVERSAL_ADMIN_NAME || "Universal Admin";
  const departmentName = process.env.UNIVERSAL_ADMIN_DEPARTMENT || "Administration";

  const hashedPassword = await bcrypt.hash(password, 10);
  const department = await prisma.department.upsert({
    where: { name: departmentName },
    create: {
      name: departmentName,
      color: "#10B981"
    },
    update: {}
  });

  const admin = await prisma.user.upsert({
    where: { email },
    create: {
      name,
      email,
      password: hashedPassword,
      role: "BOSS",
      departmentId: department.id,
      departmentName: department.name,
      isActive: true
    },
    update: {
      name,
      password: hashedPassword,
      role: "BOSS",
      departmentId: department.id,
      departmentName: department.name,
      isActive: true
    },
    select: {
      id: true,
      email: true,
      role: true
    }
  });

  return {
    email: admin.email,
    role: admin.role,
    id: admin.id
  };
}

module.exports = {
  ensureUniversalAdmin
};
