const { Prisma } = require("@prisma/client");

function isMissingTrackingSchemaError(error) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (!["P2021", "P2022"].includes(error.code)) {
    return false;
  }

  return true;
}

module.exports = {
  isMissingTrackingSchemaError
};
