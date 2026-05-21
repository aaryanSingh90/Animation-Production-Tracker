import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Plus, ArrowLeft, Trash2 } from 'lucide-react'
import { useClientStore } from '../store/clientStore'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { format } from 'date-fns'

function newId() { return `project-${Date.now()}` }

const STATUS_BADGES: Record<string, string> = {
  ACTIVE:    'bg-green-100 text-green-800',
  ON_HOLD:   'bg-amber-100 text-amber-800',
  COMPLETED: 'bg-gray-100 text-gray-700',
}

export function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>()
  const navigate = useNavigate()
  const { clients, projects, addProject, deleteProject } = useClientStore()

  const client = clients.find(c => c.id === clientId)
  const clientProjects = projects.filter(p => p.clientId === clientId)

  const [showForm, setShowForm] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', description: '', status: 'ACTIVE' as const })

  if (!client) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Client not found.</p>
        <Link to="/clients" className="text-indigo-600 hover:underline text-sm">Back to clients</Link>
      </div>
    )
  }

  function submit() {
    if (!form.name.trim()) return
    addProject({
      id: newId(),
      clientId: clientId!,
      name: form.name.trim(),
      description: form.description.trim(),
      status: form.status,
      frameRate: 24,
      createdAt: new Date().toISOString().slice(0, 10),
    })
    setForm({ name: '', description: '', status: 'ACTIVE' })
    setShowForm(false)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <Link to="/clients" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
          <ArrowLeft className="w-3.5 h-3.5" /> All Clients
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
            {client.description && <p className="text-sm text-gray-500 mt-1">{client.description}</p>}
            {client.contactEmail && <p className="text-xs text-gray-400 mt-1">{client.contactEmail}</p>}
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
          >
            <Plus className="w-4 h-4" /> New Project
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">New Project</h2>
          <div className="grid grid-cols-3 gap-3">
            <input
              placeholder="Project name *"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              placeholder="Description"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ACTIVE">Active</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={submit} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">Save</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {/* Projects */}
      {clientProjects.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>No projects yet. Create the first project for this client.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clientProjects.map(proj => (
            <div key={proj.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between mb-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGES[proj.status]}`}>
                  {proj.status.replace('_', ' ')}
                </span>
                <button
                  onClick={() => setDeleteId(proj.id)}
                  className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <Link to={`/clients/${clientId}/projects/${proj.id}`}>
                <h3 className="text-base font-semibold text-gray-900 hover:text-indigo-700 mb-1">{proj.name}</h3>
              </Link>
              {proj.description && (
                <p className="text-xs text-gray-500 mb-3 line-clamp-2">{proj.description}</p>
              )}
              <div className="text-xs text-gray-400">
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
        onConfirm={() => { if (deleteId) deleteProject(deleteId); setDeleteId(null) }}
      />
    </div>
  )
}
