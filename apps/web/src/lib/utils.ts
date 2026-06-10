import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format a number as a quantity string with UOM */
export function formatQty(qty: number | string, uom?: string): string {
  const n = typeof qty === 'string' ? parseFloat(qty) : qty
  const formatted = n % 1 === 0 ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 3 })
  return uom ? `${formatted} ${uom}` : formatted
}

/** Format a date string to DD MMM YYYY */
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

/** Format a datetime string to DD MMM YYYY, HH:MM */
export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

/** Map inventory state to a display label and colour class */
export const INVENTORY_STATE_LABELS: Record<string, { label: string; color: string }> = {
  available:    { label: 'Available',    color: 'text-green-600 bg-green-50' },
  reserved:     { label: 'Reserved',     color: 'text-amber-600 bg-amber-50' },
  in_production:{ label: 'In Production',color: 'text-blue-600 bg-blue-50' },
  qc_hold:      { label: 'QC Hold',      color: 'text-purple-600 bg-purple-50' },
  damaged:      { label: 'Damaged',      color: 'text-red-600 bg-red-50' },
  returned:     { label: 'Returned',     color: 'text-orange-600 bg-orange-50' },
  in_transit:   { label: 'In Transit',   color: 'text-sky-600 bg-sky-50' },
}

/** Map SKU type to display label */
export const SKU_TYPE_LABELS: Record<string, string> = {
  raw_material:  'Raw Material',
  component:     'Component',
  semi_finished: 'Semi-Finished',
  finished_good: 'Finished Good',
  packaging:     'Packaging',
  consumable:    'Consumable',
}
