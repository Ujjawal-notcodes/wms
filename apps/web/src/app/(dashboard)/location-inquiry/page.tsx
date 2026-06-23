'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Search, Loader2, Package, MapPin, Shield, Layers } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'

interface Location {
  id: string
  name: string
  code: string
  level: string
  path: string
  isActive: boolean
}

interface LocationStockItem {
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
  inventoryState: string
  batchNo: string | null
  displayAddress: string
}

export default function LocationInquiryPage() {
  const { hasPermission, user } = useAuthStore()
  const [selectedLocationId, setSelectedLocationId] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')

  if (user && !hasPermission('inventory', 'read')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6 bg-white border rounded-xl shadow-sm">
        <Shield className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-800">Access Denied</h2>
        <p className="text-slate-500 text-sm mt-2 max-w-md">
          You do not have the required permissions to access location inquiries.
        </p>
      </div>
    )
  }

  // Fetch active locations list for lookup/selector
  const { data: locationsData, isLoading: isLocationsLoading } = useQuery({
    queryKey: ['locations-lookup-inquiry'],
    queryFn: () => api.get<Location[]>('/locations'),
  })

  // Filter locations in frontend
  const filteredLocations = locationsData?.filter((loc) =>
    loc.isActive &&
    `${loc.name} ${loc.code} ${loc.path}`.toLowerCase().includes(searchTerm.toLowerCase())
  ) ?? []

  // Fetch Stock details for the selected location (using the GET /locations/:id/stock endpoint)
  const { data: stockData, isLoading: isStockLoading } = useQuery({
    queryKey: ['location-stock-inquiry', selectedLocationId],
    queryFn: () =>
      selectedLocationId
        ? api.get<{ locationId: string; locationPath: string; items: LocationStockItem[] }>(
            `/locations/${selectedLocationId}/stock`,
          )
        : null,
    enabled: !!selectedLocationId,
  })

  const selectedLoc = locationsData?.find((l) => l.id === selectedLocationId)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Location Inquiry</h1>
        <p className="text-sm text-slate-500 mt-1">
          Lookup any location to inspect all SKUs, quantities, batches, and inventory states stored there recursively.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Search Sidebar */}
        <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4 h-fit">
          <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">Search Location</h2>
          
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              type="search"
              placeholder="Search by name, code or path..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
            />
          </div>

          <div className="border rounded-lg max-h-[300px] overflow-y-auto divide-y divide-slate-100">
            {isLocationsLoading ? (
              <div className="p-4 text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-brand-500" />
                <span className="text-xs text-slate-400 mt-1 block">Loading locations...</span>
              </div>
            ) : filteredLocations.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">No matching locations found.</div>
            ) : (
              filteredLocations.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => setSelectedLocationId(loc.id)}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors hover:bg-slate-50 flex items-start gap-2.5 ${
                    selectedLocationId === loc.id ? 'bg-brand-50 border-l-4 border-brand-500 font-medium' : ''
                  }`}
                >
                  <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold text-slate-900">{loc.name} ({loc.code})</div>
                    <div className="text-[10px] font-mono text-slate-500 mt-0.5 break-all">{loc.path}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Stock Details View */}
        <div className="lg:col-span-2 space-y-6">
          {!selectedLocationId ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] text-center p-6 bg-white border border-dashed rounded-xl shadow-sm">
              <MapPin className="h-10 w-10 text-slate-300 mb-3" />
              <h3 className="text-sm font-semibold text-slate-700">No Location Selected</h3>
              <p className="text-xs text-slate-400 mt-1">
                Select a location from the left list to see all inventory and quantities stored there.
              </p>
            </div>
          ) : isStockLoading ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] text-center p-6 bg-white border rounded-xl shadow-sm">
              <Loader2 className="h-8 w-8 animate-spin text-brand-500 mb-3" />
              <span className="text-sm text-slate-500">Retrieving location inventory levels...</span>
            </div>
          ) : !stockData?.items || stockData.items.length === 0 ? (
            <div className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-slate-50 text-slate-400 rounded-lg">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{selectedLoc?.name}</h3>
                  <p className="text-xs text-slate-500">{selectedLoc?.path}</p>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center min-h-[200px] text-center border-t pt-4">
                <p className="text-sm text-slate-400 font-medium">Empty Location</p>
                <p className="text-xs text-slate-400 mt-1">There are no inventory balances currently at this location or its children.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Location Card */}
              <div className="bg-white border rounded-xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="p-3 bg-brand-50 text-brand-500 rounded-xl">
                    <MapPin className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {selectedLoc?.name} ({selectedLoc?.code})
                    </h3>
                    <p className="text-xs font-mono text-slate-500 break-all">{stockData.locationPath}</p>
                  </div>
                </div>
                <div className="bg-slate-50 border rounded-xl px-5 py-3 shrink-0 flex flex-col justify-center text-right sm:min-w-[120px]">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Total Items</span>
                  <span className="text-xl font-extrabold text-slate-900">
                    {stockData.items.length} <span className="text-xs font-normal text-slate-500">lines</span>
                  </span>
                </div>
              </div>

              {/* Inventory Items list */}
              <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b bg-slate-50/50 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-brand-500" />
                  <h3 className="text-sm font-semibold text-slate-800">Inventory Items Stored</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm text-slate-500">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-700 border-b">
                      <tr>
                        <th scope="col" className="px-5 py-3">SKU</th>
                        <th scope="col" className="px-5 py-3">Batch/Lot</th>
                        <th scope="col" className="px-5 py-3">State</th>
                        <th scope="col" className="px-5 py-3">Location Details</th>
                        <th scope="col" className="px-5 py-3 text-right">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 border-t">
                      {stockData.items.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/50">
                          <td className="px-5 py-4">
                            <div className="font-mono font-bold text-slate-900">{row.skuCode}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{row.skuName}</div>
                          </td>
                          <td className="px-5 py-4">
                            {row.batchNo ? (
                              <span className="font-mono text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded">
                                {row.batchNo}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 italic">None</span>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              row.inventoryState === 'available' ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20' :
                              row.inventoryState === 'qc_hold' ? 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20' :
                              row.inventoryState === 'damaged' ? 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {row.inventoryState}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <div className="text-xs text-slate-800">{row.locationName} ({row.locationCode})</div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">{row.locationPath}</div>
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
