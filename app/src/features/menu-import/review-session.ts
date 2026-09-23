import type { NormalizedMenuItem, ParsedMenuImport } from './types'

const STORAGE_KEY = 'niteowl.inventory.review-session.v1'
const STORAGE_VERSION = 1

export type SavedReviewSession = {
  version: number
  savedAt: string
  importFile: ParsedMenuImport | null
  items: NormalizedMenuItem[]
}

export function saveReviewSession(importFile: ParsedMenuImport | null, items: NormalizedMenuItem[]) {
  saveReviewedItems(items, importFile)
}

export function saveReviewedItems(items: NormalizedMenuItem[], importFile: ParsedMenuImport | null = null) {
  if (typeof window === 'undefined') return

  if (items.length === 0) {
    window.localStorage.removeItem(STORAGE_KEY)
    return
  }

  const existing = loadReviewSession()
  const payload: SavedReviewSession = {
    version: STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    importFile: importFile ?? existing?.importFile ?? null,
    items,
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export function loadReviewSession(): SavedReviewSession | null {
  if (typeof window === 'undefined') return null

  const raw = window.localStorage.getItem(STORAGE_KEY)
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

export function clearReviewSession() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}
