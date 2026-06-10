/**
 * @fileoverview Document number utility.
 * Generates human-readable sequential document numbers like "TRF-2025-0042".
 * Uses the `next_document_number` PostgreSQL function for atomic increment.
 */

import { db } from '@wms/db'
import { sql } from 'drizzle-orm'

export type DocType = 'TRF' | 'ADJ' | 'GRN' | 'PCK' | 'DSP' | 'RET'

export async function nextDocumentNumber(
  orgId: string,
  docType: DocType,
): Promise<string> {
  const year = new Date().getFullYear()

  const result = await db.execute(
    sql`SELECT next_document_number(${orgId}::UUID, ${docType}, ${year}::SMALLINT) AS doc_number`,
  )

  const docNumber = (result as unknown as Array<{ doc_number: string }>)[0]?.doc_number

  if (!docNumber) {
    throw new Error(`Failed to generate document number for type: ${docType}`)
  }

  return docNumber
}
