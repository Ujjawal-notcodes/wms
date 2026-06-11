'use client'

import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '@/store/auth.store'
import { api } from '@/lib/api-client'
import { LogOut, User as UserIcon } from 'lucide-react'

export function TopbarProfile() {
  const { user, clearAuth } = useAuthStore()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout')
    } catch (err) {
      console.error('Logout request failed:', err)
    } finally {
      clearAuth()
      document.cookie = 'wms_session=; path=/; max-age=0; samesite=lax'
      window.location.href = '/login'
    }
  }

  if (!user) return null

  const initials = user.fullName ? user.fullName.charAt(0).toUpperCase() : 'U'

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="h-9 w-9 rounded-full bg-indigo-600 hover:bg-indigo-700 transition-colors flex items-center justify-center text-white text-sm font-semibold cursor-pointer shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        {initials}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-lg border bg-white shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-4 py-3 border-b">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Signed in as</p>
            <p className="text-sm font-semibold text-slate-800 truncate">{user.fullName}</p>
            <p className="text-xs text-slate-500 truncate mt-0.5">{user.email}</p>
          </div>
          <div className="py-1">
            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
