import { normalizeCategoryKey } from './category-rules'

export type ToastDestination = {
  label: string
  note?: string
}

const BEER_DESTINATIONS = new Map<string, ToastDestination>([
  [
    'BEER CAN',
    {
      label: '',
      note: 'Toast Beer tab: Can or 24oz Can by item size',
    },
  ],
  [
    'Beer Mods',
    {
      label: '',
      note: 'Toast Beer tab: beer modifier/review',
    },
  ],
  [
    'DRAFT 10OZ',
    {
      label: '',
      note: 'Toast Beer tab: Draft Beer 10oz',
    },
  ],
  [
    'DRAFT REG PINT',
    {
      label: '',
      note: 'Toast Beer tab: Draft Beer 16oz',
    },
  ],
  [
    'DRAFT IMP PINT',
    {
      label: '',
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
  if (!beerDestination) return { label: '' }

  if (sourceKey === 'BEER CAN') {
    const packagedSlot = getPackagedBeerSlot(itemName)
    return {
      label: '',
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
