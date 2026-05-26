/**
 * Lightweight fetch wrapper for the ShotHub API.
 *
 * Auth model (post Phase-1 hardening):
 *   • Primary: HttpOnly cookie `shothub_token` set by the backend on login,
 *     sent automatically by the browser via `credentials: 'include'`.
 *     We never see or store this token in JS, so an XSS bug can't exfiltrate it.
 *
 *   • Fallback: in-memory + localStorage token (back-compat for during the
 *     migration window — older browser sessions still have a token in
 *     localStorage from the previous version of the app). Once everyone has
 *     re-logged in we can delete the localStorage branch.
 *
 * Behaviour:
 *   - Listens for 401 globally → clears the legacy token + dispatches a
 *     logout event so the router can boot the user to /login.
 *   - 403 with `code: 'PASSWORD_CHANGE_REQUIRED'` → dispatches a special
 *     event so the router can redirect to /account (change-password screen).
 *   - Throws `ApiError` for any non-2xx response.
 */

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')

const TOKEN_KEY = 'shothub:jwt'

// Legacy in-memory token — only used as a back-compat fallback during the
// cookie migration. New logins set the cookie + return token in the response
// body; we cache it here so the very first request after login still has it
// in case the cookie hasn't been written yet (rare, but happens on Safari).
let inMemoryToken: string | null = (() => {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
})()

export function getToken(): string | null { return inMemoryToken }

export function setToken(token: string | null) {
  inMemoryToken = token
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else        localStorage.removeItem(TOKEN_KEY)
  } catch { /* SSR / private mode — ignore */ }
}

/** Clear every trace of an auth session from this browser. */
export function clearSession() {
  setToken(null)
  // We don't manually clear the cookie — the /logout endpoint does that with
  // a server Set-Cookie expire. Calling this without hitting /logout leaves
  // the cookie until it expires (1h), which is fine for our threat model.
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

export const api = {
  get:    <T>(path: string, params?: RequestOpts['params'])             => request<T>(path, { method: 'GET',    params }),
  post:   <T>(path: string, body?: unknown)                              => request<T>(path, { method: 'POST',   body }),
  patch:  <T>(path: string, body?: unknown)                              => request<T>(path, { method: 'PATCH',  body }),
  delete: <T>(path: string)                                              => request<T>(path, { method: 'DELETE' }),

  /** Send FormData (file upload) — browser sets Content-Type + boundary automatically. */
  postForm: <T>(path: string, form: FormData): Promise<T> => {
    const url = `${API_URL}${path.startsWith('/') ? path : `/${path}`}`
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(inMemoryToken ? { Authorization: `Bearer ${inMemoryToken}` } : {}),
    }
    return fetch(url, { method: 'POST', headers, body: form, credentials: 'include' })
      .then(async res => {
        if (!res.ok) {
          let bodyJson: unknown; try { bodyJson = await res.json() } catch { /* */ }
          const msg = (bodyJson && typeof bodyJson === 'object' && 'error' in bodyJson)
            ? String((bodyJson as { error: unknown }).error) : res.statusText
          throw new ApiError(res.status, msg, bodyJson)
        }
        return res.json() as Promise<T>
      })
  },
}
