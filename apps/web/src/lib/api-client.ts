/**
 * API client for the WMS Fastify backend.
 *
 * Features:
 *   - Automatically attaches Bearer access token
 *   - On 401, attempts silent token refresh via /auth/refresh
 *   - On refresh failure, redirects to /login
 *   - Typed response helpers
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
// Token management (client-side)
// ─────────────────────────────────────────────────────────────

let accessToken: string | null = null
let refreshPromise: Promise<string> | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

// ─────────────────────────────────────────────────────────────
// Core fetch wrapper
// ─────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.body !== undefined && init.body !== null ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers as Record<string, string> ?? {}),
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include', // send refresh token cookie
  })

  // Attempt token refresh on 401
  if (response.status === 401 && retry) {
    try {
      if (!refreshPromise) {
        refreshPromise = apiFetch<{ accessToken: string }>(
          '/auth/refresh',
          { method: 'POST' },
          false, // no retry on refresh itself
        ).then((res) => {
          setAccessToken(res.accessToken)
          return res.accessToken
        }).finally(() => {
          refreshPromise = null
        })
      }

      await refreshPromise

      // Retry original request with new token
      return apiFetch<T>(path, init, false)
    } catch {
      setAccessToken(null)
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('wms-auth')
        document.cookie = 'wms_session=; path=/; max-age=0; samesite=lax'
        window.location.href = '/login'
      }
      throw new Error('Session expired. Please log in again.')
    }
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
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
}
