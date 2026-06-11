/**
 * Dashboard layout — wraps all authenticated pages with sidebar + topbar.
 * Server Component. Sidebar and Topbar are Client Components.
 */

import type { Metadata } from 'next'
import TokenRehydrator from '@/components/token-rehydrator'

export const metadata: Metadata = {
  title: { default: 'Dashboard', template: '%s | WMS' },
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar — fixed left */}
      <aside
        id="sidebar"
        className="hidden md:flex w-64 flex-col bg-slate-900 text-white flex-shrink-0"
      >
        <div className="flex h-16 items-center gap-3 px-4 border-b border-slate-700">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500">
            <span className="text-sm font-bold">W</span>
          </div>
          <span className="font-semibold">WMS</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {[
            { href: '/dashboard', label: 'Dashboard' },
            { href: '/inventory', label: 'Inventory' },
            { href: '/stock-ledger', label: 'Stock Ledger' },
            { href: '/skus', label: 'SKU Catalog' },
            { href: '/locations', label: 'Locations' },
            { href: '/transfers', label: 'Transfers' },
            { href: '/settings/users', label: 'Users' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-sm"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex h-16 items-center justify-between border-b bg-white px-6 flex-shrink-0">
          <div className="flex items-center gap-4">
            <input
              type="search"
              placeholder="Search SKUs, locations, transfers..."
              className="w-80 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-sm font-semibold">
              A
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          {/*
            TokenRehydrator is a tiny client component that calls setAccessToken()
            from the Zustand store on mount. It renders nothing visible — it just
            ensures the api-client module variable is populated before React Query
            hooks fire their first request. Pages still render immediately; if the
            token isn't ready, the api-client's 401→refresh→retry flow handles it.
          */}
          <TokenRehydrator />
          {children}
        </main>
      </div>
    </div>
  )
}
