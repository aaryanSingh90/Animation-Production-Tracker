/**
 * Typed wrappers around each REST endpoint. Stores call these helpers
 * rather than `api.get('/api/...')` directly so the shape lives in one place.
 */
import { api } from './client'
import type { Client, Employee, Project, TaskRow } from '../types'

// ─── Auth ───────────────────────────────────────────────────────────────────

export interface LoginResponse {
  /** Legacy field — the real session is the HttpOnly cookie. Kept for SSE which can't read cookies. */
  token: string
  user:  Employee
  /** Set when the admin issued the temp password and the user must change it. */
  mustChangePassword?: boolean
}
export interface MeResponse {
  user: Employee
  mustChangePassword?: boolean
}
export const Auth = {
  login:          (email: string, password: string) => api.post<LoginResponse>('/api/auth/login',   { email, password }),
  me:             ()                                => api.get<MeResponse>('/api/auth/me'),
  refresh:        ()                                => api.post<{ ok: true; mustChangePassword?: boolean }>('/api/auth/refresh'),
  logout:         ()                                => api.post<{ ok: true }>('/api/auth/logout'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ ok: true }>('/api/auth/change-password', { currentPassword, newPassword }),
}

// ─── Employees ──────────────────────────────────────────────────────────────

export interface EmployeeUpsert {
  name:           string
  email:          string
  password?:      string
  role:           Employee['role']
  department:     Employee['department']
  specialization?: string
  avatarColor?:   string
  active?:        boolean
}

export const Employees = {
  list:   ()                                       => api.get<{ employees: Employee[] }>('/api/employees'),
  create: (data: EmployeeUpsert)                   => api.post<{ employee: Employee }>('/api/employees', data),
  update: (id: string, patch: Partial<EmployeeUpsert>) => api.patch<{ employee: Employee }>(`/api/employees/${id}`, patch),
  remove: (id: string)                             => api.delete<{ employee: Employee }>(`/api/employees/${id}`),
}

// ─── Clients ────────────────────────────────────────────────────────────────

export interface ClientUpsert {
  name:         string
  description?: string
  contactEmail?: string
}

export const Clients = {
  list:   ()                                       => api.get<{ clients: Client[] }>('/api/clients'),
  create: (data: ClientUpsert)                     => api.post<{ client: Client }>('/api/clients', data),
  update: (id: string, patch: Partial<ClientUpsert>) => api.patch<{ client: Client }>(`/api/clients/${id}`, patch),
  remove: (id: string)                             => api.delete<{ ok: true }>(`/api/clients/${id}`),
}

// ─── Projects ───────────────────────────────────────────────────────────────

export interface ProjectUpsert {
  clientId?:   string
  name:        string
  description?: string
  folderName?:  string | null
  status?:     Project['status']
}

export const Projects = {
  list:   (clientId?: string)                      => api.get<{ projects: Project[] }>('/api/projects', clientId ? { clientId } : undefined),
  create: (data: ProjectUpsert & { clientId: string }) => api.post<{ project: Project }>('/api/projects', data),
  update: (id: string, patch: Partial<ProjectUpsert>) => api.patch<{ project: Project }>(`/api/projects/${id}`, patch),
  remove: (id: string)                             => api.delete<{ ok: true }>(`/api/projects/${id}`),
}

// ─── Tasks ──────────────────────────────────────────────────────────────────

export interface TaskCreate {
  projectId:        string
  subStageId:       string
  itemName?:        string
  shotNumber?:      string | null
  frameRange?:      string | null
  seconds?:         number | null
  assignedArtistId?: string | null
  status?:          TaskRow['status']
  startDate?:       string | null
  endDate?:         string | null
  audioStatus?:     TaskRow['audioStatus']
}

export type TaskPatch = Partial<TaskCreate> & {
  retakeNote?:   string | null
  timeConsumed?: number | null
  notes?:        string | null
  thumbnail?:    string | null
  finalOutput?:  string | null
}

export interface TaskFilter {
  projectId?:        string
  subStageId?:       string
  assignedArtistId?: string
}

export const Tasks = {
  list:    (filter?: TaskFilter)                   => api.get<{ tasks: TaskRow[] }>('/api/tasks', filter as Record<string, string | undefined>),
  create:  (data: TaskCreate)                      => api.post<{ task: TaskRow }>('/api/tasks', data),
  update:  (id: string, patch: TaskPatch)          => api.patch<{ task: TaskRow }>(`/api/tasks/${id}`, patch),
  remove:  (id: string)                            => api.delete<{ ok: true }>(`/api/tasks/${id}`),
  comment: (id: string, message: string, type?: 'note' | 'retake' | 'approval') =>
    api.post<{ comment: unknown; task: TaskRow }>(`/api/tasks/${id}/comments`, { message, type }),
}
