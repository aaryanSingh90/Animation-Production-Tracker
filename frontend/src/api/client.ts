/**
 * Lightweight fetch wrapper for the ShotHub API.
 *
 * - Attaches `Authorization: Bearer <jwt>` automatically when a token is set.
 * - Throws `ApiError` for any non-2xx response so callers can `try/catch`.
 * - Listens for 401 globally and clears the token + dispatches a logout event.
 */

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')

const TOKEN_KEY = 'shothub:jwt'

let inMemoryToken: string | null = localStorage.getItem(TOKEN_KEY)

export function getToken(): string | null { return inMemoryToken }

export function setToken(token: string | null) {
  inMemoryToken = token
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else        localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  body:   unknown
  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.status = status
    this.body   = body
  }
}

interface RequestOpts extends Omit<RequestInit, 'body'> {
  body?: unknown
  /** query string params; values undefined/null are dropped */
  params?: Record<string, string | number | boolean | null | undefined>
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { body, params, headers, ...rest } = opts
  const url = new URL(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue
      url.searchParams.set(k, String(v))
    }
  }

  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(inMemoryToken ? { Authorization: `Bearer ${inMemoryToken}` } : {}),
    ...(headers as Record<string, string> | undefined),
  }

  const res = await fetch(url.toString(), {
    ...rest,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    setToken(null)
    window.dispatchEvent(new CustomEvent('shothub:unauthorized'))
  }

  if (!res.ok) {
    let bodyJson: unknown = undefined
    try { bodyJson = await res.json() } catch { /* ignore */ }
    const msg = (bodyJson && typeof bodyJson === 'object' && 'error' in bodyJson)
      ? String((bodyJson as { error: unknown }).error)
      : res.statusText
    throw new ApiError(res.status, msg, bodyJson)
  }

  // 204 No Content
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get:    <T>(path: string, params?: RequestOpts['params'])             => request<T>(path, { method: 'GET',    params }),
  post:   <T>(path: string, body?: unknown)                              => request<T>(path, { method: 'POST',   body }),
  patch:  <T>(path: string, body?: unknown)                              => request<T>(path, { method: 'PATCH',  body }),
  delete: <T>(path: string)                                              => request<T>(path, { method: 'DELETE' }),
}
