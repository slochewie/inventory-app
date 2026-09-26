import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AuthenticatedInventoryShell,
  useInventoryAccessRole,
} from '#/components/authenticated-inventory-shell'
import { catalogRowToNormalizedItem } from '#/features/menu-import/catalog'
import { formatCurrency, type NormalizedMenuItem } from '#/features/menu-import/types'
import { authClient } from '#/lib/auth-client'
import {
  ALL_HAPPY_HOUR_DAYS,
  getInventoryOrganizationConfig,
  listInventoryCatalog,
  mergeInventoryItems,
  updateInventoryItemCategory,
  updateInventoryOrganizationConfig,
  updateInventoryOrganizationVariant,
  type HappyHourDay,
} from '#/lib/inventory-access'

export const Route = createFileRoute('/')({ component: CatalogPage })

type AvailabilityFilter = 'carried' | 'not-carried' | 'all'

type DraftSlotState = {
  enabled: boolean
  actualSizeOz: string
}

const PAGE_SIZE = 50

const HAPPY_HOUR_DAY_OPTIONS: Array<{
  value: HappyHourDay
  label: string
}> = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
]


type CatalogGroup = {
  id: string
  name: string
  category: string
  categoryId?: string
  items: NormalizedMenuItem[]
}

type CatalogCategoryOption = {
  id: string
  name: string
}

function CatalogPage() {
  const { canEdit, canImportExport, canManageAssignments } = useInventoryAccessRole()
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [items, setItems] = useState<NormalizedMenuItem[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [availability, setAvailability] = useState<AvailabilityFilter>('carried')
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingVariantId, setSavingVariantId] = useState<string | null>(null)
  const [mergingItemId, setMergingItemId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [happyHourEnabled, setHappyHourEnabled] = useState(false)
  const [happyHourStart, setHappyHourStart] = useState('')
  const [happyHourEnd, setHappyHourEnd] = useState('')
  const [happyHourDays, setHappyHourDays] = useState<HappyHourDay[]>([
    ...ALL_HAPPY_HOUR_DAYS,
  ])
  const [happyHourDraftEnabled, setHappyHourDraftEnabled] = useState(false)
  const [happyHourDraftStart, setHappyHourDraftStart] = useState('')
  const [happyHourDraftEnd, setHappyHourDraftEnd] = useState('')
  const [happyHourDraftDays, setHappyHourDraftDays] = useState<HappyHourDay[]>([
    ...ALL_HAPPY_HOUR_DAYS,
  ])
  const [happyHourRange2Enabled, setHappyHourRange2Enabled] = useState(false)
  const [happyHourRange2Start, setHappyHourRange2Start] = useState('')
  const [happyHourRange2End, setHappyHourRange2End] = useState('')
  const [happyHourRange2Days, setHappyHourRange2Days] = useState<HappyHourDay[]>([
    ...ALL_HAPPY_HOUR_DAYS,
  ])
  const [happyHourRange2DraftEnabled, setHappyHourRange2DraftEnabled] = useState(false)
  const [happyHourRange2DraftStart, setHappyHourRange2DraftStart] = useState('')
  const [happyHourRange2DraftEnd, setHappyHourRange2DraftEnd] = useState('')
  const [happyHourRange2DraftDays, setHappyHourRange2DraftDays] = useState<HappyHourDay[]>([
    ...ALL_HAPPY_HOUR_DAYS,
  ])
  const [savingHappyHour, setSavingHappyHour] = useState(false)
  const [draft8, setDraft8] = useState<DraftSlotState>({ enabled: false, actualSizeOz: '' })
  const [draft16, setDraft16] = useState<DraftSlotState>({ enabled: false, actualSizeOz: '' })
  const [draft24, setDraft24] = useState<DraftSlotState>({ enabled: false, actualSizeOz: '' })
  const [pitcher, setPitcher] = useState<DraftSlotState>({ enabled: false, actualSizeOz: '' })
  const [draft8Edit, setDraft8Edit] = useState<DraftSlotState>({ enabled: false, actualSizeOz: '' })
  const [draft16Edit, setDraft16Edit] = useState<DraftSlotState>({ enabled: false, actualSizeOz: '' })
  const [draft24Edit, setDraft24Edit] = useState<DraftSlotState>({ enabled: false, actualSizeOz: '' })
  const [pitcherEdit, setPitcherEdit] = useState<DraftSlotState>({ enabled: false, actualSizeOz: '' })
  const [savingDraftSlots, setSavingDraftSlots] = useState(false)
  const [optionalBeerCategory1Enabled, setOptionalBeerCategory1Enabled] = useState(false)
  const [optionalBeerCategory1Label, setOptionalBeerCategory1Label] = useState('Optional Beer Category 1')
  const [optionalBeerCategory1EditEnabled, setOptionalBeerCategory1EditEnabled] = useState(false)
  const [optionalBeerCategory1EditLabel, setOptionalBeerCategory1EditLabel] = useState('Optional Beer Category 1')
  const [savingOptionalBeerCategory1, setSavingOptionalBeerCategory1] = useState(false)

  useEffect(() => {
    if (!activeOrganization?.id) {
      setItems([])
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    void Promise.all([
      listInventoryCatalog(activeOrganization.id, controller.signal),
      getInventoryOrganizationConfig(activeOrganization.id, controller.signal),
    ])
      .then(([catalog, organizationConfig]) => {
        setItems(catalog.items.map(catalogRowToNormalizedItem))
        setSelectedGroupId(null)
        setPage(1)

        const start = organizationConfig.happyHourStart ?? ''
        const end = organizationConfig.happyHourEnd ?? ''
        setHappyHourEnabled(organizationConfig.happyHourEnabled)
        setHappyHourStart(start)
        const days =
          organizationConfig.happyHourDays?.length > 0
            ? organizationConfig.happyHourDays
            : [...ALL_HAPPY_HOUR_DAYS]

        setHappyHourEnd(end)
        setHappyHourDays(days)
        setHappyHourDraftEnabled(organizationConfig.happyHourEnabled)
        setHappyHourDraftStart(start)
        setHappyHourDraftEnd(end)
        setHappyHourDraftDays(days)

        const range2Start = organizationConfig.happyHourRange2Start ?? ''
        const range2End = organizationConfig.happyHourRange2End ?? ''
        const range2Days =
          organizationConfig.happyHourRange2Days?.length > 0
            ? organizationConfig.happyHourRange2Days
            : [...ALL_HAPPY_HOUR_DAYS]

        setHappyHourRange2Enabled(organizationConfig.happyHourRange2Enabled === true)
        setHappyHourRange2Start(range2Start)
        setHappyHourRange2End(range2End)
        setHappyHourRange2Days(range2Days)
        setHappyHourRange2DraftEnabled(organizationConfig.happyHourRange2Enabled === true)
        setHappyHourRange2DraftStart(range2Start)
        setHappyHourRange2DraftEnd(range2End)
        setHappyHourRange2DraftDays(range2Days)

        const nextDraft8 = {
          enabled: organizationConfig.draft8Enabled === true,
          actualSizeOz: organizationConfig.draft8ActualSizeOz?.toString() ?? '',
        }
        const nextDraft16 = {
          enabled: organizationConfig.draft16Enabled === true,
          actualSizeOz: organizationConfig.draft16ActualSizeOz?.toString() ?? '',
        }
        const nextDraft24 = {
          enabled: organizationConfig.draft24Enabled === true,
          actualSizeOz: organizationConfig.draft24ActualSizeOz?.toString() ?? '',
        }
        const nextPitcher = {
          enabled: organizationConfig.pitcherEnabled === true,
          actualSizeOz: organizationConfig.pitcherActualSizeOz?.toString() ?? '',
        }

        setDraft8(nextDraft8)
        setDraft16(nextDraft16)
        setDraft24(nextDraft24)
        setPitcher(nextPitcher)
        setDraft8Edit(nextDraft8)
        setDraft16Edit(nextDraft16)
        setDraft24Edit(nextDraft24)
        setPitcherEdit(nextPitcher)

        const nextOptionalBeerCategory1Enabled = organizationConfig.optionalBeerCategory1Enabled === true
        const nextOptionalBeerCategory1Label =
          organizationConfig.optionalBeerCategory1Label?.trim() || 'Optional Beer Category 1'
        setOptionalBeerCategory1Enabled(nextOptionalBeerCategory1Enabled)
        setOptionalBeerCategory1Label(nextOptionalBeerCategory1Label)
        setOptionalBeerCategory1EditEnabled(nextOptionalBeerCategory1Enabled)
        setOptionalBeerCategory1EditLabel(nextOptionalBeerCategory1Label)
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setError(
          caught instanceof Error
            ? caught.message
            : 'Unable to load the Inventory catalog.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [activeOrganization?.id])

  const groups = useMemo(() => groupCatalogItems(items), [items])

  const categories = useMemo(
    () => [...new Set(groups.map((group) => group.category))].sort((a, b) => a.localeCompare(b)),
    [groups],
  )

  const categoryOptions = useMemo(() => {
    const byId = new Map<string, string>()

    groups.forEach((group) => {
      if (group.categoryId) byId.set(group.categoryId, group.category)
    })

    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [groups])

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return groups.filter((group) => {
      if (category !== 'all' && group.category !== category) return false

      const carried = group.items.some((item) => item.organizationEnabled === true)
      if (availability === 'carried' && !carried) return false
      if (availability === 'not-carried' && carried) return false

      if (!normalizedQuery) return true

      return [
        group.name,
        group.category,
        ...group.items.flatMap((item) => [
          item.variantLabel,
          item.toastDestination,
        ]),
      ].some((value) => value?.toLowerCase().includes(normalizedQuery))
    })
  }, [availability, category, groups, query])

  const pageCount = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount)
  const pageStart = (clampedPage - 1) * PAGE_SIZE
  const pageGroups = filteredGroups.slice(pageStart, pageStart + PAGE_SIZE)
  const pageEnd = pageStart + pageGroups.length

  useEffect(() => {
    setPage(1)
  }, [availability, category, query])

  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ?? null

  async function updateGroupCategory(
    group: CatalogGroup,
    categoryId: string,
  ) {
    if (!canManageAssignments || !activeOrganization?.id) return

    setError(null)

    try {
      await updateInventoryItemCategory({
        organizationId: activeOrganization.id,
        itemId: group.id,
        categoryId,
      })

      const catalog = await listInventoryCatalog(activeOrganization.id)
      setItems(catalog.items.map(catalogRowToNormalizedItem))
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to update the Inventory category.',
      )
      throw caught
    }
  }

  async function mergeGroup(sourceGroup: CatalogGroup, targetItemId: string) {
    if (!canEdit || !activeOrganization?.id || mergingItemId) return

    setMergingItemId(sourceGroup.id)
    setError(null)

    try {
      await mergeInventoryItems({
        organizationId: activeOrganization.id,
        sourceItemId: sourceGroup.id,
        targetItemId,
      })

      const catalog = await listInventoryCatalog(activeOrganization.id)
      setItems(catalog.items.map(catalogRowToNormalizedItem))
      setSelectedGroupId(targetItemId)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to merge Inventory items.',
      )
    } finally {
      setMergingItemId(null)
    }
  }

  const happyHourHasChanges =
    happyHourDraftEnabled !== happyHourEnabled ||
    happyHourDraftStart !== happyHourStart ||
    happyHourDraftEnd !== happyHourEnd ||
    happyHourDraftDays.join(',') !== happyHourDays.join(',') ||
    happyHourRange2DraftEnabled !== happyHourRange2Enabled ||
    happyHourRange2DraftStart !== happyHourRange2Start ||
    happyHourRange2DraftEnd !== happyHourRange2End ||
    happyHourRange2DraftDays.join(',') !== happyHourRange2Days.join(',')

  async function saveHappyHourSettings() {
    if (
      !canEdit ||
      !activeOrganization?.id ||
      !happyHourHasChanges ||
      savingHappyHour
    ) {
      return
    }

    if (
      happyHourDraftEnabled &&
      (!happyHourDraftStart ||
        !happyHourDraftEnd ||
        happyHourDraftDays.length === 0)
    ) {
      setError('Set a Happy Hour start, end, and at least one day.')
      return
    }

    if (
      happyHourRange2DraftEnabled &&
      (!happyHourRange2DraftStart ||
        !happyHourRange2DraftEnd ||
        happyHourRange2DraftDays.length === 0)
    ) {
      setError('Set a Time Range 2 start, end, and at least one day.')
      return
    }

    setSavingHappyHour(true)
    setError(null)

    try {
      const config = await updateInventoryOrganizationConfig({
        organizationId: activeOrganization.id,
        happyHourEnabled: happyHourDraftEnabled,
        happyHourStart: happyHourDraftStart || null,
        happyHourEnd: happyHourDraftEnd || null,
        happyHourDays: happyHourDraftDays,
        happyHourRange2Enabled: happyHourRange2DraftEnabled,
        happyHourRange2Start: happyHourRange2DraftStart || null,
        happyHourRange2End: happyHourRange2DraftEnd || null,
        happyHourRange2Days: happyHourRange2DraftDays,
        draft8Enabled: draft8.enabled,
        draft8ActualSizeOz: parseDraftSize(draft8.actualSizeOz),
        draft16Enabled: draft16.enabled,
        draft16ActualSizeOz: parseDraftSize(draft16.actualSizeOz),
        draft24Enabled: draft24.enabled,
        draft24ActualSizeOz: parseDraftSize(draft24.actualSizeOz),
        pitcherEnabled: pitcher.enabled,
        pitcherActualSizeOz: parseDraftSize(pitcher.actualSizeOz),
        optionalBeerCategory1Enabled,
        optionalBeerCategory1Label,
      })

      const nextEnabled = config?.happyHourEnabled ?? happyHourDraftEnabled
      const nextStart = config?.happyHourStart ?? happyHourDraftStart
      const nextEnd = config?.happyHourEnd ?? happyHourDraftEnd
      const nextDays =
        config?.happyHourDays?.length
          ? config.happyHourDays
          : happyHourDraftDays
      const nextRange2Enabled =
        config?.happyHourRange2Enabled ?? happyHourRange2DraftEnabled
      const nextRange2Start =
        config?.happyHourRange2Start ?? happyHourRange2DraftStart
      const nextRange2End =
        config?.happyHourRange2End ?? happyHourRange2DraftEnd
      const nextRange2Days =
        config?.happyHourRange2Days?.length
          ? config.happyHourRange2Days
          : happyHourRange2DraftDays

      setHappyHourEnabled(nextEnabled)
      setHappyHourStart(nextStart || '')
      setHappyHourEnd(nextEnd || '')
      setHappyHourDays(nextDays)
      setHappyHourDraftEnabled(nextEnabled)
      setHappyHourDraftStart(nextStart || '')
      setHappyHourDraftEnd(nextEnd || '')
      setHappyHourDraftDays(nextDays)
      setHappyHourRange2Enabled(nextRange2Enabled)
      setHappyHourRange2Start(nextRange2Start || '')
      setHappyHourRange2End(nextRange2End || '')
      setHappyHourRange2Days(nextRange2Days)
      setHappyHourRange2DraftEnabled(nextRange2Enabled)
      setHappyHourRange2DraftStart(nextRange2Start || '')
      setHappyHourRange2DraftEnd(nextRange2End || '')
      setHappyHourRange2DraftDays(nextRange2Days)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to save Happy Hour settings.',
      )
    } finally {
      setSavingHappyHour(false)
    }
  }

  const draftSlotsHaveChanges =
    !draftSlotEquals(draft8, draft8Edit) ||
    !draftSlotEquals(draft16, draft16Edit) ||
    !draftSlotEquals(draft24, draft24Edit) ||
    !draftSlotEquals(pitcher, pitcherEdit)

  async function saveDraftSlotSettings() {
    if (
      !canEdit ||
      !activeOrganization?.id ||
      !draftSlotsHaveChanges ||
      savingDraftSlots
    ) {
      return
    }

    const slots = [
      ['8oz', draft8Edit],
      ['16oz', draft16Edit],
      ['24oz', draft24Edit],
      ['Pitcher', pitcherEdit],
    ] as const

    const invalidSlot = slots.find(([, slot]) => {
      const size = parseDraftSize(slot.actualSizeOz)
      return slot.enabled && (size === null || size <= 0)
    })

    if (invalidSlot) {
      setError(`Set an actual size for the enabled ${invalidSlot[0]} Toast draft slot.`)
      return
    }

    setSavingDraftSlots(true)
    setError(null)

    try {
      const config = await updateInventoryOrganizationConfig({
        organizationId: activeOrganization.id,
        happyHourEnabled,
        happyHourStart: happyHourStart || null,
        happyHourEnd: happyHourEnd || null,
        happyHourDays,
        happyHourRange2Enabled,
        happyHourRange2Start: happyHourRange2Start || null,
        happyHourRange2End: happyHourRange2End || null,
        happyHourRange2Days,
        draft8Enabled: draft8Edit.enabled,
        draft8ActualSizeOz: parseDraftSize(draft8Edit.actualSizeOz),
        draft16Enabled: draft16Edit.enabled,
        draft16ActualSizeOz: parseDraftSize(draft16Edit.actualSizeOz),
        draft24Enabled: draft24Edit.enabled,
        draft24ActualSizeOz: parseDraftSize(draft24Edit.actualSizeOz),
        pitcherEnabled: pitcherEdit.enabled,
        pitcherActualSizeOz: parseDraftSize(pitcherEdit.actualSizeOz),
        optionalBeerCategory1Enabled,
        optionalBeerCategory1Label,
      })

      const nextDraft8 = {
        enabled: config?.draft8Enabled ?? draft8Edit.enabled,
        actualSizeOz: config?.draft8ActualSizeOz?.toString() ?? draft8Edit.actualSizeOz,
      }
      const nextDraft16 = {
        enabled: config?.draft16Enabled ?? draft16Edit.enabled,
        actualSizeOz: config?.draft16ActualSizeOz?.toString() ?? draft16Edit.actualSizeOz,
      }
      const nextDraft24 = {
        enabled: config?.draft24Enabled ?? draft24Edit.enabled,
        actualSizeOz: config?.draft24ActualSizeOz?.toString() ?? draft24Edit.actualSizeOz,
      }
      const nextPitcher = {
        enabled: config?.pitcherEnabled ?? pitcherEdit.enabled,
        actualSizeOz: config?.pitcherActualSizeOz?.toString() ?? pitcherEdit.actualSizeOz,
      }

      setDraft8(nextDraft8)
      setDraft16(nextDraft16)
      setDraft24(nextDraft24)
      setPitcher(nextPitcher)
      setDraft8Edit(nextDraft8)
      setDraft16Edit(nextDraft16)
      setDraft24Edit(nextDraft24)
      setPitcherEdit(nextPitcher)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to save draft size settings.',
      )
    } finally {
      setSavingDraftSlots(false)
    }
  }

  const optionalBeerCategory1HasChanges =
    optionalBeerCategory1EditEnabled !== optionalBeerCategory1Enabled ||
    optionalBeerCategory1EditLabel.trim() !== optionalBeerCategory1Label

  async function saveOptionalBeerCategory1Settings() {
    if (
      !canEdit ||
      !activeOrganization?.id ||
      !optionalBeerCategory1HasChanges ||
      savingOptionalBeerCategory1
    ) {
      return
    }

    const nextLabel = optionalBeerCategory1EditLabel.trim()
    if (optionalBeerCategory1EditEnabled && !nextLabel) {
      setError('Set a label for Optional Beer Category 1.')
      return
    }

    setSavingOptionalBeerCategory1(true)
    setError(null)

    try {
      const config = await updateInventoryOrganizationConfig({
        organizationId: activeOrganization.id,
        happyHourEnabled,
        happyHourStart: happyHourStart || null,
        happyHourEnd: happyHourEnd || null,
        happyHourDays,
        happyHourRange2Enabled,
        happyHourRange2Start: happyHourRange2Start || null,
        happyHourRange2End: happyHourRange2End || null,
        happyHourRange2Days,
        draft8Enabled: draft8.enabled,
        draft8ActualSizeOz: parseDraftSize(draft8.actualSizeOz),
        draft16Enabled: draft16.enabled,
        draft16ActualSizeOz: parseDraftSize(draft16.actualSizeOz),
        draft24Enabled: draft24.enabled,
        draft24ActualSizeOz: parseDraftSize(draft24.actualSizeOz),
        pitcherEnabled: pitcher.enabled,
        pitcherActualSizeOz: parseDraftSize(pitcher.actualSizeOz),
        optionalBeerCategory1Enabled: optionalBeerCategory1EditEnabled,
        optionalBeerCategory1Label: nextLabel || 'Optional Beer Category 1',
      })

      const savedEnabled = config?.optionalBeerCategory1Enabled ?? optionalBeerCategory1EditEnabled
      const savedLabel =
        config?.optionalBeerCategory1Label?.trim() ||
        nextLabel ||
        'Optional Beer Category 1'

      setOptionalBeerCategory1Enabled(savedEnabled)
      setOptionalBeerCategory1Label(savedLabel)
      setOptionalBeerCategory1EditEnabled(savedEnabled)
      setOptionalBeerCategory1EditLabel(savedLabel)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to save Optional Beer Category 1 settings.',
      )
    } finally {
      setSavingOptionalBeerCategory1(false)
    }
  }

  async function updateVariant(
    item: NormalizedMenuItem,
    patch: Partial<NormalizedMenuItem>,
  ) {
    if (!canEdit || !activeOrganization?.id || savingVariantId) return

    setSavingVariantId(item.id)
    setError(null)

    const payload: Parameters<typeof updateInventoryOrganizationVariant>[0] = {
      organizationId: activeOrganization.id,
      variantId: item.id,
    }

    if (Object.hasOwn(patch, 'name')) {
      const nextName = patch.name?.trim() ?? ''
      payload.toastNameOverride =
        nextName && nextName !== item.masterName ? nextName : null
    }

    if (Object.hasOwn(patch, 'organizationEnabled')) {
      payload.enabled = patch.organizationEnabled
    }

    if (Object.hasOwn(patch, 'exportToToast')) {
      payload.exportToToast = patch.exportToToast
    }

    if (Object.hasOwn(patch, 'basePriceCents')) {
      payload.priceOverrideCents = patch.basePriceCents ?? null
    }

    if (Object.hasOwn(patch, 'happyHourPriceCents')) {
      payload.happyHourPriceCents = patch.happyHourPriceCents ?? null
    }

    try {
      await updateInventoryOrganizationVariant(payload)
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id
            ? {
                ...currentItem,
                ...patch,
                exportIncluded:
                  (patch.organizationEnabled ?? currentItem.organizationEnabled) === true &&
                  (patch.exportToToast ?? currentItem.exportToToast) === true,
              }
            : currentItem,
        ),
      )
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to save the Inventory item.',
      )
      throw caught
    } finally {
      setSavingVariantId(null)
    }
  }

  return (
    <AuthenticatedInventoryShell currentPath="/">
      <section className="inventory-content inventory-catalog-page">
        <header className="inventory-page-heading">
          <div>
            <p className="inventory-kicker">Catalog</p>
            <h1>Catalog</h1>
            <p>
              Manage what {activeOrganization?.name ?? 'this organization'} carries,
              its prices, and what exports to Toast.
            </p>
          </div>
        </header>

        {canEdit ? (
          <details className="inventory-organization-settings">
            <summary>
              <div>
                <p className="inventory-kicker">Organization settings</p>
                <strong>Happy Hour & draft sizes</strong>
                <span>
                  Settings for {activeOrganization?.name ?? 'this organization'}.
                </span>
              </div>
              <span className="inventory-organization-settings-summary-action">
                Edit settings
              </span>
            </summary>

            <div className="inventory-organization-settings-content">
              <section className="inventory-organization-settings-section inventory-happy-hour-settings">
                <div className="inventory-happy-hour-copy">
                  <h2>Happy Hour</h2>
                  <p>
                    Set when {activeOrganization?.name ?? 'this organization'} uses Happy Hour pricing.
                  </p>
                </div>

                <label className="inventory-inline-toggle inventory-happy-hour-toggle">
                  <input
                    type="checkbox"
                    checked={happyHourDraftEnabled}
                    disabled={savingHappyHour}
                    onChange={(event) => setHappyHourDraftEnabled(event.target.checked)}
                  />
                  <span>{happyHourDraftEnabled ? 'Enabled' : 'Disabled'}</span>
                </label>

                <label className="inventory-search-control">
                  <span>Start</span>
                  <input
                    type="time"
                    value={happyHourDraftStart}
                    disabled={!happyHourDraftEnabled || savingHappyHour}
                    onChange={(event) => setHappyHourDraftStart(event.target.value)}
                  />
                </label>

                <label className="inventory-search-control">
                  <span>End</span>
                  <input
                    type="time"
                    value={happyHourDraftEnd}
                    disabled={!happyHourDraftEnabled || savingHappyHour}
                    onChange={(event) => setHappyHourDraftEnd(event.target.value)}
                  />
                </label>

                <fieldset
                  className="inventory-happy-hour-days"
                  disabled={!happyHourDraftEnabled || savingHappyHour}
                >
                  <legend>Days</legend>
                  <div className="inventory-happy-hour-day-options">
                    {HAPPY_HOUR_DAY_OPTIONS.map((option) => (
                      <label key={option.value}>
                        <input
                          type="checkbox"
                          checked={happyHourDraftDays.includes(option.value)}
                          onChange={(event) => {
                            setHappyHourDraftDays((current) =>
                              event.target.checked
                                ? ALL_HAPPY_HOUR_DAYS.filter(
                                    (day) =>
                                      day === option.value ||
                                      current.includes(day),
                                  )
                                : current.filter((day) => day !== option.value),
                            )
                          }}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="inventory-happy-hour-range2">
                  <div className="inventory-happy-hour-range2-heading">
                    <div>
                      <strong>Time Range 2</strong>
                      <span>Optional second Happy Hour window for the Toast Notes tab.</span>
                    </div>
                    <label className="inventory-inline-toggle">
                      <input
                        type="checkbox"
                        checked={happyHourRange2DraftEnabled}
                        disabled={!happyHourDraftEnabled || savingHappyHour}
                        onChange={(event) =>
                          setHappyHourRange2DraftEnabled(event.target.checked)
                        }
                      />
                      <span>{happyHourRange2DraftEnabled ? 'Enabled' : 'Disabled'}</span>
                    </label>
                  </div>

                  <div className="inventory-happy-hour-range2-times">
                    <label className="inventory-search-control">
                      <span>Start</span>
                      <input
                        type="time"
                        value={happyHourRange2DraftStart}
                        disabled={
                          !happyHourDraftEnabled ||
                          !happyHourRange2DraftEnabled ||
                          savingHappyHour
                        }
                        onChange={(event) => setHappyHourRange2DraftStart(event.target.value)}
                      />
                    </label>
                    <label className="inventory-search-control">
                      <span>End</span>
                      <input
                        type="time"
                        value={happyHourRange2DraftEnd}
                        disabled={
                          !happyHourDraftEnabled ||
                          !happyHourRange2DraftEnabled ||
                          savingHappyHour
                        }
                        onChange={(event) => setHappyHourRange2DraftEnd(event.target.value)}
                      />
                    </label>
                  </div>

                  <fieldset
                    className="inventory-happy-hour-days"
                    disabled={
                      !happyHourDraftEnabled ||
                      !happyHourRange2DraftEnabled ||
                      savingHappyHour
                    }
                  >
                    <legend>Days</legend>
                    <div className="inventory-happy-hour-day-options">
                      {HAPPY_HOUR_DAY_OPTIONS.map((option) => (
                        <label key={option.value}>
                          <input
                            type="checkbox"
                            checked={happyHourRange2DraftDays.includes(option.value)}
                            onChange={(event) => {
                              setHappyHourRange2DraftDays((current) =>
                                event.target.checked
                                  ? ALL_HAPPY_HOUR_DAYS.filter(
                                      (day) =>
                                        day === option.value ||
                                        current.includes(day),
                                    )
                                  : current.filter((day) => day !== option.value),
                              )
                            }}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>

                <div className="inventory-happy-hour-actions">
                  <button
                    type="button"
                    className="inventory-secondary-button"
                    disabled={!happyHourHasChanges || savingHappyHour}
                    onClick={() => {
                      setHappyHourDraftEnabled(happyHourEnabled)
                      setHappyHourDraftStart(happyHourStart)
                      setHappyHourDraftEnd(happyHourEnd)
                      setHappyHourDraftDays(happyHourDays)
                      setHappyHourRange2DraftEnabled(happyHourRange2Enabled)
                      setHappyHourRange2DraftStart(happyHourRange2Start)
                      setHappyHourRange2DraftEnd(happyHourRange2End)
                      setHappyHourRange2DraftDays(happyHourRange2Days)
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inventory-primary-button"
                    disabled={!happyHourHasChanges || savingHappyHour}
                    onClick={() => void saveHappyHourSettings()}
                  >
                    {savingHappyHour ? 'Saving…' : 'Update'}
                  </button>
                </div>
              </section>

              <section className="inventory-organization-settings-section inventory-draft-slots-settings">
                <div className="inventory-draft-slots-copy">
                  <h2>Draft sizes</h2>
                  <p>
                    Map this location's actual draft sizes to Toast's fixed draft slots.
                  </p>
                </div>

                <div className="inventory-draft-slot-list">
                  <div className="inventory-draft-slot-header" aria-hidden="true">
                    <span>Toast slot</span>
                    <span>Used</span>
                    <span>Actual size</span>
                  </div>
                  <DraftSlotField toastLabel="8oz" value={draft8Edit} disabled={savingDraftSlots} onChange={setDraft8Edit} />
                  <DraftSlotField toastLabel="16oz" value={draft16Edit} disabled={savingDraftSlots} onChange={setDraft16Edit} />
                  <DraftSlotField toastLabel="24oz" value={draft24Edit} disabled={savingDraftSlots} onChange={setDraft24Edit} />
                  <DraftSlotField toastLabel="Pitcher" value={pitcherEdit} disabled={savingDraftSlots} onChange={setPitcherEdit} />
                </div>

                <div className="inventory-draft-slots-actions">
                  <button
                    type="button"
                    className="inventory-secondary-button"
                    disabled={!draftSlotsHaveChanges || savingDraftSlots}
                    onClick={() => {
                      setDraft8Edit(draft8)
                      setDraft16Edit(draft16)
                      setDraft24Edit(draft24)
                      setPitcherEdit(pitcher)
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inventory-primary-button"
                    disabled={!draftSlotsHaveChanges || savingDraftSlots}
                    onClick={() => void saveDraftSlotSettings()}
                  >
                    {savingDraftSlots ? 'Saving…' : 'Update'}
                  </button>
                </div>
              </section>

              <section className="inventory-organization-settings-section inventory-draft-slots-settings">
                <div className="inventory-draft-slots-copy">
                  <h2>Optional beer category 1</h2>
                  <p>
                    Enable Toast's first hidden Optional Beer Category and set the organization-specific label that should appear in the workbook.
                  </p>
                </div>

                <label className="inventory-inline-toggle">
                  <input
                    type="checkbox"
                    checked={optionalBeerCategory1EditEnabled}
                    disabled={savingOptionalBeerCategory1}
                    onChange={(event) => setOptionalBeerCategory1EditEnabled(event.target.checked)}
                  />
                  <span>{optionalBeerCategory1EditEnabled ? 'Enabled' : 'Disabled'}</span>
                </label>

                <label className="inventory-search-control">
                  <span>Category label</span>
                  <input
                    type="text"
                    value={optionalBeerCategory1EditLabel}
                    disabled={!optionalBeerCategory1EditEnabled || savingOptionalBeerCategory1}
                    onChange={(event) => setOptionalBeerCategory1EditLabel(event.target.value)}
                    placeholder="Category name"
                  />
                </label>

                <div className="inventory-draft-slots-actions">
                  <button
                    type="button"
                    className="inventory-secondary-button"
                    disabled={!optionalBeerCategory1HasChanges || savingOptionalBeerCategory1}
                    onClick={() => {
                      setOptionalBeerCategory1EditEnabled(optionalBeerCategory1Enabled)
                      setOptionalBeerCategory1EditLabel(optionalBeerCategory1Label)
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inventory-primary-button"
                    disabled={!optionalBeerCategory1HasChanges || savingOptionalBeerCategory1}
                    onClick={() => void saveOptionalBeerCategory1Settings()}
                  >
                    {savingOptionalBeerCategory1 ? 'Saving…' : 'Update'}
                  </button>
                </div>
              </section>
            </div>
          </details>
        ) : null}

        <section className="inventory-catalog-toolbar" aria-label="Catalog filters">
          <label className="inventory-search-control inventory-catalog-search">
            <span>Search</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search items…"
            />
          </label>

          <label className="inventory-search-control">
            <span>Toast category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="all">All categories</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="inventory-search-control">
            <span>Availability</span>
            <select
              value={availability}
              onChange={(event) => setAvailability(event.target.value as AvailabilityFilter)}
            >
              <option value="carried">Carried here</option>
              <option value="not-carried">Not carried here</option>
              <option value="all">All master items</option>
            </select>
          </label>
        </section>

        <section className="inventory-card inventory-catalog-card">
          <div className="inventory-table-heading">
            <div>
              <h2>{activeOrganization?.name ?? 'Selected organization'}</h2>
              <p className="inventory-catalog-subtitle">
                {filteredGroups.length === 0
                  ? '0 items'
                  : `Showing ${(pageStart + 1).toLocaleString()}–${pageEnd.toLocaleString()} of ${filteredGroups.length.toLocaleString()} items`}
              </p>
            </div>
          </div>

          {loading ? <p>Loading catalog…</p> : null}
          {error ? <p className="inventory-error">{error}</p> : null}

          {!loading && !error && filteredGroups.length === 0 ? (
            <p className="inventory-empty-state">No catalog items match these filters.</p>
          ) : null}

          {filteredGroups.length > 0 ? (
            <div className="inventory-table-wrap">
              <table className="inventory-table inventory-catalog-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Price</th>
                    <th>Happy hour</th>
                    <th>Available here</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pageGroups.map((group) => {
                    const carried = group.items.some((item) => item.organizationEnabled === true)

                    return (
                      <tr
                        key={group.id}
                        className="inventory-catalog-row"
                        tabIndex={0}
                        onClick={() => setSelectedGroupId(group.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setSelectedGroupId(group.id)
                          }
                        }}
                      >
                        <td>
                          <div className="inventory-catalog-item-cell">
                            <strong>{group.name}</strong>
                            <span>{group.category}</span>
                            <div className="inventory-format-list">
                              {group.items.map((item) => (
                                <span key={item.id}>{item.variantLabel || 'Standard'}</span>
                              ))}
                            </div>
                          </div>
                        </td>
                        <td>{getPriceRange(group.items)}</td>
                        <td>{getHappyHourRange(group.items)}</td>
                        <td>
                          <span className={carried ? 'inventory-carry-status is-on' : 'inventory-carry-status'}>
                            {carried ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="inventory-catalog-action-cell" aria-hidden="true">
                          <span className="inventory-catalog-chevron">›</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {filteredGroups.length > PAGE_SIZE ? (
            <div className="inventory-catalog-pagination" aria-label="Catalog pagination">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={clampedPage <= 1}
              >
                Previous
              </button>
              <span>Page {clampedPage.toLocaleString()} of {pageCount.toLocaleString()}</span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                disabled={clampedPage >= pageCount}
              >
                Next
              </button>
            </div>
          ) : null}
        </section>

        {selectedGroup ? (
          <CatalogDrawer
            group={selectedGroup}
            canEdit={canEdit}
            canMerge={canManageAssignments}
            allGroups={groups}
            categoryOptions={categoryOptions}
            savingVariantId={savingVariantId}
            merging={mergingItemId === selectedGroup.id}
            onClose={() => setSelectedGroupId(null)}
            onUpdate={updateVariant}
            onUpdateCategory={updateGroupCategory}
            onMerge={mergeGroup}
          />
        ) : null}
      </section>
    </AuthenticatedInventoryShell>
  )
}

function CatalogDrawer({
  group,
  canEdit,
  canMerge,
  allGroups,
  categoryOptions,
  savingVariantId,
  merging,
  onClose,
  onUpdate,
  onUpdateCategory,
  onMerge,
}: {
  group: CatalogGroup
  canEdit: boolean
  canMerge: boolean
  allGroups: CatalogGroup[]
  categoryOptions: CatalogCategoryOption[]
  savingVariantId: string | null
  merging: boolean
  onClose: () => void
  onUpdate: (
    item: NormalizedMenuItem,
    patch: Partial<NormalizedMenuItem>,
  ) => Promise<void>
  onUpdateCategory: (group: CatalogGroup, categoryId: string) => Promise<void>
  onMerge: (sourceGroup: CatalogGroup, targetItemId: string) => Promise<void>
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [draftItems, setDraftItems] = useState(() =>
    group.items.map((item) => ({ ...item })),
  )
  const [updating, setUpdating] = useState(false)
  const [draftCategoryId, setDraftCategoryId] = useState(group.categoryId ?? '')

  useEffect(() => {
    setDraftItems(group.items.map((item) => ({ ...item })))
    setDraftCategoryId(group.categoryId ?? '')
  }, [group.id])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  const carriedCount = draftItems.filter(
    (item) => item.organizationEnabled === true,
  ).length
  const [mergeTargetId, setMergeTargetId] = useState('')
  const mergeCandidates = allGroups.filter((candidate) => candidate.id !== group.id)
  const categoryChanged =
    Boolean(draftCategoryId) && draftCategoryId !== (group.categoryId ?? '')

  const hasChanges = categoryChanged || draftItems.some((draftItem) => {
    const original = group.items.find((item) => item.id === draftItem.id)
    if (!original) return true

    return (
      draftItem.name !== original.name ||
      draftItem.organizationEnabled !== original.organizationEnabled ||
      draftItem.exportToToast !== original.exportToToast ||
      draftItem.basePriceCents !== original.basePriceCents ||
      draftItem.happyHourPriceCents !== original.happyHourPriceCents
    )
  })

  function updateDraft(
    itemId: string,
    patch: Partial<NormalizedMenuItem>,
  ) {
    setDraftItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              ...patch,
              exportIncluded:
                (patch.organizationEnabled ?? item.organizationEnabled) === true &&
                (patch.exportToToast ?? item.exportToToast) === true,
            }
          : item,
      ),
    )
  }

  async function saveDraft() {
    if (!canEdit || !hasChanges || updating || savingVariantId) return

    setUpdating(true)

    try {
      if (categoryChanged) {
        await onUpdateCategory(group, draftCategoryId)
      }

      for (const draftItem of draftItems) {
        const original = group.items.find((item) => item.id === draftItem.id)
        if (!original) continue

        const patch: Partial<NormalizedMenuItem> = {}

        if (draftItem.name !== original.name) {
          patch.name = draftItem.name
        }
        if (draftItem.organizationEnabled !== original.organizationEnabled) {
          patch.organizationEnabled = draftItem.organizationEnabled
        }
        if (draftItem.exportToToast !== original.exportToToast) {
          patch.exportToToast = draftItem.exportToToast
        }
        if (draftItem.basePriceCents !== original.basePriceCents) {
          patch.basePriceCents = draftItem.basePriceCents
        }
        if (draftItem.happyHourPriceCents !== original.happyHourPriceCents) {
          patch.happyHourPriceCents = draftItem.happyHourPriceCents
        }

        if (Object.keys(patch).length > 0) {
          await onUpdate(original, patch)
        }
      }

      onClose()
    } catch {
      // updateVariant already surfaces the save error in the Catalog page.
    } finally {
      setUpdating(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="inventory-edit-drawer inventory-catalog-drawer"
      aria-labelledby="inventory-catalog-drawer-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="inventory-catalog-drawer-heading">
        <div>
          <p className="inventory-kicker">{group.category}</p>
          <h2 id="inventory-catalog-drawer-title">{group.name}</h2>
          <p>
            {group.items.length} format{group.items.length === 1 ? '' : 's'} · {carriedCount} available here
          </p>
        </div>
        <button type="button" onClick={onClose}>Close</button>
      </div>

      {canMerge ? (
        <section className="inventory-drawer-section inventory-master-category-section">
          <div className="inventory-drawer-section-heading">
            <div>
              <p className="inventory-kicker">Shared master item</p>
              <h3>Category</h3>
            </div>
          </div>
          <label className="inventory-search-control">
            <span>Canonical category</span>
            <select
              value={draftCategoryId}
              disabled={updating || savingVariantId !== null}
              onChange={(event) => setDraftCategoryId(event.target.value)}
            >
              {categoryOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <p className="inventory-master-category-note">
            This category is shared across every organization.
          </p>
        </section>
      ) : null}

      <section className="inventory-drawer-section">
        <div className="inventory-drawer-section-heading">
          <div>
            <p className="inventory-kicker">Availability & pricing</p>
            <h3>Formats</h3>
          </div>
          {!canEdit ? <span className="inventory-readonly-pill">Read only</span> : null}
        </div>

        <div className="inventory-catalog-variants">
          {draftItems.map((item) => {
            const saving = savingVariantId === item.id

            return (
              <article key={item.id} className="inventory-catalog-variant-card">
                <div className="inventory-catalog-variant-heading">
                  <div>
                    <strong>{item.variantLabel || 'Standard'}</strong>
                    <span>
                      {item.toastDestination || 'No Toast destination'}
                    </span>
                  </div>
                  <div className="inventory-variant-toggles">
                    <label className="inventory-inline-toggle">
                      <input
                        type="checkbox"
                        checked={item.organizationEnabled === true}
                        disabled={!canEdit || saving || updating}
                        onChange={(event) =>
                          updateDraft(item.id, {
                            organizationEnabled: event.target.checked,
                          })
                        }
                      />
                      <span>
                        {item.organizationEnabled === true
                          ? 'Available here'
                          : 'Not carried here'}
                      </span>
                    </label>

                    <label className="inventory-inline-toggle">
                      <input
                        type="checkbox"
                        checked={item.exportToToast === true}
                        disabled={
                          !canEdit ||
                          saving ||
                          updating ||
                          item.organizationEnabled !== true
                        }
                        onChange={(event) =>
                          updateDraft(item.id, {
                            exportToToast: event.target.checked,
                          })
                        }
                      />
                      <span>Export to Toast</span>
                    </label>
                  </div>
                </div>

                <NameField
                  value={item.name}
                  masterName={item.masterName ?? item.name}
                  disabled={!canEdit || saving || updating}
                  onCommit={(value) => updateDraft(item.id, { name: value })}
                />

                <div className="inventory-catalog-price-grid">
                  <MoneyField
                    label="Price"
                    value={item.basePriceCents}
                    disabled={!canEdit || saving || updating}
                    onCommit={(value) => updateDraft(item.id, { basePriceCents: value })}
                  />
                  <MoneyField
                    label="Happy hour"
                    value={item.happyHourPriceCents}
                    disabled={!canEdit || saving || updating}
                    onCommit={(value) =>
                      updateDraft(item.id, { happyHourPriceCents: value })
                    }
                  />
                </div>

                <div className="inventory-variant-meta">
                  <span>{item.toastCategory}</span>
                  {saving ? <span className="inventory-save-note">Saving…</span> : null}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {canMerge ? (
        <section className="inventory-drawer-section inventory-merge-section">
          <div className="inventory-drawer-section-heading">
            <div>
              <p className="inventory-kicker">Consolidate duplicate</p>
              <h3>Merge with another item</h3>
            </div>
          </div>
          <p>
            Move this item's variants and source mappings into an existing master item.
            The selected master item is kept.
          </p>
          <label className="inventory-search-control">
            <span>Keep this master item</span>
            <select
              value={mergeTargetId}
              disabled={merging || hasChanges || updating}
              onChange={(event) => setMergeTargetId(event.target.value)}
            >
              <option value="">Choose master item…</option>
              {mergeCandidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.items[0]?.masterName ?? candidate.name} · {candidate.category}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="inventory-danger-button"
            disabled={!mergeTargetId || merging || hasChanges || updating}
            onClick={() => {
              if (!mergeTargetId) return
              const target = mergeCandidates.find((candidate) => candidate.id === mergeTargetId)
              if (!target) return

              const sourceName = group.items[0]?.masterName ?? group.name
              const targetName = target.items[0]?.masterName ?? target.name

              if (
                window.confirm(
                  `Merge "${sourceName}" into "${targetName}"? This consolidates their master Inventory records.`,
                )
              ) {
                void onMerge(group, mergeTargetId)
              }
            }}
          >
            {merging ? 'Merging…' : 'Merge items'}
          </button>
        </section>
      ) : null}

      {canMerge && hasChanges ? (
        <p className="inventory-drawer-pending-note">
          Update or cancel your edits before merging this item.
        </p>
      ) : null}

      <section className="inventory-drawer-section inventory-drawer-help">
        <p className="inventory-kicker">How this works</p>
        <p>
          Availability, Toast export, price, and Happy Hour values are specific to the selected organization.
          The master item remains shared across organizations.
        </p>
      </section>

      {canEdit ? (
        <footer className="inventory-drawer-actions">
          <button
            type="button"
            className="inventory-secondary-button"
            disabled={updating || savingVariantId !== null}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inventory-primary-button"
            disabled={!hasChanges || updating || savingVariantId !== null}
            onClick={() => void saveDraft()}
          >
            {updating || savingVariantId !== null ? 'Updating…' : 'Update'}
          </button>
        </footer>
      ) : null}
    </dialog>
  )
}

function NameField({
  value,
  masterName,
  disabled,
  onCommit,
}: {
  value: string
  masterName: string
  disabled: boolean
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  return (
    <label className="inventory-search-control inventory-catalog-name-field">
      <span>Name</span>
      <input
        value={draft}
        disabled={disabled}
        placeholder={masterName}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const nextValue = draft.trim() || masterName
          if (nextValue !== value) {
            setDraft(nextValue)
            onCommit(nextValue)
          }
        }}
      />
      {value !== masterName ? (
        <small>Master name: {masterName}</small>
      ) : null}
    </label>
  )
}

function DraftSlotField({
  toastLabel,
  value,
  disabled,
  onChange,
}: {
  toastLabel: string
  value: DraftSlotState
  disabled: boolean
  onChange: (value: DraftSlotState) => void
}) {
  const toastSize = toastLabel.endsWith('oz')
    ? toastLabel.replace('oz', '')
    : ''

  return (
    <div className="inventory-draft-slot-row">
      <strong>{toastLabel}</strong>

      <label className="inventory-draft-slot-used">
        <input
          type="checkbox"
          checked={value.enabled}
          disabled={disabled}
          onChange={(event) => {
            const enabled = event.target.checked
            onChange({
              ...value,
              enabled,
              actualSizeOz:
                enabled && !value.actualSizeOz.trim() && toastSize
                  ? toastSize
                  : value.actualSizeOz,
            })
          }}
        />
        <span>{value.enabled ? 'Yes' : 'No'}</span>
      </label>

      <label className="inventory-draft-size-input">
        <span className="sr-only">{toastLabel} actual size in ounces</span>
        <div className="inventory-draft-size-control">
          <input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={value.actualSizeOz}
            disabled={!value.enabled || disabled}
            placeholder="—"
            onInput={(event) =>
              onChange({
                ...value,
                actualSizeOz: (event.currentTarget as HTMLInputElement).value,
              })
            }
          />
          <span>oz</span>
        </div>
      </label>
    </div>
  )
}

function draftSlotEquals(left: DraftSlotState, right: DraftSlotState) {
  return (
    left.enabled === right.enabled &&
    left.actualSizeOz.trim() === right.actualSizeOz.trim()
  )
}

function parseDraftSize(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function MoneyField({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string
  value: number | null
  disabled: boolean
  onCommit: (value: number | null) => void
}) {
  const [draft, setDraft] = useState(value === null ? '' : (value / 100).toFixed(2))

  useEffect(() => {
    setDraft(value === null ? '' : (value / 100).toFixed(2))
  }, [value])

  return (
    <label className="inventory-search-control">
      <span>{label}</span>
      <input
        type="number"
        min="0"
        step="0.01"
        value={draft}
        disabled={disabled}
        placeholder="—"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const trimmed = draft.trim()
          if (!trimmed) {
            if (value !== null) onCommit(null)
            return
          }

          const number = Number(trimmed)
          if (!Number.isFinite(number)) return

          const cents = Math.round(number * 100)
          if (cents !== value) onCommit(cents)
        }}
      />
    </label>
  )
}

function groupCatalogItems(items: NormalizedMenuItem[]): CatalogGroup[] {
  const groups = new Map<string, NormalizedMenuItem[]>()

  items.forEach((item) => {
    const key = item.masterItemId ?? item.id
    const existing = groups.get(key)

    if (existing) existing.push(item)
    else groups.set(key, [item])
  })

  return [...groups.entries()]
    .map(([id, groupedItems]) => {
      const sortedItems = [...groupedItems].sort((a, b) =>
        (a.variantLabel || 'Standard').localeCompare(b.variantLabel || 'Standard'),
      )
      const first = sortedItems[0]

      return {
        id,
        name: first?.name ?? 'Unnamed item',
        category: first?.category || first?.toastCategory || 'Uncategorized',
        categoryId: first?.masterCategoryId,
        items: sortedItems,
      }
    })
    .sort((a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    )
}

function getHappyHourRange(items: NormalizedMenuItem[]) {
  const prices = items
    .map((item) => item.happyHourPriceCents)
    .filter((value): value is number => value !== null)

  if (prices.length === 0) return '—'

  const minimum = Math.min(...prices)
  const maximum = Math.max(...prices)

  return minimum === maximum
    ? formatCurrency(minimum)
    : `${formatCurrency(minimum)}–${formatCurrency(maximum)}`
}

function getPriceRange(items: NormalizedMenuItem[]) {
  const prices = items
    .map((item) => item.basePriceCents)
    .filter((value): value is number => value !== null)

  if (prices.length === 0) return '—'

  const minimum = Math.min(...prices)
  const maximum = Math.max(...prices)

  return minimum === maximum
    ? formatCurrency(minimum)
    : `${formatCurrency(minimum)}–${formatCurrency(maximum)}`
}
