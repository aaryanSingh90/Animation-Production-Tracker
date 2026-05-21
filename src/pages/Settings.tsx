import { useRef } from 'react'
import { Download, Upload, Palette, Info } from 'lucide-react'
import { usePipelineStore } from '../store/pipelineStore'
import { useClientStore } from '../store/clientStore'
import { useEmployeeStore } from '../store/employeeStore'
import { STATUS_CONFIG, type TaskStatus } from '../types'
import { StatusPill } from '../components/ui/StatusPill'
import * as XLSX from 'xlsx'

const STATUS_DESCRIPTIONS: Record<TaskStatus, string> = {
  NOT_STARTED: 'Task has not been started yet.',
  IN_PROGRESS: 'Artist is actively working on this task.',
  REVIEW: 'Task submitted for review by lead/manager.',
  APPROVED: 'Task fully approved and complete.',
  ISSUE: 'Issue raised. Task requires a retake.',
  EXTENDED: 'Task deadline has been extended.',
}

const ALL_STATUSES = Object.keys(STATUS_CONFIG) as TaskStatus[]

export function Settings() {
  const tasks = usePipelineStore(s => s.tasks)
  const clients = useClientStore(s => s.clients)
  const projects = useClientStore(s => s.projects)
  const employees = useEmployeeStore(s => s.employees)
  const fileRef = useRef<HTMLInputElement>(null)

  function exportAll() {
    const wb = XLSX.utils.book_new()

    const taskData = tasks.map(t => ({
      ID: t.id,
      'Sub Stage': t.subStageId,
      Project: projects.find(p => p.id === t.projectId)?.name ?? t.projectId,
      'Item Name': t.itemName,
      'Shot No': t.shotNumber ?? '',
      'Frame Range': t.frameRange ?? '',
      Seconds: t.seconds ?? '',
      Artist: employees.find(e => e.id === t.assignedArtistId)?.name ?? '',
      Status: STATUS_CONFIG[t.status].label,
      'Start Date': t.startDate ?? '',
      'End Date': t.endDate ?? '',
      'Time (hrs)': t.timeConsumed ?? '',
      Notes: t.notes ?? '',
    }))

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(taskData), 'Tasks')

    const clientData = clients.map(c => ({ ID: c.id, Name: c.name, Email: c.contactEmail ?? '', Description: c.description ?? '' }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clientData), 'Clients')

    const projectData = projects.map(p => ({ ID: p.id, Client: clients.find(c => c.id === p.clientId)?.name ?? '', Name: p.name, Status: p.status }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projectData), 'Projects')

    const empData = employees.map(e => ({ ID: e.id, Name: e.name, Email: e.email, Role: e.role, Department: e.department, Specialization: e.specialization ?? '' }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(empData), 'Employees')

    XLSX.writeFile(wb, `animation-pipeline-export-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Export, import, and app configuration</p>
      </div>

      {/* Export / Import */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Data Export &amp; Import</h2>
        <p className="text-sm text-gray-500 mb-4">Export all data as a multi-sheet Excel file, or import from a compatible file.</p>
        <div className="flex gap-3">
          <button
            onClick={exportAll}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
          >
            <Download className="w-4 h-4" /> Export to Excel
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg"
          >
            <Upload className="w-4 h-4" /> Import Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={() => {}} />
        </div>
        <div className="mt-3 text-xs text-gray-400 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Export includes Tasks, Clients, Projects, and Employees sheets.
        </div>
      </div>

      {/* Status legend */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Palette className="w-4 h-4 text-gray-500" />
          <h2 className="text-base font-semibold text-gray-900">Status Reference</h2>
        </div>
        <div className="space-y-3">
          {ALL_STATUSES.map(s => (
            <div key={s} className="flex items-center gap-4">
              <div className="w-28 shrink-0">
                <StatusPill status={s} />
              </div>
              <p className="text-sm text-gray-500">{STATUS_DESCRIPTIONS[s]}</p>
            </div>
          ))}
        </div>
      </div>

      {/* App info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-3">About</h2>
        <div className="text-sm text-gray-600 space-y-1">
          <p><strong>Animation Pipeline Tracker</strong> v2</p>
          <p>Data stored locally in your browser via localStorage.</p>
          <p className="text-xs text-gray-400 mt-2">
            {tasks.length} tasks · {clients.length} clients · {projects.length} projects · {employees.length} employees
          </p>
        </div>
      </div>
    </div>
  )
}
