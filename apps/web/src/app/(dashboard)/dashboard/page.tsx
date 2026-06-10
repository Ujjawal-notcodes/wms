import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard' }

/**
 * Dashboard overview page.
 *
 * KPI widgets (to be implemented):
 *   - Total active SKUs
 *   - Total inventory value (by site)
 *   - Pending transfers
 *   - Low-stock alerts count
 *   - Recent movements
 */
export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Inventory overview across all sites</p>
      </div>

      {/* KPI cards — stub */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Active SKUs', value: '—', color: 'brand' },
          { label: 'Factory Stock Items', value: '—', color: 'blue' },
          { label: 'Warehouse Stock Items', value: '—', color: 'green' },
          { label: 'Pending Transfers', value: '—', color: 'amber' },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{kpi.label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Placeholder for charts / tables */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <p className="text-slate-400 text-sm text-center py-8">
          Dashboard widgets will be implemented in the feature sprint.
        </p>
      </div>
    </div>
  )
}
