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

  // The Rhymes Overview is always the first sheet — it's the at-a-glance
  // master view the client's existing Excel template (`IP 2 Arvind ji.xlsx`)
  // uses: one row per project, one column per stage status + deadline.
  appendRhymesOverview(wb, scoped)
  appendCharacterSheet(wb, scoped)

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

  // BUG-45: every sheet builder skips when it has no rows, so an export over an
  // empty scope (or with all optional sheets disabled) can end up with ZERO
  // sheets — and XLSX.writeFile throws an opaque "Workbook is empty" error.
  // Guarantee at least one sheet with a clear, human message instead.
  if (wb.SheetNames.length === 0) {
    const ws = XLSX.utils.json_to_sheet([
      { Info: 'No data in the selected scope.' },
      { Info: 'Nothing matched this client / project, or the chosen sheets had no rows.' },
    ])
    ws['!cols'] = [{ wch: 70 }]
    XLSX.utils.book_append_sheet(wb, ws, 'No Data')
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

/**
 * "Rhymes Overview" — matches the existing Excel template the studio has been
 * using internally (one row per rhyme/project, one column per pipeline-stage
 * status + deadline + responsible artist). This is the at-a-glance view the
 * production manager uses for daily standups.
 *
 * Column names intentionally mirror the client's source file so the team can
 * keep using the same vocabulary they're used to ("Audio Recevied", etc.).
 */
function appendRhymesOverview(wb: XLSX.WorkBook, d: ScopedData) {
  // BUG-45: don't emit an empty "Rhymes Overview" sheet when there are no
  // projects in scope — that produced a confusing blank tab. The No-Data guard
  // in buildAndDownloadExport covers the truly-empty case instead.
  if (d.projects.length === 0) return
  const rows = d.projects.map((project, idx) => {
    const projectTasks = d.tasks.filter(t => t.projectId === project.id)
    const tasksAt      = (subStageId: string) => projectTasks.filter(t => t.subStageId === subStageId)

    // Helper: roll up a list of tasks into a single status word.
    function statusOf(list: TaskRow[]): string {
      if (list.length === 0) return ''
      if (list.every(t => t.status === 'FINAL_APPROVAL' || t.status === 'DONE')) return 'Done'
      if (list.some(t => t.status === 'LEAD_RETAKE'))   return 'Retake'
      if (list.some(t => t.status === 'LEAD_APPROVAL')) return 'In Review'
      if (list.some(t => t.status === 'IN_PROGRESS'))   return 'WIP'
      return 'Yet to Start'
    }
    // Helper: latest end-date in a list, formatted dd-MM-yyyy to match template.
    function deadlineOf(list: TaskRow[]): string {
      const dates = list.map(t => t.endDate).filter((x): x is string => !!x)
      if (dates.length === 0) return ''
      const max = dates.sort().slice(-1)[0]
      return formatDateOnly(max)
    }
    // Helper: most-assigned artist across a list of tasks.
    function artistOf(list: TaskRow[]): string {
      const counts: Record<string, number> = {}
      for (const t of list) {
        if (!t.assignedArtistId) continue
        counts[t.assignedArtistId] = (counts[t.assignedArtistId] ?? 0) + 1
      }
      const topId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]
      return d.employees.find(e => e.id === topId)?.name ?? ''
    }

    const audio       = tasksAt('audio-audio')
    const animatics   = tasksAt('animatics-animatics')
    const chModel     = tasksAt('modelling-character')
    const blendshapes = tasksAt('modelling-character-blendshapes')
    const bgModel     = tasksAt('modelling-bg')
    const rigging     = projectTasks.filter(t => t.subStageId.startsWith('rigging-'))
    const texturing   = projectTasks.filter(t => t.subStageId.startsWith('texturing-'))
    const animation   = tasksAt('animation-animation')
    const lighting    = tasksAt('lighting-lighting')
    const compositing = tasksAt('compositing-compositing')
    const editing     = tasksAt('editing-editing')

    // Audio "Received" = any audio task that's gone past YET_TO_START.
    const audioReceived = audio.length === 0
      ? ''
      : audio.some(t => t.status !== 'YET_TO_START') ? 'Received' : ''

    // Thumbnail = "Yes" if any task on this project carries a thumbnail.
    const hasThumbnail = projectTasks.some(t => t.thumbnail)

    // Editing in/out — start / end of editing tasks.
    const editingStart = editing.map(t => t.startDate).filter((x): x is string => !!x).sort()[0]
    const editingEnd   = editing.map(t => t.endDate).filter((x): x is string => !!x).sort().slice(-1)[0]

    return {
      'Sr No.':              idx + 1,
      'Rhymes Name':         project.name,
      'Audio Recevied':      audioReceived,
      'Priority':            '',
      'Animatics Staus':     statusOf(animatics),
      'Artist Name':         artistOf(animatics),
      'Ch Modelling Status': statusOf(chModel),
      'Ch Modelling Deadline': deadlineOf(chModel),
      'Blendshapes Status':  statusOf(blendshapes),
      'Blendshapes Deadline': deadlineOf(blendshapes),
      'Bg Modelling Status': statusOf(bgModel),
      'Bg Modelling Deadline': deadlineOf(bgModel),
      'Rigging Status':      statusOf(rigging),
      'Rigging Deadline':    deadlineOf(rigging),
      'Texturing Status':    statusOf(texturing),
      'Anim Status':         statusOf(animation),
      'Lighting Status':     statusOf(lighting),
      'Lighting Artist':     artistOf(lighting),
      'Render Status':       statusOf(lighting),     // proxy until we add a Render stage
      'Comping':             statusOf(compositing),
      'Comp Out Date':       deadlineOf(compositing),
      'Thumbnail':           hasThumbnail ? 'Yes' : '',
      'Editing In':          editingStart ? formatDateOnly(editingStart) : '',
      'Editing Out':         editingEnd   ? formatDateOnly(editingEnd)   : '',
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = autoCols(rows)
  // Freeze the header row + the first two id columns so users can scroll
  // horizontally without losing the project name.
  ws['!freeze'] = { xSplit: 2, ySplit: 1 }
  XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(wb, 'Rhymes Overview'))
}

/**
 * Character Sheet — one row per character/asset across the scope. Tracks the
 * character's progress through Modelling → Blendshapes → Texturing → Rigging
 * (the four character-pipeline sub-stages) and shows the latest deadline at
 * each step. Mirrors the "Character Sheet" tab in the client's template.
 */
function appendCharacterSheet(wb: XLSX.WorkBook, d: ScopedData) {
  // Group character-pipeline tasks by character name (per project so the same
  // name across two rhymes shows up as two rows).
  type Key = string
  const groups: Record<Key, { name: string; project: string; tasks: TaskRow[] }> = {}
  for (const t of d.tasks) {
    if (
      t.subStageId !== 'modelling-character' &&
      t.subStageId !== 'modelling-character-blendshapes' &&
      t.subStageId !== 'texturing-character' &&
      t.subStageId !== 'rigging-character'
    ) continue
    const project = d.projects.find(p => p.id === t.projectId)
    if (!project) continue
    const key = `${project.id}::${t.itemName.trim().toLowerCase()}`
    if (!groups[key]) groups[key] = { name: t.itemName, project: project.name, tasks: [] }
    groups[key].tasks.push(t)
  }

  function status(tasks: TaskRow[]): string {
    if (tasks.length === 0) return ''
    if (tasks.every(t => t.status === 'FINAL_APPROVAL' || t.status === 'DONE')) return 'Done'
    if (tasks.some(t => t.status === 'LEAD_RETAKE')) return 'Retake'
    if (tasks.some(t => t.status === 'IN_PROGRESS')) return 'WIP'
    return ''
  }
  function deadline(tasks: TaskRow[]): string {
    const dates = tasks.map(t => t.endDate).filter((x): x is string => !!x).sort()
    return dates.length ? formatDateOnly(dates.slice(-1)[0]) : ''
  }

  const rows = Object.values(groups)
    .sort((a, b) => a.project.localeCompare(b.project) || a.name.localeCompare(b.name))
    .map((g, idx) => {
      const modelling   = g.tasks.filter(t => t.subStageId === 'modelling-character')
      const blendshapes = g.tasks.filter(t => t.subStageId === 'modelling-character-blendshapes')
      const texturing   = g.tasks.filter(t => t.subStageId === 'texturing-character')
      const rigging     = g.tasks.filter(t => t.subStageId === 'rigging-character')
      return {
        'S No.':          idx + 1,
        'Character Names': g.name,
        'Project':        g.project,
        'Refrence':       g.tasks.some(t => t.thumbnail) ? 'Done' : '',
        'Modelling':      status(modelling),
        'Blendshapes':    status(blendshapes),
        'Blendshapes Deadline': deadline(blendshapes),
        'Texturing':      status(texturing),
        'Texturing Deadline': deadline(texturing),
        'Rigging':        status(rigging),
        'Rigging Deadline': deadline(rigging),
      }
    })

  if (rows.length === 0) return       // nothing to write
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = autoCols(rows)
  ws['!freeze'] = { xSplit: 3, ySplit: 1 }
  XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(wb, 'Character Sheet'))
}

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
  XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(wb, 'Summary'))
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
    XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(wb, stage.name))
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
  XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(wb, 'Comments'))
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
  XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(wb, 'Status History'))
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
  XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(wb, 'Team'))
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sanitizeSheetName(name: string): string {
  // Excel limits: 31 chars, no : / \ ? * [ ]
  return name.replace(/[*?/\\:[\]]/g, '').slice(0, 31)
}

/**
 * BUG-43: Excel forbids two sheets with the same name and XLSX.book_append_sheet
 * THROWS on a collision — aborting the whole export. Stage names truncated to 31
 * chars (or a stage that happens to share a name with a fixed sheet like
 * "Summary"/"Team") can collide. Return a sanitized name that's guaranteed
 * unique within this workbook, appending " (2)", " (3)", … and trimming so the
 * result still respects the 31-char cap.
 */
function uniqueSheetName(wb: XLSX.WorkBook, desired: string): string {
  const base = sanitizeSheetName(desired) || 'Sheet'
  const existing = new Set(wb.SheetNames)
  if (!existing.has(base)) return base
  for (let i = 2; i < 1000; i++) {
    const suffix = ` (${i})`
    const candidate = base.slice(0, 31 - suffix.length) + suffix
    if (!existing.has(candidate)) return candidate
  }
  // Pathological fallback — should never be reached in practice.
  return `${base.slice(0, 24)} (${Date.now() % 100000})`.slice(0, 31)
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

/** Day-precision date in dd-MM-yyyy form to match the client's template style. */
function formatDateOnly(d: string | null | undefined): string {
  if (!d) return ''
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(dt.getDate())}-${pad(dt.getMonth() + 1)}-${dt.getFullYear()}`
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
