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

const clients = new Set<Response>()

export function addClient(res: Response) {
  clients.add(res)
  res.on('close', () => clients.delete(res))
}

export function broadcast(event: ServerEvent) {
  const frame = `data: ${JSON.stringify(event)}\n\n`
  for (const res of clients) {
    res.write(frame)
  }
}

// Keep idle connections alive — proxies often drop after 30s of silence.
setInterval(() => broadcast({ type: 'ping' }), 25_000)
