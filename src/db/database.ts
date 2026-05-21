import Dexie, { type Table } from 'dexie'
import type { Client, Project, Employee, TaskRow } from '../types'

export interface AppSetting {
  key: string
  value: string
}

class AnimDB extends Dexie {
  clients!: Table<Client>
  projects!: Table<Project>
  employees!: Table<Employee>
  tasks!: Table<TaskRow>
  settings!: Table<AppSetting>

  constructor() {
    super('anim-pipeline-v1')
    this.version(1).stores({
      clients:   '&id, name',
      projects:  '&id, clientId, status',
      employees: '&id, active, department',
      tasks:     '&id, projectId, subStageId, assignedArtistId, status, shotNumber',
      settings:  '&key',
    })
  }
}

export const db = new AnimDB()
