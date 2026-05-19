const { z } = require("zod");

const isoDate = z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));
const stageStatusEnum = z.enum([
  "NOT_STARTED",
  "IN_PROGRESS",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "REVISION_REQUIRED",
  "ISSUE",
  "EXTENDED"
]);
const trackingModeEnum = z.enum(["PROJECT", "SHOT", "ASSET"]);
const hybridStageModeEnum = z.enum(["PROJECT", "SHOT"]);

const idParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

const stringIdParamSchema = z.object({
  id: z.string().min(1)
});

const departmentIdParamSchema = z.object({
  id: z.string().min(1)
});

const departmentMemberParamSchema = z.object({
  id: z.string().min(1),
  userId: z.coerce.number().int().positive()
});

const teamIdParamSchema = z.object({
  id: z.string().min(1)
});

const teamMemberParamSchema = z.object({
  id: z.string().min(1),
  userId: z.coerce.number().int().positive()
});

const teamProjectParamSchema = z.object({
  id: z.string().min(1),
  projectId: z.coerce.number().int().positive()
});

const characterStageParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  stageName: z.string().min(1)
});

const stageArtistParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive()
});

const stageDepartmentParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  departmentId: z.string().min(1)
});

const stageCommentParamSchema = z.object({
  stageId: z.coerce.number().int().positive()
});

const stringStageCommentParamSchema = z.object({
  stageId: z.string().min(1)
});

const projectCommentParamSchema = z.object({
  projectId: z.coerce.number().int().positive()
});

const assignmentRecommendationParamSchema = z.object({
  stageId: z.coerce.number().int().positive()
});

const projectStageWorkspaceParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  stageCode: z.string().min(1)
});

const commentIdParamSchema = z.object({
  commentId: z.string().min(1)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  departmentName: z.string().max(255).optional(),
  department: z.string().max(255).optional()
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["BOSS", "PRODUCTION_MANAGER", "COORDINATOR", "EMPLOYEE"]),
  departmentId: z.string().min(1).optional().nullable().or(z.literal("")),
  teamId: z.string().min(1).optional().nullable().or(z.literal("")),
  departmentName: z.string().min(2).optional().nullable().or(z.literal("")),
  department: z.string().min(2).optional().nullable().or(z.literal("")),
  employmentType: z.enum(["INHOUSE", "FREELANCE"]).optional(),
  phone: z.string().max(40).optional().nullable().or(z.literal("")),
  availabilityStatus: z.enum(["AVAILABLE", "BUSY", "ON_LEAVE", "OVERLOADED"]).optional(),
  skills: z.array(z.string().min(1).max(80)).max(20).optional()
});

const assignUserSchema = z.object({
  stageId: z.coerce.number().int().positive().optional(),
  projectStageId: z.coerce.number().int().positive().optional()
}).superRefine((data, ctx) => {
  if (!data.stageId && !data.projectStageId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stageId"],
      message: "stageId or projectStageId is required"
    });
  }
});

const createProjectStageSchema = z.object({
  stageTemplateId: z.string().min(1).optional().nullable(),
  stageName: z.string().min(1).max(255).optional(),
  customName: z.string().min(1).max(255).optional(),
  order: z.coerce.number().int().min(0).optional(),
  status: stageStatusEnum.optional(),
  deadline: isoDate.nullable().optional(),
  assignedUserId: z.coerce.number().int().positive().nullable().optional(),
  notes: z.string().max(5000).optional(),
  isActive: z.boolean().optional()
}).superRefine((value, ctx) => {
  const isCustomStage = value.stageName === "CUSTOM" || (!value.stageTemplateId && !!value.customName);
  if (isCustomStage && !value.customName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customName"],
      message: "customName is required for custom stages"
    });
  }
});

const createProjectSchema = z.object({
  name: z.string().min(2),
  client: z.string().max(255).optional().or(z.literal("")),
  priority: z.coerce.number().int().min(1).max(20),
  audioReceivedDate: isoDate.optional(),
  totalShots: z.coerce.number().int().min(0).max(5000).optional(),
  startDate: isoDate.optional(),
  dueDate: isoDate.optional(),
  lightingMode: hybridStageModeEnum.optional(),
  renderingMode: hybridStageModeEnum.optional(),
  activeStageCodes: z.array(z.string().min(1).max(80)).optional(),
  description: z.string().max(5000).optional().or(z.literal("")),
  stages: z.array(createProjectStageSchema).optional()
});

const updateProjectSchema = z
  .object({
    name: z.string().min(2).optional(),
    client: z.string().max(255).optional().or(z.literal("")),
    priority: z.coerce.number().int().min(1).max(20).optional(),
    audioReceivedDate: isoDate.optional(),
    totalShots: z.coerce.number().int().min(0).max(5000).optional(),
    startDate: isoDate.optional(),
    dueDate: isoDate.optional(),
    lightingMode: hybridStageModeEnum.optional(),
    renderingMode: hybridStageModeEnum.optional(),
    activeStageCodes: z.array(z.string().min(1).max(80)).optional(),
    description: z.string().max(5000).optional().or(z.literal(""))
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const updateStageSchema = z
  .object({
    status: stageStatusEnum.optional(),
    deadline: isoDate.nullable().optional(),
    assignedUserId: z.coerce.number().int().positive().nullable().optional(),
    notes: z.string().max(5000).optional(),
    feedback: z.string().max(5000).optional().nullable(),
    order: z.coerce.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
    customName: z.string().max(255).optional().nullable(),
    stageTemplateId: z.string().min(1).optional().nullable()
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const rejectStageSchema = z.object({
  feedback: z.string().min(2).max(2000)
});

const issueSchema = z
  .object({
    issueType: z.enum(["TECHNICAL", "SOFTWARE_CRASH", "ASSET_MISSING", "HARDWARE_FAILURE", "ARTIST_UNAVAILABLE", "OTHER"]),
    description: z.string().min(5).max(4000),
    extendDeadline: z.boolean().optional().default(false),
    newDeadline: isoDate.nullable().optional(),
    extensionReason: z.string().max(2000).nullable().optional()
  })
  .superRefine((data, ctx) => {
    if (data.extendDeadline) {
      if (!data.newDeadline) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["newDeadline"],
          message: "newDeadline is required when extendDeadline is true"
        });
      }
      if (!data.extensionReason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["extensionReason"],
          message: "extensionReason is required when extendDeadline is true"
        });
      }
    }
  });

const extendDeadlineSchema = z.object({
  newDeadline: isoDate,
  reason: z.string().min(5).max(2000)
});

const assignArtistSchema = z.object({
  userId: z.coerce.number().int().positive()
});

const createDepartmentSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional().or(z.literal("")),
  color: z.string().regex(/^#([0-9A-Fa-f]{6})$/, "Color must be a valid hex code").optional()
});

const updateDepartmentSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    description: z.string().max(1000).optional().or(z.literal("")),
    color: z.string().regex(/^#([0-9A-Fa-f]{6})$/, "Color must be a valid hex code").optional()
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const departmentMemberSchema = z.object({
  userId: z.coerce.number().int().positive()
});

const assignDepartmentSchema = z.object({
  departmentId: z.string().min(1)
});

const createTeamSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional().or(z.literal("")),
  color: z.string().regex(/^#([0-9A-Fa-f]{6})$/, "Color must be a valid hex code").optional(),
  departmentId: z.string().min(1).optional().nullable().or(z.literal("")),
  leadId: z.coerce.number().int().positive().optional().nullable()
});

const updateTeamSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    description: z.string().max(1000).optional().or(z.literal("")),
    color: z.string().regex(/^#([0-9A-Fa-f]{6})$/, "Color must be a valid hex code").optional(),
    departmentId: z.string().min(1).optional().nullable().or(z.literal("")),
    leadId: z.coerce.number().int().positive().optional().nullable(),
    isArchived: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const teamMemberSchema = z.object({
  userId: z.coerce.number().int().positive()
});

const teamProjectSchema = z.object({
  projectId: z.coerce.number().int().positive()
});

const teamLeadSchema = z.object({
  leadId: z.coerce.number().int().positive().nullable()
});

const createShotSchema = z.object({
  shotNumber: z.coerce.number().int().min(1).optional(),
  name: z.string().max(255).optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  duration: z.coerce.number().positive().optional(),
  order: z.coerce.number().int().min(1).optional(),
  status: stageStatusEnum.optional()
});

const updateShotSchema = z
  .object({
    shotNumber: z.coerce.number().int().min(1).optional(),
    name: z.string().max(255).optional().or(z.literal("")),
    description: z.string().max(2000).optional().or(z.literal("")),
    duration: z.coerce.number().positive().optional().nullable(),
    order: z.coerce.number().int().min(1).optional(),
    status: stageStatusEnum.optional()
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const createAssetSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["CHARACTER", "PROP", "ENVIRONMENT"]),
  description: z.string().max(2000).optional().or(z.literal("")),
  referenceImageUrl: z.string().url().optional().or(z.literal("")),
  status: stageStatusEnum.optional()
});

const updateAssetSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    type: z.enum(["CHARACTER", "PROP", "ENVIRONMENT"]).optional(),
    description: z.string().max(2000).optional().or(z.literal("")),
    referenceImageUrl: z.string().url().optional().or(z.literal("")),
    status: stageStatusEnum.optional()
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const stageWorkspaceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  status: stageStatusEnum.optional(),
  artistId: z.coerce.number().int().positive().optional(),
  search: z.string().max(255).optional(),
  type: z.enum(["CHARACTER", "PROP", "ENVIRONMENT"]).optional()
});

const smartAssignSchema = z
  .object({
    projectStageId: z.coerce.number().int().positive(),
    userId: z.coerce.number().int().positive().optional(),
    teamId: z.string().min(1).optional()
  })
  .superRefine((value, ctx) => {
    if (!value.userId && !value.teamId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["userId"],
        message: "userId or teamId is required"
      });
    }
  });

const createCommentSchema = z.object({
  body: z.string().min(1).max(2000),
  type: z.enum(["NOTE", "QUESTION", "FEEDBACK", "APPROVAL_NOTE"]).optional(),
  parentId: z.string().min(1).optional().nullable()
});

const updateCommentSchema = z.object({
  body: z.string().min(1).max(2000)
});

const linkCharacterSchema = z.object({
  characterId: z.coerce.number().int().positive()
});

module.exports = {
  idParamSchema,
  stringIdParamSchema,
  departmentIdParamSchema,
  departmentMemberParamSchema,
  teamIdParamSchema,
  teamMemberParamSchema,
  teamProjectParamSchema,
  characterStageParamSchema,
  stageArtistParamSchema,
  stageDepartmentParamSchema,
  stageCommentParamSchema,
  stringStageCommentParamSchema,
  projectCommentParamSchema,
  assignmentRecommendationParamSchema,
  projectStageWorkspaceParamSchema,
  commentIdParamSchema,
  loginSchema,
  registerSchema,
  changePasswordSchema,
  createUserSchema,
  assignUserSchema,
  createProjectStageSchema,
  createProjectSchema,
  updateProjectSchema,
  updateStageSchema,
  rejectStageSchema,
  issueSchema,
  extendDeadlineSchema,
  assignArtistSchema,
  createDepartmentSchema,
  updateDepartmentSchema,
  departmentMemberSchema,
  assignDepartmentSchema,
  createTeamSchema,
  updateTeamSchema,
  teamMemberSchema,
  teamProjectSchema,
  teamLeadSchema,
  createShotSchema,
  updateShotSchema,
  createAssetSchema,
  updateAssetSchema,
  stageWorkspaceQuerySchema,
  smartAssignSchema,
  createCommentSchema,
  updateCommentSchema,
  linkCharacterSchema
};
