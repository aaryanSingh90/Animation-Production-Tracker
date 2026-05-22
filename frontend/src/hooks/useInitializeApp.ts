import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { useClientStore } from '../store/clientStore'
import { useEmployeeStore } from '../store/employeeStore'
import { usePipelineStore } from '../store/pipelineStore'
import { connect as sseConnect, disconnect as sseDisconnect, subscribe as sseSubscribe } from '../api/sse'

/**
 * Boots the app:
 *   1. Restore JWT session (if any).
 *   2. Once we have a current user, load employees + clients + projects + tasks.
 *   3. Open the SSE stream so server-pushed updates land in the stores.
 */
export function useInitializeApp() {
  const [ready, setReady] = useState(false)
  const restoreSession = useAuthStore(s => s.restoreSession)
  const currentUser    = useAuthStore(s => s.currentUser)

  const initEmployees = useEmployeeStore(s => s.initialize)
  const initClients   = useClientStore(s => s.initialize)
  const initPipeline  = usePipelineStore(s => s.initialize)

  // 1. Restore session on mount
  useEffect(() => {
    restoreSession().finally(() => setReady(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2. When we're authenticated, pull the data + open SSE
  useEffect(() => {
    if (!currentUser) {
      sseDisconnect()
      return
    }
    Promise.all([initEmployees(), initClients(), initPipeline()]).catch(console.error)
    sseConnect()
    const unsubscribe = sseSubscribe(event => {
      switch (event.type) {
        case 'task.created':
        case 'task.updated':
        case 'task.deleted':
          usePipelineStore.getState().applyServerEvent(event)
          break
        case 'employee.created':
        case 'employee.updated':
          useEmployeeStore.getState().applyServerEvent(event)
          break
        case 'client.created':
        case 'client.updated':
        case 'client.deleted':
        case 'project.created':
        case 'project.updated':
        case 'project.deleted':
          useClientStore.getState().applyServerEvent(event)
          break
      }
    })
    return () => {
      unsubscribe()
      sseDisconnect()
    }
  }, [currentUser, initEmployees, initClients, initPipeline])

  return ready
}
