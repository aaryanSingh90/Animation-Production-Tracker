import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Briefcase, Mail, Trash2, Users, AlertCircle } from 'lucide-react'
import { useClientStore } from '../store/clientStore'
import { usePipelineStore } from '../store/pipelineStore'
import { useAuthStore } from '../store/authStore'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { ApiError } from '../api/client'
import { format } from 'date-fns'

const inputCls = 'px-3 py-2 text-xs bg-[#0d1424] border border-[#1b253b] rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors'

export function Clients() {
  const { clients: allClients, projects, addClient, deleteClient } = useClientStore()
  const allTasks = usePipelineStore(s => s.tasks)
  const currentUser = useAuthStore(s => s.currentUser)
  const isManager = currentUser?.role === 'MANAGER'
  const [showForm, setShowForm] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', description: '', contactEmail: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const myProjectIds = isManager
    ? null
    : new Set(allTasks.filter(t => t.assignedArtistId === currentUser?.id).map(t => t.projectId))
  const myClientIds = isManager
    ? null
    : new Set(projects.filter(p => myProjectIds!.has(p.id)).map(p => p.clientId))
  const clients = isManager ? allClients : allClients.filter(c => myClientIds!.has(c.id))

  async function submit() {
    if (!form.name.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await addClient({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
      })
      setForm({ name: '', description: '', contactEmail: '' })
      setShowForm(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create client — check connection.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteClient(id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete client.')
    }
    setDeleteId(null)
  }

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1a263e] pb-5 mb-6">
          <div>
            <h1 className="text-xl font-black tracking-wide text-white uppercase flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-indigo-400" /> Clients
            </h1>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
              {clients.length} client{clients.length !== 1 ? 's' : ''}
            </p>
          </div>
          {isManager && (
            <button
              onClick={() => setShowForm(v => !v)}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-md shadow-indigo-950/50"
            >
              <Plus className="w-3.5 h-3.5" /> New Client
            </button>
          )}
        </div>

        {/* Add form — manager only */}
        {isManager && showForm && (
          <div className="bg-[#0d1424] border border-indigo-500/30 rounded-xl p-4 mb-6 space-y-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">New Client</p>
            <div className="grid grid-cols-3 gap-3">
              <input
                placeholder="Client name *"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className={inputCls}
              />
              <input
                placeholder="Contact email"
                value={form.contactEmail}
                onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))}
                className={inputCls}
              />
              <input
                placeholder="Description"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className={inputCls}
              />
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

        {/* Table */}
        {clients.length === 0 ? (
          <div className="text-center py-20">
            <Briefcase className="w-10 h-10 mx-auto mb-3 text-slate-700" />
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">No clients yet. Create your first client.</p>
          </div>
        ) : (
          <div className="bg-[#0c1221] rounded-xl border border-[#1b253b] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#111929] border-b border-[#1b253b]">
                  <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Contact</th>
                  <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Projects</th>
                  <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Created</th>
                  {isManager && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {clients.map(client => {
                  const projectCount = projects.filter(p => p.clientId === client.id).length
                  return (
                    <tr key={client.id} className="border-b border-[#141d2f] hover:bg-[#0f1829] transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          to={`/clients/${client.id}`}
                          className="text-sm font-semibold text-slate-100 hover:text-indigo-400 transition-colors"
                        >
                          {client.name}
                        </Link>
                        {client.description && (
                          <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-xs">{client.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {client.contactEmail ? (
                          <div className="flex items-center gap-1.5 text-xs">
                            <Mail className="w-3.5 h-3.5 text-slate-500" />
                            {client.contactEmail}
                          </div>
                        ) : <span className="text-slate-700">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border bg-indigo-500/15 text-indigo-400 border-indigo-500/30">
                          <Users className="w-3 h-3" />
                          {projectCount} project{projectCount !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                        {format(new Date(client.createdAt), 'MMM d, yyyy')}
                      </td>
                      {isManager && (
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setDeleteId(client.id)}
                            className="p-1.5 rounded hover:bg-rose-500/15 text-slate-700 hover:text-rose-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <ConfirmDialog
          open={!!deleteId}
          onOpenChange={v => !v && setDeleteId(null)}
          title="Delete client"
          description="All projects under this client will also be deleted. This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={() => { if (deleteId) handleDelete(deleteId) }}
        />
      </div>
    </div>
  )
}
