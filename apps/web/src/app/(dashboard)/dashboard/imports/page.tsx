'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth.store'
import {
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  Play,
  History,
  Shield,
  Loader2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
} from 'lucide-react'
import * as XLSX from 'xlsx'

interface ImportJob {
  id: string
  orgId: string
  type: 'location' | 'sku' | 'opening_stock'
  status: 'pending' | 'validating' | 'validated' | 'processing' | 'completed' | 'failed'
  fileName: string | null
  totalRows: number
  validRows: number
  errorRows: number
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt: string
}

interface StagingRow {
  id: string
  jobId: string
  rowNumber: number
  rowData: Record<string, any>
  isValid: boolean
  errors: string[]
  createdAt: string
}

interface ImportJobDetails {
  job: ImportJob
  rows: StagingRow[]
}

const IMPORT_TYPES = [
  {
    value: 'location' as const,
    label: 'Location Import',
    permission: { module: 'locations', action: 'create' },
    description: 'Set up warehouse layouts, Buildings, Floors, and Storage Addresses.',
  },
  {
    value: 'sku' as const,
    label: 'SKU Import',
    permission: { module: 'skus', action: 'create' },
    description: 'Upload product catalogs, weight variables, categories, and tracking settings.',
  },
  {
    value: 'opening_stock' as const,
    label: 'Opening Stock Import',
    permission: { module: 'inventory', action: 'post' },
    description: 'Establish starting balances, quantities, batch details, and manufacturing dates.',
  },
]

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-amber-50', text: 'text-amber-700 border-amber-250', label: 'Pending' },
  validating: { bg: 'bg-blue-50', text: 'text-blue-700 border-blue-250', label: 'Validating' },
  validated: { bg: 'bg-indigo-50', text: 'text-indigo-700 border-indigo-250', label: 'Validated' },
  processing: { bg: 'bg-purple-50', text: 'text-purple-700 border-purple-250', label: 'Processing' },
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700 border-emerald-250', label: 'Completed' },
  failed: { bg: 'bg-rose-50', text: 'text-rose-700 border-rose-250', label: 'Failed' },
}

export default function ImportsDashboardPage() {
  const queryClient = useQueryClient()
  const { hasPermission, user } = useAuthStore()

  // Dynamic Gated Selection
  const canImportLocation = hasPermission('locations', 'create')
  const canImportSku = hasPermission('skus', 'create')
  const canImportStock = hasPermission('inventory', 'post')
  const hasAnyPermission = canImportLocation || canImportSku || canImportStock

  // State
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const [selectedType, setSelectedType] = useState<'location' | 'sku' | 'opening_stock'>('location')
  const [file, setFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [filterMode, setFilterMode] = useState<'all' | 'valid' | 'invalid'>('all')
  const [page, setPage] = useState(1)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Execution Step Success State
  const [executionResult, setExecutionResult] = useState<{
    created: number
    updated: number
    posted: number
    skipped: number
  } | null>(null)

  // Default active tab to first permitted module
  useEffect(() => {
    if (hasAnyPermission) {
      if (canImportLocation) setSelectedType('location')
      else if (canImportSku) setSelectedType('sku')
      else if (canImportStock) setSelectedType('opening_stock')
    }
  }, [canImportLocation, canImportSku, canImportStock, hasAnyPermission])

  // Queries
  const { data: jobsHistory, isLoading: isHistoryLoading } = useQuery({
    queryKey: ['import-jobs'],
    queryFn: () => api.get<ImportJob[]>('/imports/jobs'),
    enabled: hasAnyPermission,
  })

  const { data: jobDetails, isLoading: isDetailsLoading } = useQuery({
    queryKey: ['import-job-details', activeJobId],
    queryFn: () => api.get<ImportJobDetails>(`/imports/jobs/${activeJobId}`),
    enabled: !!activeJobId,
  })

  // Pre-fetch categories for the SKU template reference sheet
  const { data: skuCategoriesData } = useQuery({
    queryKey: ['sku-categories'],
    queryFn: () => api.get<Array<{ id: string; code: string; name: string }>>('/skus/categories'),
    enabled: canImportSku,
    staleTime: 5 * 60 * 1000, // 5 min cache
  })

  // Mutations
  const validateMutation = useMutation({
    mutationFn: (payload: { file: string; type: string; fileName: string }) =>
      api.post<{ jobId: string; totalRows: number; validRows: number; errorRows: number }>(
        '/imports/validate',
        payload,
      ),
    onSuccess: (res) => {
      setActiveJobId(res.jobId)
      setPage(1)
      setFilterMode('all')
      setUploadProgress(100)
      setTimeout(() => {
        setIsUploading(false)
        setUploadProgress(0)
      }, 500)
      queryClient.invalidateQueries({ queryKey: ['import-jobs'] })
    },
    onError: (err: any) => {
      alert(err.message || 'Validation failed. Please verify the spreadsheet format.')
      setIsUploading(false)
      setUploadProgress(0)
    },
  })

  const executeMutation = useMutation({
    mutationFn: (jobId: string) =>
      api.post<{
        success: boolean
        created: number
        updated: number
        posted: number
        skipped: number
      }>('/imports/execute', { jobId }),
    onSuccess: (res) => {
      setExecutionResult({
        created: res.created,
        updated: res.updated,
        posted: res.posted,
        skipped: res.skipped,
      })
      queryClient.invalidateQueries({ queryKey: ['import-jobs'] })
    },
    onError: (err: any) => {
      alert(err.message || 'Execution failed.')
    },
  })

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    )
  }

  // RBAC shield
  if (user && !hasAnyPermission) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6 bg-white border rounded-xl shadow-sm">
        <Shield className="h-12 w-12 text-red-500 mb-4 animate-pulse" />
        <h2 className="text-xl font-bold text-slate-800">Access Denied</h2>
        <p className="text-slate-500 text-sm mt-2 max-w-md">
          You do not have the required permissions (`locations:create`, `skus:create`, or `inventory:post`) to upload or execute master data imports.
        </p>
      </div>
    )
  }

  // Template Downloader
  const handleDownloadTemplate = (type: 'location' | 'sku' | 'opening_stock') => {
    let headers: string[] = []
    let sampleData: Record<string, any>[] = []
    let filename = ''

    if (type === 'location') {
      headers = [
        'building_code',
        'building_name',
        'floor_code',
        'floor_name',
        'locator_code',
        'notes',
      ]
      sampleData = [
        {
          building_code: 'BLD-A',
          building_name: 'Building A',
          floor_code: 'FLR-1',
          floor_name: 'Floor 1',
          locator_code: 'Z01-R02-C04',
          notes: 'Main picking bin address',
        },
        {
          building_code: 'BLD-A',
          building_name: 'Building A',
          floor_code: 'FLR-1',
          floor_name: 'Floor 1',
          locator_code: 'Z01-R02-C05',
          notes: 'Secondary picking bin address',
        },
        {
          building_code: 'BLD-B',
          building_name: 'Building B',
          floor_code: 'G-FLOOR',
          floor_name: 'Ground Floor',
          locator_code: 'Z02-R01-C01',
          notes: 'Bulk storage floor address',
        },
      ]
      filename = 'Location_Import_Template.xlsx'

      const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers })
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Template')
      XLSX.writeFile(wb, filename)
    } else if (type === 'sku') {
      headers = [
        'sku_code',
        'name',
        'category_code',
        'sku_type',
        'uom',
        'weight',
        'is_batch_tracked',
        'description',
      ]
      sampleData = [
        {
          sku_code: 'RAW-STEL-001',
          name: 'Carbon Steel Sheet 2mm',
          category_code: 'RAW-METAL',
          sku_type: 'raw_material',
          uom: 'SHEET',
          weight: '5.4',
          is_batch_tracked: 'TRUE',
          description: 'High tensile carbon steel sheet',
        },
        {
          sku_code: 'FG-WIDG-99',
          name: 'SuperWidget Pro Pack',
          category_code: 'FIN-GOODS',
          sku_type: 'finished_good',
          uom: 'BOX',
          weight: '1.25',
          is_batch_tracked: 'FALSE',
          description: 'Finished super widget box bundle',
        },
      ]
      filename = 'SKU_Import_Template.xlsx'

      const wb = XLSX.utils.book_new()

      // Sheet 1: Import template
      const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers })
      XLSX.utils.book_append_sheet(wb, ws, 'SKU Import')

      // Sheet 2: Categories Reference — all active categories in the org
      const categoryRefData: Array<{ category_code: string; category_name: string }> =
        skuCategoriesData && skuCategoriesData.length > 0
          ? skuCategoriesData
              .sort((a, b) => a.code.localeCompare(b.code))
              .map((c) => ({ category_code: c.code, category_name: c.name }))
          : [
              { category_code: 'RAW-METAL', category_name: 'Raw Metals (example — download after adding categories)' },
              { category_code: 'FIN-GOODS', category_name: 'Finished Goods (example — download after adding categories)' },
            ]

      const wsRef = XLSX.utils.json_to_sheet(categoryRefData, {
        header: ['category_code', 'category_name'],
      })
      XLSX.utils.book_append_sheet(wb, wsRef, 'Categories Reference')

      XLSX.writeFile(wb, filename)
    } else {
      headers = [
        'sku_code',
        'location_path',
        'quantity',
        'inventory_state',
        'batch_no',
        'manufacture_date',
        'expiry_date',
        'remarks',
      ]
      sampleData = [
        {
          sku_code: 'RAW-STEL-001',
          location_path: 'BLD-A/FLR-1/Z01/R02/C04',
          quantity: '50',
          inventory_state: 'available',
          batch_no: 'LOT-2026-06A',
          manufacture_date: '2026-06-01',
          expiry_date: '2028-06-01',
          remarks: 'Initial stock intake',
        },
      ]
      filename = 'Opening_Stock_Import_Template.xlsx'

      const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers })
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Template')
      XLSX.writeFile(wb, filename)
    }
  }

  // Uploader Events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0])
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0])
    }
  }

  const validateAndSetFile = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase()
    if (ext !== 'xlsx' && ext !== 'xls') {
      alert('Invalid file format. Only Excel files (.xlsx, .xls) are accepted.')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      alert('File size exceeds the 10MB limit.')
      return
    }
    setFile(f)
    setActiveJobId(null)
    setExecutionResult(null)
  }

  const clearFile = () => {
    setFile(null)
    setActiveJobId(null)
    setExecutionResult(null)
  }

  // Action handlers
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(',')[1]
        resolve(base64!)
      }
      reader.onerror = (err) => reject(err)
    })
  }

  const handleValidate = async () => {
    if (!file) return
    setIsUploading(true)
    setUploadProgress(15)

    try {
      const base64 = await fileToBase64(file)
      setUploadProgress(60)
      validateMutation.mutate({
        file: base64,
        type: selectedType,
        fileName: file.name,
      })
    } catch (err: any) {
      alert('Failed to process file locally.')
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const handleExecute = () => {
    if (!activeJobId) return
    executeMutation.mutate(activeJobId)
  }

  const handleReset = () => {
    setFile(null)
    setActiveJobId(null)
    setExecutionResult(null)
    setPage(1)
  }

  // Grid filtering & pagination variables
  const rows = jobDetails?.rows ?? []
  const filteredRows = rows.filter((r) => {
    if (filterMode === 'valid') return r.isValid
    if (filterMode === 'invalid') return !r.isValid
    return true
  })

  const limit = 10
  const totalPages = Math.ceil(filteredRows.length / limit)
  const paginatedRows = filteredRows.slice((page - 1) * limit, page * limit)

  // Permission Gating for Selectable Types
  const isTypePermitted = (type: 'location' | 'sku' | 'opening_stock') => {
    if (type === 'location') return canImportLocation
    if (type === 'sku') return canImportSku
    if (type === 'opening_stock') return canImportStock
    return false
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Import Master Data</h1>
        <p className="text-sm text-slate-500 mt-1.5">
          Validate and stage bulk imports of warehouse locations, item catalogs, and stock opening balances.
        </p>
      </div>

      {/* Main Form Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-300">
        {/* Step 1: Type Selection */}
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Step 1: Select Master Data Category
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {IMPORT_TYPES.map((t) => {
              const permitted = isTypePermitted(t.value)
              const selected = selectedType === t.value

              return (
                <button
                  key={t.value}
                  disabled={!permitted || isUploading || validateMutation.isPending || executeMutation.isPending}
                  onClick={() => {
                    setSelectedType(t.value)
                    clearFile()
                  }}
                  className={`flex flex-col text-left p-4 rounded-xl border-2 transition-all cursor-pointer relative ${
                    selected
                      ? 'border-indigo-500 bg-indigo-50/20 ring-2 ring-indigo-500/10'
                      : 'border-slate-200 hover:border-slate-350 hover:bg-slate-50/30'
                  } ${!permitted ? 'opacity-40 cursor-not-allowed bg-slate-100/50' : ''}`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-semibold text-slate-900 text-sm">{t.label}</span>
                    {selected && (
                      <span className="h-4 w-4 rounded-full bg-indigo-500 flex items-center justify-center">
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500 mt-2 leading-relaxed">{t.description}</span>
                  {!permitted && (
                    <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                      <Shield className="h-2.5 w-2.5" />
                      Gated
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Templates Download */}
        <div className="px-6 py-4 bg-slate-50/20 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-700">Need template spreadsheets?</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleDownloadTemplate('location')}
              disabled={!canImportLocation}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-950 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              <Download className="h-3 w-3" />
              Location Template
            </button>
            <button
              onClick={() => handleDownloadTemplate('sku')}
              disabled={!canImportSku}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-950 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              <Download className="h-3 w-3" />
              SKU Template
            </button>
            <button
              onClick={() => handleDownloadTemplate('opening_stock')}
              disabled={!canImportStock}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-950 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              <Download className="h-3 w-3" />
              Opening Stock Template
            </button>
          </div>
        </div>

        {/* Step 2: Upload Area */}
        <div className="p-6">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Step 2: Upload File
          </h2>

          {!file ? (
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-all ${
                dragActive
                  ? 'border-indigo-500 bg-indigo-50/10'
                  : 'border-slate-250 hover:border-slate-350 hover:bg-slate-50/30'
              }`}
            >
              <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 mb-3">
                <Upload className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-slate-700">
                Drag and drop your spreadsheet here, or{' '}
                <label className="text-indigo-600 hover:text-indigo-800 cursor-pointer underline">
                  browse files
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              </p>
              <p className="text-xs text-slate-400 mt-2">Accepted formats: .xlsx, .xls (Max 10MB)</p>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 rounded-xl border bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-indigo-500 flex items-center justify-center text-white font-semibold shadow-sm">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 truncate max-w-md">{file.name}</p>
                  <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>

              {!activeJobId && !executionResult && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={clearFile}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleValidate}
                    disabled={isUploading || validateMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Validating...
                      </>
                    ) : (
                      'Validate File'
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Upload Progress Bar */}
          {isUploading && (
            <div className="mt-4 space-y-1">
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-indigo-500 h-1.5 transition-all duration-300 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                <span>Parsing Spreadsheet</span>
                <span>{uploadProgress}%</span>
              </div>
            </div>
          )}
        </div>

        {/* Step 3: Staged Validation Summary / Execution triggers */}
        {activeJobId && !executionResult && jobDetails && (
          <div className="border-t border-slate-100 p-6 space-y-6">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Step 3: Staging Summary & Execution
            </h2>

            {/* Metrics cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white border rounded-xl p-4 shadow-sm flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center border font-bold">
                  {jobDetails.job.totalRows}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Total Rows</h3>
                  <p className="text-xs text-slate-400">Total entries staged in staging area</p>
                </div>
              </div>
              <div className="bg-white border rounded-xl p-4 shadow-sm flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100 font-bold">
                  {jobDetails.job.validRows}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Valid Rows</h3>
                  <p className="text-xs text-slate-400">Clean rows ready to import</p>
                </div>
              </div>
              <div className="bg-white border rounded-xl p-4 shadow-sm flex items-center gap-4">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center border font-bold ${
                  jobDetails.job.errorRows > 0 
                    ? 'bg-rose-50 text-rose-700 border-rose-100' 
                    : 'bg-slate-50 text-slate-500'
                }`}>
                  {jobDetails.job.errorRows}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Invalid Rows</h3>
                  <p className="text-xs text-slate-400">Rows failing system sanity checks</p>
                </div>
              </div>
            </div>

            {/* Execution Warning / Buttons */}
            <div className="p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
              <div className="flex gap-3">
                {jobDetails.job.errorRows > 0 ? (
                  <>
                    <AlertTriangle className="h-5 w-5 text-rose-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-rose-800">Validation Errors Detected</p>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Please correct the validation errors listed in the preview grid below before importing.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-800">Validation Passed</p>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        All rows are structurally clean and active. Click Execute to commit changes safely.
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={clearFile}
                  className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  disabled={jobDetails.job.errorRows > 0 || executeMutation.isPending}
                  onClick={handleExecute}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {executeMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Executing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Execute Import
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Validation Grid */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-4 gap-4">
                <h3 className="font-bold text-slate-800 text-base">Validation Grid</h3>
                <div className="flex gap-1.5 bg-slate-100 p-0.5 rounded-lg border">
                  {(['all', 'valid', 'invalid'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        setFilterMode(m)
                        setPage(1)
                      }}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                        filterMode === m
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {isDetailsLoading ? (
                <div className="py-12 text-center text-slate-400">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-indigo-500" />
                  <span className="block mt-2 text-sm">Loading staged data...</span>
                </div>
              ) : paginatedRows.length === 0 ? (
                <div className="py-8 text-center text-slate-400 bg-slate-50 border border-dashed rounded-xl">
                  No rows found matching current filter ({filterMode}).
                </div>
              ) : (
                <div className="border rounded-xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-500 border-collapse">
                      <thead className="bg-slate-50 border-b text-slate-700 text-xs font-semibold uppercase">
                        <tr>
                          <th className="px-4 py-3">Row #</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Errors</th>
                          <th className="px-4 py-3">Data Preview</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedRows.map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3.5 font-mono text-xs font-bold text-slate-900">
                              {r.rowNumber}
                            </td>
                            <td className="px-4 py-3.5">
                              {r.isValid ? (
                                <span className="inline-flex items-center gap-1 rounded bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 border border-green-150">
                                  Valid
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 border border-red-150">
                                  Invalid
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 max-w-xs">
                              {r.errors.length > 0 ? (
                                <div className="space-y-1">
                                  {r.errors.map((err, idx) => (
                                    <p key={idx} className="text-xs text-rose-600 font-medium leading-relaxed">
                                      • {err}
                                    </p>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-300 italic text-xs">None</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-xs text-slate-600 max-w-md">
                              {selectedType === 'location' ? (
                                <div className="space-y-1">
                                  <div>
                                    <span className="font-semibold text-slate-700">Building:</span>{' '}
                                    {r.rowData.building_name || r.rowData.building_code}{' '}
                                    <span className="text-slate-400 font-mono text-[10px]">
                                      ({r.rowData.building_code})
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-semibold text-slate-700">Floor:</span>{' '}
                                    {r.rowData.floor_name || r.rowData.floor_code}{' '}
                                    <span className="text-slate-400 font-mono text-[10px]">
                                      ({r.rowData.floor_code})
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-semibold text-slate-700">Address:</span>{' '}
                                    <span className="font-mono font-bold text-amber-700">
                                      {r.rowData.locator_code}
                                    </span>
                                  </div>
                                  {r.rowData.notes && (
                                    <div className="text-[11px] text-slate-400 truncate">
                                      <span className="font-medium text-slate-500">Notes:</span> {r.rowData.notes}
                                    </div>
                                  )}
                                </div>
                              ) : selectedType === 'sku' ? (
                                <div className="space-y-1">
                                  <div>
                                    <span className="font-semibold text-slate-700">SKU:</span>{' '}
                                    <span className="font-mono font-bold">{r.rowData.sku_code}</span>
                                  </div>
                                  <div className="font-medium text-slate-800 truncate">{r.rowData.name}</div>
                                  <div className="text-[11px] text-slate-400">
                                    Type: <span className="capitalize">{r.rowData.sku_type}</span> | UOM:{' '}
                                    {r.rowData.uom}
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <div>
                                    <span className="font-semibold text-slate-700">SKU:</span>{' '}
                                    <span className="font-mono font-bold">{r.rowData.sku_code}</span>
                                  </div>
                                  <div className="truncate">
                                    <span className="font-semibold text-slate-700">Path:</span>{' '}
                                    <span className="font-mono text-[11px]">{r.rowData.location_path}</span>
                                  </div>
                                  <div className="text-[11px]">
                                    Qty:{' '}
                                    <span className="font-bold text-slate-900">{r.rowData.quantity}</span> |
                                    State: <span className="text-indigo-650 font-medium">{r.rowData.inventory_state}</span>
                                    {r.rowData.batch_no && ` | Batch: ${r.rowData.batch_no}`}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Paginated grid navigation */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t bg-white px-4 py-3">
                      <span className="text-xs text-slate-500">
                        Showing row <strong className="text-slate-900">{(page - 1) * limit + 1}</strong> to{' '}
                        <strong className="text-slate-900">
                          {Math.min(page * limit, filteredRows.length)}
                        </strong>{' '}
                        of <strong className="text-slate-900">{filteredRows.length}</strong>
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page === 1}
                          className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                        >
                          <ChevronLeft className="h-3 w-3" />
                          Prev
                        </button>
                        <button
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          disabled={page === totalPages}
                          className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                        >
                          Next
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Success Screen */}
        {executionResult && (
          <div className="border-t border-slate-100 p-10 flex flex-col items-center justify-center text-center space-y-6 bg-slate-50/20">
            <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 animate-bounce">
              <CheckCircle className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Import Completed Successfully</h2>
              <p className="text-sm text-slate-500 mt-1 max-w-sm">
                Transactional execution succeeded and the staging job has been completed.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-lg border rounded-xl bg-white p-4 shadow-sm">
              <div className="p-3 border-r last:border-r-0 border-slate-100 flex flex-col">
                <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">Created</span>
                <span className="text-xl font-extrabold text-slate-800 mt-1">{executionResult.created}</span>
              </div>
              <div className="p-3 border-r last:border-r-0 border-slate-100 flex flex-col">
                <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">Updated</span>
                <span className="text-xl font-extrabold text-slate-800 mt-1">{executionResult.updated}</span>
              </div>
              <div className="p-3 border-r last:border-r-0 border-slate-100 flex flex-col">
                <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">Posted</span>
                <span className="text-xl font-extrabold text-slate-800 mt-1">{executionResult.posted}</span>
              </div>
              <div className="p-3 last:border-r-0 border-slate-100 flex flex-col">
                <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">Skipped</span>
                <span className="text-xl font-extrabold text-slate-800 mt-1">{executionResult.skipped}</span>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-600 transition-colors shadow-sm cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              Import Another File
            </button>
          </div>
        )}
      </div>

      {/* History Log Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2 border-b pb-4">
          <History className="h-5 w-5 text-slate-500" />
          <h2 className="font-extrabold text-slate-900 text-lg">Recent Imports</h2>
        </div>

        {isHistoryLoading ? (
          <div className="py-12 text-center text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
            <span className="block mt-2 text-sm">Loading import history...</span>
          </div>
        ) : !jobsHistory || jobsHistory.length === 0 ? (
          <div className="py-12 text-center text-slate-400 border border-dashed rounded-xl bg-slate-50/50">
            No recent imports found for your organization.
          </div>
        ) : (
          <div className="border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-500 border-collapse">
                <thead className="bg-slate-50 border-b text-slate-700 text-xs font-semibold uppercase">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">File Name</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Created By</th>
                    <th className="px-5 py-3">Rows</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobsHistory.map((j) => {
                    const badge = STATUS_BADGES[j.status] || {
                      bg: 'bg-slate-100',
                      text: 'text-slate-700 border-slate-200',
                      label: j.status,
                    }

                    return (
                      <tr key={j.id} className="hover:bg-slate-50/50">
                        <td className="px-5 py-3.5 text-slate-900 font-medium whitespace-nowrap">
                          {new Date(j.createdAt).toLocaleString()}
                        </td>
                        <td className="px-5 py-3.5 font-semibold capitalize text-slate-700 whitespace-nowrap">
                          {j.type.replace('_', ' ')}
                        </td>
                        <td className="px-5 py-3.5 text-slate-600 truncate max-w-xs">
                          {j.fileName || (
                            <span className="text-slate-350 italic text-xs">unknown_file</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${badge.bg} ${badge.text}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-700 whitespace-nowrap font-medium">
                          {j.createdByName}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs font-bold text-slate-900">
                          {j.totalRows}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
