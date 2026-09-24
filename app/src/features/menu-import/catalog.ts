import type { InventoryCatalogRow } from '#/lib/inventory-access'
import type { NormalizedMenuItem } from './types'

export function catalogRowToNormalizedItem(
  row: InventoryCatalogRow,
): NormalizedMenuItem {
  const variantLabel = [
    row.variant.kind !== 'standard' ? row.variant.kind : null,
    row.variant.sizeOz !== null ? `${row.variant.sizeOz}oz` : null,
    row.variant.packageType,
    row.variant.name,
  ]
    .filter(Boolean)
    .join(' · ')

  const categoryName = row.category?.name ?? undefined
  const toastCategory =
    row.organization.toastCategoryOverride ??
    row.category?.toastCategory ??
    categoryName ??
    'Uncategorized'

  return {
    id: row.variant.id,
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
