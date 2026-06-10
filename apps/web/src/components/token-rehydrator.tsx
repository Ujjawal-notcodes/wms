'use client'

/**
 * TokenRehydrator
 *
 * A fire-and-forget component that ensures the api-client's in-memory
 * `accessToken` variable is populated from the Zustand store as early as
 * possible after client-side hydration.
 *
 * Why this exists:
 *   The Zustand `persist` middleware hydrates from sessionStorage
 *   asynchronously. On first render the api-client's module-level `accessToken`
 *   variable is null. Without this component, the first React Query fetch on a
 *   protected page goes out without an Authorization header → 401.
 *
 *   The api-client WILL recover: it silently calls /auth/refresh on 401 and
 *   retries. But that adds an extra round-trip. This component eliminates it
 *   by pushing the token into the api-client module before queries fire.
 *
 * Crucially, this component does NOT block children from rendering.
 * Blank screens caused by AuthInitializer are avoided entirely.
 */

import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth.store'
import { setAccessToken } from '@/lib/api-client'

export default function TokenRehydrator() {
  const accessToken = useAuthStore((s) => s.accessToken)

  useEffect(() => {
    if (accessToken) {
      setAccessToken(accessToken)
    }
  }, [accessToken])

  return null
}
