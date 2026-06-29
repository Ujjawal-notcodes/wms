'use client'

/**
 * TokenRehydrator
 *
 * Ensures the api-client's in-memory `accessToken` is populated from the
 * Zustand store as early as possible after client-side hydration, then
 * validates the session against /auth/me to catch stale permissions.
 *
 * ── Deadlock-prevention rules ──
 *
 * 1. READ TOKEN FROM STORE FIRST.
 *    Zustand's onRehydrateStorage hook calls setAccessToken() synchronously
 *    when sessionStorage is read. However, the Zustand store rehydration is
 *    async relative to React rendering — the useEffect here may fire before
 *    the store has populated the module-level `accessToken` variable.
 *    We therefore read `store.accessToken` directly and call setAccessToken()
 *    ourselves before touching ensureFreshToken().
 *
 * 2. ONLY CALL ensureFreshToken() IF NO TOKEN IS AVAILABLE.
 *    If a valid token is already in the store, we skip the /auth/refresh call
 *    entirely and proceed directly to /auth/me. This prevents the cross-origin
 *    cookie problem: the refresh_token cookie is httpOnly on the API origin
 *    (localhost:3001); a fetch from the Next.js origin (localhost:3000) will
 *    NOT send it, causing a 401 → redirect-to-login on every page load.
 *
 * 3. MODULE-LEVEL HYDRATION FLAG.
 *    React 18 StrictMode double-invokes effects in development. A module-level
 *    `hydrated` flag ensures we only run the full sync once per page lifetime,
 *    not once per mount cycle.
 *
 * 4. DO NOT REDIRECT ON TRANSIENT ERRORS.
 *    Only redirect to /login when /auth/me explicitly returns 401 (the token
 *    is definitively invalid), not on network timeouts or 5xx errors.
 */

import { useEffect } from 'react'
import { useAuthStore, type AuthUser } from '@/store/auth.store'
import { api, setAccessToken, ensureFreshToken, clearSessionAndRedirect } from '@/lib/api-client'

// Module-level flag — survives StrictMode re-mounts within the same page lifetime.
// Reset to false on full navigation (module is re-evaluated on hard navigation).
let hydrated = false

export default function TokenRehydrator() {
  const storeToken = useAuthStore((s) => s.accessToken)
  const setAuth = useAuthStore((s) => s.setAuth)
  const clearAuth = useAuthStore((s) => s.clearAuth)

  useEffect(() => {
    // Guard against StrictMode double-invocation and repeated re-renders
    if (hydrated) return
    hydrated = true

    let active = true

    const syncSession = async () => {
      try {
        // ── Step 1: Ensure the module-level accessToken is populated ──
        // If Zustand already has a token from sessionStorage rehydration, use it
        // directly. This avoids an unnecessary /auth/refresh round-trip and the
        // cross-origin cookie problem.
        let token: string | null = storeToken ?? null

        if (token) {
          // Sync the Zustand token into the api-client's module-level variable
          // in case onRehydrateStorage hasn't fired yet (timing race).
          setAccessToken(token)
        } else {
          // No token in store — attempt silent refresh. This path is only hit
          // on first-ever login (no sessionStorage) or after the access token
          // has been explicitly cleared. ensureFreshToken() uses raw fetch()
          // to avoid the apiFetch→401→ensureFreshToken recursion.
          token = await ensureFreshToken()
        }

        if (!active) return

        // ── Step 2: Validate session and refresh user profile / permissions ──
        // Always call /auth/me to ensure the Zustand store has the latest user
        // data and permissions, regardless of how we got the token.
        const freshUser = await api.get<AuthUser>('/auth/me')
        if (!active) return

        setAuth(freshUser, token)
      } catch (err: unknown) {
        if (!active) return

        // Determine whether this is a definitive auth failure or a transient error.
        // Only redirect to /login on explicit 401 responses. Transient errors
        // (network, 5xx) are logged but do not kick the user out — the existing
        // token in the store is still valid for making requests.
        const statusCode =
          (err as { statusCode?: number })?.statusCode ??
          (err as ApiError)?.statusCode ??
          0

        if (statusCode === 401) {
          console.warn('[TokenRehydrator] Session invalid — redirecting to login')
          clearAuth()
          clearSessionAndRedirect()
        } else {
          // Non-auth error (network glitch, API down). Log it but keep the user
          // on the page. React Query's retry logic will handle subsequent requests.
          console.error('[TokenRehydrator] Session sync failed (non-auth error):', err)
        }
      }
    }

    syncSession()

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // storeToken intentionally excluded — we read it once on mount to avoid
    // re-triggering on every setAuth() call.
  }, []) // Empty deps = run once on mount only

  return null
}

// Local type for error shape
interface ApiError {
  statusCode?: number
  message?: string
}
