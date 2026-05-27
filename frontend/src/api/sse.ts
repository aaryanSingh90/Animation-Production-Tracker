/**
 * Server-Sent Events subscription.
 *
 * The backend pushes `task.created | task.updated | task.deleted` whenever
 * any user changes data, so every connected client stays in sync without
 * polling. Auto-reconnects with exponential backoff on disconnect.
 *
 * BUG-21 / Architectural note: The EventSource API does not support custom
 * request headers, so the JWT is passed as a `?token=` query parameter.
 * This means the token is visible in server access logs and browser network
 * panels. Mitigation: tokens are short-lived (1 h) and the HttpOnly cookie
 * is the real auth mechanism for all other endpoints. If stronger guarantees
 * are needed in future, replace EventSource with a fetch-based SSE client
 * (ReadableStream) that can set Authorization headers.
 */
import { create } from 'zustand'
import { API_URL, getToken } from './client'
import type { Client, Employee, Project, TaskRow } from '../types'
import { logger } from '../utils/logger'

// BUG-14: Connection state — consumed by Layout.tsx to show an offline banner.
interface SseState {
  /** null = initial connect in progress; true = live; false = disconnected/reconnecting */
  connected: boolean | null
}
export const useSseStore = create<SseState>()(() => ({ connected: null }))

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
// BUG-10: Track whether we've ever had a successful connection so we can
// distinguish "first connect" (no data was missed) from "reconnect" (need refresh).
let hasConnectedOnce = false
const listeners = new Set<(e: ServerEvent) => void>()

export function subscribe(fn: (e: ServerEvent) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function emit(event: ServerEvent) {
  for (const l of listeners) {
    try { l(event) } catch (err) { logger.error('[sse] listener threw', err) }
  }
}

export function connect() {
  const token = getToken()
  if (!token) return                                       // not logged in yet
  if (source && source.readyState !== EventSource.CLOSED) return

  source = new EventSource(`${API_URL}/api/events?token=${encodeURIComponent(token)}`)

  source.onopen = () => {
    const isReconnect = hasConnectedOnce
    hasConnectedOnce = true
    backoffMs = 1000
    // BUG-14: Mark as connected so the offline banner hides.
    useSseStore.setState({ connected: true })
    if (isReconnect) {
      // BUG-10: Reconnected after a drop — signal stores to re-fetch so any
      // updates that arrived while we were offline are picked up.
      window.dispatchEvent(new CustomEvent('shothub:sse-reconnect'))
    }
    logger.info('[sse] connected')
  }

  source.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data) as ServerEvent
      emit(data)
    } catch (err) {
      logger.warn('[sse] bad payload', err, msg.data)
    }
  }

  source.onerror = () => {
    source?.close()
    source = null
    // BUG-14: Mark as disconnected so the offline banner appears.
    useSseStore.setState({ connected: false })
    if (reconnectTimer) return
    logger.warn(`[sse] disconnected — reconnecting in ${backoffMs}ms`)
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
  hasConnectedOnce = false      // BUG-10: reset so next connect() is treated as fresh
  useSseStore.setState({ connected: null })  // BUG-14: clear banner on logout
}
