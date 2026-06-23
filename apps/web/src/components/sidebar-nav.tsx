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

  if (!mounted) {
    return <nav className="flex-1 p-3 space-y-1" />
  }

  const canShowImport =
    hasPermission('locations', 'create') ||
    hasPermission('skus', 'create') ||
    hasPermission('inventory', 'post')

  const navGroups = [
    {
      title: 'General',
      items: [
        { href: '/dashboard', label: 'Dashboard', module: 'dashboard', action: 'read' },
        { href: '/inventory', label: 'Inventory', module: 'inventory', action: 'read' },
        { href: '/sku-inquiry', label: 'SKU Inquiry', module: 'inventory', action: 'read' },
        { href: '/location-inquiry', label: 'Location Inquiry', module: 'inventory', action: 'read' },
        { href: '/stock-ledger', label: 'Stock Ledger', module: 'inventory', action: 'read' },
        { href: '/transfers', label: 'Transfers', module: 'transfers', action: 'read' },
      ],
    },
    {
      title: 'Master Data',
      items: [
        { href: '/skus', label: 'SKUs', module: 'skus', action: 'read' },
        { href: '/locations', label: 'Locations', module: 'locations', action: 'read' },
        { href: '/dashboard/imports', label: 'Import Master Data', module: 'imports', action: 'read' },
      ],
    },
    {
      title: 'System',
      items: [
        { href: '/settings/users', label: 'Users', module: 'users', action: 'read' },
      ],
    },
  ]

  return (
    <nav className="flex-1 p-3 space-y-6">
      {navGroups.map((group) => {
        // Filter visible items in this group
        const visibleItems = group.items.filter((item) => {
          if (item.href === '/dashboard/imports') {
            return canShowImport
          }
          return hasPermission(item.module, item.action)
        })

        if (visibleItems.length === 0) return null

        return (
          <div key={group.title} className="space-y-1.5">
            <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {group.title}
            </h3>
            <div className="space-y-1">
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
            </div>
          </div>
        )
      })}
    </nav>
  )
}
