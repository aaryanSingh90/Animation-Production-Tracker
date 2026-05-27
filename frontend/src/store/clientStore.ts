import { create } from 'zustand'
import type { Client, Project } from '../types'
import {
  Clients, Projects,
  type ClientUpsert, type ProjectUpsert,
} from '../api/endpoints'
import { logger } from '../utils/logger'

interface ClientState {
  clients:     Client[]
  /** Active projects only (status != ARCHIVED). Archived are lazy-loaded per client. */
  projects:    Project[]
  /** Archived projects keyed by clientId — null = not loaded yet. */
  archivedByClient: Record<string, Project[] | null>
  initialized: boolean
  loading:     boolean

  /** BUG-01: Reset all store state — called on logout so a new login starts clean. */
  reset:       () => void
  initialize:  () => Promise<void>
  refresh:     () => Promise<void>

  addClient:    (data: ClientUpsert)                          => Promise<Client>
  updateClient: (id: string, patch: Partial<ClientUpsert>)    => Promise<Client>
  deleteClient: (id: string)                                  => Promise<void>

  addProject:            (data: ProjectUpsert & { clientId: string }) => Promise<Project>
  updateProject:         (id: string, patch: Partial<ProjectUpsert>)  => Promise<Project>
  deleteProject:         (id: string)                                  => Promise<void>
  archiveProject:        (id: string)                                  => Promise<void>
  unarchiveProject:      (id: string)                                  => Promise<void>
  loadArchivedForClient: (clientId: string)                            => Promise<void>

  getProjectsByClient: (clientId: string) => Project[]

  applyServerEvent: (event:
    | { type: 'client.created';  client: Client }
    | { type: 'client.updated';  client: Client }
    | { type: 'client.deleted';  clientId: string }
    | { type: 'project.created'; project: Project }
    | { type: 'project.updated'; project: Project }
    | { type: 'project.deleted'; projectId: string }
  ) => void
}

function upsertById<T extends { id: string }>(list: T[], next: T): T[] {
  const idx = list.findIndex(x => x.id === next.id)
  if (idx < 0) return [...list, next]
  const out = list.slice()
  out[idx] = next
  return out
}

export const useClientStore = create<ClientState>()((set, get) => ({
  clients:          [],
  projects:         [],
  archivedByClient: {},
  initialized:      false,
  loading:          false,

  // BUG-01: Reset to initial state on logout so a subsequent login sees a clean store.
  reset: () => set({ clients: [], projects: [], archivedByClient: {}, initialized: false, loading: false }),

  initialize: async () => {
    if (get().initialized) return
    await get().refresh()
    set({ initialized: true })
  },

  // Only loads NON-ARCHIVED projects — keeps the payload small at startup.
  refresh: async () => {
    set({ loading: true })
    try {
      const [{ clients }, { projects }] = await Promise.all([
        Clients.list(),
        Projects.list(),     // backend excludes ARCHIVED by default
      ])
      set({ clients, projects, loading: false })
    } catch (err) {
      logger.error('[clients] refresh failed', err)
      set({ loading: false })
    }
  },

  addClient: async (data) => {
    const { client } = await Clients.create(data)
    set(s => ({ clients: upsertById(s.clients, client) }))
    return client
  },

  updateClient: async (id, patch) => {
    const { client } = await Clients.update(id, patch)
    set(s => ({ clients: s.clients.map(c => c.id === id ? client : c) }))
    return client
  },

  deleteClient: async (id) => {
    await Clients.remove(id)
    set(s => ({
      clients:  s.clients.filter(c => c.id !== id),
      projects: s.projects.filter(p => p.clientId !== id),
    }))
  },

  addProject: async (data) => {
    const { project } = await Projects.create(data)
    set(s => ({ projects: upsertById(s.projects, project) }))
    return project
  },

  updateProject: async (id, patch) => {
    const { project } = await Projects.update(id, patch)
    set(s => ({ projects: s.projects.map(p => p.id === id ? project : p) }))
    return project
  },

  deleteProject: async (id) => {
    await Projects.remove(id)
    set(s => ({
      projects: s.projects.filter(p => p.id !== id),
      archivedByClient: Object.fromEntries(
        Object.entries(s.archivedByClient).map(([cid, list]) => [
          cid, list ? list.filter(p => p.id !== id) : null,
        ])
      ),
    }))
  },

  // Move project to ARCHIVED — remove from active list, add to archived bucket
  archiveProject: async (id) => {
    const active = get().projects.find(p => p.id === id)
    if (!active) return
    const { project } = await Projects.update(id, { status: 'ARCHIVED' })
    set(s => {
      const existing = s.archivedByClient[project.clientId]
      return {
        projects: s.projects.filter(p => p.id !== id),
        archivedByClient: {
          ...s.archivedByClient,
          // Only add to the bucket if it was already loaded — otherwise it
          // will appear when the user explicitly opens the archive section.
          [project.clientId]: existing != null ? upsertById(existing, project) : null,
        },
      }
    })
  },

  // Move project back to ACTIVE — remove from archived bucket, add to active list
  unarchiveProject: async (id) => {
    const { project } = await Projects.update(id, { status: 'ACTIVE' })
    set(s => {
      const existing = s.archivedByClient[project.clientId]
      return {
        projects: upsertById(s.projects, project),
        archivedByClient: {
          ...s.archivedByClient,
          [project.clientId]: existing != null
            ? existing.filter(p => p.id !== id)
            : null,
        },
      }
    })
  },

  // Lazy-load archived projects for one client on demand
  loadArchivedForClient: async (clientId) => {
    // Already loaded — skip
    if (get().archivedByClient[clientId] != null) return
    try {
      const { projects } = await Projects.listArchived(clientId)
      set(s => ({
        archivedByClient: { ...s.archivedByClient, [clientId]: projects },
      }))
    } catch (err) {
      logger.error('[clients] loadArchived failed', err)
    }
  },

  getProjectsByClient: (clientId) => get().projects.filter(p => p.clientId === clientId),

  applyServerEvent: (event) => {
    switch (event.type) {
      case 'client.created':
      case 'client.updated':
        set(s => ({ clients: upsertById(s.clients, event.client) }))
        break
      case 'client.deleted':
        set(s => ({
          clients:  s.clients.filter(c => c.id !== event.clientId),
          projects: s.projects.filter(p => p.clientId !== event.clientId),
        }))
        break
      case 'project.created':
        // New projects are never ARCHIVED, safe to upsert into active list
        set(s => ({ projects: upsertById(s.projects, event.project) }))
        break
      case 'project.updated':
        if (event.project.status === 'ARCHIVED') {
          // Move out of active list; only add to archived bucket if loaded
          set(s => {
            const existing = s.archivedByClient[event.project.clientId]
            return {
              projects: s.projects.filter(p => p.id !== event.project.id),
              archivedByClient: {
                ...s.archivedByClient,
                [event.project.clientId]: existing != null
                  ? upsertById(existing, event.project)
                  : null,
              },
            }
          })
        } else {
          // Active update — also remove from archived bucket in case it was
          // just unarchived by another user session
          set(s => {
            const existing = s.archivedByClient[event.project.clientId]
            return {
              projects: upsertById(
                s.projects.filter(p => p.id !== event.project.id),
                event.project,
              ),
              archivedByClient: {
                ...s.archivedByClient,
                [event.project.clientId]: existing != null
                  ? existing.filter(p => p.id !== event.project.id)
                  : null,
              },
            }
          })
        }
        break
      case 'project.deleted':
        set(s => ({
          projects: s.projects.filter(p => p.id !== event.projectId),
          archivedByClient: Object.fromEntries(
            Object.entries(s.archivedByClient).map(([cid, list]) => [
              cid, list ? list.filter(p => p.id !== event.projectId) : null,
            ])
          ),
        }))
        break
    }
  },
}))
