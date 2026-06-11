'use client'

/**
 * TokenRehydrator
 *
 * A fire-and-forget component that ensures the api-client's in-memory
 * `accessToken` variable is populated from the Zustand store as early as
 * possible after client-side hydration.
 *
 * It also fetches the latest user profile and permissions from `/auth/me`
 * on mount to ensure the client-side store is in sync with the database and
 * stale cached permissions are refreshed.
 */

import { useEffect } from 'react'
import { useAuthStore, type AuthUser } from '@/store/auth.store'
import { api, setAccessToken, ensureFreshToken } from '@/lib/api-client'

export default function TokenRehydrator() {
  const setAuth = useAuthStore((s) => s.setAuth)
  const clearAuth = useAuthStore((s) => s.clearAuth)

  useEffect(() => {
    let active = true

    const syncSession = async () => {
      try {
        const token = await ensureFreshToken()
        if (!active) return

        const freshUser = await api.get<AuthUser>('/auth/me')
        if (!active) return

        setAuth(freshUser, token)
      } catch (err) {
        console.error('Failed to sync user session on mount:', err)
        if (!active) return

        // Clear auth and session cookie, then redirect to login
        clearAuth()
        if (typeof window !== 'undefined') {
          document.cookie = 'wms_session=; path=/; max-age=0; samesite=lax'
          window.location.href = `/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`
        }
      }
    }

    syncSession()

    return () => {
      active = false
    }
  }, [setAuth, clearAuth])

  return null
}

