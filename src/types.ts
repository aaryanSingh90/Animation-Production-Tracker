// ─── Status ──────────────────────────────────────────────────────────────────

export type TaskStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'REVIEW'
  | 'APPROVED'
  | 'ISSUE'
  | 'EXTENDED'

export const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string }> = {
  NOT_STARTED: { label: 'Not Started', color: 'gray' },
  IN_PROGRESS:  { label: 'In Progress', color: 'amber' },
  REVIEW:       { label: 'In Review',   color: 'blue' },
  APPROVED:     { label: 'Approved',    color: 'green' },
  ISSUE:        { label: 'Issue / Retake', color: 'red' },
  EXTENDED:     { label: 'Extended',    color: 'purple' },
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
  status: 'ACTIVE' | 'ON_HOLD' | 'COMPLETED'
  frameRate: 24
  createdAt: string
}

// ─── Employee ─────────────────────────────────────────────────────────────────

export type EmployeeRole = 'MANAGER' | 'ARTIST' | 'LEAD'
export type EmployeeDepartment =
  | 'Animation'
  | 'Rigging'
  | 'Lighting'
  | 'FX'
  | 'Compositing'
  | 'Modelling'
  | 'Audio'
  | 'Editing'

export interface Employee {
  id: string
  name: string
  email: string
  role: EmployeeRole
  department: EmployeeDepartment
  specialization?: string
  active: boolean
  avatarColor?: string
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
  // Editing stage extras (matching Excel layout)
  audioStatus?: TaskStatus
  finalOutput?: string
  notes?: string
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
