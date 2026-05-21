import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Briefcase, Mail, Trash2 } from 'lucide-react'
import { useClientStore } from '../store/clientStore'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { format } from 'date-fns'

function newId() { return `client-${Date.now()}` }

export function Clients() {
  const { clients, projects, addClient, deleteClient } = useClientStore()
  const [showForm, setShowForm] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', description: '', contactEmail: '' })

  function submit() {
    if (!form.name.trim()) return
    addClient({
      id: newId(),
      name: form.name.trim(),
      description: form.description.trim(),
      contactEmail: form.contactEmail.trim(),
      createdAt: new Date().toISOString().slice(0, 10),
    })
    setForm({ name: '', description: '', contactEmail: '' })
    setShowForm(false)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-1">{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
        >
          <Plus className="w-4 h-4" /> New Client
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">New Client</h2>
          <div className="grid grid-cols-3 gap-3">
            <input
              placeholder="Client name *"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              placeholder="Contact email"
              value={form.contactEmail}
              onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              placeholder="Description"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={submit} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">
              Save
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {clients.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No clients yet. Create your first client.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Projects</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {clients.map(client => {
                const projectCount = projects.filter(p => p.clientId === client.id).length
                return (
                  <tr key={client.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link to={`/clients/${client.id}`} className="font-medium text-gray-900 hover:text-indigo-600">
                        {client.name}
                      </Link>
                      {client.description && (
                        <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{client.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {client.contactEmail ? (
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-gray-400" />
                          {client.contactEmail}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                        {projectCount} project{projectCount !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {format(new Date(client.createdAt), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setDeleteId(client.id)}
                        className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
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
        onConfirm={() => { if (deleteId) deleteClient(deleteId); setDeleteId(null) }}
      />
    </div>
  )
}
