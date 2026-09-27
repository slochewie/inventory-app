export type InventoryMenuCategory = {
  id: string
  name: string
  toastCategory: string
  toastDestination: string
  createdAt: string
  updatedAt: string
}

export const MENU_CATEGORIES_CHANGED_EVENT = 'inventory-menu-categories-changed'

const STORAGE_PREFIX = 'inventory-menu-categories'
const STORAGE_VERSION = 1

const MENU_CATEGORY_SUGGESTIONS = ['NA Bev', 'Retail', 'Cocktails']

type StoredMenuCategories = {
  version?: number
  categories?: Partial<InventoryMenuCategory>[]
}

export function getMenuCategorySuggestions() {
  return [...MENU_CATEGORY_SUGGESTIONS]
}

export function normalizeMenuCategoryName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function normalizeMenuCategoryKey(value: string) {
  return normalizeMenuCategoryName(value).toLowerCase()
}

export function listSavedMenuCategories(organizationId: string) {
  if (!canUseStorage() || !organizationId) return []

  const stored = window.localStorage.getItem(getStorageKey(organizationId))
  if (!stored) return []

  try {
    const parsed = JSON.parse(stored) as StoredMenuCategories
    if (!Array.isArray(parsed.categories)) return []

    return parsed.categories
      .map(normalizeStoredCategory)
      .filter((category): category is InventoryMenuCategory => category !== null)
      .sort((left, right) => left.name.localeCompare(right.name))
  } catch (error) {
    return []
  }
}

export function saveMenuCategory(
  organizationId: string,
  input: {
    id?: string | null
    name: string
    toastCategory?: string | null
    toastDestination?: string | null
  },
) {
  if (!canUseStorage() || !organizationId) {
    throw new Error('Menu categories can only be saved in the browser.')
  }

  const name = normalizeMenuCategoryName(input.name)
  if (!name) {
    throw new Error('Set a menu category name before saving.')
  }

  const toastCategory = normalizeMenuCategoryName(input.toastCategory ?? '') || name
  const toastDestination = normalizeMenuCategoryName(input.toastDestination ?? '')
  const now = new Date().toISOString()
  const categories = listSavedMenuCategories(organizationId)
  const matchKey = normalizeMenuCategoryKey(name)
  const existingIndex = categories.findIndex((category) =>
    category.id === input.id || normalizeMenuCategoryKey(category.name) === matchKey,
  )

  const nextCategory: InventoryMenuCategory = {
    id:
      existingIndex >= 0
        ? categories[existingIndex].id
        : `menu-category-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    toastCategory,
    toastDestination,
    createdAt: existingIndex >= 0 ? categories[existingIndex].createdAt : now,
    updatedAt: now,
  }

  const nextCategories = [...categories]
  if (existingIndex >= 0) {
    nextCategories[existingIndex] = nextCategory
  } else {
    nextCategories.push(nextCategory)
  }

  writeMenuCategories(organizationId, nextCategories)
  notifyMenuCategoriesChanged(organizationId)

  return nextCategory
}

export function deleteMenuCategory(organizationId: string, categoryId: string) {
  if (!canUseStorage() || !organizationId) return false

  const categories = listSavedMenuCategories(organizationId)
  const nextCategories = categories.filter((category) => category.id !== categoryId)

  if (nextCategories.length === categories.length) return false

  writeMenuCategories(organizationId, nextCategories)
  notifyMenuCategoriesChanged(organizationId)

  return true
}

export function findSavedMenuCategory(
  categories: InventoryMenuCategory[],
  value: string,
) {
  const valueKey = normalizeMenuCategoryKey(value)
  if (!valueKey) return null

  return (
    categories.find((category) =>
      normalizeMenuCategoryKey(category.name) === valueKey ||
      normalizeMenuCategoryKey(category.toastCategory) === valueKey,
    ) ?? null
  )
}

export function mergeCategoryOptions(
  left: string[],
  right: string[],
) {
  const optionsByKey = new Map<string, string>()

  for (const option of [...left, ...right]) {
    const normalized = normalizeMenuCategoryName(option)
    if (!normalized) continue

    const key = normalizeMenuCategoryKey(normalized)
    if (!optionsByKey.has(key)) optionsByKey.set(key, normalized)
  }

  return [...optionsByKey.values()].sort((a, b) => a.localeCompare(b))
}

function writeMenuCategories(
  organizationId: string,
  categories: InventoryMenuCategory[],
) {
  window.localStorage.setItem(
    getStorageKey(organizationId),
    JSON.stringify({
      version: STORAGE_VERSION,
      categories: categories.sort((left, right) => left.name.localeCompare(right.name)),
    }),
  )
}

function normalizeStoredCategory(
  category: Partial<InventoryMenuCategory>,
): InventoryMenuCategory | null {
  const name = normalizeMenuCategoryName(category.name ?? '')
  if (!name) return null

  const createdAt =
    typeof category.createdAt === 'string' && category.createdAt
      ? category.createdAt
      : new Date().toISOString()

  return {
    id:
      typeof category.id === 'string' && category.id
        ? category.id
        : `menu-category-${normalizeMenuCategoryKey(name).replace(/[^a-z0-9]+/g, '-')}`,
    name,
    toastCategory: normalizeMenuCategoryName(category.toastCategory ?? '') || name,
    toastDestination: normalizeMenuCategoryName(category.toastDestination ?? ''),
    createdAt,
    updatedAt:
      typeof category.updatedAt === 'string' && category.updatedAt
        ? category.updatedAt
        : createdAt,
  }
}

function notifyMenuCategoriesChanged(organizationId: string) {
  window.dispatchEvent(
    new CustomEvent(MENU_CATEGORIES_CHANGED_EVENT, {
      detail: { organizationId },
    }),
  )
}

function getStorageKey(organizationId: string) {
  return `${STORAGE_PREFIX}:v${STORAGE_VERSION}:${organizationId}`
}

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}
