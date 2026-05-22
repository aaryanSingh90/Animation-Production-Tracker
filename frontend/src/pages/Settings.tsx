import { useState } from 'react'
import {
  Download, Palette, Database,
  Info,
  Users, Film, Briefcase, LayoutGrid,
} from 'lucide-react'
import { usePipelineStore } from '../store/pipelineStore'
import { useClientStore } from '../store/clientStore'
import { useEmployeeStore } from '../store/employeeStore'
import {
  STATUS_CONFIG, AUDIO_STATUS_CONFIG,
  type TaskStatus, type AudioStatus,
} from '../types'
import { StatusPill } from '../components/ui/StatusPill'
import { ExportDialog } from '../components/export/ExportDialog'

const STATUS_DESCRIPTIONS: Record<TaskStatus, string> = {
  YET_TO_START:   'Task has not been started yet.',
  IN_PROGRESS:    'Artist is actively working on this task.',
  DONE:           'Work completed by the artist — ready for manager review.',
  LEAD_APPROVAL:  'Submitted to the manager for approval.',
  LEAD_RETAKE:    'Manager has requested changes. Task needs rework.',
  FINAL_APPROVAL: 'Task fully approved and locked. No further changes.',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function Settings() {
  const tasks      = usePipelineStore(s => s.tasks)
  const clients    = useClientStore(s => s.clients)
  const projects   = useClientStore(s => s.projects)
  const employees  = useEmployeeStore(s => s.employees)
  // Used by the "Refresh from server" button; keep reference for future use
  const [refreshState, setRefreshState] = useState<'idle' | 'loading'>('idle')
  const [exportOpen, setExportOpen] = useState(false)

  async function refreshAll() {
    setRefreshState('loading')
    try {
      await Promise.all([
        useEmployeeStore.getState().refresh(),
        useClientStore.getState().refresh(),
        usePipelineStore.getState().refresh(),
      ])
    } finally {
      setRefreshState('idle')
    }
  }

  const ALL_STATUSES = Object.keys(STATUS_CONFIG) as TaskStatus[]

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* Page Header */}
        <div className="border-b border-[#1a263e] pb-5">
          <h1 className="text-xl font-black tracking-wide text-white uppercase">Settings</h1>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
            Data management, export, import &amp; pipeline reference
          </p>
        </div>

        {/* ── Database Stats ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: Film,       label: 'Tasks',     value: tasks.length,     border: 'border-indigo-500/20', bg: 'bg-indigo-500/10', color: 'text-indigo-400' },
            { icon: Briefcase,  label: 'Clients',   value: clients.length,   border: 'border-violet-500/20', bg: 'bg-violet-500/10', color: 'text-violet-400' },
            { icon: LayoutGrid, label: 'Projects',  value: projects.length,  border: 'border-cyan-500/20',   bg: 'bg-cyan-500/10',   color: 'text-cyan-400' },
            { icon: Users,      label: 'Employees', value: employees.length, border: 'border-emerald-500/20',bg: 'bg-emerald-500/10',color: 'text-emerald-400' },
          ].map(s => (
            <div key={s.label} className={`bg-[#0c1221] rounded-xl border ${s.border} p-4`}>
              <div className={`w-7 h-7 rounded-md ${s.bg} flex items-center justify-center mb-2`}>
                <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
              </div>
              <div className="text-2xl font-black text-white">{s.value}</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Export & Sync ───────────────────────────────────────────────── */}
        <div className="bg-[#0c1221] rounded-xl border border-[#1b253b] p-5 space-y-4">
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-wide">Data Export &amp; Sync</h2>
            <p className="text-xs text-slate-400 mt-1">
              Choose what to export — the whole studio, a single client, or one project. Each pipeline stage gets its own sheet for clean review.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => setExportOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-md shadow-indigo-950/50"
            >
              <Download className="w-3.5 h-3.5" /> Export…
            </button>
            <button
              onClick={refreshAll}
              disabled={refreshState === 'loading'}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-300 bg-[#111827] border border-[#1b253b] hover:border-indigo-500/50 hover:text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Database className="w-3.5 h-3.5" />
              {refreshState === 'loading' ? 'Refreshing…' : 'Refresh from Server'}
            </button>
          </div>

          {/* Info note */}
          <div className="flex items-start gap-2 text-xs text-slate-500">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              All data lives on the backend Postgres database. Changes by other users arrive in real-time over the SSE stream.
              Use <strong className="text-slate-400">Refresh from Server</strong> only if you suspect a sync glitch.
            </span>
          </div>
        </div>

        {/* Export modal */}
        <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />

        {/* ── Status Reference ───────────────────────────────────────────── */}
        <div className="bg-[#0c1221] rounded-xl border border-[#1b253b] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-black text-white uppercase tracking-wide">Task Status Reference</h2>
          </div>

          <div className="space-y-2">
            {ALL_STATUSES.map(s => (
              <div key={s} className="flex items-center gap-4 p-3 rounded-lg bg-[#080d1a] border border-[#1a263e]">
                <div className="w-32 shrink-0">
                  <StatusPill status={s} />
                </div>
                <p className="text-xs text-slate-400">{STATUS_DESCRIPTIONS[s]}</p>
              </div>
            ))}
          </div>

          {/* Audio statuses */}
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 mt-2">
              Audio Status (Editing stage only)
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(AUDIO_STATUS_CONFIG) as AudioStatus[]).map(s => (
                <div key={s} className="flex items-center gap-2 p-2.5 rounded-lg bg-[#080d1a] border border-[#1a263e]">
                  <StatusPill status={s} size="sm" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── About ──────────────────────────────────────────────────────── */}
        <div className="bg-[#0c1221] rounded-xl border border-[#1b253b] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-black text-white uppercase tracking-wide">About</h2>
          </div>
          <div className="space-y-2 text-xs text-slate-400">
            <div className="flex items-center justify-between py-1.5 border-b border-[#1a263e]">
              <span className="text-slate-500 uppercase tracking-wider font-bold">App</span>
              <span className="text-slate-300 font-medium">Animation Pipeline Tracker v2</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-[#1a263e]">
              <span className="text-slate-500 uppercase tracking-wider font-bold">Storage</span>
              <span className="text-slate-300 font-medium">IndexedDB via Dexie.js</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-[#1a263e]">
              <span className="text-slate-500 uppercase tracking-wider font-bold">Records</span>
              <span className="text-slate-300 font-medium">
                {tasks.length} tasks · {clients.length} clients · {projects.length} projects · {employees.length} employees
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-slate-500 uppercase tracking-wider font-bold">Stack</span>
              <span className="text-slate-300 font-medium">React 18 · Zustand · Dexie · TanStack</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
