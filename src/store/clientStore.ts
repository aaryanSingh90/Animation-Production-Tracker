import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Client, Project } from '../types'
import { INITIAL_CLIENTS, INITIAL_PROJECTS } from '../data/initialData'

interface ClientState {
  clients: Client[]
  projects: Project[]
  addClient: (client: Client) => void
  updateClient: (id: string, patch: Partial<Client>) => void
  deleteClient: (id: string) => void
  addProject: (project: Project) => void
  updateProject: (id: string, patch: Partial<Project>) => void
  deleteProject: (id: string) => void
  getProjectsByClient: (clientId: string) => Project[]
}

export const useClientStore = create<ClientState>()(
  persist(
    (set, get) => ({
      clients: INITIAL_CLIENTS,
      projects: INITIAL_PROJECTS,

      addClient: (client) =>
        set(s => ({ clients: [...s.clients, client] })),

      updateClient: (id, patch) =>
        set(s => ({ clients: s.clients.map(c => c.id === id ? { ...c, ...patch } : c) })),

      deleteClient: (id) =>
        set(s => ({
          clients: s.clients.filter(c => c.id !== id),
          projects: s.projects.filter(p => p.clientId !== id),
        })),

      addProject: (project) =>
        set(s => ({ projects: [...s.projects, project] })),

      updateProject: (id, patch) =>
        set(s => ({ projects: s.projects.map(p => p.id === id ? { ...p, ...patch } : p) })),

      deleteProject: (id) =>
        set(s => ({ projects: s.projects.filter(p => p.id !== id) })),

      getProjectsByClient: (clientId) =>
        get().projects.filter(p => p.clientId === clientId),
    }),
    { name: 'anim-clients' }
  )
)
