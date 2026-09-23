import { getDefaultToastCategory, shouldExportByDefault } from './category-rules'
import { normalizeHeader, parseCsv } from './csv'
import type { NormalizedMenuItem, ParsedMenuImport, RawMenuRow } from './types'

const ALOHA_REQUIRED_HEADERS = ['item number', 'item name', 'price', 'effective time']

export function parseAlohaMenuCsv(text: string, sourceName: string): ParsedMenuImport {
  const csvRows = parseCsv(text)
  const rows: RawMenuRow[] = []
  const warnings: string[] = []
  const meta: Record<string, string> = {}
  let activeHeaders: string[] | null = null
  let activeSection = ''

  csvRows.forEach((csvRow, index) => {
    const trimmedRow = csvRow.map((cell) => cell.trim())
    const normalizedHeaders = trimmedRow.map(normalizeHeader)

    if (trimmedRow[0]?.startsWith('Store :')) {
      meta.store = trimmedRow[0].replace(/^Store\s*:\s*/i, '').trim()
      return
    }

    if (ALOHA_REQUIRED_HEADERS.every((header) => normalizedHeaders.includes(header))) {
      activeHeaders = trimmedRow
      return
    }

    if (!activeHeaders || !/^\d+$/.test(trimmedRow[0] ?? '')) return

    const row = activeHeaders.reduce<RawMenuRow>((accumulator, header, headerIndex) => {
      accumulator[header] = trimmedRow[headerIndex] ?? ''
      return accumulator
    }, {})

    row['Source Row'] = String(index + 1)

    const itemName = row['Item Name']?.trim() ?? ''
    if (isAlohaSectionHeader(itemName)) {
      activeSection = itemName.replace(/[<>]/g, '').trim()
    }

    if (activeSection) row['Aloha Section'] = activeSection

    rows.push(row)
  })

  if (rows.length === 0) {
    warnings.push('No Aloha item rows were found. Expected Item Number, Item Name, Price, and Effective Time columns.')
  }

  return {
    sourceKind: 'aloha-csv',
    sourceName,
    rows,
    warnings,
    meta,
  }
}

export function normalizeAlohaMenuItems(importFile: ParsedMenuImport): NormalizedMenuItem[] {
  const groups = new Map<string, RawMenuRow[]>()

  importFile.rows.forEach((row) => {
    const itemNumber = row['Item Number']?.trim() ?? ''
    const itemName = row['Item Name']?.trim() ?? ''
    const key = `${itemNumber}::${itemName}`
    const group = groups.get(key) ?? []

    group.push(row)
    groups.set(key, group)
  })

  return [...groups.values()].map((rows) => normalizeAlohaGroup(rows))
}

function normalizeAlohaGroup(rows: RawMenuRow[]): NormalizedMenuItem {
  const firstRow = rows[0] ?? {}
  const itemNumber = firstRow['Item Number']?.trim() ?? ''
  const name = firstRow['Item Name']?.trim() ?? ''
  const sourceCategory = firstRow['Aloha Section'] || undefined
  const prices = rows.map((row) => parsePriceCents(row.Price)).filter(isPriceCents)
  const basePriceCents = getBasePriceCents(rows)
  const happyHourPriceCents = getHappyHourPriceCents(rows, basePriceCents)
  const happyHourWindow = happyHourPriceCents === null ? undefined : getHappyHourWindow(rows, happyHourPriceCents)
  const notes: string[] = []
  let status: NormalizedMenuItem['status'] = 'ready'

  if (isIgnoredAlohaName(name)) {
    status = 'ignored'
    notes.push('Aloha section/header row')
  }

  if (status !== 'ignored' && basePriceCents === null) {
    status = 'review'
    notes.push('Price needs review')
  }

  if (status !== 'ignored' && rows.some((row) => normalizeHeader(row.Price ?? '') === 'ask')) {
    status = 'review'
    notes.push('Aloha price is Ask')
  }

  if (status !== 'ignored' && prices.length > 1 && new Set(prices).size > 1 && happyHourPriceCents === null) {
    status = 'review'
    notes.push('Multiple prices need review')
  }

  if (happyHourPriceCents !== null) {
    notes.push('Detected lower timed price')
  }

  const toastCategory = getDefaultToastCategory(sourceCategory)
  const exportIncluded = shouldExportByDefault({
    sourceCategory,
    itemName: name,
    status,
  })

  return {
    id: itemNumber ? `aloha-${itemNumber}-${cryptoSafeId(name)}` : `aloha-row-${firstRow['Source Row'] ?? cryptoSafeId(name)}`,
    sourceKind: 'aloha-csv',
    sourceItemNumber: itemNumber || undefined,
    name,
    category: sourceCategory,
    toastCategory,
    basePriceCents,
    happyHourPriceCents,
    happyHourWindow,
    effectiveTimes: [...new Set(rows.map((row) => row['Effective Time']?.trim()).filter(isNonEmptyString))],
    sourceRowCount: rows.length,
    status,
    exportIncluded,
    notes,
    rawRows: rows,
  }
}

function getBasePriceCents(rows: RawMenuRow[]) {
  const midnightRow = rows.find((row) => row['Effective Time']?.trim() === '00:00')
  const midnightPrice = parsePriceCents(midnightRow?.Price)
  if (midnightPrice !== null) return midnightPrice

  const parsedPrices = rows.map((row) => parsePriceCents(row.Price)).filter(isPriceCents)
  if (parsedPrices.length === 0) return null

  return Math.max(...parsedPrices)
}

function getHappyHourPriceCents(rows: RawMenuRow[], basePriceCents: number | null) {
  if (basePriceCents === null) return null

  const lowerPrices = rows
    .map((row) => parsePriceCents(row.Price))
    .filter((price): price is number => isPriceCents(price) && price < basePriceCents)

  if (lowerPrices.length === 0) return null

  return Math.min(...lowerPrices)
}

function getHappyHourWindow(rows: RawMenuRow[], happyHourPriceCents: number) {
  const happyHourRows = rows.filter((row) => parsePriceCents(row.Price) === happyHourPriceCents)
  const startTime = happyHourRows[0]?.['Effective Time']?.trim()
  if (!startTime) return undefined

  const sortedRows = rows
    .map((row) => ({
      time: row['Effective Time']?.trim() ?? '',
      price: parsePriceCents(row.Price),
    }))
    .filter((row) => row.time)
    .sort((left, right) => left.time.localeCompare(right.time))

  const followingBaseRow = sortedRows.find((row) => row.time > startTime && row.price !== happyHourPriceCents)

  return followingBaseRow ? `${startTime}–${followingBaseRow.time}` : startTime
}

function parsePriceCents(value?: string) {
  const normalized = value?.trim()
  if (!normalized || normalizeHeader(normalized) === 'ask') return null

  const numeric = Number(normalized.replace(/[$,]/g, ''))
  if (!Number.isFinite(numeric)) return null

  return Math.round(numeric * 100)
}

function isIgnoredAlohaName(name: string) {
  const normalized = name.trim()

  return (
    normalized === '' ||
    normalized === 'ITEM INDEX:' ||
    /^=+$/.test(normalized) ||
    isAlohaSectionHeader(normalized) ||
    /#S$/.test(normalized)
  )
}

function isAlohaSectionHeader(name: string) {
  return /^<[^>]+>$/.test(name.trim())
}

function isPriceCents(value: number | null): value is number {
  return value !== null
}

function isNonEmptyString(value: string | undefined): value is string {
  return Boolean(value)
}

function cryptoSafeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'unknown'
}
