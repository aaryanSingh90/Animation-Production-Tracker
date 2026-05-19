const { z } = require("zod");

const isoDate = z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

const idParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

const departmentIdParamSchema = z.object({
  id: z.string().min(1)
});

const departmentMemberParamSchema = z.object({
  id: z.string().min(1),
  userId: z.coerce.number().int().positive()
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
  password: z.string().min(8),
  role: z.enum(["BOSS", "PRODUCTION_MANAGER", "COORDINATOR", "EMPLOYEE"]),
  departmentId: z.string().min(1).optional().or(z.literal("")),
  departmentName: z.string().min(2).optional().or(z.literal("")),
  department: z.string().min(2).optional().or(z.literal("")),
  employmentType: z.enum(["INHOUSE", "FREELANCE"]).optional()
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
  stageName: z
    .enum([
      "AUDIO",
      "ANIMATICS",
      "CHARACTER_MODELLING",
      "BLENDSHAPES",
      "CHARACTER_MODELLING_BLENDSHAPES",
      "BG_MODELLING",
      "RIGGING",
      "TEXTURING",
      "ANIMATION",
      "LIGHTING",
      "RENDER",
      "COMPOSITING",
      "EDITING",
      "CUSTOM"
    ])
    .optional(),
  customName: z.string().min(1).max(255).optional(),
  order: z.coerce.number().int().min(0).optional(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "APPROVED", "REJECTED", "ISSUE", "EXTENDED"]).optional(),
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
  priority: z.coerce.number().int().min(1).max(20),
  audioReceivedDate: isoDate.optional(),
  description: z.string().max(5000).optional().or(z.literal("")),
  stages: z.array(createProjectStageSchema).optional()
});

const updateProjectSchema = z
  .object({
    name: z.string().min(2).optional(),
    priority: z.coerce.number().int().min(1).max(20).optional(),
    audioReceivedDate: isoDate.optional(),
    description: z.string().max(5000).optional().or(z.literal(""))
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const updateStageSchema = z
  .object({
    status: z.enum(["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "APPROVED", "REJECTED", "ISSUE", "EXTENDED"]).optional(),
    deadline: isoDate.nullable().optional(),
    assignedUserId: z.coerce.number().int().positive().nullable().optional(),
    notes: z.string().max(5000).optional(),
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

const linkCharacterSchema = z.object({
  characterId: z.coerce.number().int().positive()
});

module.exports = {
  idParamSchema,
  departmentIdParamSchema,
  departmentMemberParamSchema,
  characterStageParamSchema,
  stageArtistParamSchema,
  stageDepartmentParamSchema,
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
  linkCharacterSchema
};
