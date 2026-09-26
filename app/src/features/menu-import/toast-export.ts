import { buildBeerTabPreviewRows, type BeerTabPreviewRow } from './beer-preview'
import { saveReviewedItems } from './review-session'
import type { NormalizedMenuItem } from './types'

export type ToastExportFile = {
  id: 'export-review' | 'beer-tab' | 'liquor' | 'audit'
  label: string
  filename: string
  rows: string[][]
  rowCount: number
  note: string
}

const REVIEW_EXPORT_HEADERS = [
  'Source Kind',
  'Source Item #',
  'Item Name',
  'Source Category',
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

const BEER_EXPORT_HEADERS = [
  'Draft Beer', '10oz', 'Happy Hour $', '16oz', 'Happy Hour $',
  '24oz', 'Happy Hour $', 'Pitcher', 'Happy Hour $',
  'Can', 'Price $', 'Happy Hour $',
  'Bottle', 'Price $', 'Happy Hour $',
]

const LIQUOR_EXPORT_HEADERS = ['Item Name', 'Base Price ($)', 'Happy Hour $', 'Liquor Type']

const OMIT_BEERS = new Set([
  'domestic can', 'import can', 'tall', '$5 can', 'malibu boo', 'pb & j',
  'the setup', 'cc 1.00', 'sierra pale', 'stiegl radler', 'fig. mtn. agua santa',
  'sierra torpedo', 'blue moon', 'c-', 'banquet', 'bd', 'bd lite', 'm lite',
  'h life', 'tec', 'bavic pilsner', 'ashland seltzer', 'ashland 16',
  'jameson can', 'draft', 'dba', 'weinstephan', 'stone', 'rogue',
  'liquid gravity', 'fig mtn davy brown', 'pizza port', 'alesmith',
  'maui brewing', 'voodoo ranger', 'lg dope melody', 'wandering don',
  'weihenstephan', "killian's", 'tap it', 'weihensteph', 'new beer', 'tdne', 'silva',
])

const BEER_ALIASES = new Map(Object.entries({
  'russ rv happy hops': 'russ rvr happy hops',
  'russ rvr happy hops': 'russ rvr happy hops',
  'russ rvr blind pig': 'russ rvr blind pig',
  'rr pliny the elder': 'pliny the elder',
  'r r pliny the elder': 'pliny the elder',
  'rr pliney the elder': 'pliny the elder',
  'r r pliney the elder': 'pliny the elder',
  'pliny the elder': 'pliny the elder',
  'fig mtn davy brown': 'davy brown',
  'fig mtn davy brwn': 'davy brown',
  'davy brown': 'davy brown',
  'davy brwn': 'davy brown',
  'liquid gravity': 'liquid gravity',
  'liquid gravity ipa': 'liquid gravity',
  'cali squeze': 'cali squeeze',
  'cali squeeze': 'cali squeeze',
  'coors original': 'coors original',
  'coors og': 'coors original',
  'sierra': 'sierra nevada hazy ipa',
  'weinstephan': 'weihenstephan',
  'weihensteph': 'weihenstephan',
}))

const LIQUOR_TYPE_OVERRIDES = new Map([
  ['titos', 'VODKA'],
  ["tito's", 'VODKA'],
  ['flor de cana', 'RUM'],
  ['bombay east', 'GIN'],
  ['tangueray', 'GIN'],
])

const WELL_LIQUOR_NAMES = new Set([
  'bourbon well', 'gin well', 'rum well', 'scotch well', 'tequila well', 'vodka well',
])

export function buildToastExportFiles(items: NormalizedMenuItem[]): ToastExportFile[] {
  if (items.length > 0) saveReviewedItems(items)

  const included = items.filter((item) => item.exportIncluded && item.status !== 'ignored')
  const beerItems = included.filter((item) => item.toastCategory.toLowerCase() === 'beer')
  const liquorItems = included.filter((item) => isLiquorItem(item))
  const exportReviewRows = buildReviewRows(included)
  const auditRows = buildReviewRows(items)
  const beerRows = buildBeerExportRows(beerItems)
  const liquorRows = buildLiquorExportRows(liquorItems)

  return [
    {
      id: 'export-review',
      label: 'Export review CSV',
      filename: 'toast-export-review.csv',
      rows: [REVIEW_EXPORT_HEADERS, ...exportReviewRows],
      rowCount: exportReviewRows.length,
      note: 'Only rows currently included for Toast export. This should change immediately when you edit, include, or exclude menu items.',
    },
    {
      id: 'beer-tab',
      label: 'Beer tab CSV',
      filename: 'toast-beer-tab.csv',
      rows: [BEER_EXPORT_HEADERS, ...beerRows],
      rowCount: beerRows.length,
      note: 'Beer tab staging: 10oz custom draft size, 16oz draft, standard cans in Can, 24oz Tall cans in Bottle slot; Happy Hour is $1 off unless edited.',
    },
    {
      id: 'liquor',
      label: 'Liquor CSV',
      filename: 'toast-liquor.csv',
      rows: [LIQUOR_EXPORT_HEADERS, ...liquorRows],
      rowCount: liquorRows.length,
      note: 'Liquor staging uses the canonical Toast category for each Inventory item and only gives happy hour to well liquors by default.',
    },
    {
      id: 'audit',
      label: 'All rows audit CSV',
      filename: 'toast-all-rows-audit.csv',
      rows: [REVIEW_EXPORT_HEADERS, ...auditRows],
      rowCount: auditRows.length,
      note: 'Full audit/reconciliation file. This intentionally includes ignored and not-exporting rows so you can inspect source imports and normalization decisions.',
    },
  ]
}

export function toCsv(rows: string[][]) {
  return `${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')}\n`
}

export function downloadCsv(filename: string, rows: string[][]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function buildReviewRows(items: NormalizedMenuItem[]) {
  return [...items]
    .sort((left, right) => {
      const exportCompare = Number(right.exportIncluded) - Number(left.exportIncluded)
      if (exportCompare !== 0) return exportCompare

      const leftCategory = clean(left.toastCategory || 'Uncategorized')
      const rightCategory = clean(right.toastCategory || 'Uncategorized')
      const categoryCompare = leftCategory.localeCompare(rightCategory)
      if (categoryCompare !== 0) return categoryCompare

      return clean(left.name).localeCompare(clean(right.name))
    })
    .map((item) => [
      item.sourceKind,
      item.sourceItemNumber ?? '',
      item.name,
      item.category || 'Uncategorized',
      item.toastCategory,
      item.toastDestination,
      moneyBlank(item.basePriceCents),
      moneyBlank(item.happyHourPriceCents),
      item.happyHourWindow ?? '',
      item.status,
      item.exportIncluded ? 'yes' : 'no',
      item.effectiveTimes.join(' | '),
      String(item.sourceRowCount),
      item.notes.join(' | '),
    ])
}

function buildBeerExportRows(items: NormalizedMenuItem[]) {
  const rows = mergeBeerRows(buildBeerTabPreviewRows(items))
    .filter((row) => {
      const raw = clean(row.beerName).toLowerCase()
      const key = keyName(row.beerName)
      return !OMIT_BEERS.has(raw) && !OMIT_BEERS.has(key)
    })

  const out: string[][] = []

  rows.forEach((row) => {
    const beerName = displayBeerName(row.beerName)

    if (row.draft10ozPrice !== null || row.draft16ozPrice !== null) {
      out.push([
        beerName,
        moneyBlank(row.draft10ozPrice),
        moneyBlank(row.draft10ozHappyHour),
        moneyBlank(row.draft16ozPrice),
        moneyBlank(row.draft16ozHappyHour),
        '', '', '', '', '', '', '', '', '', '',
      ])
    }

    if (row.canPrice !== null) {
      out.push(['', '', '', '', '', '', '', '', '', beerName, moneyBlank(row.canPrice), moneyBlank(row.canHappyHour), '', '', ''])
    }

    if (row.can24ozPrice !== null) {
      out.push(['', '', '', '', '', '', '', '', '', '', '', '', beerName, moneyBlank(row.can24ozPrice), moneyBlank(row.can24ozHappyHour)])
    }

    if (row.bottlePrice !== null) {
      out.push(['', '', '', '', '', '', '', '', '', '', '', '', beerName, moneyBlank(row.bottlePrice), moneyBlank(row.bottleHappyHour)])
    }
  })

  return out
}

function mergeBeerRows(rows: BeerTabPreviewRow[]) {
  const merged = new Map<string, BeerTabPreviewRow>()

  rows.forEach((row) => {
    const key = keyName(row.beerName)
    const existing = merged.get(key)

    if (!existing) {
      merged.set(key, { ...row, beerName: displayBeerName(row.beerName), reviewNotes: [...row.reviewNotes] })
      return
    }

    copyPriceFields(existing, row)
    existing.reviewNotes.push(...row.reviewNotes)
  })

  return [...merged.values()].sort((left, right) => left.beerName.localeCompare(right.beerName))
}

function copyPriceFields(target: BeerTabPreviewRow, source: BeerTabPreviewRow) {
  if (source.draft10ozPrice !== null) target.draft10ozPrice = source.draft10ozPrice
  if (source.draft10ozHappyHour !== null) target.draft10ozHappyHour = source.draft10ozHappyHour
  if (source.draft16ozPrice !== null) target.draft16ozPrice = source.draft16ozPrice
  if (source.draft16ozHappyHour !== null) target.draft16ozHappyHour = source.draft16ozHappyHour
  if (source.canPrice !== null) target.canPrice = source.canPrice
  if (source.canHappyHour !== null) target.canHappyHour = source.canHappyHour
  if (source.can24ozPrice !== null) target.can24ozPrice = source.can24ozPrice
  if (source.can24ozHappyHour !== null) target.can24ozHappyHour = source.can24ozHappyHour
  if (source.bottlePrice !== null) target.bottlePrice = source.bottlePrice
  if (source.bottleHappyHour !== null) target.bottleHappyHour = source.bottleHappyHour
}

function buildLiquorExportRows(items: NormalizedMenuItem[]) {
  const rows = new Map<string, { itemName: string, basePrice: string, happyHourPrice: string, liquorType: string }>()

  items.forEach((item) => {
    const itemName = clean(item.name)
    if (!itemName || item.basePriceCents === null) return

    const canonicalLiquorType = normalizeLiquorCategory(item.toastCategory)
    const liquorType = LIQUOR_TYPE_OVERRIDES.get(itemName.toLowerCase()) || canonicalLiquorType
    const row = {
      itemName,
      basePrice: moneyBlank(item.basePriceCents),
      happyHourPrice: WELL_LIQUOR_NAMES.has(itemName.toLowerCase())
        ? moneyBlank(item.happyHourPriceCents ?? getOneDollarOff(item.basePriceCents))
        : '',
      liquorType,
    }
    const key = `${liquorType}\u0000${itemName.toLowerCase()}`
    const existing = rows.get(key)

    if (!existing || Number(row.basePrice) > Number(existing.basePrice)) {
      rows.set(key, row)
    }
  })

  return [...rows.values()]
    .sort((left, right) => left.liquorType.localeCompare(right.liquorType) || left.itemName.localeCompare(right.itemName))
    .map((row) => [row.itemName, row.basePrice, row.happyHourPrice, row.liquorType])
}

function isLiquorItem(item: NormalizedMenuItem) {
  return LIQUOR_CATEGORIES.has(normalizeLiquorCategory(item.toastCategory))
}

const LIQUOR_CATEGORIES = new Set([
  'BRANDY/COGNAC',
  'GIN',
  'LIQUEURS',
  'RUM',
  'SCOTCH',
  'TEQUILA',
  'VODKA',
  'WHISKEY/BOURBON',
])

function normalizeLiquorCategory(value?: string) {
  const category = clean(value).toUpperCase().replace(/&/g, '/')

  if (category.includes('WHISKEY') || category.includes('BOURBON')) return 'WHISKEY/BOURBON'
  if (category.includes('BRANDY') || category.includes('COGNAC')) return 'BRANDY/COGNAC'
  if (category.includes('LIQUEUR') || category.includes('CORDIAL')) return 'LIQUEURS'

  return category
}

function clean(value?: string) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function strippedName(value: string) {
  return clean(value)
    .replace(/\btall\b/gi, '')
    .replace(/\b10\s*oz\.?\b/gi, '')
    .replace(/\b16\s*oz\.?\b/gi, '')
    .replace(/\bregular\s+pint\b/gi, '')
    .replace(/\breg\s+pint\b/gi, '')
    .replace(/\bpintr?\s+pint\b/gi, '')
    .replace(/\bpint\b/gi, '')
    .replace(/\bimperial\b/gi, '')
    .replace(/\bimp\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function keyName(value: string) {
  const normalized = strippedName(value)
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return BEER_ALIASES.get(normalized) || normalized
}

function displayBeerName(value: string) {
  const rawKey = strippedName(value).toLowerCase().replace(/[.'’]/g, '').replace(/\s+/g, ' ').trim()
  const name = BEER_ALIASES.has(rawKey) ? keyName(value) : strippedName(value)

  return titleBeerName(name || clean(value))
}

function titleBeerName(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bIpa\b/g, 'IPA')
    .replace(/\bNa\b/g, 'NA')
}

function moneyBlank(cents: number | null) {
  return cents === null ? '' : (cents / 100).toFixed(2)
}

function getOneDollarOff(cents: number) {
  return Math.max(0, cents - 100)
}

function escapeCsvCell(value: string) {
  if (!/^[\s]|[\s]$|[",\n\r]/.test(value)) return value

  return `"${value.replace(/"/g, '""')}"`
}
