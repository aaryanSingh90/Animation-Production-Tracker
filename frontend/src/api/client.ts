/**
 * Lightweight fetch wrapper for the ShotHub API.
 *
 * Auth model:
 *   • Primary: HttpOnly cookie `shothub_token` set by the backend on login,
 *     sent automatically by the browser via `credentials: 'include'`.
 *     We never see or store this token in JS, so an XSS bug can't exfiltrate it.
 *
 *   • In-memory fallback: the token is also cached in `inMemoryToken` for the
 *     SSE EventSource, which cannot send cookies or headers on its own and reads
 *     `getToken()` to add `?token=` to the SSE URL.
 *
 * Behaviour:
 *   - Listens for 401 globally → clears the in-memory token + dispatches a
 *     logout event so the router can boot the user to /login.
 *   - 403 with `code: 'PASSWORD_CHANGE_REQUIRED'` → dispatches a special
 *     event so the router can redirect to /account (change-password screen).
 *   - Throws `ApiError` for any non-2xx response.
 */

// BUG-24: Warn in production only when VITE_API_URL was never declared. An
// explicit empty string is the intended single-origin (v3) config — relative
// API paths — so that must NOT warn. `undefined` means the var is missing.
if (import.meta.env.PROD && import.meta.env.VITE_API_URL === undefined) {
  console.warn('[ShotHub] VITE_API_URL is not set — falling back to localhost:4000. Set it (or an empty string for single-origin) in your build config.')
}

// Empty string → '' → relative paths (single-origin). Undefined → localhost fallback.
export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')

// BUG-13: In-memory only — no localStorage. The HttpOnly cookie is the real
// auth mechanism; this token is only used as a fallback for the SSE EventSource
// (which can't send cookies on cross-origin requests in all browsers).
let inMemoryToken: string | null = null

export function getToken(): string | null { return inMemoryToken }

export function setToken(token: string | null) {
  inMemoryToken = token
}

/** Clear the in-memory auth token. The HttpOnly cookie is cleared server-side by /logout. */
export function clearSession() {
  setToken(null)
}

export class ApiError extends Error {
  status: number
  body:   unknown
  code?:  string
  constructor(status: number, message: string, body?: unknown, code?: string) {
    super(message)
    this.status = status
    this.body   = body
    this.code   = code
  }
}

interface RequestOpts extends Omit<RequestInit, 'body'> {
  body?: unknown
  /** query string params; values undefined/null are dropped */
  params?: Record<string, string | number | boolean | null | undefined>
}

/**
 * Shared response handling for BOTH JSON requests and multipart uploads.
 * BUG-04: previously only `request()` ran this logic, so a video upload via
 * `postForm()` that hit an expired session (401) or a forced password change
 * (403) just threw a generic error — the user was never booted to /login or the
 * change-password screen. Centralising it here makes uploads behave exactly like
 * every other call.
 */
async function handleResponse<T>(res: Response): Promise<T> {
  // 401 → not authenticated. Clear local state + boot to /login.
  if (res.status === 401) {
    setToken(null)
    window.dispatchEvent(new CustomEvent('shothub:unauthorized'))
  }

  // 403 with code=NO_ACCESS → artist tried to open a client/project they have
  // no tasks in. Surface as a custom event so the router can show the
  // /access-denied page rather than letting the page crash on undefined data.
  if (res.status === 403) {
    let peek: unknown = undefined
    try { peek = await res.clone().json() } catch { /* ignore */ }
    const code = (peek && typeof peek === 'object' && 'code' in peek)
      ? String((peek as { code: unknown }).code)
      : undefined
    if (code === 'NO_ACCESS') {
      window.dispatchEvent(new CustomEvent('shothub:no-access'))
    }
  }

  if (!res.ok) {
    let bodyJson: unknown = undefined
    try { bodyJson = await res.json() } catch { /* ignore */ }
    const msg = (bodyJson && typeof bodyJson === 'object' && 'error' in bodyJson)
      ? String((bodyJson as { error: unknown }).error)
      : res.statusText
    const code = (bodyJson && typeof bodyJson === 'object' && 'code' in bodyJson)
      ? String((bodyJson as { code: unknown }).code)
      : undefined

    // 403 + PASSWORD_CHANGE_REQUIRED → force the user to the change-password
    // screen. Layout listens for this and navigates.
    if (res.status === 403 && code === 'PASSWORD_CHANGE_REQUIRED') {
      window.dispatchEvent(new CustomEvent('shothub:password-change-required'))
    }

    throw new ApiError(res.status, msg, bodyJson, code)
  }

  // 204 No Content
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { body, params, headers, ...rest } = opts
  // API_URL is '' in single-origin (v3) builds. `new URL('/api/...')` with no
  // base throws "Invalid URL", which the store surfaces as a misleading
  // "Network error — is the server running?". Passing the current page origin
  // as the base resolves relative paths against this host; an absolute API_URL
  // (frontend hosted separately) still takes precedence and ignores the base.
  const url = new URL(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`, window.location.origin)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue
      url.searchParams.set(k, String(v))
    }
  }

  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    // Authorization header is back-compat only — the cookie is the primary
    // mechanism now. If both are present the backend prefers the cookie.
    ...(inMemoryToken ? { Authorization: `Bearer ${inMemoryToken}` } : {}),
    ...(headers as Record<string, string> | undefined),
  }

  const res = await fetch(url.toString(), {
    ...rest,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    // CRITICAL: include credentials so the browser sends the HttpOnly cookie
    // on cross-origin requests (Vercel frontend → Render backend).
    credentials: 'include',
  })

  return handleResponse<T>(res)
}

export const api = {
  get:    <T>(path: string, params?: RequestOpts['params'])             => request<T>(path, { method: 'GET',    params }),
  post:   <T>(path: string, body?: unknown)                              => request<T>(path, { method: 'POST',   body }),
  patch:  <T>(path: string, body?: unknown)                              => request<T>(path, { method: 'PATCH',  body }),
  delete: <T>(path: string)                                              => request<T>(path, { method: 'DELETE' }),

  /** Send FormData (file upload) — browser sets Content-Type + boundary automatically. */
  postForm: <T>(path: string, form: FormData): Promise<T> => {
    const url = new URL(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`, window.location.origin)
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(inMemoryToken ? { Authorization: `Bearer ${inMemoryToken}` } : {}),
    }
    // BUG-04: run the SAME response handling as request() so an upload that hits
    // a 401 / 403 triggers the global logout / password-change / no-access flows.
    return fetch(url.toString(), { method: 'POST', headers, body: form, credentials: 'include' })
      .then(res => handleResponse<T>(res))
  },
}
