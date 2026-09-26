import type { NormalizedMenuItem } from './types'

export type DraftBeerPrice = {
  price: number | null
  happyHour: number | null
}

export type BeerTabPreviewRow = {
  beerName: string
  draftBySizeOz: Record<string, DraftBeerPrice>
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
    draftBySizeOz: {},
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
  const variantKind = item.variantKind?.toLowerCase()

  if (variantKind === 'draft' || destination.includes('draft')) {
    const sizeOz = getDraftSizeOz(item)

    if (sizeOz !== null) {
      row.draftBySizeOz[draftSizeKey(sizeOz)] = {
        price: item.basePriceCents,
        happyHour: happyHourEnabled ? item.happyHourPriceCents : null,
      }
    } else {
      row.reviewNotes.push(`${item.name}: draft size is unknown`)
    }

    return
  }

  if (
    (variantKind === 'can' && item.variantSizeOz === 24) ||
    destination.includes('24oz can')
  ) {
    row.can24ozPrice = item.basePriceCents
    row.can24ozHappyHour = happyHourEnabled ? item.happyHourPriceCents : null
    return
  }

  if (variantKind === 'bottle' || destination.includes('bottle')) {
    row.bottlePrice = item.basePriceCents
    row.bottleHappyHour = happyHourEnabled ? item.happyHourPriceCents : null
    return
  }

  if (variantKind === 'can' || destination.includes('can')) {
    row.canPrice = item.basePriceCents
    row.canHappyHour = happyHourEnabled ? item.happyHourPriceCents : null
    return
  }

  row.reviewNotes.push(`${item.name}: ${item.toastDestination}`)
}

export function getDraftBeerPrice(
  row: BeerTabPreviewRow,
  actualSizeOz: number,
) {
  return row.draftBySizeOz[draftSizeKey(actualSizeOz)] ?? null
}

function getDraftSizeOz(item: NormalizedMenuItem) {
  if (
    typeof item.variantSizeOz === 'number' &&
    Number.isFinite(item.variantSizeOz) &&
    item.variantSizeOz > 0
  ) {
    return item.variantSizeOz
  }

  const destinationSize = extractSizeOz(item.toastDestination)
  if (destinationSize !== null) return destinationSize

  return extractSizeOz(item.name)
}

function extractSizeOz(value: string) {
  const match = value.match(/\b(\d+(?:\.\d+)?)\s*oz\b/i)
  if (!match) return null

  const parsed = Number(match[1])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function draftSizeKey(sizeOz: number) {
  return String(Number(sizeOz))
}

function getBeerName(name: string, toastDestination: string) {
  const destination = toastDestination.toLowerCase()
  let normalized = name
    .replace(/\b\d+(?:\.\d+)?\s*oz\b/gi, '')
    .replace(/\b(draft|pint|imperial|imp|reg|regular|can|bottle|btl|tall)\b/gi, '')
    .replace(/[\s_-]+/g, ' ')
    .trim()

  if (!normalized && destination.includes('draft')) {
    normalized = name.replace(/\b\d+(?:\.\d+)?\s*oz\b/gi, '').trim()
  }
  if (!normalized) normalized = name.trim()

  return normalized || 'Unknown beer'
}
