'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import {
  Search,
  Plus,
  Edit2,
  Power,
  Loader2,
  Shield,
  Trash2,
  Building2,
  Layers,
  MapPin,
  Package,
  RefreshCw,
  Download,
  X,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  createLocationSchema,
  type CreateLocationInput,
} from '@wms/shared'
import { useAuthStore } from '@/store/auth.store'
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

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
  parentCode: string | null
  parentName: string | null
  name: string
  code: string
  level: 'site' | 'building' | 'floor' | 'zone' | 'row' | 'column' | 'shelf'
  path: string
  isStorage: boolean
  capacity: string | null
  capacityUnit: string | null
  maxWeight: string | null
  maxVolume: string | null
  notes: string | null
  isActive: boolean
  createdAt: string
  storedSkus?: string[]
  locatorCode?: string | null
}

// Storage address form schema (No Site)
const storageAddressSchema = z.object({
  buildingId: z.string().min(1, 'Building is required'),
  floorId: z.string().min(1, 'Floor is required'),
  zone: z
    .string()
    .min(1)
    .max(20)
    .transform((val) => val.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9-]+$/, 'Alphanumeric and hyphen only')),
  row: z
    .string()
    .min(1)
    .max(20)
    .transform((val) => val.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9-]+$/, 'Alphanumeric and hyphen only')),
  column: z
    .string()
    .min(1)
    .max(20)
    .transform((val) => val.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9-]+$/, 'Alphanumeric and hyphen only')),
  notes: z.string().optional(),
})
type StorageAddressInput = z.infer<typeof storageAddressSchema>

// Tab type for the create modal
type CreateTab = 'building' | 'floor' | 'storage'

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function LocationsPage() {
  const queryClient = useQueryClient()
  const { hasPermission, user } = useAuthStore()

  const [searchTerm, setSearchTerm] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createTab, setCreateTab] = useState<CreateTab>('storage')
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)
  
  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActionResults, setBulkActionResults] = useState<{
    title: string
    summary: { total: number; success: number; failed: number }
    results: Array<{ id: string; code: string; status: 'success' | 'failed'; message?: string }>
  } | null>(null)

  if (user && !hasPermission('locations', 'read')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6 bg-white border rounded-xl shadow-sm">
        <Shield className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-800">Access Denied</h2>
        <p className="text-slate-500 text-sm mt-2 max-w-md">
          You do not have the required permissions to view or manage locations.
        </p>
      </div>
    )
  }

  // ─── Queries ───────────────────────────────────────────────

  const { data: sitesData, isLoading: isSitesLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.get<Site[]>('/locations/sites'),
  })

  const { data: locationsData, isLoading: isLocationsLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get<Location[]>('/locations'),
  })

  // ─── Derived data ──────────────────────────────────────────

  const buildings = useMemo(
    () => locationsData?.filter((l) => l.level === 'building' && l.isActive) ?? [],
    [locationsData]
  )

  const floors = useMemo(
    () => locationsData?.filter((l) => l.level === 'floor' && l.isActive) ?? [],
    [locationsData]
  )

  // Filtered locations for the table — show buildings, floors, and storage locations (column only)
  const tableRows = useMemo(() => {
    const visible = locationsData?.filter((l) =>
      ['building', 'floor', 'column'].includes(l.level)
    ) ?? []

    const lower = searchTerm.toLowerCase()
    return visible.filter((l) => {
      const matchSearch =
        !searchTerm ||
        l.code.toLowerCase().includes(lower) ||
        l.name.toLowerCase().includes(lower) ||
        (l.locatorCode ?? '').toLowerCase().includes(lower) ||
        l.path.toLowerCase().includes(lower) ||
        (l.storedSkus ?? []).some((s) => s.toLowerCase().includes(lower))
      const matchLevel = !levelFilter || l.level === levelFilter
      return matchSearch && matchLevel
    })
  }, [locationsData, searchTerm, levelFilter])

  // ─── Selection Helpers ─────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (prev.size === tableRows.length) {
        return new Set()
      } else {
        return new Set(tableRows.map((r) => r.id))
      }
    })
  }

  // ─── Mutations ─────────────────────────────────────────────

  const createBuildingMutation = useMutation({
    mutationFn: (data: Partial<CreateLocationInput>) => api.post<Location>('/locations', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      setIsCreateOpen(false)
    },
    onError: (err: any) => alert(err.response?.data?.message || err.message),
  })

  const createStorageAddressMutation = useMutation({
    mutationFn: (data: StorageAddressInput) =>
      api.post<{ locatorCode: string; locationId: string; path: string }>('/locations/storage-address', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      setIsCreateOpen(false)
      alert(`✅ Storage address ${res.locatorCode} created successfully`)
    },
    onError: (err: any) => alert(err.response?.data?.message || err.message),
  })

  const updateLocationMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateLocationInput> }) =>
      api.put<Location>(`/locations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      setEditingLocation(null)
    },
    onError: (err: any) => alert(err.response?.data?.message || err.message),
  })

  const deleteLocationMutation = useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(`/locations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
    },
    onError: (err: any) => alert(err.response?.data?.message || err.message),
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) =>
      api.post<{
        summary: { total: number; success: number; failed: number }
        results: Array<{ id: string; code: string; status: 'success' | 'failed'; message?: string }>
      }>('/locations/bulk-delete', { ids }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      setSelectedIds(new Set())
      setBulkActionResults({
        title: 'Bulk Deletion Results',
        summary: res.summary,
        results: res.results,
      })
    },
    onError: (err: any) => alert(err.response?.data?.message || err.message),
  })

  const bulkDeactivateMutation = useMutation({
    mutationFn: (ids: string[]) =>
      api.post<{ message: string }>('/locations/bulk-deactivate', { ids }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      setSelectedIds(new Set())
      alert(`✅ ${res.message}`)
    },
    onError: (err: any) => alert(err.response?.data?.message || err.message),
  })

  const resetDemoMutation = useMutation({
    mutationFn: () => api.post<{ message: string }>('/locations/reset-demo'),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      setSelectedIds(new Set())
      alert(`✅ ${res.message}`)
    },
    onError: (err: any) => alert(err.response?.data?.message || err.message),
  })

  // ─── Forms ─────────────────────────────────────────────────

  const buildingForm = useForm<CreateLocationInput>({
    resolver: zodResolver(createLocationSchema),
    defaultValues: { name: '', code: '', level: 'building', isStorage: false, metadata: {} },
  })

  const floorForm = useForm<CreateLocationInput>({
    resolver: zodResolver(createLocationSchema),
    defaultValues: { parentId: undefined, name: '', code: '', level: 'floor', isStorage: false, metadata: {} },
  })

  const storageForm = useForm<StorageAddressInput>({
    resolver: zodResolver(storageAddressSchema),
    defaultValues: { buildingId: '', floorId: '', zone: '', row: '', column: '', notes: '' },
  })

  const editForm = useForm<Partial<CreateLocationInput>>({
    resolver: zodResolver(createLocationSchema.partial()),
  })

  // ─── Handlers ──────────────────────────────────────────────

  const handleOpenCreate = () => {
    setCreateTab('storage')
    storageForm.reset({ buildingId: '', floorId: '', zone: '', row: '', column: '', notes: '' })
    buildingForm.reset({ name: '', code: '', level: 'building', isStorage: false, metadata: {} })
    floorForm.reset({ parentId: undefined, name: '', code: '', level: 'floor', isStorage: false, metadata: {} })
    setIsCreateOpen(true)
  }

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (createTab === 'building') {
      buildingForm.handleSubmit((data) => createBuildingMutation.mutate({ ...data, level: 'building' }))(e)
    } else if (createTab === 'floor') {
      floorForm.handleSubmit((data) => {
        const parentId = data.parentId === '' ? undefined : data.parentId
        createBuildingMutation.mutate({ ...data, level: 'floor', parentId })
      })(e)
    } else {
      storageForm.handleSubmit((data) => createStorageAddressMutation.mutate(data))(e)
    }
  }

  const handleOpenEdit = (loc: Location) => {
    setEditingLocation(loc)
    editForm.reset({ name: loc.name, notes: loc.notes ?? '', isActive: loc.isActive })
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingLocation) return
    editForm.handleSubmit((data) => {
      updateLocationMutation.mutate({ id: editingLocation.id, data })
    })(e)
  }

  const handleDelete = (loc: Location) => {
    if (window.confirm(`Delete location ${loc.code}? This will fail if the location has children or inventory.`)) {
      deleteLocationMutation.mutate(loc.id)
    }
  }

  const handleBulkDelete = () => {
    if (
      window.confirm(
        `Are you sure you want to delete ${selectedIds.size} selected locations? The system will attempt to delete the eligible ones and return a detailed report.`
      )
    ) {
      bulkDeleteMutation.mutate(Array.from(selectedIds))
    }
  }

  const handleBulkDeactivate = () => {
    if (
      window.confirm(
        `Are you sure you want to deactivate ${selectedIds.size} selected locations?`
      )
    ) {
      bulkDeactivateMutation.mutate(Array.from(selectedIds))
    }
  }

  const handleBulkExport = () => {
    if (selectedIds.size === 0) return
    const selectedLocs = locationsData?.filter((l) => selectedIds.has(l.id)) ?? []
    const locMap = new Map(locationsData?.map((l) => [l.id, l]) ?? [])

    const exportData = selectedLocs.map((loc) => {
      // Resolve Building & Floor by walking parent tree
      let building = 'N/A'
      let floor = 'N/A'

      if (loc.level === 'building') {
        building = loc.name
      } else if (loc.level === 'floor') {
        floor = loc.name
        // Find parent building
        let curr = loc
        while (curr && curr.parentId) {
          const p = locMap.get(curr.parentId)
          if (p?.level === 'building') {
            building = p.name
            break
          }
          curr = p!
        }
      } else if (loc.level === 'column') {
        // Find parent floor and building
        let curr = loc
        while (curr && curr.parentId) {
          const p = locMap.get(curr.parentId)
          if (!p) break
          if (p.level === 'floor') {
            floor = p.name
          } else if (p.level === 'building') {
            building = p.name
          }
          curr = p
        }
      }

      const typeLabel =
        loc.level === 'building'
          ? 'Building'
          : loc.level === 'floor'
          ? 'Floor'
          : 'Storage Address'
      const addressVal = loc.level === 'column' ? (loc.locatorCode || 'N/A') : 'N/A'

      return {
        Type: typeLabel,
        Building: building,
        Floor: floor,
        Address: addressVal,
        'Full Path': loc.path,
        Status: loc.isActive ? 'Active' : 'Inactive',
        'Stored SKU Count': loc.storedSkus?.length ?? 0,
      }
    })

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Locations')
    XLSX.writeFile(wb, `Selected_Locations_Export.xlsx`)
  }

  const handleResetDemo = () => {
    if (
      window.confirm(
        '⚠️ DANGER: This will delete ALL warehouse locations, stock ledgers, inventory balances, and transfer orders. It will reset the locations module to a clean slate. This cannot be undone. Are you sure you want to proceed?'
      )
    ) {
      resetDemoMutation.mutate()
    }
  }

  // Watched values for live preview
  const watchedZone = storageForm.watch('zone')
  const watchedRow = storageForm.watch('row')
  const watchedCol = storageForm.watch('column')
  const watchedBuildingId = storageForm.watch('buildingId')
  const storageAddressPreview =
    watchedZone && watchedRow && watchedCol
      ? `${watchedZone.toUpperCase()}-${watchedRow.toUpperCase()}-${watchedCol.toUpperCase()}`
      : null

  // Floors filtered by selected building in storage form
  const floorsForBuilding = useMemo(
    () => floors.filter((f) => {
      const building = buildings.find((b) => b.id === watchedBuildingId)
      return building && f.path.startsWith(building.path + '/')
    }),
    [floors, buildings, watchedBuildingId]
  )

  const isLoading = isSitesLoading || isLocationsLoading

  // Level badge styling
  const levelBadge = (level: string) => {
    const map: Record<string, string> = {
      building: 'bg-blue-50 text-blue-700 border border-blue-100',
      floor: 'bg-purple-50 text-purple-700 border border-purple-100',
      column: 'bg-amber-50 text-amber-700 border border-amber-100',
    }
    return map[level] ?? 'bg-slate-100 text-slate-600'
  }

  const levelLabel = (level: string) => {
    const map: Record<string, string> = {
      building: 'Building',
      floor: 'Floor',
      column: 'Storage',
    }
    return map[level] ?? level
  }

  return (
    <div className="space-y-6">

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Warehouse Locations</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage Buildings, Floors, and Storage Addresses (Zone-Row-Column).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 font-semibold text-white hover:bg-brand-600 transition-colors cursor-pointer text-sm shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Location
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: Building2, label: 'Buildings', value: buildings.length, color: 'text-blue-600' },
          { icon: Layers, label: 'Floors', value: floors.length, color: 'text-purple-600' },
          {
            icon: MapPin,
            label: 'Storage Locations',
            value: locationsData?.filter((l) => l.level === 'column').length ?? 0,
            color: 'text-amber-600',
          },
          {
            icon: Package,
            label: 'Occupied',
            value: locationsData?.filter((l) => l.level === 'column' && (l.storedSkus?.length ?? 0) > 0).length ?? 0,
            color: 'text-green-600',
          },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="bg-white border rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`h-4 w-4 ${color}`} />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
            </div>
            <div className="text-2xl font-bold text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-4 rounded-xl border shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            type="search"
            placeholder="Search by code, name, address (Z01-R02-C04) or path..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
        </div>
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="w-full sm:w-48 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm bg-white"
        >
          <option value="">All Types</option>
          <option value="building">Buildings</option>
          <option value="floor">Floors</option>
          <option value="column">Storage Addresses</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm text-slate-500">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-700 border-b">
              <tr>
                <th scope="col" className="px-6 py-4 w-10">
                  <input
                    type="checkbox"
                    checked={tableRows.length > 0 && selectedIds.size === tableRows.length}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 h-4 w-4 cursor-pointer"
                  />
                </th>
                <th scope="col" className="px-6 py-4">Type</th>
                <th scope="col" className="px-6 py-4">Code / Address</th>
                <th scope="col" className="px-6 py-4">Name</th>
                <th scope="col" className="px-6 py-4">Full Path</th>
                <th scope="col" className="px-6 py-4">Stored SKUs</th>
                <th scope="col" className="px-6 py-4">Status</th>
                <th scope="col" className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 border-t border-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-brand-500" />
                    <span className="text-slate-400 mt-2 block text-sm">Loading locations...</span>
                  </td>
                </tr>
              ) : tableRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    No locations found. Add a Building first, then Floors, then Storage Addresses.
                  </td>
                </tr>
              ) : (
                tableRows.map((loc) => (
                  <tr
                    key={loc.id}
                    className={`hover:bg-slate-50/50 ${loc.level === 'column' ? 'bg-amber-50/10' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(loc.id)}
                        onChange={() => toggleSelect(loc.id)}
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 h-4 w-4 cursor-pointer"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${levelBadge(loc.level)}`}>
                        {levelLabel(loc.level)}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-slate-900">
                      {loc.locatorCode ? (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-amber-500" />
                          {loc.locatorCode}
                        </div>
                      ) : (
                        loc.code
                      )}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-700">{loc.name}</td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-400">{loc.path}</td>
                    <td className="px-6 py-4">
                      {loc.storedSkus && loc.storedSkus.length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full font-semibold border border-green-150">
                          <Package className="h-3.5 w-3.5" />
                          {loc.storedSkus.length} SKU{loc.storedSkus.length !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs italic">Empty</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                        loc.isActive ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {loc.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => handleOpenEdit(loc)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => updateLocationMutation.mutate({ id: loc.id, data: { isActive: !loc.isActive } })}
                          className={`p-1.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer ${
                            loc.isActive ? 'text-red-400 hover:text-red-705' : 'text-green-400 hover:text-green-705'
                          }`}
                          title={loc.isActive ? 'Deactivate' : 'Activate'}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(loc)}
                          className="p-1.5 text-red-400 hover:text-red-700 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
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

      {/* ── CREATE MODAL ─────────────────────────────────────── */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl border overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-slate-900">Add Location</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Buildings and Floors are structural. Storage Addresses are where inventory is kept.
              </p>
            </div>

            {/* Tab Switcher */}
            <div className="flex border-b bg-slate-50">
              {([
                { key: 'storage', label: 'Storage Address', icon: MapPin },
                { key: 'floor', label: 'Floor', icon: Layers },
                { key: 'building', label: 'Building', icon: Building2 },
              ] as const).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCreateTab(key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-3 text-xs font-semibold transition-colors cursor-pointer ${
                    createTab === key
                      ? 'border-b-2 border-brand-500 text-brand-600 bg-white'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">

              {/* ── STORAGE ADDRESS TAB ────────────────────── */}
              {createTab === 'storage' && (
                <>
                  <p className="text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-lg p-3">
                    Enter the Zone, Row, and Column codes. The system will automatically generate
                    the address (e.g. <strong>Z01-R02-C04</strong>) and create the intermediate nodes.
                  </p>

                  {/* Building */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Building</label>
                    <select
                      {...storageForm.register('buildingId')}
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">Select Building...</option>
                      {buildings.map((b) => (
                        <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                      ))}
                    </select>
                    {storageForm.formState.errors.buildingId && (
                      <p className="text-xs text-red-500 mt-1">{storageForm.formState.errors.buildingId.message}</p>
                    )}
                  </div>

                  {/* Floor */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Floor</label>
                    <select
                      {...storageForm.register('floorId')}
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">Select Floor...</option>
                      {floorsForBuilding.map((f) => (
                        <option key={f.id} value={f.id}>{f.name} ({f.code})</option>
                      ))}
                    </select>
                    {storageForm.formState.errors.floorId && (
                      <p className="text-xs text-red-500 mt-1">{storageForm.formState.errors.floorId.message}</p>
                    )}
                  </div>

                  {/* Zone / Row / Column */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Zone</label>
                      <input
                        type="text"
                        placeholder="Z01"
                        {...storageForm.register('zone', {
                          onChange: (e) => e.target.value = e.target.value.toUpperCase()
                        })}
                        className="w-full px-3 py-2 border rounded-lg text-sm uppercase font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      {storageForm.formState.errors.zone && (
                        <p className="text-xs text-red-500 mt-1">{storageForm.formState.errors.zone.message}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Row</label>
                      <input
                        type="text"
                        placeholder="R02"
                        {...storageForm.register('row', {
                          onChange: (e) => e.target.value = e.target.value.toUpperCase()
                        })}
                        className="w-full px-3 py-2 border rounded-lg text-sm uppercase font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      {storageForm.formState.errors.row && (
                        <p className="text-xs text-red-500 mt-1">{storageForm.formState.errors.row.message}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Column</label>
                      <input
                        type="text"
                        placeholder="C04"
                        {...storageForm.register('column', {
                          onChange: (e) => e.target.value = e.target.value.toUpperCase()
                        })}
                        className="w-full px-3 py-2 border rounded-lg text-sm uppercase font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      {storageForm.formState.errors.column && (
                        <p className="text-xs text-red-500 mt-1">{storageForm.formState.errors.column.message}</p>
                      )}
                    </div>
                  </div>

                  {/* Live Preview */}
                  {storageAddressPreview && (
                    <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                      <MapPin className="h-4 w-4 text-amber-600 flex-shrink-0" />
                      <div>
                        <div className="text-xs text-amber-700 font-medium">Storage Address Preview</div>
                        <div className="text-lg font-bold font-mono text-amber-900">{storageAddressPreview}</div>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Notes (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Flammable materials only"
                      {...storageForm.register('notes')}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </>
              )}

              {/* ── BUILDING TAB ───────────────────────────── */}
              {createTab === 'building' && (
                <>
                  <p className="text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded-lg p-3">
                    A Building is the top-level physical structure.
                    Example: <strong>Building A</strong>, <strong>Block B</strong>.
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Building Code</label>
                      <input
                        type="text"
                        placeholder="BLD-A"
                        {...buildingForm.register('code', {
                          onChange: (e) => e.target.value = e.target.value.toUpperCase()
                        })}
                        className="w-full px-3 py-2 border rounded-lg text-sm uppercase font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      {buildingForm.formState.errors.code && (
                        <p className="text-xs text-red-500 mt-1">{buildingForm.formState.errors.code.message}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Building Name</label>
                      <input
                        type="text"
                        placeholder="Building A"
                        {...buildingForm.register('name')}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      {buildingForm.formState.errors.name && (
                        <p className="text-xs text-red-500 mt-1">{buildingForm.formState.errors.name.message}</p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* ── FLOOR TAB ──────────────────────────────── */}
              {createTab === 'floor' && (
                <>
                  <p className="text-xs text-slate-500 bg-purple-50 border border-purple-100 rounded-lg p-3">
                    A Floor is a level within a Building.
                    Example: <strong>Floor 1</strong>, <strong>Ground Floor</strong>.
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Building</label>
                    <select
                      {...floorForm.register('parentId')}
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">Select Building...</option>
                      {buildings.map((b) => (
                        <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                      ))}
                    </select>
                    {floorForm.formState.errors.parentId && (
                      <p className="text-xs text-red-500 mt-1">{String(floorForm.formState.errors.parentId.message)}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Floor Code</label>
                      <input
                        type="text"
                        placeholder="F1"
                        {...floorForm.register('code', {
                          onChange: (e) => e.target.value = e.target.value.toUpperCase()
                        })}
                        className="w-full px-3 py-2 border rounded-lg text-sm uppercase font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      {floorForm.formState.errors.code && (
                        <p className="text-xs text-red-500 mt-1">{floorForm.formState.errors.code.message}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Floor Name</label>
                      <input
                        type="text"
                        placeholder="Floor 1"
                        {...floorForm.register('name')}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      {floorForm.formState.errors.name && (
                        <p className="text-xs text-red-500 mt-1">{floorForm.formState.errors.name.message}</p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Modal Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    createBuildingMutation.isPending ||
                    createStorageAddressMutation.isPending
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg cursor-pointer disabled:opacity-60"
                >
                  {(createBuildingMutation.isPending || createStorageAddressMutation.isPending) && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {createTab === 'storage'
                    ? 'Create Storage Address'
                    : createTab === 'building'
                    ? 'Create Building'
                    : 'Create Floor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ───────────────────────────────────────── */}
      {editingLocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl border overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-slate-900">
                Edit: {editingLocation.locatorCode ?? editingLocation.code}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${levelBadge(editingLocation.level)}`}>
                  {levelLabel(editingLocation.level)}
                </span>
                <span className="text-xs font-mono text-slate-400">{editingLocation.path}</span>
              </div>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  {...editForm.register('name')}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  {...editForm.register('notes')}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setEditingLocation(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateLocationMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg cursor-pointer disabled:opacity-60"
                >
                  {updateLocationMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Operations Card (Reset Demo Data) */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 mt-8">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Shield className="h-4.5 w-4.5 text-brand-650" />
            Admin Operations
          </h3>
          <p className="text-xs text-slate-500 max-w-2xl">
            Clean up seeded test and demo warehouse locations, including associated stock balances and transfer orders.
            This resets the locations module to a clean slate while preserving users, settings, and permissions.
          </p>
        </div>
        <button
          onClick={handleResetDemo}
          disabled={resetDemoMutation.isPending}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold px-4 py-2.5 text-xs transition-colors cursor-pointer disabled:opacity-50 border border-slate-300 shadow-sm"
        >
          {resetDemoMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Reset Demo Data
        </button>
      </div>

      {/* Floating Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40 bg-slate-900/90 backdrop-blur-md text-white px-6 py-4 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-6 animate-in slide-in-from-bottom-4 duration-300">
          <div className="text-sm font-semibold border-r border-slate-750 pr-4">
            <span className="text-brand-400 font-bold">{selectedIds.size}</span> selected
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleBulkDeactivate}
              disabled={bulkDeactivateMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50 text-slate-200 hover:text-white"
            >
              <Power className="h-3.5 w-3.5" />
              Deactivate Selected
            </button>
            <button
              onClick={handleBulkExport}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold hover:bg-slate-800 rounded-lg transition-colors cursor-pointer text-slate-200 hover:text-white"
            >
              <Download className="h-3.5 w-3.5" />
              Export Selected
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-red-650 hover:bg-red-700 text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Delete Selected
            </button>
          </div>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-slate-400 hover:text-white font-medium border-l border-slate-750 pl-4 transition-colors cursor-pointer"
          >
            Clear Selection
          </button>
        </div>
      )}

      {/* Bulk Action Results Dialog */}
      {bulkActionResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl border overflow-hidden">
            <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
              <h2 className="text-lg font-bold text-slate-900">{bulkActionResults.title}</h2>
              <button
                onClick={() => setBulkActionResults(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-md hover:bg-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 border rounded-xl bg-slate-50">
                  <div className="text-slate-400 text-xs font-semibold uppercase">Total</div>
                  <div className="text-xl font-bold text-slate-800 mt-1">{bulkActionResults.summary.total}</div>
                </div>
                <div className="p-3 border border-green-100 rounded-xl bg-green-50">
                  <div className="text-green-600 text-xs font-semibold uppercase">Deleted</div>
                  <div className="text-xl font-bold text-green-700 mt-1">{bulkActionResults.summary.success}</div>
                </div>
                <div className="p-3 border border-red-105 rounded-xl bg-red-50">
                  <div className="text-red-650 text-xs font-semibold uppercase">Failed</div>
                  <div className="text-xl font-bold text-red-700 mt-1">{bulkActionResults.summary.failed}</div>
                </div>
              </div>

              {/* Detailed results list */}
              <div className="border rounded-lg overflow-hidden max-h-60 overflow-y-auto divide-y">
                {bulkActionResults.results.map((item, idx) => (
                  <div key={idx} className="p-3 flex items-start justify-between text-xs gap-3">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-slate-800">{item.code}</div>
                      {item.message && <div className="text-red-500 font-medium">{item.message}</div>}
                    </div>
                    <div>
                      {item.status === 'success' ? (
                        <span className="inline-flex items-center rounded bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700 border border-green-150">
                          Success
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-755 border border-red-150">
                          Blocked
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-slate-50 flex justify-end">
              <button
                onClick={() => setBulkActionResults(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-755 hover:bg-slate-100 rounded-lg cursor-pointer bg-white border border-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
