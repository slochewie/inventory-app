export type MenuImportSourceKind = 'aloha-csv' | 'toast-template-sheet'

export type RawMenuRow = Record<string, string>

export type ParsedMenuImport = {
  sourceKind: MenuImportSourceKind
  sourceName: string
  rows: RawMenuRow[]
  warnings: string[]
  meta?: Record<string, string>
}

export type NormalizedMenuItemStatus = 'ready' | 'review' | 'ignored'

export type NormalizedMenuItem = {
  id: string
  sourceKind: MenuImportSourceKind
  sourceItemNumber?: string
  name: string
  category?: string
  basePriceCents: number | null
  happyHourPriceCents: number | null
  happyHourWindow?: string
  effectiveTimes: string[]
  sourceRowCount: number
  status: NormalizedMenuItemStatus
  notes: string[]
  rawRows: RawMenuRow[]
}

export type MenuImportSummary = {
  rawRows: number
  normalizedItems: number
  ignoredItems: number
  reviewItems: number
  happyHourItems: number
}

export function summarizeMenuItems(items: NormalizedMenuItem[]): MenuImportSummary {
  return {
    rawRows: items.reduce((total, item) => total + item.sourceRowCount, 0),
    normalizedItems: items.filter((item) => item.status !== 'ignored').length,
    ignoredItems: items.filter((item) => item.status === 'ignored').length,
    reviewItems: items.filter((item) => item.status === 'review').length,
    happyHourItems: items.filter((item) => item.happyHourPriceCents !== null).length,
  }
}

export function formatCurrency(cents: number | null) {
  if (cents === null) return 'Review'

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}
