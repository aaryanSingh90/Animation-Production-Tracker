// ─── Task Status ─────────────────────────────────────────────────────────────

export type TaskStatus =
  | 'YET_TO_START'
  | 'IN_PROGRESS'
  | 'LEAD_APPROVAL'
  | 'LEAD_RETAKE'
  | 'DONE'
  | 'FINAL_APPROVAL'

export const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  YET_TO_START:   { label: 'Yet to Start',   color: 'text-slate-400',   bg: 'bg-slate-500/10'  },
  IN_PROGRESS:    { label: 'In Progress',    color: 'text-amber-400',   bg: 'bg-amber-500/10'  },
  LEAD_APPROVAL:  { label: 'Pending Approval', color: 'text-sky-400',   bg: 'bg-sky-500/10'    },
  LEAD_RETAKE:    { label: 'Retake',           color: 'text-rose-400',  bg: 'bg-rose-500/10'   },
  DONE:           { label: 'Done',           color: 'text-teal-400',    bg: 'bg-teal-500/10'   },
  FINAL_APPROVAL: { label: 'Final Approval', color: 'text-green-400',   bg: 'bg-green-500/10'  },
}

// ─── Audio Status (Editing stage only) ───────────────────────────────────────

export type AudioStatus =
  | 'YET_TO_START'
  | 'IN_PROGRESS'
  | 'RECEIVED'
  | 'FINAL_APPROVAL'
  | 'RETAKE'
  | 'DONE_INHOUSE'
  | 'WIP_INHOUSE'
  | 'APPROVED_INHOUSE'

export const AUDIO_STATUS_CONFIG: Record<AudioStatus, { label: string; color: string; bg: string }> = {
  YET_TO_START:     { label: 'Not Started',          color: 'text-slate-400',   bg: 'bg-slate-500/10'  },
  IN_PROGRESS:      { label: 'In Progress',           color: 'text-amber-400',   bg: 'bg-amber-500/10'  },
  RECEIVED:         { label: 'Received',              color: 'text-blue-400',    bg: 'bg-blue-500/10'   },
  FINAL_APPROVAL:   { label: 'Final Approval',        color: 'text-green-400',   bg: 'bg-green-500/10'  },
  RETAKE:           { label: 'Retake',                color: 'text-rose-400',    bg: 'bg-rose-500/10'   },
  DONE_INHOUSE:     { label: 'Done Inhouse',          color: 'text-teal-400',    bg: 'bg-teal-500/10'   },
  WIP_INHOUSE:      { label: 'WIP Inhouse',           color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10'},
  APPROVED_INHOUSE: { label: 'Approved Inhouse',      color: 'text-indigo-400',  bg: 'bg-indigo-500/10' },
}

// Combined lookup for pill rendering (includes both task + audio statuses)
export const ANY_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  ...STATUS_CONFIG,
  ...AUDIO_STATUS_CONFIG,
}

// ─── Client & Project ─────────────────────────────────────────────────────────

export interface Client {
  id: string
  name: string
  description?: string
  contactEmail?: string
  createdAt: string
}

export interface Project {
  id: string
  clientId: string
  name: string
  description?: string
  folderName?: string | null
  status: 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED'
  // Per-project frame rate (defaults to 24 server-side). Typed as the literal
  // 24 originally, which wrongly told TS every project ran at 24fps; it's a
  // free-form number — calcSeconds() relies on the real value.
  frameRate: number
  createdAt: string
}

// ─── Employee ─────────────────────────────────────────────────────────────────

export type EmployeeRole = 'MANAGER' | 'ARTIST' | 'LEAD' | 'FREELANCE'
export type EmployeeDepartment =
  | 'Animation' | 'Rigging' | 'Lighting' | 'FX'
  | 'Compositing' | 'Modelling' | 'Texturing' | 'Audio' | 'Editing'

export interface Employee {
  id: string
  name: string
  email: string
  role: EmployeeRole
  department: EmployeeDepartment
  specialization?: string
  active: boolean
  avatarColor?: string
  // Password never leaves the backend — only sent to the API in create/update payloads.
}

// ─── Task Version ─────────────────────────────────────────────────────────────

export interface TaskVersion {
  id:             string
  versionNum:     number
  videoUrl:       string
  uploadedByName: string
  uploadedById?:  string | null
  createdAt:      string
}

// ─── Review Comment ───────────────────────────────────────────────────────────

export interface ReviewComment {
  id: string
  authorName: string
  authorId?: string
  avatarColor: string
  message: string
  createdAt: string
  type?: 'note' | 'retake' | 'approval'
}

// ─── Pipeline / Task ──────────────────────────────────────────────────────────

export interface StatusChange {
  from: TaskStatus
  to: TaskStatus
  changedAt: string
  changedByUserId?: string
}

export interface TaskRow {
  id: string
  subStageId: string
  projectId: string
  itemName: string
  shotNumber?: string
  frameRange?: string
  seconds?: number
  assignedArtistId: string | null
  status: TaskStatus
  startDate: string | null
  endDate: string | null
  timeConsumed?: number
  audioStatus?: AudioStatus
  finalOutput?: string
  notes?: string
  thumbnail?: string
  retakeNote?: string
  comments?: ReviewComment[]
  versions?: TaskVersion[]
  createdAt: string
  updatedAt: string
  statusHistory: StatusChange[]
}

// ─── Stage Config ─────────────────────────────────────────────────────────────

export type WorkflowType = 'ASSET' | 'SHOT'

export interface ColumnConfig {
  key: string
  label: string
  type: 'text' | 'frameRange' | 'seconds' | 'status' | 'audioStatus' | 'artist' | 'date' | 'number'
  readOnly?: boolean
  width?: number
}

export interface SubStageConfig {
  id: string
  slug: string
  name: string
  columns: ColumnConfig[]
}

export interface StageConfig {
  id: string
  slug: string
  name: string
  icon: string
  workflowType: WorkflowType
  subStages: SubStageConfig[]
}
