import { normalizeCategoryKey } from './category-rules'

export type ToastDestination = {
  label: string
  note?: string
}

const BEER_DESTINATIONS = new Map<string, ToastDestination>([
  [
    'BEER CAN',
    {
      label: 'Beer tab · Can / 24oz Can',
      note: 'Toast Beer tab: Can or 24oz Can by item size',
    },
  ],
  [
    'Beer Mods',
    {
      label: 'Beer tab · Modifiers',
      note: 'Toast Beer tab: beer modifier/review',
    },
  ],
  [
    'DRAFT 10OZ',
    {
      label: 'Beer tab · Draft Beer 10oz',
      note: 'Toast Beer tab: Draft Beer 10oz',
    },
  ],
  [
    'DRAFT REG PINT',
    {
      label: 'Beer tab · Draft Beer 16oz',
      note: 'Toast Beer tab: Draft Beer 16oz',
    },
  ],
  [
    'DRAFT IMP PINT',
    {
      label: 'Beer tab · obsolete 20oz review',
      note: 'Toast Beer tab: obsolete 20oz draft review only',
    },
  ],
])

export function getToastDestination({
  sourceCategory,
  itemName,
  toastCategory,
}: {
  sourceCategory?: string
  itemName: string
  toastCategory: string
}) {
  const sourceKey = normalizeCategoryKey(sourceCategory)
  const beerDestination = BEER_DESTINATIONS.get(sourceKey)
  if (!beerDestination) return { label: toastCategory }

  if (sourceKey === 'BEER CAN') {
    const packagedSlot = getPackagedBeerSlot(itemName)
    return {
      label: `Beer tab · ${packagedSlot}`,
      note: `Toast Beer tab: ${packagedSlot}`,
    }
  }

  return beerDestination
}

function getPackagedBeerSlot(itemName: string) {
  const normalized = itemName.toLowerCase()

  if (/\b(tall|24\s*oz|24oz)\b/.test(normalized)) return '24oz Can'
  if (/\b(bottle|btl)\b/.test(normalized)) return 'Bottle'

  return 'Can'
}
