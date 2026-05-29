/**
 * Server-Sent Events bus.
 *
 * Any HTTP route can call `broadcast(event)` to push to every connected
 * client. The /api/events endpoint (see src/routes/events.ts) keeps the
 * SSE connection alive and writes the events as `data: <json>\n\n` frames.
 *
 * Suitable for ~30 concurrent users. For much larger scale, swap for
 * a pub/sub (Redis, NATS) so multiple Node instances can broadcast.
 */
import type { Response } from 'express'

export type ServerEvent =
  | { type: 'task.created';     task: unknown }
  | { type: 'task.updated';     task: unknown }
  | { type: 'task.deleted';     taskId: string }
  | { type: 'employee.created'; employee: unknown }
  | { type: 'employee.updated'; employee: unknown }
  | { type: 'client.created';   client: unknown }
  | { type: 'client.updated';   client: unknown }
  | { type: 'client.deleted';   clientId: string }
  | { type: 'project.created';  project: unknown }
  | { type: 'project.updated';  project: unknown }
  | { type: 'project.deleted';  projectId: string }
  | { type: 'ping' }
  | { type: 'hello' }

/** The slice of the authenticated user the SSE bus needs in order to decide
 *  which events a connection is allowed to receive. */
export interface SseClient {
  sub:  string
  role: string
}

// Each open SSE connection is keyed by its Response and carries the user
// context so broadcast() can scope task events per-recipient.
const clients = new Map<Response, SseClient>()

export function addClient(res: Response, user: SseClient) {
  clients.set(res, user)
  res.on('close', () => clients.delete(res))
}

/** ARTIST/FREELANCE only ever receive events for their OWN tasks. */
function isRestricted(role: string): boolean {
  return role === 'ARTIST' || role === 'FREELANCE'
}

/** Safely read assignedArtistId off an event's `task` payload (typed unknown). */
function taskAssignee(task: unknown): string | null {
  if (task && typeof task === 'object' && 'assignedArtistId' in task) {
    const v = (task as { assignedArtistId: unknown }).assignedArtistId
    return typeof v === 'string' ? v : null
  }
  return null
}

/**
 * BUG-27: decide whether a given client may receive a given event.
 *
 * The OLD bus broadcast EVERY task event to EVERY connection, so an artist's
 * browser received (and the network panel exposed) the full payload of every
 * other artist's tasks — a data-confidentiality leak. We now scope
 * task.created / task.updated to the assignee for restricted roles; managers
 * and leads keep studio-wide visibility, and all non-task events (deletes,
 * employee/client/project, ping/hello) go to everyone.
 *
 * Note: a de-assigned artist won't receive the task.updated that moved the task
 * away from them, so their local copy stays until their next load/SSE
 * reconnect. That's a minor staleness trade-off, not a confidentiality issue.
 */
function canReceive(event: ServerEvent, ctx: SseClient): boolean {
  if ((event.type === 'task.created' || event.type === 'task.updated') && isRestricted(ctx.role)) {
    return taskAssignee(event.task) === ctx.sub
  }
  return true
}

export function broadcast(event: ServerEvent) {
  const frame = `data: ${JSON.stringify(event)}\n\n`
  for (const [res, ctx] of clients) {
    if (canReceive(event, ctx)) res.write(frame)
  }
}

// Keep idle connections alive — proxies often drop after 30s of silence.
setInterval(() => broadcast({ type: 'ping' }), 25_000)
