'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/auth.store'
import { usePathname } from 'next/navigation'

export function SidebarNav() {
  const pathname = usePathname()
  const user = useAuthStore((s) => s.user)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', module: 'dashboard', action: 'read' },
    { href: '/inventory', label: 'Inventory', module: 'inventory', action: 'read' },
    { href: '/stock-ledger', label: 'Stock Ledger', module: 'inventory', action: 'read' },
    { href: '/skus', label: 'SKU Catalog', module: 'skus', action: 'read' },
    { href: '/locations', label: 'Locations', module: 'locations', action: 'read' },
    { href: '/transfers', label: 'Transfers', module: 'transfers', action: 'read' },
    { href: '/settings/users', label: 'Users', module: 'users', action: 'read' },
  ]

  if (!mounted) {
    return <nav className="flex-1 p-3 space-y-1" />
  }

  // Filter items based on user permission strings
  const visibleItems = navItems.filter((item) => hasPermission(item.module, item.action))

  return (
    <nav className="flex-1 p-3 space-y-1">
      {visibleItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <a
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all text-sm ${
              isActive
                ? 'bg-slate-800 text-white font-semibold shadow-sm'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            {item.label}
          </a>
        )
      })}
    </nav>
  )
}

