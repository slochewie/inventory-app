export type ToastDestination = {
  label: string
  note?: string
}

export function getToastDestination(_input?: {
  sourceCategory?: string
  itemName: string
}): ToastDestination {
  return { label: '' }
}
