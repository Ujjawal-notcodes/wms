'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import {
  Search,
  ArrowRight,
  Loader2,
  ArrowLeftRight,
  Package,
  MapPin,
  Plus,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createTransferSchema, type CreateTransferInput } from '@wms/shared'

interface SKU {
  id: string
  skuCode: string
  name: string
  uom: string
}

interface Location {
  id: string
  name: string
  code: string
  level: string
  isActive: boolean
}

interface TransferRecord {
  id: string
  performed_at: string
  sku_id: string
  sku_code: string
  sku_name: string
  uom: string
  from_location_id: string
  from_location_code: string
  from_location_name: string
  to_location_id: string
  to_location_code: string
  to_location_name: string
  quantity: string
  performed_by_name: string
  notes: string | null
}

const STORAGE_LEVELS = ['store', 'rack', 'bin', 'shelf']

export default function TransfersPage() {
  const queryClient = useQueryClient()

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [fromLocFilter, setFromLocFilter] = useState('')
  const [toLocFilter, setToLocFilter] = useState('')
  const [page, setPage] = useState(1)
  const limit = 20

  // Modal
  const [isOpen, setIsOpen] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  // ─── Queries ────────────────────────────────────────────────

  const { data: transfersData, isLoading } = useQuery({
    queryKey: ['transfers', searchTerm, fromLocFilter, toLocFilter, page],
    queryFn: () => {
      const params = new URLSearchParams()
      params.append('page', String(page))
      params.append('limit', String(limit))
      if (searchTerm) params.append('q', searchTerm)
      if (fromLocFilter) params.append('fromLocationId', fromLocFilter)
      if (toLocFilter) params.append('toLocationId', toLocFilter)
      return api.get<{ data: TransferRecord[]; total: number; hasMore: boolean }>(
        `/transfers?${params.toString()}`,
      )
    },
  })

  const { data: skusData } = useQuery({
    queryKey: ['skus-lookup'],
    queryFn: () => api.get<{ data: SKU[] }>('/skus?limit=200'),
  })

  const { data: locationsData } = useQuery({
    queryKey: ['locations-lookup'],
    queryFn: () => api.get<Location[]>('/locations'),
  })

  // ─── Mutation ───────────────────────────────────────────────

  const transferMutation = useMutation({
    mutationFn: (data: CreateTransferInput) => api.post<any>('/transfers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
      setIsOpen(false)
      setApiError(null)
      form.reset()
    },
    onError: (err: any) => {
      setApiError(err.message || 'Transfer failed. Please try again.')
    },
  })

  // ─── Form ───────────────────────────────────────────────────

  const form = useForm<CreateTransferInput>({
    resolver: zodResolver(createTransferSchema),
    defaultValues: {
      skuId: '',
      fromLocationId: '',
      toLocationId: '',
      quantity: undefined as any,
      notes: '',
    },
  })

  const storageLocations = (locationsData ?? []).filter(
    (l) => l.isActive && STORAGE_LEVELS.includes(l.level),
  )

  const handleOpen = () => {
    setApiError(null)
    form.reset({
      skuId: skusData?.data?.[0]?.id ?? '',
      fromLocationId: storageLocations?.[0]?.id ?? '',
      toLocationId: storageLocations?.[1]?.id ?? '',
      quantity: undefined as any,
      notes: '',
    })
    setIsOpen(true)
  }

  const onSubmit = (data: CreateTransferInput) => {
    setApiError(null)
    transferMutation.mutate(data)
  }

  const totalPages = Math.ceil((transfersData?.total ?? 0) / limit)

  // ─── Helpers ────────────────────────────────────────────────

  const formatDate = (iso: string) => {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  }

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Transfers</h1>
          <p className="text-sm text-slate-500 mt-1">
            Move inventory between storage locations. Stock levels update immediately.
          </p>
        </div>
        <button
          id="btn-new-transfer"
          onClick={handleOpen}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 font-semibold text-white hover:bg-brand-600 transition-colors cursor-pointer text-sm"
        >
          <Plus className="h-4 w-4" />
          New Transfer
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white border rounded-xl p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-500 rounded-lg">
            <ArrowLeftRight className="h-6 w-6" />
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Total Transfers
            </span>
            <span className="text-2xl font-bold text-slate-900">
              {transfersData?.total ?? 0}
            </span>
          </div>
        </div>

        <div className="bg-white border rounded-xl p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-500 rounded-lg">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Unique SKUs Moved
            </span>
            <span className="text-2xl font-bold text-slate-900">
              {new Set(transfersData?.data?.map((t) => t.sku_id) ?? []).size}
            </span>
          </div>
        </div>

        <div className="bg-white border rounded-xl p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-500 rounded-lg">
            <MapPin className="h-6 w-6" />
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Storage Locations
            </span>
            <span className="text-2xl font-bold text-slate-900">
              {storageLocations.length}
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-4 rounded-xl border shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            id="transfer-search"
            type="search"
            placeholder="Search by SKU code, name, or location..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setPage(1)
            }}
            className="w-full pl-9 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
        </div>
        <div className="w-full md:w-52">
          <select
            id="filter-from-location"
            value={fromLocFilter}
            onChange={(e) => {
              setFromLocFilter(e.target.value)
              setPage(1)
            }}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm bg-white"
          >
            <option value="">All Source Locations</option>
            {(locationsData ?? [])
              .filter((l) => l.isActive)
              .map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
          </select>
        </div>
        <div className="w-full md:w-52">
          <select
            id="filter-to-location"
            value={toLocFilter}
            onChange={(e) => {
              setToLocFilter(e.target.value)
              setPage(1)
            }}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm bg-white"
          >
            <option value="">All Dest. Locations</option>
            {(locationsData ?? [])
              .filter((l) => l.isActive)
              .map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* Transfers Table */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm text-slate-500">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-700 border-b">
              <tr>
                <th scope="col" className="px-6 py-4">SKU</th>
                <th scope="col" className="px-6 py-4">From</th>
                <th scope="col" className="px-6 py-4"></th>
                <th scope="col" className="px-6 py-4">To</th>
                <th scope="col" className="px-6 py-4">Quantity</th>
                <th scope="col" className="px-6 py-4">Moved By</th>
                <th scope="col" className="px-6 py-4">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 border-t border-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-brand-500" />
                    <span className="text-slate-400 mt-2 block text-sm">Loading transfers...</span>
                  </td>
                </tr>
              ) : !transfersData?.data?.length ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <ArrowLeftRight className="h-10 w-10 text-slate-300" />
                      <span className="font-medium">No transfers recorded yet</span>
                      <span className="text-xs">Click "New Transfer" to move inventory between locations.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                transfersData.data.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{row.sku_name}</div>
                      <div className="font-mono text-xs text-slate-400">{row.sku_code}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-800">{row.from_location_name}</div>
                      <div className="font-mono text-xs text-slate-400">{row.from_location_code}</div>
                    </td>
                    <td className="px-4 py-4 text-slate-300">
                      <ArrowRight className="h-4 w-4" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-800">{row.to_location_name}</div>
                      <div className="font-mono text-xs text-slate-400">{row.to_location_code}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-slate-900">
                        {Number(row.quantity).toLocaleString()}
                      </span>
                      <span className="ml-1 text-xs text-slate-400">{row.uom}</span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{row.performed_by_name}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs whitespace-nowrap">
                      {formatDate(row.performed_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t text-sm text-slate-600">
            <span>
              Page {page} of {totalPages} ({transfersData?.total ?? 0} records)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* NEW TRANSFER MODAL */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl border overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-500 rounded-lg">
                <ArrowLeftRight className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">New Transfer</h2>
                <p className="text-xs text-slate-400">Move stock between storage locations</p>
              </div>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4">
              {/* API Error Banner */}
              {apiError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  {apiError}
                </div>
              )}

              {/* SKU */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  SKU <span className="text-red-500">*</span>
                </label>
                <select
                  id="transfer-sku"
                  {...form.register('skuId')}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">— Select SKU —</option>
                  {skusData?.data?.map((sku) => (
                    <option key={sku.id} value={sku.id}>
                      {sku.name} ({sku.skuCode})
                    </option>
                  ))}
                </select>
                {form.formState.errors.skuId && (
                  <p className="text-xs text-red-500 mt-1">{form.formState.errors.skuId.message}</p>
                )}
              </div>

              {/* From / To Locations */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    From Location <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="transfer-from-location"
                    {...form.register('fromLocationId')}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">— Source —</option>
                    {storageLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                  {form.formState.errors.fromLocationId && (
                    <p className="text-xs text-red-500 mt-1">
                      {form.formState.errors.fromLocationId.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    To Location <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="transfer-to-location"
                    {...form.register('toLocationId')}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">— Destination —</option>
                    {storageLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                  {form.formState.errors.toLocationId && (
                    <p className="text-xs text-red-500 mt-1">
                      {form.formState.errors.toLocationId.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quantity <span className="text-red-500">*</span>
                </label>
                <input
                  id="transfer-quantity"
                  type="number"
                  step="any"
                  min="0.0001"
                  placeholder="e.g. 50"
                  {...form.register('quantity', { valueAsNumber: true })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {form.formState.errors.quantity && (
                  <p className="text-xs text-red-500 mt-1">
                    {form.formState.errors.quantity.message}
                  </p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notes <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  id="transfer-notes"
                  placeholder="Reason for transfer, batch details..."
                  rows={2}
                  {...form.register('notes')}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>

              {/* Info tip */}
              <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700">
                Stock at the source location will be deducted immediately. Inventory balances update in real time.
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false)
                    setApiError(null)
                  }}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn-submit-transfer"
                  disabled={transferMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg cursor-pointer disabled:opacity-60"
                >
                  {transferMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Execute Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
