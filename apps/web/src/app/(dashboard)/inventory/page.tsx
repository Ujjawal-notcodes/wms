'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import {
  Search,
  Plus,
  SlidersHorizontal,
  Loader2,
  Package,
  Layers,
  MapPin,
  HelpCircle,
  Shield,
  Download,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  createOpeningBalanceSchema,
  createAdjustmentSchema,
  type CreateOpeningBalanceInput,
  type CreateAdjustmentInput,
} from '@wms/shared'
import { useAuthStore } from '@/store/auth.store'

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
  isStorage?: boolean
  locatorCode?: string | null
  path?: string
}

interface InventoryBalance {
  id: string
  skuId: string
  skuCode: string
  skuName: string
  locationId: string
  locationCode: string
  locationName: string
  locationPath: string | null
  locationLevel: string | null
  displayAddress: string | null
  building: string | null
  floor: string | null
  address: string | null
  locatorCode: string | null
  quantity: string
  uom: string
  batchNo?: string | null
  inventoryState?: string | null
}

interface InventorySummary {
  totalSkus: number
  totalQuantity: number
  activeLocations: number
}

export default function InventoryPage() {
  const queryClient = useQueryClient()
  const { hasPermission, user } = useAuthStore()

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState('')

  if (user && !hasPermission('inventory', 'read')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6 bg-white border rounded-xl shadow-sm">
        <Shield className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-800">Access Denied</h2>
        <p className="text-slate-500 text-sm mt-2 max-w-md">
          You do not have the required permissions to view the inventory balances.
        </p>
      </div>
    )
  }
  const [locationFilter, setLocationFilter] = useState('')
  const [page, setPage] = useState(1)
  const limit = 20
  const [isExporting, setIsExporting] = useState(false)

  // Modal States
  const [isOpeningOpen, setIsOpeningOpen] = useState(false)
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false)

  // Fetch Inventory Balances
  const { data: inventoryData, isLoading: isInventoryLoading } = useQuery({
    queryKey: ['inventory', searchTerm, locationFilter, page],
    queryFn: () => {
      const params = new URLSearchParams()
      params.append('page', String(page))
      params.append('limit', String(limit))
      if (searchTerm) params.append('q', searchTerm)
      if (locationFilter) params.append('locationId', locationFilter)
      return api.get<{ data: InventoryBalance[]; total: number; hasMore: boolean }>(
        `/inventory?${params.toString()}`,
      )
    },
  })

  // Fetch Inventory Summary (KPIs)
  const { data: summaryData } = useQuery({
    queryKey: ['inventory-summary'],
    queryFn: () => api.get<InventorySummary>('/inventory/summary'),
  })

  // Fetch active SKUs (for dropdown select)
  const { data: skusData } = useQuery({
    queryKey: ['skus-lookup'],
    queryFn: () => api.get<{ data: SKU[] }>('/skus?limit=200'),
  })

  // Fetch active locations (for dropdown select and filters)
  const { data: locationsData } = useQuery({
    queryKey: ['locations-lookup'],
    queryFn: () => api.get<Location[]>('/locations'),
  })

  // Mutations
  const openingMutation = useMutation({
    mutationFn: (data: CreateOpeningBalanceInput) =>
      api.post<any>('/inventory/opening-balance', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
      setIsOpeningOpen(false)
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to post opening balance')
    },
  })

  const adjustmentMutation = useMutation({
    mutationFn: (data: CreateAdjustmentInput) =>
      api.post<any>('/inventory/adjustments', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
      setIsAdjustmentOpen(false)
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to post adjustment')
    },
  })

  // Form setups
  const openingForm = useForm<CreateOpeningBalanceInput>({
    resolver: zodResolver(createOpeningBalanceSchema),
    defaultValues: { skuId: '', locationId: '', quantity: undefined as any, remarks: '' },
  })

  const adjustmentForm = useForm<CreateAdjustmentInput>({
    resolver: zodResolver(createAdjustmentSchema),
    defaultValues: { skuId: '', locationId: '', quantity: undefined as any, reason: '', notes: '' },
  })

  // Allowed storage locations filter: column only
  const validStorageLocations = locationsData?.filter(
    (loc) => loc.isActive && loc.level === 'column',
  ) ?? []

  const handleOpenOpening = () => {
    openingForm.reset({
      skuId: skusData?.data?.[0]?.id || '',
      locationId: validStorageLocations?.[0]?.id || '',
      quantity: undefined as any,
      remarks: '',
    })
    setIsOpeningOpen(true)
  }

  const handleOpenAdjustment = () => {
    adjustmentForm.reset({
      skuId: skusData?.data?.[0]?.id || '',
      locationId: validStorageLocations?.[0]?.id || '',
      quantity: undefined as any,
      reason: '',
      notes: '',
    })
    setIsAdjustmentOpen(true)
  }

  const handleOpeningSubmit = (data: CreateOpeningBalanceInput) => {
    openingMutation.mutate(data)
  }

  const handleAdjustmentSubmit = (data: CreateAdjustmentInput) => {
    adjustmentMutation.mutate(data)
  }

  const totalPages = Math.ceil((inventoryData?.total ?? 0) / limit)

  const handleExportInventory = async () => {
    setIsExporting(true)
    try {
      let allBalances: InventoryBalance[] = []
      let currentPage = 1
      let hasMore = true

      while (hasMore) {
        const params = new URLSearchParams()
        params.append('page', String(currentPage))
        params.append('limit', '500')
        if (searchTerm) params.append('q', searchTerm)
        if (locationFilter) params.append('locationId', locationFilter)

        const res = await api.get<{ data: InventoryBalance[]; total: number; hasMore: boolean }>(
          `/inventory?${params.toString()}`,
        )
        allBalances = [...allBalances, ...res.data]
        hasMore = res.hasMore && res.data.length > 0
        currentPage++
      }

      if (allBalances.length === 0) {
        alert('No inventory balances found to export.')
        return
      }

      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '')
      const exportData = allBalances.map((row) => ({
        'SKU Code': row.skuCode,
        'SKU Name': row.skuName,
        'Location': row.locatorCode ?? row.locationCode,
        'Quantity': Number(row.quantity),
        'Batch': row.batchNo ?? '',
        'State': row.inventoryState ?? '',
        'UOM': row.uom,
      }))
      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Inventory')
      XLSX.writeFile(wb, `inventory_export_${dateStr}.xlsx`)
    } catch (error) {
      console.error('Failed to export inventory:', error)
      alert('Failed to export inventory.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Track current stock levels across all storage locations.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExportInventory}
            disabled={isExporting || !inventoryData?.data?.length}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-white"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isExporting ? 'Exporting...' : 'Export Excel'}
          </button>
          <button
            onClick={handleOpenAdjustment}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-350 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer text-sm"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Stock Adjustment
          </button>
          <button
            onClick={handleOpenOpening}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 font-semibold text-white hover:bg-brand-600 transition-colors cursor-pointer text-sm"
          >
            <Plus className="h-4 w-4" />
            Opening Stock
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border rounded-xl p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-500 rounded-lg">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Total SKUs In Stock</span>
            <span className="text-2xl font-bold text-slate-900">{summaryData?.totalSkus ?? 0}</span>
          </div>
        </div>
        <div className="bg-white border rounded-xl p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-50 text-purple-500 rounded-lg">
            <Layers className="h-6 w-6" />
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Quantity</span>
            <span className="text-2xl font-bold text-slate-900">
              {summaryData?.totalQuantity !== undefined ? Number(summaryData.totalQuantity).toLocaleString() : 0}
            </span>
          </div>
        </div>
        <div className="bg-white border rounded-xl p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-green-50 text-green-500 rounded-lg">
            <MapPin className="h-6 w-6" />
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Storage Locations</span>
            <span className="text-2xl font-bold text-slate-900">{summaryData?.activeLocations ?? 0}</span>
          </div>
        </div>
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
        <div className="w-full md:w-64">
          <select
            value={locationFilter}
            onChange={(e) => {
              setLocationFilter(e.target.value)
              setPage(1)
            }}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm bg-white"
          >
            <option value="">All Locations</option>
            {locationsData?.filter(l => l.isActive && l.level === 'column').map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.locatorCode ?? loc.code}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stock Table */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm text-slate-500">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-700 border-b">
              <tr>
                <th scope="col" className="px-6 py-4">SKU Code</th>
                <th scope="col" className="px-6 py-4">SKU Name</th>
                <th scope="col" className="px-6 py-4">Location</th>
                <th scope="col" className="px-6 py-4">Quantity</th>
                <th scope="col" className="px-6 py-4">UOM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 border-t border-slate-100">
              {isInventoryLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-brand-500" />
                    <span className="text-slate-400 mt-2 block text-sm">Loading stock levels...</span>
                  </td>
                </tr>
              ) : inventoryData?.data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    No inventory balances found.
                  </td>
                </tr>
              ) : (
                inventoryData?.data.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-mono font-medium text-slate-900">{row.skuCode}</td>
                    <td className="px-6 py-4 font-medium text-slate-900">{row.skuName}</td>
                    <td className="px-6 py-4 text-slate-700">
                      {row.locatorCode ? (
                        <div>
                          <div className="font-mono font-bold text-slate-900 tracking-wide">
                            {row.locatorCode}
                          </div>
                          {(row.building && row.building !== 'N/A') && (
                            <div className="text-xs text-slate-500 mt-0.5">
                              {row.building}{row.floor && row.floor !== 'N/A' ? ` › ${row.floor}` : ''}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div className="font-semibold text-slate-800">{row.locationName}</div>
                          <div className="font-mono text-xs text-slate-400">{row.locationCode}</div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      {Number(row.quantity).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-medium">{row.uom}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* OPENING BALANCE MODAL */}
      {isOpeningOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl border overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-slate-900">Post Opening Stock</h2>
            </div>
            <form onSubmit={openingForm.handleSubmit(handleOpeningSubmit)} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select SKU</label>
                <select
                  {...openingForm.register('skuId')}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {skusData?.data?.map((sku) => (
                    <option key={sku.id} value={sku.id}>
                      {sku.name} ({sku.skuCode})
                    </option>
                  ))}
                </select>
                {openingForm.formState.errors.skuId && (
                  <p className="text-xs text-red-500 mt-1">{openingForm.formState.errors.skuId.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Storage Location</label>
                <select
                  {...openingForm.register('locationId')}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">-- Select location --</option>
                  {validStorageLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.locatorCode ?? loc.code} — {loc.name}
                    </option>
                  ))}
                </select>
                {openingForm.formState.errors.locationId && (
                  <p className="text-xs text-red-500 mt-1">{openingForm.formState.errors.locationId.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 500"
                  {...openingForm.register('quantity', { valueAsNumber: true })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {openingForm.formState.errors.quantity && (
                  <p className="text-xs text-red-500 mt-1">{openingForm.formState.errors.quantity.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks</label>
                <textarea
                  placeholder="Initial balance load notes..."
                  rows={2}
                  {...openingForm.register('remarks')}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsOpeningOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-105 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={openingMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg cursor-pointer"
                >
                  {openingMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Submit Balance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADJUSTMENT MODAL */}
      {isAdjustmentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl border overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-slate-900">Stock Adjustment (+/-)</h2>
            </div>
            <form onSubmit={adjustmentForm.handleSubmit(handleAdjustmentSubmit)} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select SKU</label>
                <select
                  {...adjustmentForm.register('skuId')}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {skusData?.data?.map((sku) => (
                    <option key={sku.id} value={sku.id}>
                      {sku.name} ({sku.skuCode})
                    </option>
                  ))}
                </select>
                {adjustmentForm.formState.errors.skuId && (
                  <p className="text-xs text-red-500 mt-1">{adjustmentForm.formState.errors.skuId.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Storage Location</label>
                <select
                  {...adjustmentForm.register('locationId')}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">-- Select location --</option>
                  {validStorageLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.locatorCode ?? loc.code} — {loc.name}
                    </option>
                  ))}
                </select>
                {adjustmentForm.formState.errors.locationId && (
                  <p className="text-xs text-red-500 mt-1">{adjustmentForm.formState.errors.locationId.message}</p>
                )}
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label className="block text-xs font-semibold text-slate-700">Adjustment Quantity</label>
                  <span className="text-[10px] text-slate-400 font-semibold">(Use negative sign - for stock reduction)</span>
                </div>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 100 or -50"
                  {...adjustmentForm.register('quantity', { valueAsNumber: true })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {adjustmentForm.formState.errors.quantity && (
                  <p className="text-xs text-red-500 mt-1">{adjustmentForm.formState.errors.quantity.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Adjustment</label>
                <input
                  type="text"
                  placeholder="e.g. Stocktake discrepancy, Damaged items"
                  {...adjustmentForm.register('reason')}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {adjustmentForm.formState.errors.reason && (
                  <p className="text-xs text-red-500 mt-1">{adjustmentForm.formState.errors.reason.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Additional Notes</label>
                <textarea
                  placeholder="Optional notes..."
                  rows={2}
                  {...adjustmentForm.register('notes')}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsAdjustmentOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-105 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustmentMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg cursor-pointer"
                >
                  {adjustmentMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Submit Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
