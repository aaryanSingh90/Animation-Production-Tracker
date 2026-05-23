import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Plus, ArrowLeft, Trash2, Briefcase, AlertCircle } from 'lucide-react'
import { useClientStore } from '../store/clientStore'
import { usePipelineStore } from '../store/pipelineStore'
import { useAuthStore } from '../store/authStore'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { ApiError } from '../api/client'
import { format } from 'date-fns'

const STATUS_BADGES: Record<string, string> = {
  ACTIVE:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  ON_HOLD:   'bg-amber-500/15  text-amber-400  border-amber-500/30',
  COMPLETED: 'bg-slate-500/15  text-slate-400  border-slate-600/30',
}

const inputCls = 'px-3 py-2 text-xs bg-[#0d1424] border border-[#1b253b] rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors'

export function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>()
  const { clients, projects, addProject, deleteProject } = useClientStore()
  const allTasks = usePipelineStore(s => s.tasks)
  const currentUser = useAuthStore(s => s.currentUser)
  const isManager = currentUser?.role === 'MANAGER'

  const client = clients.find(c => c.id === clientId)
  const allClientProjects = projects.filter(p => p.clientId === clientId)

  const myProjectIds = isManager
    ? null
    : new Set(allTasks.filter(t => t.assignedArtistId === currentUser?.id).map(t => t.projectId))
  const clientProjects = isManager
    ? allClientProjects
    : allClientProjects.filter(p => myProjectIds!.has(p.id))

  const [showForm, setShowForm] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', description: '', status: 'ACTIVE' as const })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!client) {
    return (
      <div className="min-h-screen bg-[#0b0f19] p-6">
        <p className="text-slate-500 text-sm">Client not found.</p>
        <Link to="/clients" className="text-indigo-400 hover:underline text-sm mt-2 inline-block">Back to clients</Link>
      </div>
    )
  }

  async function submit() {
    if (!form.name.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await addProject({
        clientId: clientId!,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        status: form.status,
      })
      setForm({ name: '', description: '', status: 'ACTIVE' })
      setShowForm(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create project — check connection.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteProject(id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete project.')
    }
    setDeleteId(null)
  }

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-6">
          <Link
            to="/clients"
            className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-indigo-400 mb-3 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> All Clients
          </Link>
          <div className="flex items-start justify-between border-b border-[#1a263e] pb-5">
            <div>
              <h1 className="text-xl font-black tracking-wide text-white uppercase">{client.name}</h1>
              {client.description && <p className="text-xs text-slate-400 font-medium mt-1">{client.description}</p>}
              {client.contactEmail && <p className="text-[10px] text-slate-500 mt-1">{client.contactEmail}</p>}
            </div>
            {isManager && (
              <button
                onClick={() => setShowForm(v => !v)}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-md shadow-indigo-950/50"
              >
                <Plus className="w-3.5 h-3.5" /> New Project
              </button>
            )}
          </div>
        </div>

        {/* New project form */}
        {isManager && showForm && (
          <div className="bg-[#0d1424] border border-indigo-500/30 rounded-xl p-4 mb-6 space-y-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">New Project</p>
            <div className="grid grid-cols-3 gap-3">
              <input
                placeholder="Project name *"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className={inputCls}
              />
              <input
                placeholder="Description"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className={inputCls}
              />
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}
                className={`${inputCls} cursor-pointer`}
              >
                <option value="ACTIVE"    className="bg-[#0d1424]">Active</option>
                <option value="ON_HOLD"   className="bg-[#0d1424]">On Hold</option>
                <option value="COMPLETED" className="bg-[#0d1424]">Completed</option>
              </select>
            </div>
            <div className="flex gap-2 items-center">
              <button
                onClick={submit}
                disabled={submitting}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setShowForm(false); setError(null) }}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 border border-[#1b253b] rounded-lg transition-colors"
              >
                Cancel
              </button>
              {error && (
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-400">
                  <AlertCircle className="w-3.5 h-3.5" /> {error}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Projects grid */}
        {clientProjects.length === 0 ? (
          <div className="text-center py-20">
            <Briefcase className="w-10 h-10 mx-auto mb-3 text-slate-700" />
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              {isManager ? 'No projects yet. Create the first project for this client.' : 'No projects assigned to you.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clientProjects.map(proj => (
              <div
                key={proj.id}
                className="bg-[#0c1221] rounded-xl border border-[#1b253b] p-5 hover:border-indigo-500/40 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${STATUS_BADGES[proj.status] ?? STATUS_BADGES.COMPLETED}`}>
                    {proj.status.replace('_', ' ')}
                  </span>
                  {isManager && (
                    <button
                      onClick={() => setDeleteId(proj.id)}
                      aria-label={`Delete project ${proj.name}`}
                      title="Delete project"
                      className="p-1 rounded hover:bg-rose-500/15 text-slate-700 hover:text-rose-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <Link to={`/clients/${clientId}/projects/${proj.id}`}>
                  <h3 className="text-sm font-bold text-slate-100 hover:text-indigo-400 transition-colors mb-1 uppercase tracking-wide">{proj.name}</h3>
                </Link>
                {proj.description && (
                  <p className="text-xs text-slate-500 mb-3 line-clamp-2">{proj.description}</p>
                )}
                <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                  Created {format(new Date(proj.createdAt), 'MMM d, yyyy')}
                </div>
              </div>
            ))}
          </div>
        )}

        <ConfirmDialog
          open={!!deleteId}
          onOpenChange={v => !v && setDeleteId(null)}
          title="Delete project"
          description="All tasks in this project will be lost. This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={() => { if (deleteId) handleDelete(deleteId) }}
        />
      </div>
    </div>
  )
}
