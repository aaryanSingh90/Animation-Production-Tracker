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

  const initEmployees  = useEmployeeStore(s => s.initialize)
  const initClients    = useClientStore(s => s.initialize)
  const initForArtist  = usePipelineStore(s => s.initForArtist)
  const initForManager = usePipelineStore(s => s.initForManager)

  // 1. Restore session on mount
  useEffect(() => {
    restoreSession().finally(() => setReady(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // BUG-10: When SSE reconnects after a drop, re-fetch employees + clients so any
  // changes that arrived while we were offline are reflected immediately.
  useEffect(() => {
    function handleSseReconnect() {
      // Re-fetch all data stores so changes that arrived while offline are picked up.
      const user = useAuthStore.getState().currentUser
      void Promise.all([
        useEmployeeStore.getState().refresh(),
        useClientStore.getState().refresh(),
        // BUG-09: refresh tasks after reconnect for EVERYONE, not just managers.
        // Managers reload all tasks; artists/leads/freelancers reload their own —
        // otherwise an artist would miss changes to their tasks made while offline.
        user?.role === 'MANAGER'
          ? usePipelineStore.getState().refreshAllTasks()
          : user
            ? usePipelineStore.getState().refreshForArtist(user.id)
            : Promise.resolve(),
      ])
    }
    window.addEventListener('shothub:sse-reconnect', handleSseReconnect)
    return () => window.removeEventListener('shothub:sse-reconnect', handleSseReconnect)
  }, [])

  // 2. When we're authenticated, pull the data + open SSE
  useEffect(() => {
    if (!currentUser) {
      sseDisconnect()
      return
    }
    const pipelineInit = currentUser.role === 'MANAGER'
      ? initForManager()               // managers: load tasks on demand, nothing fetched now
      : initForArtist(currentUser.id)  // artists/leads/freelance: load only their tasks
    Promise.all([initEmployees(), initClients(), pipelineInit]).catch(console.error)
    sseConnect()
    const unsubscribe = sseSubscribe(event => {
      switch (event.type) {
        case 'task.created':
        case 'task.updated':
        case 'task.deleted':
          // Pass currentUser.id so artists instantly receive tasks
          // that a manager just assigned to them (not yet in their store)
          usePipelineStore.getState().applyServerEvent(event, currentUser.id, currentUser.role === 'MANAGER')
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
  }, [currentUser, initEmployees, initClients, initForArtist, initForManager])

  return ready
}
