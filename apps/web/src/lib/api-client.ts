/**
 * API client for the WMS Fastify backend.
 *
 * Features:
 *   - Automatically attaches Bearer access token
 *   - On 401, attempts silent token refresh via /auth/refresh (raw fetch — never recursive)
 *   - On refresh failure, clears auth state and redirects to /login
 *   - Typed response helpers
 *
 * IMPORTANT — recursion prevention:
 *   ensureFreshToken() MUST NOT call apiFetch(). It uses the native fetch() directly
 *   so that the 401→refresh→401→... mutual recursion cannot occur.
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001/api/v1'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ApiError {
  statusCode: number
  error: string
  message: string
  details?: unknown
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

// ─────────────────────────────────────────────────────────────
// Token management (client-side in-memory only)
// ─────────────────────────────────────────────────────────────

let accessToken: string | null = null

/**
 * A single, shared refresh promise. When a refresh is in-flight, all callers
 * await this same promise so we never fire parallel /auth/refresh requests.
 * Cleared to null in the finally block so subsequent refreshes are possible.
 */
let refreshPromise: Promise<string> | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

/**
 * Ensures a fresh access token is available.
 *
 * RULES:
 *  - NEVER calls apiFetch() — uses raw fetch() to break the recursion chain.
 *  - Deduplicates concurrent refresh calls via refreshPromise.
 *  - On success:  calls setAccessToken() and resolves with the new token.
 *  - On failure:  rejects; the caller is responsible for auth cleanup.
 */
export function ensureFreshToken(): Promise<string> {
  // Fast path — token is already in memory
  if (accessToken) {
    return Promise.resolve(accessToken)
  }

  // Dedup — if a refresh is already in-flight, reuse it
  if (!refreshPromise) {
    refreshPromise = (async (): Promise<string> => {
      // Use raw fetch() — NOT apiFetch() — to prevent the recursive 401 loop.
      //
      // IMPORTANT: Send NO headers and NO body.
      //   - No Content-Type: the request has no body; browsers reject a
      //     Content-Type: application/json header on an empty POST.
      //   - No Authorization: we are refreshing precisely because we have no
      //     valid access token; sending one would be wrong.
      //   - credentials:'include' sends the httpOnly refresh_token cookie.
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        // Throw a structured error so callers can distinguish auth failures
        // from network errors if needed.
        const body = await response.json().catch(() => ({}))
        const err = new Error(
          (body as ApiError).message ?? 'Refresh token invalid or expired',
        ) as Error & { statusCode: number }
        err.statusCode = response.status
        throw err
      }

      const body = (await response.json()) as { accessToken: string }
      if (!body?.accessToken) {
        throw new Error('Refresh response did not include accessToken')
      }

      setAccessToken(body.accessToken)
      return body.accessToken
    })().finally(() => {
      // Always clear so the next expiry can trigger a new refresh.
      refreshPromise = null
    })
  }

  return refreshPromise
}

// ─────────────────────────────────────────────────────────────
// Auth cleanup helper — used by apiFetch and TokenRehydrator
// ─────────────────────────────────────────────────────────────

function clearSessionAndRedirect(callbackPath?: string) {
  if (typeof window === 'undefined') return
  setAccessToken(null)
  try {
    sessionStorage.removeItem('wms-auth')
  } catch {
    // sessionStorage may be unavailable in some contexts
  }
  // Clear the middleware-visible session marker
  document.cookie = 'wms_session=; path=/; max-age=0; samesite=lax'
  const cb = callbackPath ?? window.location.pathname
  window.location.href = `/login?callbackUrl=${encodeURIComponent(cb)}`
}

// ─────────────────────────────────────────────────────────────
// Core fetch wrapper
// ─────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  // Add Content-Type only when there is an actual serialised body to send.
  // Checking typeof string ensures we don't set the header for FormData,
  // Blob, or other non-JSON body types that callers might pass in future.
  const hasJsonBody =
    typeof init.body === 'string' && init.body.length > 0
  const headers: Record<string, string> = {
    ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers as Record<string, string> ?? {}),
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include', // send refresh token cookie on same-origin requests
  })

  // ── 401 handling — attempt silent refresh then retry exactly once ──
  if (response.status === 401 && retry) {
    try {
      await ensureFreshToken()
    } catch {
      // Refresh failed — session is unrecoverable. Redirect to login.
      clearSessionAndRedirect()
      throw new Error('Session expired. Please log in again.')
    }

    // Retry the original request with the new token (retry=false prevents loops)
    return apiFetch<T>(path, init, false)
  }

  if (!response.ok) {
    const error = (await response.json().catch(() => ({
      statusCode: response.status,
      error: 'Request Failed',
      message: response.statusText,
    }))) as ApiError
    throw error
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

// ─────────────────────────────────────────────────────────────
// HTTP method helpers
// ─────────────────────────────────────────────────────────────

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  // body is only serialised and attached when it is explicitly provided.
  // Calling api.post('/path') with no body sends a clean bodyless POST —
  // no Content-Type header, no JSON.stringify(undefined) = "undefined" string.
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(
      path,
      body !== undefined
        ? { method: 'POST', body: JSON.stringify(body) }
        : { method: 'POST' },
    ),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(
      path,
      body !== undefined
        ? { method: 'PUT', body: JSON.stringify(body) }
        : { method: 'PUT' },
    ),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(
      path,
      body !== undefined
        ? { method: 'PATCH', body: JSON.stringify(body) }
        : { method: 'PATCH' },
    ),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
}

// Re-export the cleanup helper for use in TokenRehydrator
export { clearSessionAndRedirect }
