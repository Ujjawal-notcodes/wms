'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth.store'
import {
  Package,
  Factory,
  Warehouse,
  ArrowLeftRight,
  AlertTriangle,
  History,
  Loader2,
  TrendingUp,
  Shield,
} from 'lucide-react'

interface Kpis {
  activeSkus: number
  factoryStockItems: number
  warehouseStockItems: number
  pendingTransfers: number
}

interface LowStockAlert {
  id: string
  skuCode: string
  name: string
  uom: string
  reorderPoint: string
  totalQty: number
}

interface RecentMovement {
  id: string
  skuCode: string
  skuName: string
  locationCode: string
  locationName: string
  locationPath: string | null
  building: string | null
  floor: string | null
  locatorCode: string | null
  eventType: string
  quantity: string
  uom: string
  performedByName: string
  performedAt: string
  notes: string | null
}

interface AlertsResponse {
  lowStockAlerts: LowStockAlert[]
  recentMovements: RecentMovement[]
}

export default function DashboardPage() {
  const { hasPermission, user } = useAuthStore()

  // Fetch Dashboard KPIs
  const { data: kpis, isLoading: isKpisLoading } = useQuery<Kpis>({
    queryKey: ['dashboard-kpis'],
    queryFn: () => api.get<Kpis>('/dashboard/kpis'),
    enabled: !!user && hasPermission('dashboard', 'read'),
  })

  // Fetch Dashboard Alerts & Movements
  const { data: alertsData, isLoading: isAlertsLoading } = useQuery<AlertsResponse>({
    queryKey: ['dashboard-alerts'],
    queryFn: () => api.get<AlertsResponse>('/dashboard/alerts'),
    enabled: !!user && hasPermission('dashboard', 'read'),
  })

  if (user && !hasPermission('dashboard', 'read')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6 bg-white border rounded-xl shadow-sm">
        <Shield className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-800">Access Denied</h2>
        <p className="text-slate-500 text-sm mt-2 max-w-md">
          You do not have the required permissions to view the operations dashboard.
        </p>
      </div>
    )
  }

  const formatDate = (iso: string) => {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  }

  const getEventBadgeClass = (type: string) => {
    switch (type) {
      case 'opening_balance':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200'
      case 'transfer_in':
        return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'transfer_out':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200'
      case 'adjustment':
      case 'adjustment_positive':
      case 'adjustment_negative':
        return 'bg-amber-50 text-amber-700 border-amber-200'
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200'
    }
  }

  const formatEventType = (type: string) => {
    return type.replace(/_/g, ' ')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Real-time inventory overview and operations analytics</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          {
            label: 'Active SKUs',
            value: isKpisLoading ? null : kpis?.activeSkus,
            icon: Package,
            color: 'text-indigo-600 bg-indigo-50 border-indigo-100',
          },
          {
            label: 'Factory Stock Items',
            value: isKpisLoading ? null : kpis?.factoryStockItems,
            icon: Factory,
            color: 'text-sky-600 bg-sky-50 border-sky-100',
          },
          {
            label: 'Warehouse Stock Items',
            value: isKpisLoading ? null : kpis?.warehouseStockItems,
            icon: Warehouse,
            color: 'text-emerald-600 bg-emerald-50 border-emerald-100',
          },
          {
            label: 'Pending Transfers',
            value: isKpisLoading ? null : kpis?.pendingTransfers,
            icon: ArrowLeftRight,
            color: 'text-amber-600 bg-amber-50 border-amber-100',
          },
        ].map((kpi) => {
          const Icon = kpi.icon
          return (
            <div key={kpi.label} className="rounded-xl border bg-white p-5 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{kpi.label}</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {kpi.value === null ? (
                    <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                  ) : (
                    kpi.value?.toLocaleString() ?? 0
                  )}
                </p>
              </div>
              <div className={`p-3 rounded-lg border ${kpi.color}`}>
                <Icon className="h-6 w-6" />
              </div>
            </div>
          )
        })}
      </div>

      {/* Alerts & Recent Actions layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Low Stock Alerts */}
        <div className="lg:col-span-5 rounded-xl border bg-white shadow-sm overflow-hidden flex flex-col h-[520px]">
          <div className="px-5 py-4 border-b bg-slate-50/50 flex items-center gap-2">
            <div className="p-1.5 bg-red-50 text-red-600 rounded">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <h2 className="font-bold text-slate-800 text-sm">Low Stock Alerts</h2>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {isAlertsLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
              </div>
            ) : !alertsData?.lowStockAlerts?.length ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                <TrendingUp className="h-8 w-8 text-emerald-400" />
                <p className="text-sm font-medium">All stock levels healthy</p>
                <p className="text-xs text-center px-6">No SKUs are currently below their reorder point thresholds.</p>
              </div>
            ) : (
              alertsData.lowStockAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="p-3 border rounded-lg hover:border-slate-300 transition-colors flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate text-sm">{alert.name}</p>
                    <p className="font-mono text-xs text-slate-400 mt-0.5">{alert.skuCode}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-bold text-sm ${alert.totalQty === 0 ? 'text-red-600' : 'text-amber-600'}`}>
                      {alert.totalQty} / {Number(alert.reorderPoint).toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">Qty / Reorder ({alert.uom})</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Movements */}
        <div className="lg:col-span-7 rounded-xl border bg-white shadow-sm overflow-hidden flex flex-col h-[520px]">
          <div className="px-5 py-4 border-b bg-slate-50/50 flex items-center gap-2">
            <div className="p-1.5 bg-slate-100 text-slate-600 rounded">
              <History className="h-4 w-4" />
            </div>
            <h2 className="font-bold text-slate-800 text-sm">Recent Stock Movements</h2>
          </div>
          <div className="flex-1 overflow-auto divide-y">
            {isAlertsLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
              </div>
            ) : !alertsData?.recentMovements?.length ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                <History className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium">No movements recorded</p>
                <p className="text-xs">Initial opening balances or transfers have not been registered.</p>
              </div>
            ) : (
              alertsData.recentMovements.map((move) => {
                const qtyVal = Number(move.quantity)
                const isPositive = qtyVal > 0
                return (
                  <div key={move.id} className="p-4 hover:bg-slate-50/50 transition-colors flex items-center justify-between gap-4 text-xs">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 truncate text-sm">{move.skuName}</span>
                        <span className={`inline-flex items-center rounded border px-1.5 py-0.2 font-semibold capitalize text-[10px] ${getEventBadgeClass(move.eventType)}`}>
                          {formatEventType(move.eventType)}
                        </span>
                      </div>
                      <div className="text-slate-500 flex items-center gap-1">
                        <span className="font-mono text-slate-400">{move.skuCode}</span>
                        <span>•</span>
                        <span>Loc: <strong className="font-mono text-slate-700">{move.locatorCode ?? move.locationCode}</strong></span>
                        <span>•</span>
                        <span>By: {move.performedByName}</span>
                      </div>
                      {move.notes && (
                        <p className="text-slate-400 italic text-[11px] truncate">"{move.notes}"</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold ${isPositive ? 'text-emerald-600' : 'text-slate-800'}`}>
                        {isPositive ? '+' : ''}
                        {qtyVal.toLocaleString()}
                        <span className="text-xs font-normal text-slate-400 ml-0.5">{move.uom}</span>
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">{formatDate(move.performedAt)}</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
