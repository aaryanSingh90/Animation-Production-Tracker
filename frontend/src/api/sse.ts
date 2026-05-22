/**
 * Server-Sent Events subscription.
 *
 * The backend pushes `task.created | task.updated | task.deleted` whenever
 * any user changes data, so every connected client stays in sync without
 * polling. Auto-reconnects with exponential backoff on disconnect.
 */
import { API_URL, getToken } from './client'
import type { Client, Employee, Project, TaskRow } from '../types'

export type ServerEvent =
  | { type: 'hello' }
  | { type: 'ping' }
  | { type: 'task.created';     task: TaskRow }
  | { type: 'task.updated';     task: TaskRow }
  | { type: 'task.deleted';     taskId: string }
  | { type: 'employee.created'; employee: Employee }
  | { type: 'employee.updated'; employee: Employee }
  | { type: 'client.created';   client: Client }
  | { type: 'client.updated';   client: Client }
  | { type: 'client.deleted';   clientId: string }
  | { type: 'project.created';  project: Project }
  | { type: 'project.updated';  project: Project }
  | { type: 'project.deleted';  projectId: string }

let source:        EventSource | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let backoffMs = 1000
const listeners = new Set<(e: ServerEvent) => void>()

export function subscribe(fn: (e: ServerEvent) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function emit(event: ServerEvent) {
  for (const l of listeners) {
    try { l(event) } catch (err) { console.error('[sse] listener threw', err) }
  }
}

export function connect() {
  const token = getToken()
  if (!token) return                                       // not logged in yet
  if (source && source.readyState !== EventSource.CLOSED) return

  source = new EventSource(`${API_URL}/api/events?token=${encodeURIComponent(token)}`)

  source.onopen = () => {
    backoffMs = 1000
    console.info('[sse] connected')
  }

  source.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data) as ServerEvent
      emit(data)
    } catch (err) {
      console.warn('[sse] bad payload', err, msg.data)
    }
  }

  source.onerror = () => {
    source?.close()
    source = null
    if (reconnectTimer) return
    console.warn(`[sse] disconnected — reconnecting in ${backoffMs}ms`)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      backoffMs = Math.min(backoffMs * 2, 30_000)
      connect()
    }, backoffMs)
  }
}

export function disconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  source?.close()
  source = null
  backoffMs = 1000
}
