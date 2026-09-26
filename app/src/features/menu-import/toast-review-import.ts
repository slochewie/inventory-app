import type { NormalizedMenuItem, ParsedMenuImport, RawMenuRow } from './types'

const REQUIRED_REVIEW_HEADERS = [
  'Source Kind',
  'Source Item #',
  'Item Name',
  'Toast Category',
  'Toast Destination',
  'Base Price ($)',
  'Happy Hour $',
  'Happy Hour Window',
  'Status',
  'Export Included',
  'Effective Times',
  'Source Row Count',
  'Notes',
]

export function isToastExportReviewCsv(text: string) {
  const [headerRow] = parseCsvRows(text)
  if (!headerRow) return false

  const headers = new Set(headerRow.map((header) => normalizeHeader(header)))
  const hasSourceCategory =
    headers.has(normalizeHeader('Source Category')) ||
    headers.has(normalizeHeader('Aloha Category'))

  return (
    hasSourceCategory &&
    REQUIRED_REVIEW_HEADERS.every((header) => headers.has(normalizeHeader(header)))
  )
}

export function parseToastExportReviewCsv(text: string, sourceName: string): {
  importFile: ParsedMenuImport
  items: NormalizedMenuItem[]
} {
  const rows = parseCsvRows(text)
  const headers = rows[0]

  if (!headers) {
    throw new Error('Toast export review CSV is empty')
  }

  const headerIndex = new Map(headers.map((header, index) => [normalizeHeader(header), index]))
  const missingHeaders = REQUIRED_REVIEW_HEADERS.filter((header) => !headerIndex.has(normalizeHeader(header)))
  const sourceCategoryHeader = headerIndex.has(normalizeHeader('Source Category'))
    ? 'Source Category'
    : headerIndex.has(normalizeHeader('Aloha Category'))
      ? 'Aloha Category'
      : null

  if (!sourceCategoryHeader) {
    missingHeaders.push('Source Category')
  }

  if (missingHeaders.length > 0) {
    throw new Error(`Toast export review CSV is missing: ${missingHeaders.join(', ')}`)
  }

  const rawRows: RawMenuRow[] = []
  const items: NormalizedMenuItem[] = []

  rows.slice(1).forEach((row, rowIndex) => {
    if (row.every((value) => value.trim() === '')) return

    const rawRow = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
    const sourceKind = getCell(row, headerIndex, 'Source Kind') || 'aloha-csv'
    const sourceItemNumber = blankToUndefined(getCell(row, headerIndex, 'Source Item #'))
    const itemName = getCell(row, headerIndex, 'Item Name')
    const sourceCategory = blankToUndefined(
      getCell(row, headerIndex, sourceCategoryHeader),
    )
    const toastCategory = getCell(row, headerIndex, 'Toast Category') || sourceCategory || 'Uncategorized'
    const toastDestination = getCell(row, headerIndex, 'Toast Destination') || toastCategory
    const basePriceCents = parseMoney(getCell(row, headerIndex, 'Base Price ($)'))
    const happyHourPriceCents = parseMoney(getCell(row, headerIndex, 'Happy Hour $'))
    const happyHourWindow = blankToUndefined(getCell(row, headerIndex, 'Happy Hour Window'))
    const status = parseStatus(getCell(row, headerIndex, 'Status'))
    const exportIncluded = /^yes$/i.test(getCell(row, headerIndex, 'Export Included'))
    const effectiveTimes = splitPipeList(getCell(row, headerIndex, 'Effective Times'))
    const sourceRowCount = parsePositiveInteger(getCell(row, headerIndex, 'Source Row Count')) ?? 1
    const notes = splitPipeList(getCell(row, headerIndex, 'Notes'))

    if (!itemName.trim()) return

    rawRows.push(rawRow)
    items.push({
      id: `toast-review-${sourceItemNumber || rowIndex + 1}-${slugify(itemName)}-${rowIndex}`,
      sourceKind: sourceKind === 'aloha-csv' ? 'aloha-csv' : 'aloha-csv',
      sourceItemNumber,
      name: itemName,
      category: sourceCategory,
      toastCategory,
      toastDestination,
      basePriceCents,
      happyHourPriceCents,
      happyHourWindow,
      effectiveTimes,
      sourceRowCount,
      status,
      exportIncluded,
      notes,
      rawRows: [rawRow],
    })
  })

  if (items.length === 0) {
    throw new Error('Toast export review CSV did not contain any menu items')
  }

  return {
    importFile: {
      sourceKind: 'aloha-csv',
      sourceName,
      rows: rawRows,
      warnings: [],
      meta: {
        restoredFrom: 'toast-export-review.csv',
      },
    },
    items,
  }
}

function parseCsvRows(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        field += '"'
        index += 1
        continue
      }

      if (char === '"') {
        inQuotes = false
        continue
      }

      field += char
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }

    if (char === ',') {
      row.push(field)
      field = ''
      continue
    }

    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }

    if (char === '\r') continue

    field += char
  }

  row.push(field)
  if (row.length > 1 || row[0]) rows.push(row)

  return rows
}

function getCell(row: string[], headerIndex: Map<string, number>, header: string) {
  const index = headerIndex.get(normalizeHeader(header))
  return index === undefined ? '' : (row[index] ?? '').trim()
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase()
}

function blankToUndefined(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function parseMoney(value: string) {
  const cleaned = value.replace(/[$,]/g, '').trim()
  if (!cleaned || /^review$/i.test(cleaned)) return null

  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null
}

function parseStatus(value: string): NormalizedMenuItem['status'] {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'review' || normalized === 'ignored') return normalized
  return 'ready'
}

function splitPipeList(value: string) {
  return value
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
}

function parsePositiveInteger(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'
}
