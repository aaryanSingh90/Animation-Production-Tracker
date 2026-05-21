import { create } from 'zustand'
import type { Client, Project } from '../types'
import { INITIAL_CLIENTS, INITIAL_PROJECTS } from '../data/initialData'
import { db } from '../db/database'

interface ClientState {
  clients: Client[]
  projects: Project[]
  initialized: boolean
  initialize: () => Promise<void>
  addClient: (client: Client) => void
  updateClient: (id: string, patch: Partial<Client>) => void
  deleteClient: (id: string) => void
  addProject: (project: Project) => void
  updateProject: (id: string, patch: Partial<Project>) => void
  deleteProject: (id: string) => void
  getProjectsByClient: (clientId: string) => Project[]
}

export const useClientStore = create<ClientState>()((set, get) => ({
  clients: [],
  projects: [],
  initialized: false,

  initialize: async () => {
    const [cc, pc] = await Promise.all([db.clients.count(), db.projects.count()])
    if (cc === 0) await db.clients.bulkAdd(INITIAL_CLIENTS)
    if (pc === 0) await db.projects.bulkAdd(INITIAL_PROJECTS)
    const [clients, projects] = await Promise.all([db.clients.toArray(), db.projects.toArray()])
    set({ clients, projects, initialized: true })
  },

  addClient: (client) => {
    set(s => ({ clients: [...s.clients, client] }))
    db.clients.add(client)
  },

  updateClient: (id, patch) => {
    set(s => ({ clients: s.clients.map(c => c.id === id ? { ...c, ...patch } : c) }))
    db.clients.update(id, patch)
  },

  deleteClient: (id) => {
    set(s => ({
      clients: s.clients.filter(c => c.id !== id),
      projects: s.projects.filter(p => p.clientId !== id),
    }))
    db.clients.delete(id)
    db.projects.where('clientId').equals(id).delete()
  },

  addProject: (project) => {
    set(s => ({ projects: [...s.projects, project] }))
    db.projects.add(project)
  },

  updateProject: (id, patch) => {
    set(s => ({ projects: s.projects.map(p => p.id === id ? { ...p, ...patch } : p) }))
    db.projects.update(id, patch)
  },

  deleteProject: (id) => {
    set(s => ({ projects: s.projects.filter(p => p.id !== id) }))
    db.projects.delete(id)
  },

  getProjectsByClient: (clientId) => get().projects.filter(p => p.clientId === clientId),
}))
