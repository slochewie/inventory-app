import type { NormalizedMenuItem } from './types'
import { getToastWorkbookCategory } from './workbook-routing'

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
  optionalBySlot: Record<string, DraftBeerPrice>
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
    .filter(
      (item) =>
        item.exportIncluded && getToastWorkbookCategory(item) === 'Beer',
    )
    .forEach((item) => {
      const beerName = getBeerName(item.name)
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
    optionalBySlot: {},
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
  const variantKind = getBeerVariantKind(item)

  if (variantKind === 'draft') {
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

  if (isOptionalBeerSlot(item.toastSlot)) {
    row.optionalBySlot[item.toastSlot] = {
      price: item.basePriceCents,
      happyHour: happyHourEnabled ? item.happyHourPriceCents : null,
    }
    return
  }

  const canSizeOz = getCanSizeOz(item)

  if (variantKind === 'can' && canSizeOz !== null && canSizeOz >= 24) {
    row.can24ozPrice = item.basePriceCents
    row.can24ozHappyHour = happyHourEnabled ? item.happyHourPriceCents : null
    return
  }

  if (variantKind === 'bottle') {
    row.bottlePrice = item.basePriceCents
    row.bottleHappyHour = happyHourEnabled ? item.happyHourPriceCents : null
    return
  }

  if (variantKind === 'can') {
    row.canPrice = item.basePriceCents
    row.canHappyHour = happyHourEnabled ? item.happyHourPriceCents : null
    return
  }

  row.reviewNotes.push(`${item.name}: beer format is unknown`)
}

export function getDraftBeerPrice(
  row: BeerTabPreviewRow,
  actualSizeOz: number,
) {
  return row.draftBySizeOz[draftSizeKey(actualSizeOz)] ?? null
}

function getCanSizeOz(item: NormalizedMenuItem) {
  if (
    typeof item.variantSizeOz === 'number' &&
    Number.isFinite(item.variantSizeOz) &&
    item.variantSizeOz > 0
  ) {
    return item.variantSizeOz
  }

  return (
    extractSizeOz(item.category ?? '') ??
    extractSizeOz(item.variantLabel ?? '') ??
    extractSizeOz(item.name)
  )
}

function getDraftSizeOz(item: NormalizedMenuItem) {
  if (
    typeof item.variantSizeOz === 'number' &&
    Number.isFinite(item.variantSizeOz) &&
    item.variantSizeOz > 0
  ) {
    return item.variantSizeOz
  }

  const category = (item.category ?? '').trim()
  if (/draft\s+reg\s+pint/i.test(category)) return 16
  if (/draft\s+imp\s+pint/i.test(category)) return 20

  return (
    extractSizeOz(category) ??
    extractSizeOz(item.variantLabel ?? '') ??
    extractSizeOz(item.name)
  )
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

function getBeerName(name: string) {
  const normalized = name
    .replace(/\b\d+(?:\.\d+)?\s*oz\b/gi, '')
    .replace(/\b(draft|pint|imperial|imp|reg|regular|can|bottle|btl|tall)\b/gi, '')
    .replace(/[\s_-]+/g, ' ')
    .trim()

  return normalized || name.trim() || 'Unknown beer'
}

function getBeerVariantKind(
  item: NormalizedMenuItem,
): 'draft' | 'can' | 'bottle' | null {
  const variantKind = item.variantKind?.trim().toLowerCase()
  if (
    variantKind === 'draft' ||
    variantKind === 'can' ||
    variantKind === 'bottle'
  ) {
    return variantKind
  }

  const category = (item.category ?? '').toLowerCase()
  const itemName = item.name.toLowerCase()

  if (category.includes('draft')) return 'draft'
  if (
    category.includes('bottle') ||
    /\b(?:bottle|btl)\b/.test(itemName)
  ) {
    return 'bottle'
  }
  if (
    category.includes('can') ||
    /\b(?:can|tall|24\s*oz|24oz)\b/.test(itemName)
  ) {
    return 'can'
  }

  return null
}


function isOptionalBeerSlot(value: string | null | undefined): value is `optional-beer-${1 | 2 | 3 | 4 | 5}` {
  return typeof value === 'string' && /^optional-beer-[1-5]$/.test(value)
}
