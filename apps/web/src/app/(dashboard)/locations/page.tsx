'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import {
  Search,
  Plus,
  Edit2,
  Power,
  Loader2,
  Info,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  createSiteSchema,
  createLocationSchema,
  type CreateSiteInput,
  type CreateLocationInput,
} from '@wms/shared'

interface Site {
  id: string
  name: string
  code: string
  siteType: 'factory' | 'warehouse' | '3pl' | 'transit'
  isActive: boolean
  createdAt: string
}

interface Location {
  id: string
  siteId: string
  siteName: string
  siteCode: string
  parentId: string | null
  name: string
  code: string
  level: 'building' | 'floor' | 'rack' | 'bin' | 'shelf' | 'store'
  path: string
  isStorage: boolean
  capacity: string | null
  capacityUnit: string | null
  maxWeight: string | null
  maxVolume: string | null
  notes: string | null
  isActive: boolean
  createdAt: string
}

interface CombinedItem {
  id: string
  name: string
  code: string
  type: string      // Mapped type: Factory, Warehouse, Store, Rack, Bin, etc.
  rawType: string   // Raw DB level / siteType value
  isSite: boolean
  parentName: string
  isActive: boolean
  maxWeight: number | null
  maxVolume: number | null
  notes: string | null
  siteId?: string
  parentId?: string | null
}

const TYPE_LABELS: Record<string, string> = {
  factory: 'Factory',
  warehouse: 'Warehouse',
  store: 'Store',
  rack: 'Rack',
  bin: 'Bin',
  building: 'Building',
  floor: 'Floor',
  shelf: 'Shelf',
}

const TYPE_ORDER: Record<string, number> = {
  factory: 1,
  warehouse: 2,
  store: 3,
  rack: 4,
  bin: 5,
  building: 6,
  floor: 7,
  shelf: 8,
}

export default function LocationsPage() {
  const queryClient = useQueryClient()

  // Search and Filter States
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Modal States
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<CombinedItem | null>(null)
  const [createType, setCreateType] = useState<'Factory' | 'Warehouse' | 'Store' | 'Rack' | 'Bin'>('Factory')

  // Fetch Sites & Locations in parallel
  const { data: sitesData, isLoading: isSitesLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.get<Site[]>('/locations/sites'),
  })

  const { data: locationsData, isLoading: isLocationsLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get<Location[]>('/locations'),
  })

  // Mutations
  const createSiteMutation = useMutation({
    mutationFn: (newSite: CreateSiteInput) => api.post<Site>('/locations/sites', newSite),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      setIsCreateOpen(false)
    },
  })

  const updateSiteMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateSiteInput> }) =>
      api.put<Site>(`/locations/sites/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      setEditingItem(null)
    },
  })

  const createLocationMutation = useMutation({
    mutationFn: (newLoc: CreateLocationInput) => api.post<Location>('/locations', newLoc),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      setIsCreateOpen(false)
    },
  })

  const updateLocationMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateLocationInput> }) =>
      api.put<Location>(`/locations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      setEditingItem(null)
    },
  })

  // Combine and Format items
  const combinedItems: CombinedItem[] = []

  if (sitesData) {
    sitesData.forEach((site) => {
      combinedItems.push({
        id: site.id,
        name: site.name,
        code: site.code,
        type: TYPE_LABELS[site.siteType] || site.siteType,
        rawType: site.siteType,
        isSite: true,
        parentName: '—',
        isActive: site.isActive,
        maxWeight: null,
        maxVolume: null,
        notes: null,
      })
    })
  }

  if (locationsData) {
    locationsData.forEach((loc) => {
      combinedItems.push({
        id: loc.id,
        name: loc.name,
        code: loc.code,
        type: TYPE_LABELS[loc.level] || loc.level,
        rawType: loc.level,
        isSite: false,
        parentName: loc.siteName || '—',
        isActive: loc.isActive,
        maxWeight: loc.maxWeight ? Number(loc.maxWeight) : null,
        maxVolume: loc.maxVolume ? Number(loc.maxVolume) : null,
        notes: loc.notes,
        siteId: loc.siteId,
        parentId: loc.parentId,
      })
    })
  }

  // Filter Items
  const filteredItems = combinedItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.code.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = typeFilter ? item.rawType === typeFilter : true
    const matchesStatus = statusFilter ? String(item.isActive) === statusFilter : true
    return matchesSearch && matchesType && matchesStatus
  })

  // Sort: Type order (Factory -> Warehouse -> Store -> Rack -> Bin) then Code alphabetical
  const sortedItems = filteredItems.sort((a, b) => {
    const orderA = TYPE_ORDER[a.rawType] ?? 99
    const orderB = TYPE_ORDER[b.rawType] ?? 99
    if (orderA !== orderB) {
      return orderA - orderB
    }
    return a.code.localeCompare(b.code)
  })

  // Forms
  const siteForm = useForm<CreateSiteInput>({
    resolver: zodResolver(createSiteSchema),
    defaultValues: { name: '', code: '', siteType: 'factory', isActive: true },
  })

  const locationForm = useForm<CreateLocationInput>({
    resolver: zodResolver(createLocationSchema),
    defaultValues: {
      siteId: '',
      parentId: undefined,
      name: '',
      code: '',
      level: 'rack',
      isStorage: false,
      capacity: undefined,
      capacityUnit: 'pcs',
      maxWeight: undefined,
      maxVolume: undefined,
      notes: '',
      isActive: true,
    },
  })

  const handleOpenCreate = () => {
    siteForm.reset({ name: '', code: '', siteType: 'factory', isActive: true })
    locationForm.reset({
      siteId: sitesData?.[0]?.id || '',
      parentId: undefined,
      name: '',
      code: '',
      level: 'store',
      isStorage: false,
      capacity: undefined,
      capacityUnit: 'pcs',
      maxWeight: undefined,
      maxVolume: undefined,
      notes: '',
      isActive: true,
    })
    setCreateType('Factory')
    setIsCreateOpen(true)
  }

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (createType === 'Factory' || createType === 'Warehouse') {
      siteForm.handleSubmit((data) => {
        const payload = {
          ...data,
          siteType: createType.toLowerCase() as any,
        }
        createSiteMutation.mutate(payload)
      })(e)
    } else {
      locationForm.handleSubmit((data) => {
        const payload = {
          ...data,
          level: createType.toLowerCase() as any,
          isStorage: createType === 'Bin',
        }
        createLocationMutation.mutate(payload)
      })(e)
    }
  }

  const handleOpenEdit = (item: CombinedItem) => {
    setEditingItem(item)
    if (item.isSite) {
      siteForm.reset({
        name: item.name,
        code: item.code,
        siteType: item.rawType as any,
        isActive: item.isActive,
      })
    } else {
      locationForm.reset({
        siteId: item.siteId || '',
        parentId: item.parentId || undefined,
        name: item.name,
        code: item.code,
        level: item.rawType as any,
        isStorage: item.rawType === 'bin',
        maxWeight: item.maxWeight || undefined,
        maxVolume: item.maxVolume || undefined,
        notes: item.notes || '',
        isActive: item.isActive,
      })
    }
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingItem) return

    if (editingItem.isSite) {
      siteForm.handleSubmit((data) => {
        updateSiteMutation.mutate({
          id: editingItem.id,
          data: {
            name: data.name,
            siteType: data.siteType,
            isActive: data.isActive,
          },
        })
      })(e)
    } else {
      locationForm.handleSubmit((data) => {
        updateLocationMutation.mutate({
          id: editingItem.id,
          data: {
            name: data.name,
            maxWeight: data.maxWeight,
            maxVolume: data.maxVolume,
            notes: data.notes,
            isActive: data.isActive,
          },
        })
      })(e)
    }
  }

  const handleToggleStatus = (item: CombinedItem) => {
    const newStatus = !item.isActive
    if (item.isSite) {
      updateSiteMutation.mutate({ id: item.id, data: { isActive: newStatus } })
    } else {
      updateLocationMutation.mutate({ id: item.id, data: { isActive: newStatus } })
    }
  }

  const isLoading = isSitesLoading || isLocationsLoading

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Locations Hierarchy</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your physical Sites (Factories, Warehouses) and storage units (Stores, Racks, Bins).
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 font-semibold text-white hover:bg-brand-600 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Add Location
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-4 rounded-xl border shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            type="search"
            placeholder="Search by Code or Name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full md:w-44 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm bg-white"
          >
            <option value="">All Types</option>
            <option value="factory">Factory</option>
            <option value="warehouse">Warehouse</option>
            <option value="store">Store</option>
            <option value="rack">Rack</option>
            <option value="bin">Bin</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full md:w-36 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm bg-white"
          >
            <option value="">All Statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      {/* Table Listing */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm text-slate-500">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-700 border-b">
              <tr>
                <th scope="col" className="px-6 py-4">Code</th>
                <th scope="col" className="px-6 py-4">Name</th>
                <th scope="col" className="px-6 py-4">Type</th>
                <th scope="col" className="px-6 py-4">Parent Site</th>
                <th scope="col" className="px-6 py-4">Max Weight (kg)</th>
                <th scope="col" className="px-6 py-4">Max Volume (m³)</th>
                <th scope="col" className="px-6 py-4">Notes</th>
                <th scope="col" className="px-6 py-4">Status</th>
                <th scope="col" className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 border-t border-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-brand-500" />
                    <span className="text-slate-400 mt-2 block text-sm">Loading hierarchy...</span>
                  </td>
                </tr>
              ) : sortedItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                    No locations found matching the criteria.
                  </td>
                </tr>
              ) : (
                sortedItems.map((item) => (
                  <tr key={`${item.isSite ? 'site' : 'loc'}-${item.id}`} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-mono font-medium text-slate-900">{item.code}</td>
                    <td className="px-6 py-4 font-medium text-slate-900">{item.name}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${
                        item.rawType === 'factory' || item.rawType === 'warehouse'
                          ? 'bg-blue-50 text-blue-700'
                          : item.rawType === 'store'
                          ? 'bg-purple-50 text-purple-700'
                          : item.rawType === 'rack'
                          ? 'bg-yellow-50 text-yellow-750'
                          : 'bg-orange-50 text-orange-700'
                      }`}>
                        {item.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{item.parentName}</td>
                    <td className="px-6 py-4">{item.maxWeight !== null ? item.maxWeight.toLocaleString() : '—'}</td>
                    <td className="px-6 py-4">{item.maxVolume !== null ? item.maxVolume.toLocaleString() : '—'}</td>
                    <td className="px-6 py-4 max-w-xs truncate text-xs" title={item.notes || ''}>
                      {item.notes || <span className="text-slate-350 italic">None</span>}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                          item.isActive
                            ? 'bg-green-50 text-green-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {item.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="p-1.5 text-slate-400 hover:text-slate-650 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Edit Location"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(item)}
                          className={`p-1.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer ${
                            item.isActive ? 'text-red-400 hover:text-red-650' : 'text-green-400 hover:text-green-650'
                          }`}
                          title={item.isActive ? 'Deactivate' : 'Reactivate'}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl border overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-slate-900">Add Location Node</h2>
            </div>
            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              {/* Type Switcher */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">Node Type</label>
                <div className="grid grid-cols-5 gap-1 bg-slate-100 p-1 rounded-lg">
                  {(['Factory', 'Warehouse', 'Store', 'Rack', 'Bin'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setCreateType(t)}
                      className={`py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                        createType === t
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Form Fields for Sites (Factory/Warehouse) */}
              {(createType === 'Factory' || createType === 'Warehouse') && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Code</label>
                      <input
                        type="text"
                        placeholder="e.g. WH-NORTH"
                        {...siteForm.register('code')}
                        className="w-full px-3 py-2 border rounded-lg text-sm uppercase focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      {siteForm.formState.errors.code && (
                        <p className="text-xs text-red-500 mt-1">{siteForm.formState.errors.code.message}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
                      <input
                        type="text"
                        placeholder="e.g. North Warehouse"
                        {...siteForm.register('name')}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      {siteForm.formState.errors.name && (
                        <p className="text-xs text-red-500 mt-1">{siteForm.formState.errors.name.message}</p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Form Fields for Locations (Store/Rack/Bin) */}
              {(createType === 'Store' || createType === 'Rack' || createType === 'Bin') && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Parent Site</label>
                    <select
                      {...locationForm.register('siteId')}
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      {sitesData?.filter(s => s.isActive).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                    {locationForm.formState.errors.siteId && (
                      <p className="text-xs text-red-500 mt-1">{locationForm.formState.errors.siteId.message}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Code</label>
                      <input
                        type="text"
                        placeholder="e.g. RACK-01"
                        {...locationForm.register('code')}
                        className="w-full px-3 py-2 border rounded-lg text-sm uppercase focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      {locationForm.formState.errors.code && (
                        <p className="text-xs text-red-500 mt-1">{locationForm.formState.errors.code.message}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Storage Rack 1"
                        {...locationForm.register('name')}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      {locationForm.formState.errors.name && (
                        <p className="text-xs text-red-500 mt-1">{locationForm.formState.errors.name.message}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Max Weight (kg)</label>
                      <input
                        type="number"
                        placeholder="Optional"
                        {...locationForm.register('maxWeight')}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Max Volume (m³)</label>
                      <input
                        type="number"
                        placeholder="Optional"
                        {...locationForm.register('maxVolume')}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                    <textarea
                      placeholder="Optional details about this location..."
                      rows={2}
                      {...locationForm.register('notes')}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </>
              )}

              {/* Modal Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-650 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSiteMutation.isPending || createLocationMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg cursor-pointer"
                >
                  {(createSiteMutation.isPending || createLocationMutation.isPending) && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Create Node
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl border overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-slate-900">Edit Node: {editingItem.code}</h2>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Code</label>
                <div className="w-full px-3 py-2 border rounded-lg text-sm bg-slate-50 font-mono text-slate-650 select-none">
                  {editingItem.code}
                </div>
              </div>

              {/* Edit Form Fields for Sites */}
              {editingItem.isSite ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
                    <input
                      type="text"
                      {...siteForm.register('name')}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    {siteForm.formState.errors.name && (
                      <p className="text-xs text-red-500 mt-1">{siteForm.formState.errors.name.message}</p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Edit Form Fields for Locations */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
                    <input
                      type="text"
                      {...locationForm.register('name')}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    {locationForm.formState.errors.name && (
                      <p className="text-xs text-red-500 mt-1">{locationForm.formState.errors.name.message}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Max Weight (kg)</label>
                      <input
                        type="number"
                        placeholder="Optional"
                        {...locationForm.register('maxWeight')}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Max Volume (m³)</label>
                      <input
                        type="number"
                        placeholder="Optional"
                        {...locationForm.register('maxVolume')}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                    <textarea
                      placeholder="Optional details about this location..."
                      rows={2}
                      {...locationForm.register('notes')}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </>
              )}

              {/* Status Toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-slate-400" />
                  <span className="text-xs text-slate-650 font-medium">Node Active Status</span>
                </div>
                <input
                  type="checkbox"
                  {...(editingItem.isSite ? siteForm.register('isActive') : locationForm.register('isActive'))}
                  className="h-4 w-4 text-brand-500 rounded focus:ring-brand-500 border-slate-300"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-650 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateSiteMutation.isPending || updateLocationMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg cursor-pointer"
                >
                  {(updateSiteMutation.isPending || updateLocationMutation.isPending) && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
