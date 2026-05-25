import { useState, useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Plus, ArrowLeft, Trash2, Briefcase, AlertCircle,
  LayoutGrid, LayoutList, GripVertical,
  FolderOpen, FolderPlus, Pencil, ChevronDown, ChevronRight, X, Check,
  Archive, ArchiveRestore, Package, Search,
} from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable,
  horizontalListSortingStrategy, verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useClientStore } from '../store/clientStore'
import { usePipelineStore } from '../store/pipelineStore'
import { useAuthStore } from '../store/authStore'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { ApiError } from '../api/client'
import { format } from 'date-fns'
import type { Project } from '../types'

// ── constants ────────────────────────────────────────────────────────────────

const UNGROUPED = '__ungrouped__'

const STATUS_BADGES: Record<string, string> = {
  ACTIVE:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  ON_HOLD:   'bg-amber-500/15  text-amber-400  border-amber-500/30',
  COMPLETED: 'bg-slate-500/15  text-slate-400  border-slate-600/30',
  ARCHIVED:  'bg-slate-500/10  text-slate-600  border-slate-700/30',
}

const inputCls = 'px-3 py-2 text-xs bg-[#0d1424] border border-[#1b253b] rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors'

// ── sortable grid card ────────────────────────────────────────────────────────

function GridCard({
  proj, clientId, isManager, onDelete, onArchive,
}: {
  proj: Project; clientId: string; isManager: boolean
  onDelete: (id: string) => void; onArchive?: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: proj.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="bg-[#0c1221] rounded-xl border border-[#1b253b] p-5 hover:border-indigo-500/40 transition-all group"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          {isManager && (
            <button
              {...attributes} {...listeners}
              className="p-0.5 rounded text-slate-700 hover:text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing focus:outline-none shrink-0"
              aria-label="Drag to reorder" tabIndex={-1}
            >
              <GripVertical className="w-3.5 h-3.5" />
            </button>
          )}
          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${STATUS_BADGES[proj.status] ?? STATUS_BADGES.COMPLETED}`}>
            {proj.status.replace('_', ' ')}
          </span>
        </div>
        {isManager && (
          <div className="flex items-center gap-0.5">
            {onArchive && (
              <button onClick={() => onArchive(proj.id)} aria-label={`Archive ${proj.name}`} title="Archive"
                className="p-1 rounded hover:bg-amber-500/15 text-slate-700 hover:text-amber-400 transition-colors focus-visible:outline-none">
                <Archive className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={() => onDelete(proj.id)} aria-label={`Delete ${proj.name}`} title="Delete"
              className="p-1 rounded hover:bg-rose-500/15 text-slate-700 hover:text-rose-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      <Link to={`/clients/${clientId}/projects/${proj.id}`}>
        <h3 className="text-sm font-bold text-slate-100 hover:text-indigo-400 transition-colors mb-1 uppercase tracking-wide">{proj.name}</h3>
      </Link>
      {proj.description && <p className="text-xs text-slate-500 mb-3 line-clamp-2">{proj.description}</p>}
      <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
        Created {format(new Date(proj.createdAt), 'MMM d, yyyy')}
      </div>
    </div>
  )
}

// ── sortable list row ─────────────────────────────────────────────────────────

function ListRow({
  proj, clientId, isManager, onDelete, onArchive,
}: {
  proj: Project; clientId: string; isManager: boolean
  onDelete: (id: string) => void; onArchive?: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: proj.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-4 px-4 py-3 bg-[#0c1221] border border-[#1b253b] rounded-xl hover:border-indigo-500/30 transition-all group"
    >
      {isManager && (
        <button {...attributes} {...listeners}
          className="text-slate-700 hover:text-slate-400 cursor-grab active:cursor-grabbing shrink-0 focus:outline-none"
          aria-label="Drag to reorder" tabIndex={-1}>
          <GripVertical className="w-4 h-4" />
        </button>
      )}
      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${STATUS_BADGES[proj.status] ?? STATUS_BADGES.COMPLETED}`}>
        {proj.status.replace('_', ' ')}
      </span>
      <div className="flex-1 min-w-0">
        <Link to={`/clients/${clientId}/projects/${proj.id}`}>
          <span className="text-sm font-bold text-slate-100 hover:text-indigo-400 transition-colors uppercase tracking-wide truncate block">{proj.name}</span>
        </Link>
        {proj.description && <span className="text-[11px] text-slate-500 truncate block">{proj.description}</span>}
      </div>
      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider shrink-0">
        {format(new Date(proj.createdAt), 'MMM d, yyyy')}
      </span>
      {isManager && (
        <div className="flex items-center gap-0.5 shrink-0">
          {onArchive && (
            <button onClick={() => onArchive(proj.id)} aria-label={`Archive ${proj.name}`} title="Archive"
              className="p-1 rounded hover:bg-amber-500/15 text-slate-700 hover:text-amber-400 transition-colors focus-visible:outline-none">
              <Archive className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => onDelete(proj.id)} aria-label={`Delete ${proj.name}`} title="Delete"
            className="p-1 rounded hover:bg-rose-500/15 text-slate-700 hover:text-rose-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

// ── folder section ────────────────────────────────────────────────────────────

function FolderSection({
  folderName, projects, clientId, isManager, viewMode,
  onDelete, onArchive, onRenameFolder, onDeleteFolder,
  collapsed, onToggle,
}: {
  folderName: string
  projects: Project[]
  clientId: string
  isManager: boolean
  viewMode: 'grid' | 'list'
  onDelete: (id: string) => void
  onArchive: (id: string) => void
  onRenameFolder: (oldName: string, newName: string) => void
  onDeleteFolder: (name: string) => void
  collapsed: boolean
  onToggle: () => void
}) {
  const isUngrouped = folderName === UNGROUPED
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState(folderName)

  function commitRename() {
    const trimmed = renameVal.trim()
    if (trimmed && trimmed !== folderName) onRenameFolder(folderName, trimmed)
    setRenaming(false)
  }

  return (
    <div className="mb-6">
      {/* Folder header */}
      <div className="flex items-center gap-2 mb-3 group/folder">
        <button onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 text-left focus:outline-none">
          {collapsed
            ? <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            : <ChevronDown  className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
          {!isUngrouped && <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />}

          {renaming ? (
            <input
              autoFocus
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false) }}
              className="flex-1 px-2 py-0.5 text-xs bg-[#0d1424] border border-indigo-500 rounded text-slate-200 focus:outline-none"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="text-xs font-black uppercase tracking-wider text-slate-300 truncate">
              {isUngrouped ? 'Ungrouped' : folderName}
            </span>
          )}

          <span className="text-[10px] text-slate-600 font-bold shrink-0">
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </span>
        </button>

        {/* Rename / delete folder — manager only, non-ungrouped */}
        {isManager && !isUngrouped && !renaming && (
          <div className="flex items-center gap-1 opacity-0 group-hover/folder:opacity-100 transition-opacity">
            <button onClick={() => { setRenameVal(folderName); setRenaming(true) }}
              className="p-1 rounded hover:bg-[#1b2a40] text-slate-600 hover:text-slate-300 transition-colors"
              title="Rename folder">
              <Pencil className="w-3 h-3" />
            </button>
            <button onClick={() => onDeleteFolder(folderName)}
              className="p-1 rounded hover:bg-rose-500/15 text-slate-600 hover:text-rose-400 transition-colors"
              title="Remove folder (projects become ungrouped)">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        {renaming && (
          <div className="flex items-center gap-1">
            <button onClick={commitRename} className="p-1 rounded hover:bg-emerald-500/15 text-emerald-500 transition-colors"><Check className="w-3 h-3" /></button>
            <button onClick={() => setRenaming(false)} className="p-1 rounded hover:bg-[#1b2a40] text-slate-500 transition-colors"><X className="w-3 h-3" /></button>
          </div>
        )}
      </div>

      {/* Projects inside folder */}
      {!collapsed && (
        <SortableContext
          items={projects.map(p => p.id)}
          strategy={viewMode === 'grid' ? horizontalListSortingStrategy : verticalListSortingStrategy}
        >
          {viewMode === 'grid' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map(proj => (
                <GridCard key={proj.id} proj={proj} clientId={clientId} isManager={isManager} onDelete={onDelete} onArchive={onArchive} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {projects.map(proj => (
                <ListRow key={proj.id} proj={proj} clientId={clientId} isManager={isManager} onDelete={onDelete} onArchive={onArchive} />
              ))}
            </div>
          )}
        </SortableContext>
      )}
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>()
  const {
    clients, projects, archivedByClient,
    addProject, updateProject, deleteProject,
    archiveProject, unarchiveProject, loadArchivedForClient,
  } = useClientStore()
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

  // ── view mode (grid | list) ──
  const viewKey = 'shothub:client-view'
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try { return (localStorage.getItem(viewKey) as 'grid' | 'list') ?? 'grid' } catch { return 'grid' }
  })
  useEffect(() => { try { localStorage.setItem(viewKey, viewMode) } catch { } }, [viewMode])

  // ── project order per client ──
  const orderKey = `shothub:project-order:${clientId}`
  const [orderedIds, setOrderedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(orderKey) ?? '[]') } catch { return [] }
  })

  const sortedProjects = useMemo(() => {
    const known  = orderedIds.filter(id => clientProjects.some(p => p.id === id))
    const unseen = clientProjects.filter(p => !known.includes(p.id)).map(p => p.id)
    const order  = [...known, ...unseen]
    return order.map(id => clientProjects.find(p => p.id === id)!).filter(Boolean)
  }, [orderedIds, clientProjects])

  // ── search ──
  const [search, setSearch] = useState('')

  const visibleProjects = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return sortedProjects
    return sortedProjects.filter(p =>
      p.name.toLowerCase().includes(term) ||
      (p.description?.toLowerCase().includes(term) ?? false)
    )
  }, [sortedProjects, search])

  // ── folder collapse state ──
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({})
  function toggleFolder(name: string) {
    setCollapsedFolders(s => ({ ...s, [name]: !s[name] }))
  }

  // Group projects by folderName (use visibleProjects so search works inside folders)
  const grouped = useMemo(() => {
    const map = new Map<string, Project[]>()
    for (const p of visibleProjects) {
      const key = p.folderName?.trim() || UNGROUPED
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return map
  }, [visibleProjects])

  // Folder names in order (named folders first, ungrouped last)
  const folderKeys = useMemo(() => {
    const keys = Array.from(grouped.keys())
    const named = keys.filter(k => k !== UNGROUPED)
    const hasUngrouped = keys.includes(UNGROUPED)
    return hasUngrouped ? [...named, UNGROUPED] : named
  }, [grouped])

  const hasFolders = folderKeys.some(k => k !== UNGROUPED)

  // ── drag end ──
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragEnd(event: DragEndEvent) {
    if (search.trim()) return  // don't reorder while search is active
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = sortedProjects.findIndex(p => p.id === active.id)
    const newIdx = sortedProjects.findIndex(p => p.id === over.id)
    const next = arrayMove(sortedProjects, oldIdx, newIdx).map(p => p.id)
    setOrderedIds(next)
    try { localStorage.setItem(orderKey, JSON.stringify(next)) } catch { }
  }

  // ── folder rename ──
  async function handleRenameFolder(oldName: string, newName: string) {
    const toUpdate = clientProjects.filter(p => p.folderName === oldName)
    await Promise.all(toUpdate.map(p => updateProject(p.id, { folderName: newName })))
  }

  // ── folder delete (moves projects to ungrouped) ──
  async function handleDeleteFolder(name: string) {
    const toUpdate = clientProjects.filter(p => p.folderName === name)
    await Promise.all(toUpdate.map(p => updateProject(p.id, { folderName: null })))
  }

  // ── form state ──
  // ── archived section ──
  const archivedProjects = archivedByClient[clientId!] ?? null
  const [showArchived, setShowArchived] = useState(false)

  async function handleToggleArchived() {
    if (!showArchived && archivedProjects === null) {
      await loadArchivedForClient(clientId!)
    }
    setShowArchived(v => !v)
  }

  async function handleArchive(id: string) {
    try { await archiveProject(id) }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Failed to archive project.') }
  }

  async function handleUnarchive(id: string) {
    try { await unarchiveProject(id) }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Failed to unarchive project.') }
  }

  const [showForm, setShowForm] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', description: '', status: 'ACTIVE' as const, folderName: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Existing folder names for the dropdown
  const existingFolders = useMemo(() => {
    const names = [...new Set(
      clientProjects.map(p => p.folderName).filter(Boolean) as string[]
    )].sort()
    return names
  }, [clientProjects])

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
    setSubmitting(true); setError(null)
    try {
      await addProject({
        clientId: clientId!,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        status: form.status,
        folderName: form.folderName.trim() || null,
      })
      setForm({ name: '', description: '', status: 'ACTIVE', folderName: '' })
      setShowForm(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create project — check connection.')
    } finally { setSubmitting(false) }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteProject(id)
      setOrderedIds(ids => ids.filter(i => i !== id))
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
          <Link to="/clients"
            className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-indigo-400 mb-3 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> All Clients
          </Link>
          <div className="flex items-start justify-between border-b border-[#1a263e] pb-5">
            <div>
              <h1 className="text-xl font-black tracking-wide text-white uppercase">{client.name}</h1>
              {client.description && <p className="text-xs text-slate-400 font-medium mt-1">{client.description}</p>}
              {client.contactEmail && <p className="text-[10px] text-slate-500 mt-1">{client.contactEmail}</p>}
            </div>
            <div className="flex items-center gap-2">
              {/* Search */}
              {clientProjects.length > 0 && (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 pointer-events-none" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search projects…"
                    className="pl-8 pr-3 py-2 text-xs bg-[#0d1424] border border-[#1b253b] rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors w-44"
                  />
                  {search && (
                    <button onClick={() => setSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
              {/* View toggle */}
              {isManager && clientProjects.length > 0 && (
                <div className="flex items-center bg-[#0d1424] border border-[#1b253b] rounded-lg p-0.5">
                  <button onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                    title="Grid view"><LayoutGrid className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                    title="List view"><LayoutList className="w-3.5 h-3.5" /></button>
                </div>
              )}
              {isManager && (
                <button onClick={() => setShowForm(v => !v)}
                  className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-md shadow-indigo-950/50">
                  <Plus className="w-3.5 h-3.5" /> New Project
                </button>
              )}
            </div>
          </div>
        </div>

        {/* New project form */}
        {isManager && showForm && (
          <div className="bg-[#0d1424] border border-indigo-500/30 rounded-xl p-4 mb-6 space-y-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">New Project</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <input placeholder="Project name *" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
              <input placeholder="Description" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inputCls} />

              {/* Folder field — datalist for existing folders + free type */}
              <div className="relative">
                <input
                  list={`folders-${clientId}`}
                  placeholder="Folder (optional)"
                  value={form.folderName}
                  onChange={e => setForm(f => ({ ...f, folderName: e.target.value }))}
                  className={`${inputCls} w-full`}
                />
                <datalist id={`folders-${clientId}`}>
                  {existingFolders.map(f => <option key={f} value={f} />)}
                </datalist>
              </div>

              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}
                className={`${inputCls} cursor-pointer`}>
                <option value="ACTIVE"    className="bg-[#0d1424]">Active</option>
                <option value="ON_HOLD"   className="bg-[#0d1424]">On Hold</option>
                <option value="COMPLETED" className="bg-[#0d1424]">Completed</option>
              </select>
            </div>

            {existingFolders.length > 0 && (
              <p className="text-[10px] text-slate-600">
                Existing folders: {existingFolders.map((f, i) => (
                  <button key={f} onClick={() => setForm(fm => ({ ...fm, folderName: f }))}
                    className="text-indigo-400 hover:text-indigo-300 transition-colors font-bold">
                    {f}{i < existingFolders.length - 1 ? ', ' : ''}
                  </button>
                ))}
              </p>
            )}

            <div className="flex gap-2 items-center">
              <button onClick={submit} disabled={submitting}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {submitting ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => { setShowForm(false); setError(null) }}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 border border-[#1b253b] rounded-lg transition-colors">
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

        {/* Empty state */}
        {clientProjects.length === 0 ? (
          <div className="text-center py-20">
            <Briefcase className="w-10 h-10 mx-auto mb-3 text-slate-700" />
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              {isManager ? 'No projects yet. Create the first project for this client.' : 'No projects assigned to you.'}
            </p>
          </div>
        ) : visibleProjects.length === 0 ? (
          /* Search returned no results */
          <div className="text-center py-16">
            <Search className="w-8 h-8 mx-auto mb-3 text-slate-700" />
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              No projects match "<span className="text-slate-400">{search}</span>"
            </p>
            <button onClick={() => setSearch('')}
              className="mt-3 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-wider">
              Clear search
            </button>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>

            {/* ── No folders: flat list (same as before) ── */}
            {!hasFolders ? (
              <SortableContext
                items={visibleProjects.map(p => p.id)}
                strategy={viewMode === 'grid' ? horizontalListSortingStrategy : verticalListSortingStrategy}
              >
                {viewMode === 'grid' ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {visibleProjects.map(proj => (
                      <GridCard key={proj.id} proj={proj} clientId={clientId!} isManager={isManager} onDelete={setDeleteId} onArchive={handleArchive} />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {visibleProjects.map(proj => (
                      <ListRow key={proj.id} proj={proj} clientId={clientId!} isManager={isManager} onDelete={setDeleteId} onArchive={handleArchive} />
                    ))}
                  </div>
                )}
              </SortableContext>
            ) : (
              /* ── With folders: grouped sections ── */
              <div>
                {folderKeys.map(key => {
                  const projs = grouped.get(key) ?? []
                  return (
                    <FolderSection
                      key={key}
                      folderName={key}
                      projects={projs}
                      clientId={clientId!}
                      isManager={isManager}
                      viewMode={viewMode}
                      onDelete={setDeleteId}
                      onArchive={handleArchive}
                      onRenameFolder={handleRenameFolder}
                      onDeleteFolder={handleDeleteFolder}
                      collapsed={!!collapsedFolders[key]}
                      onToggle={() => toggleFolder(key)}
                    />
                  )
                })}
              </div>
            )}
          </DndContext>
        )}

        {/* ── Archived section ── */}
        {isManager && (
          <div className="mt-8 border-t border-[#1a263e] pt-6">
            <button
              onClick={handleToggleArchived}
              className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors mb-4"
            >
              <Package className="w-3.5 h-3.5" />
              {showArchived ? 'Hide archived' : 'Show archived projects'}
              {archivedProjects && archivedProjects.length > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-slate-700/40 text-slate-400 font-black text-[10px]">
                  {archivedProjects.length}
                </span>
              )}
              {showArchived
                ? <ChevronDown className="w-3 h-3" />
                : <ChevronRight className="w-3 h-3" />}
            </button>

            {showArchived && (
              <div>
                {archivedProjects === null ? (
                  <p className="text-xs text-slate-600 animate-pulse">Loading…</p>
                ) : archivedProjects.length === 0 ? (
                  <p className="text-xs text-slate-600 font-bold uppercase tracking-wider">No archived projects.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {archivedProjects.map(proj => (
                      <div key={proj.id}
                        className="flex items-center gap-4 px-4 py-3 bg-[#0c1221]/60 border border-[#1b253b]/60 rounded-xl opacity-60 hover:opacity-90 transition-opacity"
                      >
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${STATUS_BADGES.ARCHIVED}`}>
                          Archived
                        </span>
                        <div className="flex-1 min-w-0">
                          <Link to={`/clients/${clientId}/projects/${proj.id}`}>
                            <span className="text-sm font-bold text-slate-400 hover:text-indigo-400 transition-colors uppercase tracking-wide truncate block">
                              {proj.name}
                            </span>
                          </Link>
                          {proj.description && (
                            <span className="text-[11px] text-slate-600 truncate block">{proj.description}</span>
                          )}
                        </div>
                        <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider shrink-0">
                          {format(new Date(proj.createdAt), 'MMM d, yyyy')}
                        </span>
                        <button
                          onClick={() => handleUnarchive(proj.id)}
                          title="Restore to active"
                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/20 transition-all shrink-0"
                        >
                          <ArchiveRestore className="w-3 h-3" /> Restore
                        </button>
                        <button onClick={() => setDeleteId(proj.id)} title="Delete permanently"
                          className="p-1 rounded hover:bg-rose-500/15 text-slate-700 hover:text-rose-400 transition-colors shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Hint for manager when no folders yet */}
        {isManager && clientProjects.length > 0 && !hasFolders && (
          <p className="text-[10px] text-slate-700 font-bold uppercase tracking-wider mt-4 flex items-center gap-1.5">
            <FolderPlus className="w-3 h-3" />
            Tip: set a folder name when creating a project to group them
          </p>
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
