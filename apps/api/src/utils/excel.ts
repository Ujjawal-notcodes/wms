/**
 * @fileoverview Excel parsing utilities for the Import system.
 * Uses exceljs to read uploaded .xlsx files and convert to row objects.
 */

import ExcelJS from 'exceljs'

/**
 * Parse an uploaded Excel buffer into an array of plain row objects.
 * Headers are taken from the first row. Empty rows are skipped.
 */
export async function parseExcelBuffer(
  buffer: Buffer,
): Promise<{ rows: Record<string, unknown>[]; headers: string[] }> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as any)

  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    throw new Error('Excel file has no worksheets')
  }

  const headers: string[] = []
  const rows: Record<string, unknown>[] = []

  let isFirstRow = true

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as (ExcelJS.CellValue | undefined)[]
    // row.values is 1-indexed; index 0 is undefined
    const cells = values.slice(1)

    if (isFirstRow) {
      // Extract headers from first row, normalize to lowercase with underscores
      for (const cell of cells) {
        const header = String(cell ?? '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '_')
        headers.push(header)
      }
      isFirstRow = false
      return
    }

    // Skip completely empty rows
    const hasData = cells.some((cell) => {
      if (cell === null || cell === undefined || cell === '') return false
      if (typeof cell === 'object' && 'richText' in cell) {
        return cell.richText.some((rt) => (rt.text ?? '').trim() !== '')
      }
      return String(cell).trim() !== ''
    })

    if (!hasData) return

    const rowObj: Record<string, unknown> = {}
    headers.forEach((header, idx) => {
      const cell = cells[idx]
      rowObj[header] = resolveCellValue(cell)
    })

    rows.push(rowObj)
  })

  return { rows, headers }
}

/**
 * Resolve an ExcelJS cell value to a primitive.
 */
function resolveCellValue(cell: ExcelJS.CellValue | undefined): unknown {
  if (cell === null || cell === undefined) return ''

  // Rich text
  if (typeof cell === 'object' && 'richText' in (cell as object)) {
    return (cell as ExcelJS.CellRichTextValue).richText
      .map((rt) => rt.text ?? '')
      .join('')
      .trim()
  }

  // Formula result
  if (typeof cell === 'object' && 'result' in (cell as object)) {
    return resolveCellValue((cell as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue)
  }

  // Hyperlink
  if (typeof cell === 'object' && 'text' in (cell as object) && 'hyperlink' in (cell as object)) {
    return (cell as ExcelJS.CellHyperlinkValue).text
  }

  // Date
  if (cell instanceof Date) {
    return cell.toISOString().split('T')[0]
  }

  return cell
}

/**
 * Generate an Excel template buffer for download.
 * @param sheetName - Name of the worksheet tab
 * @param headers - Column header names
 * @param exampleRows - Optional example data rows
 */
export async function generateExcelTemplate(
  sheetName: string,
  headers: string[],
  exampleRows?: string[][],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'WMS'
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet(sheetName)

  // Header row — bold, blue background
  worksheet.columns = headers.map((h) => ({
    header: h,
    key: h,
    width: Math.max(h.length + 4, 16),
  }))

  const headerRow = worksheet.getRow(1)
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A5F' },
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF93C5FD' } },
    }
  })

  // Example rows
  if (exampleRows) {
    for (const exRow of exampleRows) {
      const row = worksheet.addRow(exRow)
      row.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF0F9FF' },
        }
      })
    }
  }

  worksheet.views = [{ state: 'frozen', ySplit: 1 }]

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
