'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import {
  Search,
  Plus,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FolderPlus,
  Shield,
  Download,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  createSkuSchema,
  updateSkuSchema,
  createSkuCategorySchema,
  type CreateSkuInput,
  type UpdateSkuInput,
  type CreateSkuCategoryInput,
} from '@wms/shared'
import { useAuthStore } from '@/store/auth.store'

interface Sku {
  id: string
  skuCode: string
  name: string
  description: string | null
  categoryId: string | null
  categoryName: string | null
  skuType: string
  uom: string
  weightKg: string | null
  dimensions: {
    length: number
    width: number
    height: number
    unit: string
  } | null
  hsnCode: string | null
  barcode: string | null
  imageUrl: string | null
  reorderPoint: string
  reorderQty: string
  leadTimeDays: number
  isBatchTracked: boolean
  isActive: boolean
  tags: string[]
  metadata: Record<string, any>
  createdAt: string
  updatedAt: string
  currentStock?: number
  locationCount?: number
  primaryLocation?: string
}

interface SkuCategory {
  id: string
  name: string
  code: string
  parentId: string | null
}

const SKU_TYPES = [
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'component', label: 'Component' },
  { value: 'semi_finished', label: 'Semi-Finished' },
  { value: 'finished_good', label: 'Finished Good' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'consumable', label: 'Consumable' },
]

export default function SkusPage() {
  const queryClient = useQueryClient()
  const { hasPermission, user } = useAuthStore()

  // Search and Pagination States
  const [searchTerm, setSearchTerm] = useState('')

  if (user && !hasPermission('skus', 'read')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6 bg-white border rounded-xl shadow-sm">
        <Shield className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-800">Access Denied</h2>
        <p className="text-slate-500 text-sm mt-2 max-w-md">
          You do not have the required permissions to view or manage the SKU catalog.
        </p>
      </div>
    )
  }
  const [skuTypeFilter, setSkuTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const limit = 10
  const [isExporting, setIsExporting] = useState(false)

  // Modal States
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingSku, setEditingSku] = useState<Sku | null>(null)
  const [isCategoryOpen, setIsCategoryOpen] = useState(false)

  // Fetch SKUs
  const { data: skusData, isLoading: isSkusLoading } = useQuery({
    queryKey: ['skus', searchTerm, skuTypeFilter, statusFilter, page],
    queryFn: () => {
      const params = new URLSearchParams()
      params.append('page', String(page))
      params.append('limit', String(limit))
      if (searchTerm) params.append('q', searchTerm)
      if (skuTypeFilter) params.append('skuType', skuTypeFilter)
      if (statusFilter) params.append('isActive', statusFilter)
      return api.get<{ data: Sku[]; total: number; hasMore: boolean }>(
        `/skus?${params.toString()}`,
      )
    },
  })

  // Fetch Categories
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<SkuCategory[]>('/skus/categories'),
  })

  // Create SKU Mutation
  const createMutation = useMutation({
    mutationFn: (newSku: CreateSkuInput) => api.post<Sku>('/skus', newSku),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skus'] })
      setIsCreateOpen(false)
    },
  })

  // Update SKU Mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSkuInput }) =>
      api.put<Sku>(`/skus/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skus'] })
      setEditingSku(null)
    },
  })

  // Delete SKU Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/skus/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skus'] })
    },
  })

  // Create Category Mutation
  const createCategoryMutation = useMutation({
    mutationFn: (newCat: CreateSkuCategoryInput) =>
      api.post<SkuCategory>('/skus/categories', newCat),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setIsCategoryOpen(false)
    },
  })

  // SKU Form Setup
  const {
    register: registerSku,
    handleSubmit: handleSubmitSku,
    reset: resetSku,
    setValue: setValueSku,
    formState: { errors: errorsSku, isSubmitting: isSkuSubmitting },
  } = useForm<CreateSkuInput>({
    resolver: zodResolver(createSkuSchema),
    defaultValues: {
      skuCode: '',
      name: '',
      description: '',
      categoryId: undefined,
      skuType: 'raw_material',
      uom: 'pcs',
      weightKg: undefined,
      reorderPoint: 0,
      reorderQty: 0,
      leadTimeDays: 0,
      isBatchTracked: true,
      isActive: true,
      tags: [],
      metadata: {},
    },
  })

  // Category Form Setup
  const {
    register: registerCat,
    handleSubmit: handleSubmitCat,
    reset: resetCat,
    formState: { errors: errorsCat, isSubmitting: isCatSubmitting },
  } = useForm<CreateSkuCategoryInput>({
    resolver: zodResolver(createSkuCategorySchema),
    defaultValues: {
      name: '',
      code: '',
      parentId: undefined,
    },
  })

  const handleOpenCreate = () => {
    resetSku({
      skuCode: '',
      name: '',
      description: '',
      categoryId: undefined,
      skuType: 'raw_material',
      uom: 'pcs',
      weightKg: undefined,
      reorderPoint: 0,
      reorderQty: 0,
      leadTimeDays: 0,
      isBatchTracked: true,
      isActive: true,
      tags: [],
      metadata: {},
    })
    setIsCreateOpen(true)
  }

  const handleOpenEdit = (sku: Sku) => {
    resetSku({
      skuCode: sku.skuCode,
      name: sku.name,
      description: sku.description || '',
      categoryId: sku.categoryId || undefined,
      skuType: sku.skuType as any,
      uom: sku.uom,
      weightKg: sku.weightKg ? Number(sku.weightKg) : undefined,
      reorderPoint: Number(sku.reorderPoint),
      reorderQty: Number(sku.reorderQty),
      leadTimeDays: sku.leadTimeDays,
      isBatchTracked: sku.isBatchTracked,
      isActive: sku.isActive,
      tags: sku.tags,
      metadata: sku.metadata,
    })
    setEditingSku(sku)
  }

  const handleCreateSkuSubmit = (data: CreateSkuInput) => {
    createMutation.mutate(data)
  }

  const handleEditSkuSubmit = (data: CreateSkuInput) => {
    if (!editingSku) return
    const updateInput = { ...data } as any
    delete updateInput.skuCode // Exclude SKU code on updates
    updateMutation.mutate({ id: editingSku.id, data: updateInput })
  }

  const handleCreateCatSubmit = (data: CreateSkuCategoryInput) => {
    createCategoryMutation.mutate(data)
  }

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this SKU?')) {
      deleteMutation.mutate(id)
    }
  }

  const totalPages = Math.ceil((skusData?.total ?? 0) / limit)

  const handleExportSku = async () => {
    setIsExporting(true)
    try {
      let allSkus: Sku[] = []
      let currentPage = 1
      let hasMore = true

      while (hasMore) {
        const params = new URLSearchParams()
        params.append('page', String(currentPage))
        params.append('limit', '200')
        if (searchTerm) params.append('q', searchTerm)
        if (skuTypeFilter) params.append('skuType', skuTypeFilter)
        if (statusFilter) params.append('isActive', statusFilter)

        const res = await api.get<{ data: Sku[]; total: number; hasMore: boolean }>(
          `/skus?${params.toString()}`,
        )
        allSkus = [...allSkus, ...res.data]
        hasMore = res.hasMore && res.data.length > 0
        currentPage++
      }

      if (allSkus.length === 0) {
        alert('No SKUs found to export.')
        return
      }

      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '')
      const exportData = allSkus.map((sku) => ({
        'SKU Code': sku.skuCode,
        'SKU Name': sku.name,
        'Category': sku.categoryName ?? '',
        'Type': sku.skuType,
        'UOM': sku.uom,
        'Current Stock': sku.currentStock ?? 0,
        'Location Count': sku.locationCount ?? 0,
        'Primary Location': sku.primaryLocation ?? '',
        'Status': sku.isActive ? 'Active' : 'Inactive',
      }))
      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'SKU Catalog')
      XLSX.writeFile(wb, `sku_export_${dateStr}.xlsx`)
    } catch (error) {
      console.error('Failed to export SKUs:', error)
      alert('Failed to export SKUs.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">SKU Catalog</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your master inventory product specifications and categories.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportSku}
            disabled={isExporting || !skusData?.data?.length}
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
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 font-semibold text-white hover:bg-brand-600 transition-colors cursor-pointer text-sm"
          >
            <Plus className="h-4 w-4" />
            Add SKU
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-4 rounded-xl border shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            type="search"
            placeholder="Search by SKU Code, Name or Description..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setPage(1)
            }}
            className="w-full pl-9 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={skuTypeFilter}
            onChange={(e) => {
              setSkuTypeFilter(e.target.value)
              setPage(1)
            }}
            className="w-full md:w-40 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm bg-white"
          >
            <option value="">All Types</option>
            {SKU_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
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
                <th scope="col" className="px-6 py-4">SKU Code</th>
                <th scope="col" className="px-6 py-4">Name</th>
                <th scope="col" className="px-6 py-4">Type</th>
                <th scope="col" className="px-6 py-4">Category</th>
                <th scope="col" className="px-6 py-4">Stock Level</th>
                <th scope="col" className="px-6 py-4">Locations</th>
                <th scope="col" className="px-6 py-4">Primary Location</th>
                <th scope="col" className="px-6 py-4">Status</th>
                <th scope="col" className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 border-t border-slate-100">
              {isSkusLoading ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-brand-500" />
                    <span className="text-slate-400 mt-2 block text-sm">Loading SKUs...</span>
                  </td>
                </tr>
              ) : skusData?.data.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-slate-400">
                    No SKUs found matching the filter options.
                  </td>
                </tr>
              ) : (
                skusData?.data.map((sku) => (
                  <tr key={sku.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-mono font-medium text-slate-900">{sku.skuCode}</td>
                    <td className="px-6 py-4 font-medium text-slate-900">
                      <div>
                        <span className="block font-medium">{sku.name}</span>
                        {sku.description && (
                          <span className="block text-xs text-slate-400 truncate max-w-xs mt-0.5">
                            {sku.description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 capitalize">
                      {sku.skuType.replace('_', ' ')}
                    </td>
                    <td className="px-6 py-4">
                      {sku.categoryName || (
                        <span className="text-slate-300 italic text-xs">Uncategorized</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      {sku.currentStock !== undefined ? Number(sku.currentStock).toLocaleString() : 0} <span className="text-xs font-normal text-slate-400">{sku.uom}</span>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-700">
                      {sku.locationCount !== undefined ? sku.locationCount : 0} locations
                    </td>
                    <td className="px-6 py-4 max-w-xs" title={sku.primaryLocation}>
                      {sku.primaryLocation && sku.primaryLocation !== 'N/A' ? (
                        <span className="inline-flex items-center font-mono font-semibold text-xs bg-slate-100 text-slate-800 px-2 py-1 rounded border border-slate-200">
                          {sku.primaryLocation}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                          sku.isActive
                            ? 'bg-green-50 text-green-700'
                            : 'bg-slate-150 text-slate-500'
                        }`}
                      >
                        {sku.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => handleOpenEdit(sku)}
                          className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(sku.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
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

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t bg-white px-6 py-4">
            <span className="text-sm text-slate-500">
              Showing page <strong className="text-slate-900">{page}</strong> of{' '}
              <strong className="text-slate-900">{totalPages}</strong>
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors cursor-pointer"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE SKU MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl border w-full max-w-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-semibold text-lg text-slate-900">Add SKU Specification</h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold focus:outline-none"
              >
                &times;
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <form onSubmit={handleSubmitSku(handleCreateSkuSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                      SKU Code *
                    </label>
                    <input
                      type="text"
                      placeholder="RM-STEE-001"
                      {...registerSku('skuCode')}
                      className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 uppercase ${
                        errorsSku.skuCode ? 'border-red-500 focus:ring-red-500' : 'border-slate-250'
                      }`}
                    />
                    {errorsSku.skuCode && (
                      <p className="mt-1 text-xs text-red-500">{errorsSku.skuCode.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                      SKU Name *
                    </label>
                    <input
                      type="text"
                      placeholder="Steel Sheet Grade A"
                      {...registerSku('name')}
                      className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                        errorsSku.name ? 'border-red-500 focus:ring-red-500' : 'border-slate-250'
                      }`}
                    />
                    {errorsSku.name && (
                      <p className="mt-1 text-xs text-red-500">{errorsSku.name.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                    Description
                  </label>
                  <textarea
                    placeholder="Provide a detailed description of the SKU specification..."
                    {...registerSku('description')}
                    rows={2}
                    className="w-full rounded-lg border border-slate-250 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                      SKU Type *
                    </label>
                    <select
                      {...registerSku('skuType')}
                      className="w-full rounded-lg border border-slate-250 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                    >
                      {SKU_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-semibold text-slate-600 uppercase">
                        Category
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsCategoryOpen(true)}
                        className="inline-flex items-center gap-0.5 text-xs text-brand-500 hover:text-brand-600 font-semibold cursor-pointer"
                      >
                        <FolderPlus className="h-3 w-3" />
                        Create
                      </button>
                    </div>
                    <select
                      {...registerSku('categoryId')}
                      className="w-full rounded-lg border border-slate-250 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                    >
                      <option value="">Uncategorized</option>
                      {categories?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                      UOM (Unit) *
                    </label>
                    <input
                      type="text"
                      {...registerSku('uom')}
                      className="w-full rounded-lg border border-slate-250 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                      Weight (Kg)
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.5"
                      {...registerSku('weightKg', { valueAsNumber: true })}
                      className="w-full rounded-lg border border-slate-250 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                      Barcode
                    </label>
                    <input
                      type="text"
                      placeholder="8901072..."
                      {...registerSku('barcode')}
                      className="w-full rounded-lg border border-slate-250 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                      HSN Code
                    </label>
                    <input
                      type="text"
                      placeholder="7208..."
                      {...registerSku('hsnCode')}
                      className="w-full rounded-lg border border-slate-250 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t pt-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                      Reorder Point
                    </label>
                    <input
                      type="number"
                      step="any"
                      {...registerSku('reorderPoint', { valueAsNumber: true })}
                      className="w-full rounded-lg border border-slate-250 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                      Reorder Qty
                    </label>
                    <input
                      type="number"
                      step="any"
                      {...registerSku('reorderQty', { valueAsNumber: true })}
                      className="w-full rounded-lg border border-slate-250 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                      Lead Time (Days)
                    </label>
                    <input
                      type="number"
                      {...registerSku('leadTimeDays', { valueAsNumber: true })}
                      className="w-full rounded-lg border border-slate-250 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 border-t pt-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      {...registerSku('isBatchTracked')}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    Enable Batch/Lot Tracking
                  </label>

                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      {...registerSku('isActive')}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    Active and Available for Movements
                  </label>
                </div>

                <div className="flex gap-3 justify-end border-t pt-4 mt-6">
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(false)}
                    className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSkuSubmitting}
                    className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition-colors inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isSkuSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save SKU
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* EDIT SKU MODAL */}
      {editingSku && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl border w-full max-w-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-semibold text-lg text-slate-900">
                Edit SKU: {editingSku.skuCode}
              </h3>
              <button
                onClick={() => setEditingSku(null)}
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold focus:outline-none"
              >
                &times;
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <form onSubmit={handleSubmitSku(handleEditSkuSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                      SKU Code (Read Only)
                    </label>
                    <input
                      type="text"
                      value={editingSku.skuCode}
                      disabled
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 focus:outline-none cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                      SKU Name *
                    </label>
                    <input
                      type="text"
                      {...registerSku('name')}
                      className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                        errorsSku.name ? 'border-red-500 focus:ring-red-500' : 'border-slate-250'
                      }`}
                    />
                    {errorsSku.name && (
                      <p className="mt-1 text-xs text-red-500">{errorsSku.name.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                    Description
                  </label>
                  <textarea
                    placeholder="Provide a detailed description..."
                    {...registerSku('description')}
                    rows={2}
                    className="w-full rounded-lg border border-slate-250 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                      SKU Type *
                    </label>
                    <select
                      {...registerSku('skuType')}
                      className="w-full rounded-lg border border-slate-250 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                    >
                      {SKU_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-semibold text-slate-600 uppercase">
                        Category
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsCategoryOpen(true)}
                        className="inline-flex items-center gap-0.5 text-xs text-brand-500 hover:text-brand-600 font-semibold cursor-pointer"
                      >
                        <FolderPlus className="h-3 w-3" />
                        Create
                      </button>
                    </div>
                    <select
                      {...registerSku('categoryId')}
                      className="w-full rounded-lg border border-slate-250 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                    >
                      <option value="">Uncategorized</option>
                      {categories?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                      UOM (Unit) *
                    </label>
                    <input
                      type="text"
                      {...registerSku('uom')}
                      className="w-full rounded-lg border border-slate-250 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                      Weight (Kg)
                    </label>
                    <input
                      type="number"
                      step="any"
                      {...registerSku('weightKg', { valueAsNumber: true })}
                      className="w-full rounded-lg border border-slate-250 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                      Barcode
                    </label>
                    <input
                      type="text"
                      {...registerSku('barcode')}
                      className="w-full rounded-lg border border-slate-250 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                      HSN Code
                    </label>
                    <input
                      type="text"
                      {...registerSku('hsnCode')}
                      className="w-full rounded-lg border border-slate-250 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t pt-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                      Reorder Point
                    </label>
                    <input
                      type="number"
                      step="any"
                      {...registerSku('reorderPoint', { valueAsNumber: true })}
                      className="w-full rounded-lg border border-slate-250 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                      Reorder Qty
                    </label>
                    <input
                      type="number"
                      step="any"
                      {...registerSku('reorderQty', { valueAsNumber: true })}
                      className="w-full rounded-lg border border-slate-250 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                      Lead Time (Days)
                    </label>
                    <input
                      type="number"
                      {...registerSku('leadTimeDays', { valueAsNumber: true })}
                      className="w-full rounded-lg border border-slate-250 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 border-t pt-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      {...registerSku('isBatchTracked')}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    Enable Batch/Lot Tracking
                  </label>

                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      {...registerSku('isActive')}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    Active and Available for Movements
                  </label>
                </div>

                <div className="flex gap-3 justify-end border-t pt-4 mt-6">
                  <button
                    type="button"
                    onClick={() => setEditingSku(null)}
                    className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSkuSubmitting}
                    className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition-colors inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isSkuSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save Updates
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* CREATE CATEGORY MODAL */}
      {isCategoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl border w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-semibold text-slate-900">Create Category</h3>
              <button
                onClick={() => setIsCategoryOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold focus:outline-none"
              >
                &times;
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleSubmitCat(handleCreateCatSubmit)} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                    Category Name *
                  </label>
                  <input
                    type="text"
                    placeholder="Electronics"
                    {...registerCat('name')}
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                      errorsCat.name ? 'border-red-500 focus:ring-red-500' : 'border-slate-250'
                    }`}
                  />
                  {errorsCat.name && (
                    <p className="mt-1 text-xs text-red-500">{errorsCat.name.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                    Category Code *
                  </label>
                  <input
                    type="text"
                    placeholder="ELEC"
                    {...registerCat('code')}
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 uppercase ${
                      errorsCat.code ? 'border-red-500 focus:ring-red-500' : 'border-slate-250'
                    }`}
                  />
                  {errorsCat.code && (
                    <p className="mt-1 text-xs text-red-500">{errorsCat.code.message}</p>
                  )}
                </div>

                <div className="flex gap-3 justify-end border-t pt-4 mt-6">
                  <button
                    type="button"
                    onClick={() => setIsCategoryOpen(false)}
                    className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCatSubmitting}
                    className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition-colors inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isCatSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Create Category
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
