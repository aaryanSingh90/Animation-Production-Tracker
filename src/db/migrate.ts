import { db } from './database'

export async function migrateFromLocalStorage() {
  const migrated = await db.settings.get('localStorage-migrated')
  if (migrated) return

  try {
    const pipelineRaw  = localStorage.getItem('anim-pipeline')
    const clientsRaw   = localStorage.getItem('anim-clients')
    const employeesRaw = localStorage.getItem('anim-employees')

    if (clientsRaw) {
      const { state } = JSON.parse(clientsRaw)
      if (state?.clients?.length)  await db.clients.bulkPut(state.clients)
      if (state?.projects?.length) await db.projects.bulkPut(state.projects)
    }
    if (employeesRaw) {
      const { state } = JSON.parse(employeesRaw)
      if (state?.employees?.length) await db.employees.bulkPut(state.employees)
    }
    if (pipelineRaw) {
      const { state } = JSON.parse(pipelineRaw)
      if (state?.tasks?.length) await db.tasks.bulkPut(state.tasks)
    }
  } catch {
    // migration best-effort; seed data will be used if this fails
  }

  await db.settings.put({ key: 'localStorage-migrated', value: 'true' })
}
