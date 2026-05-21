import { useEffect, useState } from 'react'
import { migrateFromLocalStorage } from '../db/migrate'
import { useClientStore } from '../store/clientStore'
import { useEmployeeStore } from '../store/employeeStore'
import { usePipelineStore } from '../store/pipelineStore'
import { useAuthStore } from '../store/authStore'

export function useInitializeApp() {
  const [ready, setReady] = useState(false)
  const initClients   = useClientStore(s => s.initialize)
  const initEmployees = useEmployeeStore(s => s.initialize)
  const initPipeline  = usePipelineStore(s => s.initialize)
  const loadCurrentUser = useAuthStore(s => s.loadCurrentUser)

  useEffect(() => {
    async function run() {
      await migrateFromLocalStorage()
      await Promise.all([initClients(), initEmployees(), initPipeline()])
      const employees = useEmployeeStore.getState().employees
      await loadCurrentUser(employees)
      setReady(true)
    }
    run().catch(console.error)
  }, [])

  return ready
}
