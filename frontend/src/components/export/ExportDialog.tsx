import { useState, useMemo } from 'react'
import { X, Download, Building, Briefcase, Layers, FileText, MessageSquare, Clock, Users } from 'lucide-react'
import { clsx } from 'clsx'
import { useClientStore } from '../../store/clientStore'
import { usePipelineStore } from '../../store/pipelineStore'
import { useEmployeeStore } from '../../store/employeeStore'
import { useToastStore } from '../../store/toastStore'
import { buildAndDownloadExport, type ExportScope } from '../../utils/exportXlsx'

interface Props {
  open:    boolean
  onClose: () => void
}

type ScopeType = 'studio' | 'client' | 'project'

export function ExportDialog({ open, onClose }: Props) {
  const clients        = useClientStore(s => s.clients)
  const projects       = useClientStore(s => s.projects)
  const tasks          = usePipelineStore(s => s.tasks)
  const employees      = useEmployeeStore(s => s.employees)
  const pushToast      = useToastStore(s => s.push)
  // BUG-11: Used to pre-load tasks for all in-scope projects before export.
  const loadForProject = usePipelineStore(s => s.loadForProject)

  const [scopeType, setScopeType] = useState<ScopeType>('studio')
  const [clientId,  setClientId]  = useState<string>(clients[0]?.id ?? '')
  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? '')

  // Sheets to include
  const [incSummary,  setIncSummary]  = useState(true)
  const [incTasks,    setIncTasks]    = useState(true)
  const [incComments, setIncComments] = useState(true)
  const [incHistory,  setIncHistory]  = useState(true)
  const [incTeam,     setIncTeam]     = useState(false)

  const [exporting, setExporting]     = useState(false)

  // Filter project list when client scope is active so the dropdown narrows
  const projectsForClient = useMemo(() => {
    if (scopeType === 'client') return projects.filter(p => p.clientId === clientId)
    return projects
  }, [projects, scopeType, clientId])

  // Live counts in the modal so the user knows what they're about to grab
  const counts = useMemo(() => {
    let scopedTasks = tasks
    let projectCount = projects.length
    if (scopeType === 'client') {
      const pIds = new Set(projects.filter(p => p.clientId === clientId).map(p => p.id))
      scopedTasks = tasks.filter(t => pIds.has(t.projectId))
      projectCount = pIds.size
    } else if (scopeType === 'project') {
      scopedTasks = tasks.filter(t => t.projectId === projectId)
      projectCount = 1
    }
    const totalComments = scopedTasks.reduce((acc, t) => acc + (t.comments?.length ?? 0), 0)
    const totalHistory  = scopedTasks.reduce((acc, t) => acc + (t.statusHistory?.length ?? 0), 0)
    return {
      projects: projectCount,
      tasks: scopedTasks.length,
      comments: totalComments,
      history: totalHistory,
    }
  }, [tasks, projects, scopeType, clientId, projectId])

  if (!open) return null

  async function handleExport() {
    if (exporting) return
    setExporting(true)
    try {
      // BUG-11: Ensure all in-scope project tasks are loaded before building the
      // spreadsheet. Managers load tasks lazily (per sub-stage), so an export
      // without this step would be missing tasks from unvisited stages.
      const projectsInScope =
        scopeType === 'studio'  ? projects
      : scopeType === 'client'  ? projects.filter(p => p.clientId === clientId)
      :                            projects.filter(p => p.id === projectId)
      await Promise.all(projectsInScope.map(p => loadForProject(p.id)))

      // Read fresh from the store after loading to get all newly fetched tasks.
      const freshTasks = usePipelineStore.getState().tasks

      const scope: ExportScope =
        scopeType === 'studio'  ? { type: 'studio' }
      : scopeType === 'client'  ? { type: 'client',  clientId }
      :                            { type: 'project', projectId }

      buildAndDownloadExport({
        scope,
        includeSummary:       incSummary,
        includeTasks:         incTasks,
        includeComments:      incComments,
        includeStatusHistory: incHistory,
        includeTeam:          incTeam,
      }, { tasks: freshTasks, clients, projects, employees })

      pushToast({
        kind: 'approval',
        title: 'Export ready',
        body:  `${counts.tasks} task${counts.tasks === 1 ? '' : 's'} written to Excel — check your downloads.`,
        ttl: 3500,
      })
      onClose()
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err)
      pushToast({
        kind: 'error',
        title: 'Export failed',
        body:  err instanceof Error ? err.message : 'Something went wrong while generating the workbook.',
        ttl: 5000,
      })
    } finally {
      setExporting(false)
    }
  }

  const canExport =
    (scopeType === 'studio') ||
    (scopeType === 'client'  && !!clientId) ||
    (scopeType === 'project' && !!projectId)

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#0c1221] border border-[#1b253b] rounded-xl shadow-2xl shadow-black/60 p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-indigo-500/15 flex items-center justify-center">
              <Download className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wide">Export Data</h2>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Choose what to include in the Excel file</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close export dialog"
            title="Close"
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-200 hover:bg-[#131b2e] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scope picker */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">What to export</label>
          <div className="grid grid-cols-3 gap-2">
            <ScopeButton icon={Building}  label="Entire studio" active={scopeType === 'studio'}  onClick={() => setScopeType('studio')} />
            <ScopeButton icon={Briefcase} label="One client"    active={scopeType === 'client'}  onClick={() => setScopeType('client')} />
            <ScopeButton icon={Layers}    label="One project"   active={scopeType === 'project'} onClick={() => setScopeType('project')} />
          </div>

          {scopeType === 'client' && (
            <select
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-xs bg-[#0a0f1b] border border-[#1b253b] rounded-md text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              {clients.map(c => <option key={c.id} value={c.id} className="bg-[#0a0f1b]">{c.name}</option>)}
            </select>
          )}

          {scopeType === 'project' && (
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-xs bg-[#0a0f1b] border border-[#1b253b] rounded-md text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              {projectsForClient.map(p => {
                const client = clients.find(c => c.id === p.clientId)
                return <option key={p.id} value={p.id} className="bg-[#0a0f1b]">{p.name}{client ? ` — ${client.name}` : ''}</option>
              })}
            </select>
          )}
        </div>

        {/* Sheets to include */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Which sheets to include</label>
          <div className="space-y-1.5">
            <SheetToggle icon={FileText}      label="Project summary"  hint="Counts + completion % per project" checked={incSummary}  onChange={setIncSummary} />
            <SheetToggle icon={Layers}        label="Tasks by stage"    hint="One sheet per pipeline stage (Audio, Animatics, Modelling…)" checked={incTasks}    onChange={setIncTasks} />
            <SheetToggle icon={MessageSquare} label="Comments & retake notes" hint="All feedback / approval / retake messages" checked={incComments} onChange={setIncComments} />
            <SheetToggle icon={Clock}         label="Status history"    hint="Full audit trail of status transitions" checked={incHistory}  onChange={setIncHistory} />
            <SheetToggle icon={Users}         label="Team roster"       hint="Only artists touching tasks in scope + managers (off by default)" checked={incTeam}     onChange={setIncTeam} />
          </div>
        </div>

        {/* Preview counts */}
        <div className="bg-[#080d1a] border border-[#1a263e] rounded-md px-3 py-2.5">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Preview</p>
          <div className="flex items-center gap-4 text-[11px] font-mono">
            <span className="text-indigo-400">{counts.projects} project{counts.projects !== 1 ? 's' : ''}</span>
            <span className="text-slate-400">·</span>
            <span className="text-amber-400">{counts.tasks} task{counts.tasks !== 1 ? 's' : ''}</span>
            {incComments && (
              <>
                <span className="text-slate-400">·</span>
                <span className="text-sky-400">{counts.comments} comment{counts.comments !== 1 ? 's' : ''}</span>
              </>
            )}
            {incHistory && (
              <>
                <span className="text-slate-400">·</span>
                <span className="text-violet-400">{counts.history} history entr{counts.history === 1 ? 'y' : 'ies'}</span>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2 border-t border-[#1b253b]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 border border-[#1b253b] hover:bg-[#131b2e] rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={!canExport || exporting || counts.tasks === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider text-white bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 rounded-lg transition-all shadow-md shadow-indigo-950/40 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" /> {exporting ? 'Generating…' : 'Export Excel'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ScopeButton({ icon: Icon, label, active, onClick }: { icon: typeof Building; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex flex-col items-center justify-center gap-1.5 px-3 py-3 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all',
        active
          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
          : 'border-[#1b253b] bg-[#0a0f1b] text-slate-400 hover:border-slate-600 hover:text-slate-200'
      )}
    >
      <Icon className="w-4 h-4" />
      <span className="text-[10px]">{label}</span>
    </button>
  )
}

function SheetToggle({ icon: Icon, label, hint, checked, onChange }: { icon: typeof FileText; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 px-3 py-2 bg-[#0a0f1b] border border-[#1b253b] rounded-md cursor-pointer hover:border-slate-700 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-slate-700 bg-[#0d1424] text-indigo-600 focus:ring-indigo-500 focus:ring-offset-[#0c1221] shrink-0"
      />
      <Icon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-slate-200">{label}</div>
        <div className="text-[10px] text-slate-500 truncate">{hint}</div>
      </div>
    </label>
  )
}
