'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import {
  Search,
  Loader2,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

interface StockMovement {
  id: string
  skuCode: string
  skuName: string
  locationCode: string
  locationName: string
  eventType: string
  quantity: string
  uom: string
  performedByName: string
  performedAt: string
  notes: string | null
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  opening_balance: 'Opening Balance',
  adjustment: 'Stock Adjustment',
  transfer_in: 'Transfer In',
  transfer_out: 'Transfer Out',
  cycle_count: 'Cycle Count',
}

export default function StockLedgerPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [eventTypeFilter, setEventTypeFilter] = useState('')
  const [page, setPage] = useState(1)
  const limit = 25

  // Fetch stock ledger movements
  const { data: movementsData, isLoading } = useQuery({
    queryKey: ['stock-movements', searchTerm, eventTypeFilter, page],
    queryFn: () => {
      const params = new URLSearchParams()
      params.append('page', String(page))
      params.append('limit', String(limit))
      if (searchTerm) params.append('q', searchTerm)
      if (eventTypeFilter) params.append('eventType', eventTypeFilter)
      return api.get<{ data: StockMovement[]; total: number; hasMore: boolean }>(
        `/inventory/movements?${params.toString()}`,
      )
    },
  })

  const totalPages = Math.ceil((movementsData?.total ?? 0) / limit)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Stock Ledger</h1>
        <p className="text-sm text-slate-500 mt-1">
          Read-only audit log of all inventory movements and stock adjustments.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-4 rounded-xl border shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            type="search"
            placeholder="Search by SKU Code, SKU Name, Location Code or Location Name..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setPage(1)
            }}
            className="w-full pl-9 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
        </div>
        <div className="w-full md:w-56">
          <select
            value={eventTypeFilter}
            onChange={(e) => {
              setEventTypeFilter(e.target.value)
              setPage(1)
            }}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm bg-white"
          >
            <option value="">All Event Types</option>
            <option value="opening_balance">Opening Balance</option>
            <option value="adjustment">Stock Adjustment</option>
          </select>
        </div>
      </div>

      {/* Table Listing */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm text-slate-500">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-700 border-b">
              <tr>
                <th scope="col" className="px-6 py-4">Date</th>
                <th scope="col" className="px-6 py-4">SKU Code</th>
                <th scope="col" className="px-6 py-4">SKU Name</th>
                <th scope="col" className="px-6 py-4">Location</th>
                <th scope="col" className="px-6 py-4">Event Type</th>
                <th scope="col" className="px-6 py-4">Quantity</th>
                <th scope="col" className="px-6 py-4">User</th>
                <th scope="col" className="px-6 py-4">Notes / Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 border-t border-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-brand-500" />
                    <span className="text-slate-400 mt-2 block text-sm">Loading audit log...</span>
                  </td>
                </tr>
              ) : movementsData?.data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    No transactions found in ledger history.
                  </td>
                </tr>
              ) : (
                movementsData?.data.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600 font-mono text-xs flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      {new Date(row.performedAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-mono font-medium text-slate-900">{row.skuCode}</td>
                    <td className="px-6 py-4 font-medium text-slate-900">{row.skuName}</td>
                    <td className="px-6 py-4 text-slate-700">
                      {row.locationName} ({row.locationCode})
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                        row.eventType === 'opening_balance'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-yellow-50 text-yellow-800 border border-yellow-250'
                      }`}>
                        {EVENT_TYPE_LABELS[row.eventType] || row.eventType}
                      </span>
                    </td>
                    <td className={`px-6 py-4 font-semibold ${
                      Number(row.quantity) > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {Number(row.quantity) > 0 ? '+' : ''}
                      {Number(row.quantity).toLocaleString()} <span className="text-xs font-normal text-slate-400">{row.uom}</span>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-700">{row.performedByName}</td>
                    <td className="px-6 py-4 text-xs max-w-sm truncate text-slate-650" title={row.notes || ''}>
                      {row.notes || <span className="text-slate-300 italic">No notes</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t bg-white px-6 py-4">
            <div className="flex flex-1 justify-between sm:hidden">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="relative inline-flex items-center rounded-md border bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
                className="relative ml-3 inline-flex items-center rounded-md border bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Showing page <span className="font-semibold text-slate-900">{page}</span> of{' '}
                  <span className="font-semibold text-slate-900">{totalPages}</span> ({movementsData?.total} total records)
                </p>
              </div>
              <div>
                <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                    className="relative inline-flex items-center rounded-l-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-305 hover:bg-slate-50 focus:z-20 focus:outline-offset-0 cursor-pointer disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setPage(i + 1)}
                      className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold focus:z-20 cursor-pointer ${
                        page === i + 1
                          ? 'z-10 bg-brand-500 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500'
                          : 'text-slate-900 ring-1 ring-inset ring-slate-305 hover:bg-slate-50 focus:outline-offset-0'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage(page + 1)}
                    className="relative inline-flex items-center rounded-r-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-305 hover:bg-slate-50 focus:z-20 focus:outline-offset-0 cursor-pointer disabled:opacity-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
