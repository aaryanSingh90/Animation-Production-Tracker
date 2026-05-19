function getDepartmentInfo(user) {
  if (!user) {
    return {
      id: null,
      name: null,
      color: null
    };
  }

  if (user.department && typeof user.department === "object") {
    return {
      id: user.department.id || user.departmentId || null,
      name: user.department.name || user.departmentName || null,
      color: user.department.color || null
    };
  }

  return {
    id: user.departmentId || null,
    name: user.departmentName || (typeof user.department === "string" ? user.department : null),
    color: null
  };
}

function presentUser(user) {
  if (!user) return user;

  const department = getDepartmentInfo(user);
  const teamInfo = user.team && typeof user.team === "object"
    ? {
        id: user.team.id || user.teamId || null,
        name: user.team.name || null,
        color: user.team.color || null
      }
    : {
        id: user.teamId || null,
        name: typeof user.team === "string" ? user.team : null,
        color: null
      };

  return {
    ...user,
    departmentId: department.id,
    departmentName: department.name,
    department: department.name,
    departmentInfo: department.id || department.name ? department : null,
    teamId: teamInfo.id,
    teamName: teamInfo.name,
    team: teamInfo.id || teamInfo.name ? teamInfo : null
  };
}

module.exports = {
  getDepartmentInfo,
  presentUser
};
