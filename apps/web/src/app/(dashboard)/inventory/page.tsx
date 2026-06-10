import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Inventory' }
export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <p className="text-slate-400 text-sm text-center py-8">Inventory management — coming in feature sprint.</p>
      </div>
    </div>
  )
}
