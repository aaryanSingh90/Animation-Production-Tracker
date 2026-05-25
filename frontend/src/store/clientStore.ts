import { create } from 'zustand'
import type { Client, Project } from '../types'
import {
  Clients, Projects,
  type ClientUpsert, type ProjectUpsert,
} from '../api/endpoints'

interface ClientState {
  clients:     Client[]
  projects:    Project[]
  initialized: boolean
  loading:     boolean

  initialize:  () => Promise<void>
  refresh:     () => Promise<void>

  addClient:    (data: ClientUpsert)                          => Promise<Client>
  updateClient: (id: string, patch: Partial<ClientUpsert>)    => Promise<Client>
  deleteClient: (id: string)                                  => Promise<void>

  addProject:    (data: ProjectUpsert & { clientId: string }) => Promise<Project>
  updateProject: (id: string, patch: Partial<ProjectUpsert>)  => Promise<Project>
  deleteProject: (id: string)                                 => Promise<void>

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
  clients:     [],
  projects:    [],
  initialized: false,
  loading:     false,

  initialize: async () => {
    if (get().initialized) return
    await get().refresh()
    set({ initialized: true })
  },

  refresh: async () => {
    set({ loading: true })
    try {
      const [{ clients }, { projects }] = await Promise.all([
        Clients.list(),
        Projects.list(),
      ])
      set({ clients, projects, loading: false })
    } catch (err) {
      console.error('[clients] refresh failed', err)
      set({ loading: false })
    }
  },

  addClient: async (data) => {
    const { client } = await Clients.create(data)
    // upsert (not append) — the SSE broadcast for `client.created` may have
    // already inserted this row by the time the POST response lands. Without
    // dedup we'd render the same client twice.
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
    // upsert (not append) — same SSE race as addClient.
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
    set(s => ({ projects: s.projects.filter(p => p.id !== id) }))
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
      case 'project.updated':
        set(s => ({ projects: upsertById(s.projects, event.project) }))
        break
      case 'project.deleted':
        set(s => ({ projects: s.projects.filter(p => p.id !== event.projectId) }))
        break
    }
  },
}))
