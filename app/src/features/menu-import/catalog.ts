import type { InventoryCatalogRow } from '#/lib/inventory-access'
import type { NormalizedMenuItem } from './types'

export function catalogRowToNormalizedItem(
  row: InventoryCatalogRow,
): NormalizedMenuItem {
  const variantLabel = getInventoryVariantLabel(row.variant)

  const categoryName = row.category?.name ?? undefined
  const toastCategory =
    row.organization.toastCategoryOverride ??
    row.category?.toastCategory ??
    categoryName ??
    'Uncategorized'

  return {
    id: row.variant.id,
    masterItemId: row.id,
    variantLabel: variantLabel || 'Standard',
    variantKind: row.variant.kind,
    variantSizeOz: row.variant.sizeOz,
    variantPackageType: row.variant.packageType,
    sourceKind: 'toast-template-sheet',
    name: row.organization.toastNameOverride ?? row.name,
    category: categoryName,
    toastCategory,
    toastDestination: row.organization.toastDestinationOverride ?? '',
    basePriceCents: row.effectivePriceCents,
    happyHourPriceCents: row.organization.happyHourPriceCents,
    effectiveTimes: [],
    sourceRowCount: 0,
    status: row.active && row.variant.active ? 'ready' : 'ignored',
    exportIncluded:
      row.organization.enabled && row.organization.exportToToast,
    notes: variantLabel ? [variantLabel] : [],
    rawRows: [],
  }
}


export function getInventoryVariantLabel(variant: {
  kind: string
  sizeOz: number | null
  packageType: string | null
  name: string | null
}) {
  if (variant.kind === 'draft') {
    return variant.sizeOz !== null
      ? `${variant.sizeOz}oz Draft`
      : 'Draft'
  }

  if (variant.kind === 'can') {
    return variant.sizeOz !== null
      ? `${variant.sizeOz}oz Can`
      : 'Can'
  }

  if (variant.kind === 'bottle') {
    return variant.sizeOz !== null
      ? `${variant.sizeOz}oz Bottle`
      : 'Bottle'
  }

  if (variant.kind === 'standard') {
    return variant.name?.trim() || 'Standard'
  }

  return variant.name?.trim() || [
    variant.sizeOz !== null ? `${variant.sizeOz}oz` : null,
    variant.packageType,
    variant.kind,
  ]
    .filter(Boolean)
    .join(' ') || 'Standard'
}
