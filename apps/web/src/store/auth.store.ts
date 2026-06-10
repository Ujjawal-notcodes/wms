/**
 * Zustand auth store.
 * Holds the current user profile and access token in memory.
 * Persisted to sessionStorage so it survives page refreshes within the tab.
 *
 * Note: this file must NOT have 'use client' — it is imported by both client
 * components (fine) and the TokenRehydrator. The Zustand store itself is
 * inherently client-only (sessionStorage), so Next.js tree-shakes it correctly
 * without the directive.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { setAccessToken } from '@/lib/api-client'

export interface AuthUser {
  id: string
  email: string
  fullName: string
  orgId: string
  permissions: string[] // ['skus:read', 'inventory:create', ...]
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null

  // Actions
  setAuth: (user: AuthUser, accessToken: string) => void
  clearAuth: () => void
  hasPermission: (module: string, action: string) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,

      setAuth: (user, accessToken) => {
        setAccessToken(accessToken)
        set({ user, accessToken })
      },

      clearAuth: () => {
        setAccessToken(null)
        set({ user: null, accessToken: null })
      },

      hasPermission: (module, action) => {
        const perms = get().user?.permissions ?? []
        return perms.includes(`${module}:${action}`)
      },
    }),
    {
      name: 'wms-auth',
      storage: createJSONStorage(() =>
        // sessionStorage is only available in the browser
        typeof window !== 'undefined' ? sessionStorage : ({} as Storage)
      ),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
      }),
      onRehydrateStorage: () => (state) => {
        // Sync token into api-client immediately after Zustand rehydrates
        if (state?.accessToken) {
          setAccessToken(state.accessToken)
        }
      },
    },
  ),
)
