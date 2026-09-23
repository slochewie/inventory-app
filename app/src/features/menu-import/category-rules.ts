import { normalizeHeader } from './csv'

const INCLUDED_SOURCE_CATEGORIES = new Set([
  'BOURB WHISK',
  'BEER CAN',
  'DRAFT REG PINT',
  'DRAFT 10OZ',
  'DRAFT IMP PINT',
  'LIQUEURS',
  'TEQUILA',
  'SCOTCH',
  'VODKA',
  'RUM',
  'GIN',
  'WINE GLASS',
])

const DEFAULT_TOAST_CATEGORY_BY_SOURCE = new Map<string, string>([
  ['BAR MODS', 'Modifiers'],
  ['BEER CAN', 'Beer'],
  ['Beer Mods', 'Beer'],
  ['DRAFT 10OZ', 'Beer'],
  ['DRAFT IMP PINT', 'Beer'],
  ['DRAFT REG PINT', 'Beer'],
  ['BOURB WHISK', 'Whiskey/Bourbon'],
  ['BRANDY/COGNAC', 'Brandy/Cognac'],
  ['COCKTAILS', 'Cocktails'],
  ['GIN', 'Gin'],
  ['LIQUEURS', 'Liqueurs'],
  ['RUM', 'Rum'],
  ['SCOTCH', 'Scotch'],
  ['TEQUILA', 'Tequila'],
  ['VODKA', 'Vodka'],
  ['WINE GLASS', 'Wine'],
])

const DEFAULT_EXCLUDED_SOURCE_CATEGORIES = new Set([
  'BAR MODS',
  'DEPOSITS/ATO',
  'DRAFT IMP PINT',
  'GIFT CARDS',
  'OPEN ITEMS',
  'RETAIL',
])

const EXCLUDED_NAME_PATTERNS = [
  /gift\s*card/i,
  /gift\s*certificate/i,
  /refund\s+gift\s+card/i,
  /^open\s+/i,
  /sales\s*tax/i,
  /deposit/i,
  /unavailable/i,
]

export function normalizeCategoryKey(category?: string) {
  return category?.trim() || 'Uncategorized'
}

export function getDefaultToastCategory(sourceCategory?: string) {
  const category = normalizeCategoryKey(sourceCategory)
  return DEFAULT_TOAST_CATEGORY_BY_SOURCE.get(category) ?? toTitleCase(category)
}

export function shouldExportByDefault({
  sourceCategory,
  itemName,
  status,
}: {
  sourceCategory?: string
  itemName: string
  status: 'ready' | 'review' | 'ignored'
}) {
  if (status === 'ignored') return false

  const category = normalizeCategoryKey(sourceCategory)
  const normalizedCategory = normalizeHeader(category).toUpperCase()

  if (DEFAULT_EXCLUDED_SOURCE_CATEGORIES.has(category)) return false
  if (!INCLUDED_SOURCE_CATEGORIES.has(category) && normalizedCategory !== 'UNCATEGORIZED') return false
  if (EXCLUDED_NAME_PATTERNS.some((pattern) => pattern.test(itemName))) return false

  return true
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(/([\s/-]+)/)
    .map((part) => (/^[a-z]/.test(part) ? part[0].toUpperCase() + part.slice(1) : part))
    .join('')
}
