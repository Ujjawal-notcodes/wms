'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Search, Loader2, Package, MapPin, Shield } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'

interface SKU {
  id: string
  skuCode: string
  name: string
  uom: string
}

interface SkuStockItem {
  id: string
  skuId: string
  skuCode: string
  skuName: string
  locationId: string
  locationCode: string
  locationName: string
  locationPath: string
  quantity: string
  uom: string
  building: string
  floor: string
  address: string
}

export default function SkuInquiryPage() {
  const { hasPermission, user } = useAuthStore()
  const [selectedSkuId, setSelectedSkuId] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')

  if (user && !hasPermission('inventory', 'read')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6 bg-white border rounded-xl shadow-sm">
        <Shield className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-800">Access Denied</h2>
        <p className="text-slate-500 text-sm mt-2 max-w-md">
          You do not have the required permissions to access SKU inquiries.
        </p>
      </div>
    )
  }

  // Fetch active SKUs list for lookup/selector
  const { data: skusData, isLoading: isSkusLoading } = useQuery({
    queryKey: ['skus-lookup-inquiry'],
    queryFn: () => api.get<{ data: SKU[] }>('/skus?limit=200'),
  })

  // Filter SKUs list in frontend for quick autocomplete dropdown search
  const filteredSkus = skusData?.data?.filter((sku) =>
    `${sku.skuCode} ${sku.name}`.toLowerCase().includes(searchTerm.toLowerCase()),
  ) ?? []

  // Fetch Stock details for the selected SKU
  const { data: stockData, isLoading: isStockLoading } = useQuery({
    queryKey: ['sku-stock-inquiry', selectedSkuId],
    queryFn: () =>
      selectedSkuId
        ? api.get<{ data: SkuStockItem[] }>(`/inventory?skuId=${selectedSkuId}&limit=100`)
        : null,
    enabled: !!selectedSkuId,
  })

  // Total quantity calculation
  const totalQty = stockData?.data?.reduce((acc, row) => acc + Number(row.quantity), 0) ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">SKU Inquiry</h1>
        <p className="text-sm text-slate-500 mt-1">
          Lookup a SKU to find exactly where it is stored and its quantities.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Search Sidebar */}
        <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4 h-fit">
          <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">Search SKU</h2>
          
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              type="search"
              placeholder="Type SKU code or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
            />
          </div>

          <div className="border rounded-lg max-h-[300px] overflow-y-auto divide-y divide-slate-100">
            {isSkusLoading ? (
              <div className="p-4 text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-brand-500" />
                <span className="text-xs text-slate-400 mt-1 block">Loading SKUs...</span>
              </div>
            ) : filteredSkus.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">No matching SKUs found.</div>
            ) : (
              filteredSkus.map((sku) => (
                <button
                  key={sku.id}
                  onClick={() => setSelectedSkuId(sku.id)}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors hover:bg-slate-50 flex items-start gap-2.5 ${
                    selectedSkuId === sku.id ? 'bg-brand-50 border-l-4 border-brand-500 font-medium' : ''
                  }`}
                >
                  <Package className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-mono font-bold text-slate-900">{sku.skuCode}</div>
                    <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{sku.name}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Stock Details View */}
        <div className="lg:col-span-2 space-y-6">
          {!selectedSkuId ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] text-center p-6 bg-white border border-dashed rounded-xl shadow-sm">
              <Package className="h-10 w-10 text-slate-300 mb-3" />
              <h3 className="text-sm font-semibold text-slate-700">No SKU Selected</h3>
              <p className="text-xs text-slate-400 mt-1">
                Select a SKU from the left list to see its physical stock distribution.
              </p>
            </div>
          ) : isStockLoading ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] text-center p-6 bg-white border rounded-xl shadow-sm">
              <Loader2 className="h-8 w-8 animate-spin text-brand-500 mb-3" />
              <span className="text-sm text-slate-500">Retrieving stock balance records...</span>
            </div>
          ) : !stockData?.data || stockData.data.length === 0 ? (
            <div className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-slate-50 text-slate-400 rounded-lg">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">
                    {skusData?.data?.find((s) => s.id === selectedSkuId)?.skuCode}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {skusData?.data?.find((s) => s.id === selectedSkuId)?.name}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center min-h-[200px] text-center border-t pt-4">
                <p className="text-sm text-slate-400 font-medium">Out of Stock</p>
                <p className="text-xs text-slate-400 mt-1">There are no inventory balances for this item in the warehouse.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* SKU Card */}
              <div className="bg-white border rounded-xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="p-3 bg-brand-50 text-brand-500 rounded-xl">
                    <Package className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-mono text-lg font-bold text-slate-900">
                      {stockData.data[0].skuCode}
                    </h3>
                    <p className="text-sm text-slate-500">{stockData.data[0].skuName}</p>
                  </div>
                </div>
                <div className="bg-slate-50 border rounded-xl px-5 py-3 shrink-0 flex flex-col justify-center text-right sm:min-w-[120px]">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Total Qty</span>
                  <span className="text-xl font-extrabold text-slate-900">
                    {totalQty.toLocaleString()} <span className="text-xs font-normal text-slate-500">{stockData.data[0].uom}</span>
                  </span>
                </div>
              </div>

              {/* Locations Table */}
              <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b bg-slate-50/50 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-brand-500" />
                  <h3 className="text-sm font-semibold text-slate-800">Physical Stock Distribution</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm text-slate-500">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-700 border-b">
                      <tr>
                        <th scope="col" className="px-5 py-3">Building</th>
                        <th scope="col" className="px-5 py-3">Floor</th>
                        <th scope="col" className="px-5 py-3">Address</th>
                        <th scope="col" className="px-5 py-3">Full Path</th>
                        <th scope="col" className="px-5 py-3 text-right">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 border-t">
                      {stockData.data.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/50">
                          <td className="px-5 py-4 font-semibold text-slate-900">{row.building}</td>
                          <td className="px-5 py-4 text-slate-700">{row.floor}</td>
                          <td className="px-5 py-4">
                            <span className="font-mono bg-slate-100 text-slate-800 px-2 py-1 rounded text-xs">
                              {row.address}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-slate-500">
                            <span className="font-mono text-xs break-all">{row.locationPath}</span>
                          </td>
                          <td className="px-5 py-4 font-bold text-slate-900 text-right">
                            {Number(row.quantity).toLocaleString()} <span className="text-xs font-normal text-slate-400">{row.uom}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
