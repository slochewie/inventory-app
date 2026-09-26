import type { NormalizedMenuItem } from './types'

export type BeerTabPreviewRow = {
  beerName: string
  draft10ozPrice: number | null
  draft10ozHappyHour: number | null
  draft16ozPrice: number | null
  draft16ozHappyHour: number | null
  canPrice: number | null
  canHappyHour: number | null
  can24ozPrice: number | null
  can24ozHappyHour: number | null
  bottlePrice: number | null
  bottleHappyHour: number | null
  reviewNotes: string[]
}

export function buildBeerTabPreviewRows(
  items: NormalizedMenuItem[],
  happyHourEnabled = true,
): BeerTabPreviewRow[] {
  const rows = new Map<string, BeerTabPreviewRow>()

  items
    .filter((item) => item.exportIncluded && item.toastCategory === 'Beer')
    .forEach((item) => {
      const beerName = getBeerName(item.name, item.toastDestination)
      const row = rows.get(beerName) ?? createBeerTabPreviewRow(beerName)

      applyBeerSlot(row, item, happyHourEnabled)
      rows.set(beerName, row)
    })

  return [...rows.values()].sort((left, right) => left.beerName.localeCompare(right.beerName))
}

function createBeerTabPreviewRow(beerName: string): BeerTabPreviewRow {
  return {
    beerName,
    draft10ozPrice: null,
    draft10ozHappyHour: null,
    draft16ozPrice: null,
    draft16ozHappyHour: null,
    canPrice: null,
    canHappyHour: null,
    can24ozPrice: null,
    can24ozHappyHour: null,
    bottlePrice: null,
    bottleHappyHour: null,
    reviewNotes: [],
  }
}

function applyBeerSlot(
  row: BeerTabPreviewRow,
  item: NormalizedMenuItem,
  happyHourEnabled: boolean,
) {
  const destination = item.toastDestination.toLowerCase()

  if (destination.includes('draft beer 10oz')) {
    row.draft10ozPrice = item.basePriceCents
    row.draft10ozHappyHour = happyHourEnabled ? item.happyHourPriceCents : null
    return
  }

  if (destination.includes('draft beer 16oz')) {
    row.draft16ozPrice = item.basePriceCents
    row.draft16ozHappyHour = happyHourEnabled ? item.happyHourPriceCents : null
    return
  }

  if (destination.includes('24oz can')) {
    row.can24ozPrice = item.basePriceCents
    row.can24ozHappyHour = happyHourEnabled ? item.happyHourPriceCents : null
    return
  }

  if (destination.includes('bottle')) {
    row.bottlePrice = item.basePriceCents
    row.bottleHappyHour = happyHourEnabled ? item.happyHourPriceCents : null
    return
  }

  if (destination.includes('can')) {
    row.canPrice = item.basePriceCents
    row.canHappyHour = happyHourEnabled ? item.happyHourPriceCents : null
    return
  }

  row.reviewNotes.push(`${item.name}: ${item.toastDestination}`)
}

function getBeerName(name: string, toastDestination: string) {
  const destination = toastDestination.toLowerCase()
  let normalized = name
    .replace(/\b(10\s*oz|10oz|16\s*oz|16oz|20\s*oz|20oz|24\s*oz|24oz)\b/gi, '')
    .replace(/\b(draft|pint|imperial|imp|reg|regular|can|bottle|btl|tall)\b/gi, '')
    .replace(/[\s_-]+/g, ' ')
    .trim()

  if (!normalized && destination.includes('draft beer 10oz')) normalized = name.replace(/10\s*oz/gi, '').trim()
  if (!normalized) normalized = name.trim()

  return normalized || 'Unknown beer'
}
