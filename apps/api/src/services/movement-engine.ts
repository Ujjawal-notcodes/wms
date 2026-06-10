/**
 * @fileoverview Movement Engine — The ONLY gateway for inventory mutations.
 *
 * ALL inventory changes MUST go through this engine.
 * No route handler or service should write to stock_ledger or
 * inventory_balances directly.
 *
 * The engine:
 *   1. Validates the operation (balance floor guard, state transitions)
 *   2. Inserts the ledger entry
 *   3. inventory_balances is updated atomically via PostgreSQL trigger
 *   4. All within a single transaction
 *
 * Phase 1 supported events:
 *   - opening_balance
 *   - inbound_receipt
 *   - adjustment_positive / adjustment_negative
 *   - transfer_out / transfer_in
 *   - location_transfer
 */

import { db, stockLedger } from '@wms/db'
import type { NewStockLedgerEntry } from '@wms/db'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type MovementEventType = NewStockLedgerEntry['eventType']
export type InventoryState = NewStockLedgerEntry['inventoryState']

export interface MovementInput {
  orgId: string
  eventType: MovementEventType
  skuId: string
  batchId?: string
  locationId: string
  siteId: string
  /** Signed: positive = IN, negative = OUT */
  qty: number
  uom: string
  inventoryState: InventoryState
  referenceType?: string
  referenceId?: string
  referenceLineId?: string
  performedBy: string
  notes?: string
  metadata?: Record<string, unknown>
}

export interface MovementResult {
  ledgerEntryId: string
  newBalance: number
}

// ─────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────

export class MovementEngine {
  /**
   * Post a single inventory movement event.
   *
   * The PostgreSQL trigger on stock_ledger handles the balance update
   * and balance floor guard atomically.
   *
   * @throws If balance would go negative (PostgreSQL trigger raises exception)
   * @throws If qty is zero
   */
  static async post(input: MovementInput): Promise<MovementResult> {
    if (input.qty === 0) {
      throw new Error('Movement quantity cannot be zero')
    }

    const [entry] = await db
      .insert(stockLedger)
      .values({
        orgId: input.orgId,
        eventType: input.eventType,
        skuId: input.skuId,
        batchId: input.batchId,
        locationId: input.locationId,
        siteId: input.siteId,
        qty: String(input.qty),
        uom: input.uom,
        inventoryState: input.inventoryState,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        referenceLineId: input.referenceLineId,
        performedBy: input.performedBy,
        notes: input.notes,
        metadata: input.metadata ?? {},
      })
      .returning({ id: stockLedger.id })

    if (!entry) {
      throw new Error('Failed to insert stock ledger entry')
    }

    return {
      ledgerEntryId: entry.id,
      // The trigger updated inventory_balances; the new balance
      // is not returned here to avoid an extra query. Callers
      // that need the new balance should query inventory_balances.
      newBalance: 0,
    }
  }

  /**
   * Post multiple movement events within a single database transaction.
   * Use for operations that require atomicity across multiple lines
   * (e.g., transfer dispatch: multiple SKUs must all succeed or all fail).
   */
  static async postMany(inputs: MovementInput[]): Promise<MovementResult[]> {
    if (inputs.length === 0) {
      throw new Error('postMany requires at least one movement input')
    }

    return db.transaction(async (tx) => {
      const results: MovementResult[] = []

      for (const input of inputs) {
        if (input.qty === 0) {
          throw new Error(`Movement quantity cannot be zero for SKU: ${input.skuId}`)
        }

        const [entry] = await tx
          .insert(stockLedger)
          .values({
            orgId: input.orgId,
            eventType: input.eventType,
            skuId: input.skuId,
            batchId: input.batchId,
            locationId: input.locationId,
            siteId: input.siteId,
            qty: String(input.qty),
            uom: input.uom,
            inventoryState: input.inventoryState,
            referenceType: input.referenceType,
            referenceId: input.referenceId,
            referenceLineId: input.referenceLineId,
            performedBy: input.performedBy,
            notes: input.notes,
            metadata: input.metadata ?? {},
          })
          .returning({ id: stockLedger.id })

        if (!entry) throw new Error('Failed to insert stock ledger entry')
        results.push({ ledgerEntryId: entry.id, newBalance: 0 })
      }

      return results
    })
  }
}
