/**
 * Scoped, multi-sheet Excel exporter.
 *
 * Replaces the previous "dump everything into 4 raw sheets" behaviour.
 * Builds a workbook tailored to the user's scope (studio / client / project)
 * with one sheet per pipeline stage + optional Summary / Comments / History.
 */
import * as XLSX from 'xlsx'
import type { TaskRow, Client, Project, Employee, ReviewComment, StatusChange } from '../types'
import { STAGE_CONFIGS, SUB_STAGE_MAP } from '../config/stageConfigs'
import { STATUS_CONFIG, AUDIO_STATUS_CONFIG } from '../types'

export type ExportScope =
  | { type: 'studio' }
  | { type: 'client'; clientId: string }
  | { type: 'project'; projectId: string }

export interface ExportOptions {
  scope:                ExportScope
  includeSummary?:      boolean
  includeTasks?:        boolean   // one sheet per stage
  includeComments?:     boolean
  includeStatusHistory?: boolean
  includeTeam?:         boolean
}

interface ExportData {
  tasks:     TaskRow[]
  clients:   Client[]
  projects:  Project[]
  employees: Employee[]
}

// ─── Public entry point ─────────────────────────────────────────────────────

export function buildAndDownloadExport(opts: ExportOptions, data: ExportData) {
  const scoped = scopeData(opts.scope, data)
  const wb = XLSX.utils.book_new()

  if (opts.includeSummary !== false) {
    appendSummary(wb, scoped)
  }

  if (opts.includeTasks !== false) {
    appendStageSheets(wb, scoped)
  }

  if (opts.includeComments !== false) {
    appendComments(wb, scoped)
  }

  if (opts.includeStatusHistory !== false) {
    appendStatusHistory(wb, scoped)
  }

  if (opts.includeTeam) {
    appendTeam(wb, scoped, data.employees)
  }

  const filename = buildFilename(opts.scope, scoped)
  XLSX.writeFile(wb, filename)
}

// ─── Scope filtering ────────────────────────────────────────────────────────

interface ScopedData extends ExportData {
  scopeName: string  // human-friendly name for filename
}

function scopeData(scope: ExportScope, data: ExportData): ScopedData {
  if (scope.type === 'project') {
    const project = data.projects.find(p => p.id === scope.projectId)
    if (!project) throw new Error('Project not found')
    const projects = [project]
    const clients = data.clients.filter(c => c.id === project.clientId)
    const tasks = data.tasks.filter(t => t.projectId === scope.projectId)
    return { tasks, clients, projects, employees: data.employees, scopeName: project.name }
  }
  if (scope.type === 'client') {
    const client = data.clients.find(c => c.id === scope.clientId)
    if (!client) throw new Error('Client not found')
    const clients = [client]
    const projects = data.projects.filter(p => p.clientId === scope.clientId)
    const projectIds = new Set(projects.map(p => p.id))
    const tasks = data.tasks.filter(t => projectIds.has(t.projectId))
    return { tasks, clients, projects, employees: data.employees, scopeName: client.name }
  }
  return { ...data, scopeName: 'studio' }
}

// ─── Sheet builders ─────────────────────────────────────────────────────────

function appendSummary(wb: XLSX.WorkBook, d: ScopedData) {
  const rows: Record<string, unknown>[] = []

  // Top metadata
  rows.push({ Field: 'Generated', Value: new Date().toLocaleString() })
  rows.push({ Field: 'Total projects', Value: d.projects.length })
  rows.push({ Field: 'Total tasks',    Value: d.tasks.length })
  rows.push({ Field: 'Approved tasks', Value: d.tasks.filter(t => t.status === 'FINAL_APPROVAL').length })
  rows.push({}) // blank separator

  // Per-project breakdown
  for (const p of d.projects) {
    const client = d.clients.find(c => c.id === p.clientId)
    const pTasks = d.tasks.filter(t => t.projectId === p.id)
    const approved = pTasks.filter(t => t.status === 'FINAL_APPROVAL').length
    const pct = pTasks.length ? Math.round((approved / pTasks.length) * 100) : 0

    rows.push({
      Client:           client?.name ?? '—',
      Project:          p.name,
      'Status':         p.status,
      'Total Tasks':    pTasks.length,
      'Approved':       approved,
      'In Progress':    pTasks.filter(t => t.status === 'IN_PROGRESS').length,
      'In Review':      pTasks.filter(t => t.status === 'LEAD_APPROVAL').length,
      'Retakes':        pTasks.filter(t => t.status === 'LEAD_RETAKE').length,
      'Completion %':   pct,
    })
  }

  const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: false })
  // Auto-size columns
  ws['!cols'] = autoCols(rows)
  XLSX.utils.book_append_sheet(wb, ws, 'Summary')
}

function appendStageSheets(wb: XLSX.WorkBook, d: ScopedData) {
  for (const stage of STAGE_CONFIGS) {
    const stageTasks = d.tasks.filter(t => stage.subStages.some(ss => ss.id === t.subStageId))
    if (stageTasks.length === 0) continue   // skip empty stages

    const isShot = stage.workflowType === 'SHOT'
    const isEditing = stage.id === 'editing'

    const rows = stageTasks.map(t => {
      const sub     = SUB_STAGE_MAP[t.subStageId]
      const project = d.projects.find(p => p.id === t.projectId)
      const client  = project ? d.clients.find(c => c.id === project.clientId) : null
      const artist  = d.employees.find(e => e.id === t.assignedArtistId)

      const row: Record<string, unknown> = {
        Client:      client?.name ?? '',
        Project:     project?.name ?? '',
        'Sub-stage': sub?.name ?? '',
      }

      if (isShot) {
        row['Shot No.']    = t.shotNumber ?? ''
        row['Frame Range'] = t.frameRange ?? ''
        row['Seconds']     = t.seconds != null ? Number(t.seconds.toFixed(1)) : ''
      }
      row['Item Name'] = t.itemName
      row['Status']    = STATUS_CONFIG[t.status]?.label ?? t.status
      row['Artist']    = artist?.name ?? ''
      row['Start Date'] = formatDateTime(t.startDate)
      row['End Date']   = formatDateTime(t.endDate)
      if (isEditing) {
        row['Audio Status'] = t.audioStatus ? (AUDIO_STATUS_CONFIG[t.audioStatus]?.label ?? t.audioStatus) : ''
        row['Final Output'] = t.finalOutput ?? ''
      }
      if (t.retakeNote) row['Retake Note'] = t.retakeNote
      if (t.notes)      row['Notes']       = t.notes
      return row
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = autoCols(rows)
    const sheetName = sanitizeSheetName(stage.name)
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }
}

function appendComments(wb: XLSX.WorkBook, d: ScopedData) {
  type Row = { 'Project': string; 'Task': string; 'Stage': string; 'Type': string; 'Author': string; 'Comment': string; 'Date': string }
  const rows: Row[] = []
  for (const t of d.tasks) {
    const comments = (t.comments ?? []) as ReviewComment[]
    for (const cmt of comments) {
      const project = d.projects.find(p => p.id === t.projectId)
      rows.push({
        Project: project?.name ?? '',
        Task:    t.itemName,
        Stage:   SUB_STAGE_MAP[t.subStageId]?.name ?? t.subStageId,
        Type:    cmt.type ?? 'note',
        Author:  cmt.authorName,
        Comment: cmt.message,
        Date:    formatDateTime(cmt.createdAt),
      })
    }
  }
  if (rows.length === 0) return
  // Sort by date desc so the newest activity is at the top
  rows.sort((a, b) => b.Date.localeCompare(a.Date))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = autoCols(rows)
  XLSX.utils.book_append_sheet(wb, ws, 'Comments')
}

function appendStatusHistory(wb: XLSX.WorkBook, d: ScopedData) {
  type Row = { 'Project': string; 'Task': string; 'Stage': string; 'From': string; 'To': string; 'By': string; 'Date': string }
  const rows: Row[] = []
  for (const t of d.tasks) {
    const history = (t.statusHistory ?? []) as StatusChange[]
    for (const h of history) {
      const project = d.projects.find(p => p.id === t.projectId)
      const actor   = d.employees.find(e => e.id === h.changedByUserId)
      rows.push({
        Project: project?.name ?? '',
        Task:    t.itemName,
        Stage:   SUB_STAGE_MAP[t.subStageId]?.name ?? t.subStageId,
        From:    STATUS_CONFIG[h.from]?.label ?? h.from,
        To:      STATUS_CONFIG[h.to]?.label   ?? h.to,
        By:      actor?.name ?? '—',
        Date:    formatDateTime(h.changedAt),
      })
    }
  }
  if (rows.length === 0) return
  rows.sort((a, b) => b.Date.localeCompare(a.Date))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = autoCols(rows)
  XLSX.utils.book_append_sheet(wb, ws, 'Status History')
}

function appendTeam(wb: XLSX.WorkBook, d: ScopedData, allEmployees: Employee[]) {
  // Only employees relevant to the scope: anyone who touches a task in scope.
  const inScopeIds = new Set(
    d.tasks.map(t => t.assignedArtistId).filter((id): id is string => Boolean(id))
  )
  const managers = allEmployees.filter(e => e.role === 'MANAGER').map(e => e.id)
  managers.forEach(id => inScopeIds.add(id))

  const rows = allEmployees
    .filter(e => inScopeIds.has(e.id))
    .map(e => ({
      Name:       e.name,
      Email:      e.email,
      Role:       e.role,
      Department: e.department,
      Active:     e.active ? 'Yes' : 'No',
    }))
  if (rows.length === 0) return
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = autoCols(rows)
  XLSX.utils.book_append_sheet(wb, ws, 'Team')
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sanitizeSheetName(name: string): string {
  // Excel limits: 31 chars, no : / \ ? * [ ]
  return name.replace(/[*?/\\:[\]]/g, '').slice(0, 31)
}

function buildFilename(scope: ExportScope, d: ScopedData): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'export'
  const date = new Date().toISOString().slice(0, 10)
  const tag  = scope.type === 'studio' ? 'studio' : slug(d.scopeName)
  return `shothub-${tag}-${date}.xlsx`
}

function formatDateTime(d: string | null | undefined): string {
  if (!d) return ''
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  // ISO-ish but human-readable: 2026-05-22 14:30
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

/** Auto-size columns based on the widest cell in each. */
function autoCols(rows: Record<string, unknown>[]): { wch: number }[] {
  if (rows.length === 0) return []
  const headers = Array.from(new Set(rows.flatMap(r => Object.keys(r))))
  return headers.map(h => {
    const max = Math.max(
      h.length,
      ...rows.map(r => String(r[h] ?? '').length),
    )
    return { wch: Math.min(60, Math.max(8, max + 2)) }
  })
}
