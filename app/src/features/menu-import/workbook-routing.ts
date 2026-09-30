import type { NormalizedMenuItem } from './types'

export type ToastWorkbookCategory =
  | 'Beer'
  | 'Wine'
  | 'Cocktails'
  | 'NA Bev'
  | 'Retail'
  | 'Open Items'

export function getToastWorkbookCategory(
  item: Pick<NormalizedMenuItem, 'category' | 'toastCategory'>,
): ToastWorkbookCategory | null {
  return (
    normalizeToastWorkbookCategory(item.category) ??
    normalizeToastWorkbookCategory(item.toastCategory)
  )
}

export function normalizeToastWorkbookCategory(
  value?: string | null,
): ToastWorkbookCategory | null {
  const key = (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

  if (!key) return null
  if (key === 'beer') return 'Beer'
  if (
    key === 'wine' ||
    key.startsWith('wine /') ||
    key.startsWith('wine:')
  ) {
    return 'Wine'
  }
  if (key === 'cocktail' || key === 'cocktails') return 'Cocktails'
  if (
    key === 'na bev' ||
    key === 'na beverage' ||
    key === 'na beverages' ||
    key === 'non-alcoholic' ||
    key === 'non alcoholic'
  ) {
    return 'NA Bev'
  }
  if (key === 'retail') return 'Retail'
  if (key === 'open items' || key === 'open item') return 'Open Items'

  return null
}
