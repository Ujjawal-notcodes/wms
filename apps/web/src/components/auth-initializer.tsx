'use client'

/**
 * AuthInitializer
 *
 * Blocks rendering of children until the Zustand auth store has fully rehydrated
 * from sessionStorage. Without this guard, React Query hooks on protected pages
 * (e.g. /skus) fire their first fetch before `onRehydrateStorage` calls
 * `setAccessToken()`, so requests go out with no Authorization header → 401.
 *
 * Usage: wrap the dashboard layout's <main> (or any client boundary that needs
 * the token to be available before queries run).
 */

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth.store'

export default function AuthInitializer({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    // Zustand persist middleware exposes a `_hasHydrated` flag on the store
    // via onFinishHydration. We poll once on mount — by the time the component
    // mounts client-side, rehydration is already complete in most cases.
    // The useAuthStore.persist.onFinishHydration callback is the canonical way.
    const unsubFinish = useAuthStore.persist.onFinishHydration(() => {
      setHydrated(true)
    })

    // If hydration already finished before we subscribed, mark as hydrated now.
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true)
    }

    return () => {
      unsubFinish()
    }
  }, [])

  if (!hydrated) {
    // Render nothing (or a minimal skeleton) until the token is available.
    // This avoids the flash of unauthenticated requests.
    return null
  }

  return <>{children}</>
}
