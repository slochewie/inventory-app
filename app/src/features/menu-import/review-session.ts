import type { NormalizedMenuItem, ParsedMenuImport } from './types'

const STORAGE_KEY = 'niteowl.inventory.review-session.v1'
const STORAGE_VERSION = 1

function getStorageKey(organizationId?: string | null) {
  const normalizedOrganizationId = organizationId?.trim()
  return normalizedOrganizationId
    ? `${STORAGE_KEY}.organization.${encodeURIComponent(normalizedOrganizationId)}`
    : STORAGE_KEY
}

export type SavedReviewSession = {
  version: number
  savedAt: string
  importFile: ParsedMenuImport | null
  items: NormalizedMenuItem[]
}

export function saveReviewSession(
  importFile: ParsedMenuImport | null,
  items: NormalizedMenuItem[],
  organizationId?: string | null,
) {
  saveReviewedItems(items, importFile, organizationId)
}

export function saveReviewedItems(
  items: NormalizedMenuItem[],
  importFile: ParsedMenuImport | null = null,
  organizationId?: string | null,
) {
  if (typeof window === 'undefined') return

  const storageKey = getStorageKey(organizationId)

  if (items.length === 0) {
    window.localStorage.removeItem(storageKey)
    return
  }

  const existing = loadReviewSession(organizationId)
  const payload: SavedReviewSession = {
    version: STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    importFile: importFile ?? existing?.importFile ?? null,
    items,
  }

  window.localStorage.setItem(storageKey, JSON.stringify(payload))
}

export function loadReviewSession(
  organizationId?: string | null,
): SavedReviewSession | null {
  if (typeof window === 'undefined') return null

  const raw = window.localStorage.getItem(getStorageKey(organizationId))
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<SavedReviewSession>

    if (parsed.version !== STORAGE_VERSION) return null
    if (!Array.isArray(parsed.items)) return null

    return {
      version: STORAGE_VERSION,
      savedAt: parsed.savedAt ?? new Date().toISOString(),
      importFile: parsed.importFile ?? null,
      items: parsed.items,
    }
  } catch {
    return null
  }
}

export function clearReviewSession(organizationId?: string | null) {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(getStorageKey(organizationId))
}
