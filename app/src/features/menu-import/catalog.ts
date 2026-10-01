import type {
  InventoryCatalogRow,
  InventoryOrganizationCocktail,
} from '#/lib/inventory-access'
import type { NormalizedMenuItem } from './types'

export function catalogRowToNormalizedItem(
  row: InventoryCatalogRow,
): NormalizedMenuItem {
  const variantLabel = getInventoryVariantLabel(row.variant)

  const categoryName = row.category?.name ?? undefined
  const canonicalToastCategory =
    row.category?.toastCategory ??
    categoryName
  const toastCategory =
    canonicalToastCategory ??
    row.organization.toastCategoryOverride ??
    'Uncategorized'
  const toastDestination =
    canonicalToastCategory && isCanonicalLiquorCategory(canonicalToastCategory)
      ? canonicalToastCategory
      : row.organization.toastDestinationOverride ?? ''

  return {
    id: row.variant.id,
    masterItemId: row.id,
    masterName: row.name,
    masterCategoryId: row.category?.id,
    variantLabel: variantLabel || 'Standard',
    variantKind: row.variant.kind,
    variantSizeOz: row.variant.sizeOz,
    variantPackageType: row.variant.packageType,
    sourceKind: 'toast-template-sheet',
    name: row.organization.toastNameOverride ?? row.name,
    category: categoryName,
    toastCategory,
    toastDestination,
    toastSlot: row.organization.toastSlot,
    basePriceCents: row.effectivePriceCents,
    happyHourPriceCents: row.organization.happyHourPriceCents,
    doublePriceCents: row.organization.doublePriceCents,
    effectiveTimes: [],
    sourceRowCount: 0,
    status: row.active && row.variant.active ? 'ready' : 'ignored',
    organizationEnabled: row.organization.enabled,
    exportToToast: row.organization.exportToToast,
    exportIncluded:
      row.organization.enabled && row.organization.exportToToast,
    notes: variantLabel ? [variantLabel] : [],
    rawRows: [],
  }
}


export function organizationCocktailToNormalizedItem(
  cocktail: InventoryOrganizationCocktail,
): NormalizedMenuItem {
  const sectionLabel = getCocktailSectionLabel(cocktail.section)

  return {
    id: cocktail.id,
    masterItemId: cocktail.inventoryCocktailId,
    masterName: cocktail.masterName,
    variantLabel: sectionLabel,
    variantKind: 'cocktail',
    variantSizeOz: null,
    variantPackageType: null,
    sourceKind: 'toast-template-sheet',
    name: cocktail.toastNameOverride?.trim() || cocktail.masterName,
    category: 'Cocktails',
    toastCategory: sectionLabel,
    toastDestination: 'Cocktails',
    basePriceCents: cocktail.priceCents,
    happyHourPriceCents:
      cocktail.section === 'house' ? cocktail.happyHourPriceCents : null,
    effectiveTimes: [],
    sourceRowCount: 0,
    status: cocktail.enabled ? 'ready' : 'ignored',
    organizationEnabled: cocktail.enabled,
    exportToToast: cocktail.exportToToast,
    exportIncluded: cocktail.enabled && cocktail.exportToToast,
    notes: [],
    rawRows: cocktail.description
      ? [{ description: cocktail.description }]
      : [],
  }
}

export function getCocktailSectionLabel(
  section: InventoryOrganizationCocktail['section'],
) {
  switch (section) {
    case 'house':
      return 'House Cocktails'
    case 'vodka':
      return 'Vodka Cocktails'
    case 'gin':
      return 'Gin Cocktails'
    case 'rum':
      return 'Rum Cocktails'
    case 'tequila':
      return 'Tequila Cocktails'
    case 'whiskey-bourbon':
      return 'Whiskey/Bourbon Cocktails'
  }
}

export function getInventoryVariantLabel(variant: {
  kind: string
  sizeOz: number | null
  packageType: string | null
  name: string | null
}) {
  if (variant.kind === 'draft') {
    if (variant.sizeOz !== null) {
      return `${variant.sizeOz}oz Draft`
    }

    const draftName = variant.name?.trim()
    if (/^pitcher$/i.test(draftName ?? '')) return 'Pitcher'
    return draftName || 'Draft'
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


function isCanonicalLiquorCategory(value: string) {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/&/g, '/')
    .replace(/\s+/g, ' ')

  return (
    normalized.includes('VODKA') ||
    normalized.includes('GIN') ||
    normalized.includes('RUM') ||
    normalized.includes('TEQUILA') ||
    normalized.includes('SCOTCH') ||
    normalized.includes('WHISKEY') ||
    normalized.includes('BOURBON') ||
    normalized.includes('LIQUEUR') ||
    normalized.includes('CORDIAL') ||
    normalized.includes('BRANDY') ||
    normalized.includes('COGNAC')
  )
}