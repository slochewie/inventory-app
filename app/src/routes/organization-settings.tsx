import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import {
  AuthenticatedInventoryShell,
  useInventoryAccessRole,
} from '#/components/authenticated-inventory-shell'
import { catalogRowToNormalizedItem } from '#/features/menu-import/catalog'
import type { NormalizedMenuItem } from '#/features/menu-import/types'
import { authClient } from '#/lib/auth-client'
import {
  ALL_HAPPY_HOUR_DAYS,
  getInventoryOrganizationConfig,
  getOptionalBeerCategories,
  listInventoryCatalog,
  updateInventoryOrganizationConfig,
  type HappyHourDay,
  type InventoryOrganizationConfig,
  type OptionalBeerCategoryConfig,
} from '#/lib/inventory-access'

export const Route = createFileRoute('/organization-settings')({
  component: OrganizationSettingsPage,
})

type OptionalBeerCategoryState = OptionalBeerCategoryConfig

type BuiltInBeerFormatSettings = Pick<
  InventoryOrganizationConfig,
  | 'draft8Enabled'
  | 'draft8ActualSizeOz'
  | 'draft16Enabled'
  | 'draft16ActualSizeOz'
  | 'draft24Enabled'
  | 'draft24ActualSizeOz'
  | 'pitcherEnabled'
  | 'pitcherActualSizeOz'
  | 'canEnabled'
  | 'bottleEnabled'
>

type MenuCategoryFlags = {
  retailEnabled: boolean
  openItemsEnabled: boolean
}

type OptionalMenuCategory = {
  id: keyof MenuCategoryFlags
  name: string
  description: string
}

const DEFAULT_BUILT_IN_BEER_FORMATS: BuiltInBeerFormatSettings = {
  draft8Enabled: false,
  draft8ActualSizeOz: 8,
  draft16Enabled: false,
  draft16ActualSizeOz: 16,
  draft24Enabled: false,
  draft24ActualSizeOz: 24,
  pitcherEnabled: false,
  pitcherActualSizeOz: null,
  canEnabled: true,
  bottleEnabled: true,
}

const DEFAULT_MENU_CATEGORY_FLAGS: MenuCategoryFlags = {
  retailEnabled: false,
  openItemsEnabled: false,
}

const OPTIONAL_MENU_CATEGORIES: OptionalMenuCategory[] = [
  {
    id: 'retailEnabled',
    name: 'Retail',
    description: 'Adds Retail to Add Item and Toast export routing.',
  },
  {
    id: 'openItemsEnabled',
    name: 'Open Items',
    description: 'Adds Open Items to Add Item and Toast export routing.',
  },
]

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

function OrganizationSettingsPage() {
  const { canEdit } = useInventoryAccessRole()
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [items, setItems] = useState<NormalizedMenuItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [happyHourExpanded, setHappyHourExpanded] = useState(true)
  const [timeRange1Expanded, setTimeRange1Expanded] = useState(true)
  const [timeRange2Expanded, setTimeRange2Expanded] = useState(false)
  const [beerFormatsExpanded, setBeerFormatsExpanded] = useState(true)

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

  const [menuCategoryFlags, setMenuCategoryFlags] = useState<MenuCategoryFlags>(
    DEFAULT_MENU_CATEGORY_FLAGS,
  )
  const [menuCategoryDraftFlags, setMenuCategoryDraftFlags] =
    useState<MenuCategoryFlags>(DEFAULT_MENU_CATEGORY_FLAGS)
  const [savingMenuCategories, setSavingMenuCategories] = useState(false)

  const [builtInBeerFormats, setBuiltInBeerFormats] =
    useState<BuiltInBeerFormatSettings>(DEFAULT_BUILT_IN_BEER_FORMATS)
  const [builtInBeerFormatEdits, setBuiltInBeerFormatEdits] =
    useState<BuiltInBeerFormatSettings>(DEFAULT_BUILT_IN_BEER_FORMATS)
  const [optionalBeerCategories, setOptionalBeerCategories] = useState<OptionalBeerCategoryState[]>([])
  const [optionalBeerCategoryEdits, setOptionalBeerCategoryEdits] = useState<OptionalBeerCategoryState[]>([])
  const [visibleOptionalBeerCategoryCount, setVisibleOptionalBeerCategoryCount] = useState(0)
  const [savingOptionalBeerCategories, setSavingOptionalBeerCategories] = useState(false)

  useEffect(() => {
    if (!activeOrganization?.id) {
      setItems([])
      setMenuCategoryFlags(DEFAULT_MENU_CATEGORY_FLAGS)
      setMenuCategoryDraftFlags(DEFAULT_MENU_CATEGORY_FLAGS)
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
        const catalogItems = catalog.items.map(catalogRowToNormalizedItem)
        setItems(catalogItems)
        setMenuCategoryFlags(getMenuCategoryFlags(organizationConfig))
        setMenuCategoryDraftFlags(getMenuCategoryFlags(organizationConfig))

        const start = organizationConfig.happyHourStart ?? ''
        const end = organizationConfig.happyHourEnd ?? ''
        const days = organizationConfig.happyHourDays?.length
          ? organizationConfig.happyHourDays
          : [...ALL_HAPPY_HOUR_DAYS]

        setHappyHourEnabled(organizationConfig.happyHourEnabled)
        setHappyHourStart(start)
        setHappyHourEnd(end)
        setHappyHourDays(days)
        setHappyHourDraftEnabled(organizationConfig.happyHourEnabled)
        setHappyHourDraftStart(start)
        setHappyHourDraftEnd(end)
        setHappyHourDraftDays(days)
        setTimeRange1Expanded(true)

        const range2Start = organizationConfig.happyHourRange2Start ?? ''
        const range2End = organizationConfig.happyHourRange2End ?? ''
        const range2Days = organizationConfig.happyHourRange2Days?.length
          ? organizationConfig.happyHourRange2Days
          : [...ALL_HAPPY_HOUR_DAYS]
        const range2Enabled = organizationConfig.happyHourRange2Enabled === true

        setHappyHourRange2Enabled(range2Enabled)
        setHappyHourRange2Start(range2Start)
        setHappyHourRange2End(range2End)
        setHappyHourRange2Days(range2Days)
        setHappyHourRange2DraftEnabled(range2Enabled)
        setHappyHourRange2DraftStart(range2Start)
        setHappyHourRange2DraftEnd(range2End)
        setHappyHourRange2DraftDays(range2Days)
        setTimeRange2Expanded(range2Enabled)

        const nextBuiltInBeerFormats =
          getBuiltInBeerFormatSettings(organizationConfig)
        setBuiltInBeerFormats(nextBuiltInBeerFormats)
        setBuiltInBeerFormatEdits(nextBuiltInBeerFormats)

        const savedCategories = getOptionalBeerCategories(organizationConfig)
        const effectiveCategories = getEffectiveOptionalBeerCategories(
          savedCategories,
          catalogItems,
        )
        setOptionalBeerCategories(savedCategories)
        setOptionalBeerCategoryEdits(
          effectiveCategories.map((category) => ({ ...category })),
        )
        setVisibleOptionalBeerCategoryCount(
          getVisibleOptionalBeerCategoryCount(effectiveCategories),
        )
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setError(
          caught instanceof Error
            ? caught.message
            : 'Unable to load organization settings.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [activeOrganization?.id])

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
    if (!canEdit || !activeOrganization?.id || !happyHourHasChanges || savingHappyHour) {
      return
    }

    if (
      happyHourDraftEnabled &&
      (!happyHourDraftStart || !happyHourDraftEnd || happyHourDraftDays.length === 0)
    ) {
      setError('Set a Happy Hour start, end, and at least one day.')
      setTimeRange1Expanded(true)
      return
    }

    if (
      happyHourRange2DraftEnabled &&
      (!happyHourRange2DraftStart ||
        !happyHourRange2DraftEnd ||
        happyHourRange2DraftDays.length === 0)
    ) {
      setError('Set a Time Range 2 start, end, and at least one day.')
      setTimeRange2Expanded(true)
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
        ...builtInBeerFormats,
        ...buildOptionalBeerCategoryConfig(optionalBeerCategories),
        ...menuCategoryFlags,
      })

      const nextEnabled = config?.happyHourEnabled ?? happyHourDraftEnabled
      const nextStart = config?.happyHourStart ?? happyHourDraftStart
      const nextEnd = config?.happyHourEnd ?? happyHourDraftEnd
      const nextDays = config?.happyHourDays?.length
        ? config.happyHourDays
        : happyHourDraftDays
      const nextRange2Enabled =
        config?.happyHourRange2Enabled ?? happyHourRange2DraftEnabled
      const nextRange2Start =
        config?.happyHourRange2Start ?? happyHourRange2DraftStart
      const nextRange2End =
        config?.happyHourRange2End ?? happyHourRange2DraftEnd
      const nextRange2Days = config?.happyHourRange2Days?.length
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
      setTimeRange2Expanded(nextRange2Enabled)
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

  const menuCategoryFlagsHaveChanges =
    menuCategoryDraftFlags.retailEnabled !== menuCategoryFlags.retailEnabled ||
    menuCategoryDraftFlags.openItemsEnabled !== menuCategoryFlags.openItemsEnabled

  async function saveMenuCategorySettings() {
    if (
      !canEdit ||
      !activeOrganization?.id ||
      !menuCategoryFlagsHaveChanges ||
      savingMenuCategories
    ) {
      return
    }

    setSavingMenuCategories(true)
    setError(null)

    try {
      await updateInventoryOrganizationConfig({
        organizationId: activeOrganization.id,
        happyHourEnabled,
        happyHourStart: happyHourStart || null,
        happyHourEnd: happyHourEnd || null,
        happyHourDays,
        happyHourRange2Enabled,
        happyHourRange2Start: happyHourRange2Start || null,
        happyHourRange2End: happyHourRange2End || null,
        happyHourRange2Days,
        ...builtInBeerFormats,
        ...buildOptionalBeerCategoryConfig(optionalBeerCategories),
        ...menuCategoryDraftFlags,
      } as Parameters<typeof updateInventoryOrganizationConfig>[0])

      setMenuCategoryFlags(menuCategoryDraftFlags)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to save Menu Categories settings.',
      )
    } finally {
      setSavingMenuCategories(false)
    }
  }

  const builtInBeerFormatsHaveChanges =
    JSON.stringify(builtInBeerFormatEdits) !== JSON.stringify(builtInBeerFormats)

  const optionalBeerCategoriesHaveChanges =
    optionalBeerCategoryEdits.length !== optionalBeerCategories.length ||
    optionalBeerCategoryEdits.some((draftCategory, index) => {
      const savedCategory = optionalBeerCategories[index]
      return (
        !savedCategory ||
        draftCategory.enabled !== savedCategory.enabled ||
        draftCategory.label.trim() !== savedCategory.label
      )
    })

  const savedOptionalBeerCategoryCount =
    getVisibleOptionalBeerCategoryCount(optionalBeerCategories)
  const optionalBeerCategoryUiHasChanges =
    builtInBeerFormatsHaveChanges ||
    optionalBeerCategoriesHaveChanges ||
    visibleOptionalBeerCategoryCount !== savedOptionalBeerCategoryCount

  function updateOptionalBeerCategoryDraft(
    slot: OptionalBeerCategoryConfig['slot'],
    patch: Partial<Pick<OptionalBeerCategoryConfig, 'enabled' | 'label'>>,
  ) {
    setOptionalBeerCategoryEdits((current) =>
      current.map((category) =>
        category.slot === slot ? { ...category, ...patch } : category,
      ),
    )
  }

  function moveOptionalBeerCategoryDraft(
    slot: OptionalBeerCategoryConfig['slot'],
    direction: 'up' | 'down',
  ) {
    const offset = direction === 'up' ? -1 : 1

    setOptionalBeerCategoryEdits((current) => {
      const sourceIndex = current.findIndex((category) => category.slot === slot)
      const targetIndex = sourceIndex + offset

      if (
        sourceIndex < 0 ||
        targetIndex < 0 ||
        targetIndex >= visibleOptionalBeerCategoryCount
      ) {
        return current
      }

      const next = current.map((category) => ({ ...category }))
      const source = next[sourceIndex]
      const target = next[targetIndex]
      if (!source || !target) return current

      next[sourceIndex] = {
        ...source,
        enabled: target.enabled,
        label: target.label,
      }
      next[targetIndex] = {
        ...target,
        enabled: source.enabled,
        label: source.label,
      }
      return next
    })
  }

  function removeOptionalBeerCategory(category: OptionalBeerCategoryConfig) {
    if (items.some((item) => item.toastSlot === category.key)) {
      setError(
        `${category.label} is still assigned to catalog items. Reassign those items before removing it.`,
      )
      return
    }

    setError(null)
    setOptionalBeerCategoryEdits((current) =>
      current.map((candidate) =>
        candidate.slot === category.slot
          ? {
              ...candidate,
              enabled: false,
              label: `Optional Beer Category ${candidate.slot}`,
            }
          : candidate,
      ),
    )
    setVisibleOptionalBeerCategoryCount((current) => Math.max(0, current - 1))
  }

  async function saveOptionalBeerCategorySettings() {
    if (
      !canEdit ||
      !activeOrganization?.id ||
      (!optionalBeerCategoriesHaveChanges && !builtInBeerFormatsHaveChanges) ||
      savingOptionalBeerCategories
    ) {
      return
    }

    const normalizedCategories = optionalBeerCategoryEdits.map((category) => ({
      ...category,
      label: category.label.trim() || `Optional Beer Category ${category.slot}`,
    }))

    const disabledAssignedCategory = normalizedCategories.find(
      (category) =>
        !category.enabled &&
        optionalBeerCategories.find((saved) => saved.slot === category.slot)?.enabled === true &&
        items.some((item) => item.toastSlot === category.key),
    )
    if (disabledAssignedCategory) {
      setError(
        'This Beer format is still assigned to catalog items. Reassign those items before disabling it.',
      )
      return
    }

    setSavingOptionalBeerCategories(true)
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
        ...builtInBeerFormatEdits,
        ...buildOptionalBeerCategoryConfig(normalizedCategories),
        ...menuCategoryFlags,
      })

      const savedBuiltInBeerFormats = getBuiltInBeerFormatSettings(
        config ?? ({
          enabled: true,
          happyHourEnabled,
          happyHourStart: happyHourStart || null,
          happyHourEnd: happyHourEnd || null,
          happyHourDays,
          happyHourRange2Enabled,
          happyHourRange2Start: happyHourRange2Start || null,
          happyHourRange2End: happyHourRange2End || null,
          happyHourRange2Days,
          ...builtInBeerFormatEdits,
          ...buildOptionalBeerCategoryConfig(normalizedCategories),
          ...menuCategoryFlags,
        } satisfies InventoryOrganizationConfig),
      )

      const savedCategories = getOptionalBeerCategories(
        config ?? ({
          enabled: true,
          happyHourEnabled,
          happyHourStart: happyHourStart || null,
          happyHourEnd: happyHourEnd || null,
          happyHourDays,
          happyHourRange2Enabled,
          happyHourRange2Start: happyHourRange2Start || null,
          happyHourRange2End: happyHourRange2End || null,
          happyHourRange2Days,
          ...builtInBeerFormatEdits,
          ...buildOptionalBeerCategoryConfig(normalizedCategories),
          ...menuCategoryFlags,
        } satisfies InventoryOrganizationConfig),
      )

      setBuiltInBeerFormats(savedBuiltInBeerFormats)
      setBuiltInBeerFormatEdits(savedBuiltInBeerFormats)

      setOptionalBeerCategories(savedCategories)
      setOptionalBeerCategoryEdits(
        savedCategories.map((category) => ({ ...category })),
      )
      setVisibleOptionalBeerCategoryCount(
        getVisibleOptionalBeerCategoryCount(savedCategories),
      )
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to save Beer Formats settings.',
      )
    } finally {
      setSavingOptionalBeerCategories(false)
    }
  }

  return (
    <AuthenticatedInventoryShell currentPath="/organization-settings">
      <section className="inventory-content">
        <header className="inventory-page-heading">
          <div>
            <p className="inventory-kicker">Settings</p>
            <h1>Organization Settings</h1>
            <p>
              Configure Happy Hour, Menu Categories, and Beer Formats for{' '}
              {activeOrganization?.name ?? 'this organization'}.
            </p>
          </div>
        </header>

        {loading ? <p>Loading organization settings…</p> : null}
        {error ? <p className="inventory-error">{error}</p> : null}

        {!loading && !canEdit ? (
          <section className="inventory-card">
            <p className="inventory-empty-state">
              You do not have permission to edit organization settings.
            </p>
          </section>
        ) : null}

        {!loading && canEdit ? (
          <div className="inventory-organization-settings-content">
            <details
              className="inventory-organization-settings-section inventory-happy-hour-settings"
              open={happyHourExpanded}
              onToggle={(event) => setHappyHourExpanded(event.currentTarget.open)}
            >
              <summary className="inventory-settings-card-summary">
                <div className="inventory-happy-hour-copy">
                  <h2>Happy Hour</h2>
                  <p>
                    Configure Toast Happy Hour time ranges for{' '}
                    {activeOrganization?.name ?? 'this organization'}.
                  </p>
                </div>
                <span>{happyHourExpanded ? 'Collapse' : 'Expand'}</span>
              </summary>

              <div className="inventory-happy-hour-ranges">
                <HappyHourRangeCard
                  eyebrow="Time Range 1"
                  title="Happy Hour"
                  description="Primary Toast Happy Hour window."
                  open={timeRange1Expanded}
                  onOpenChange={setTimeRange1Expanded}
                  enabled={happyHourDraftEnabled}
                  saving={savingHappyHour}
                  start={happyHourDraftStart}
                  end={happyHourDraftEnd}
                  days={happyHourDraftDays}
                  onEnabledChange={setHappyHourDraftEnabled}
                  onStartChange={setHappyHourDraftStart}
                  onEndChange={setHappyHourDraftEnd}
                  onDaysChange={setHappyHourDraftDays}
                />

                <HappyHourRangeCard
                  eyebrow="Time Range 2"
                  title="Time Range 2"
                  description="Optional second Happy Hour window."
                  open={timeRange2Expanded}
                  onOpenChange={setTimeRange2Expanded}
                  enabled={happyHourRange2DraftEnabled}
                  disabled={!happyHourDraftEnabled}
                  saving={savingHappyHour}
                  start={happyHourRange2DraftStart}
                  end={happyHourRange2DraftEnd}
                  days={happyHourRange2DraftDays}
                  onEnabledChange={setHappyHourRange2DraftEnabled}
                  onStartChange={setHappyHourRange2DraftStart}
                  onEndChange={setHappyHourRange2DraftEnd}
                  onDaysChange={setHappyHourRange2DraftDays}
                />
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
                    setTimeRange2Expanded(happyHourRange2Enabled)
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
            </details>

            <section className="inventory-organization-settings-section inventory-menu-category-card">
              <div className="inventory-draft-slots-copy">
                <h2>Menu Categories</h2>
                <p>
                  Enable optional categories that should appear in Add Item and
                  Toast export routing. Beer, Cocktails, and NA Bev are always
                  available.
                </p>
              </div>

              <div className="inventory-draft-slots-grid">
                {OPTIONAL_MENU_CATEGORIES.map((category) => (
                  <label
                    key={category.id}
                    className="inventory-inline-toggle inventory-beer-format-toggle"
                  >
                    <input
                      type="checkbox"
                      checked={menuCategoryDraftFlags[category.id]}
                      disabled={savingMenuCategories}
                      onChange={(event) =>
                        setMenuCategoryDraftFlags((current) => ({
                          ...current,
                          [category.id]: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      {category.name} ·{' '}
                      {menuCategoryDraftFlags[category.id]
                        ? 'Enabled'
                        : 'Disabled'}
                    </span>
                    <small>{category.description}</small>
                  </label>
                ))}
              </div>

              <div className="inventory-draft-slots-actions">
                <button
                  type="button"
                  className="inventory-secondary-button"
                  disabled={!menuCategoryFlagsHaveChanges || savingMenuCategories}
                  onClick={() => setMenuCategoryDraftFlags(menuCategoryFlags)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="inventory-primary-button"
                  disabled={!menuCategoryFlagsHaveChanges || savingMenuCategories}
                  onClick={() => void saveMenuCategorySettings()}
                >
                  {savingMenuCategories ? 'Saving…' : 'Update'}
                </button>
              </div>
            </section>

            <details
              className="inventory-organization-settings-section inventory-draft-slots-settings"
              open={beerFormatsExpanded}
              onToggle={(event) =>
                setBeerFormatsExpanded(event.currentTarget.open)
              }
            >
              <summary className="inventory-settings-card-summary">
                <div className="inventory-draft-slots-copy">
                  <h2>Beer Formats</h2>
                  <p>
                    Built-in Toast draft formats stay fixed and exact-match only.
                    Add custom draft or packaged formats here. Their order controls
                    which hidden Optional Beer Category workbook slot they use, and
                    the label is also used to recognize matching imports.
                  </p>
                </div>
                <span>{beerFormatsExpanded ? 'Collapse' : 'Expand'}</span>
              </summary>

              <div className="inventory-draft-slots-copy">
                <h3>Toast default formats</h3>
                <p>
                  Enable only the built-in Beer formats this organization uses.
                  Disabled formats stay out of Beer destination drop-down menus.
                </p>
              </div>

              <div className="inventory-draft-slots-grid">
                {[
                  ['draft8Enabled', '8oz Draft'],
                  ['draft16Enabled', '16oz Draft'],
                  ['draft24Enabled', '24oz Draft'],
                  ['pitcherEnabled', 'Pitcher'],
                  ['canEnabled', 'Can'],
                  ['bottleEnabled', 'Bottle'],
                ].map(([key, label]) => (
                  <label
                    key={key}
                    className="inventory-inline-toggle inventory-beer-format-toggle"
                  >
                    <input
                      type="checkbox"
                      checked={
                        builtInBeerFormatEdits[
                          key as keyof BuiltInBeerFormatSettings
                        ] === true
                      }
                      disabled={savingOptionalBeerCategories}
                      onChange={(event) =>
                        setBuiltInBeerFormatEdits((current) => ({
                          ...current,
                          [key]: event.target.checked,
                        }))
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              <div className="inventory-draft-slots-copy">
                <h3>Custom formats</h3>
                <p>
                  Custom draft or packaged formats use the hidden Optional Beer
                  Category workbook slots below.
                </p>
              </div>

              {visibleOptionalBeerCategoryCount > 0 ? (
                <div className="inventory-draft-slots-grid">
                  {optionalBeerCategoryEdits
                    .slice(0, visibleOptionalBeerCategoryCount)
                    .map((category, index) => (
                      <div key={category.key} className="inventory-draft-slot-field">
                        <label className="inventory-inline-toggle">
                          <input
                            type="checkbox"
                            checked={category.enabled}
                            disabled={savingOptionalBeerCategories}
                            onChange={(event) =>
                              updateOptionalBeerCategoryDraft(category.slot, {
                                enabled: event.target.checked,
                              })
                            }
                          />
                          <span>
                            {getBeerFormatTitle(category)} ·{' '}
                            {category.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </label>

                        <label className="inventory-search-control">
                          <span>Format label / import mapping</span>
                          <input
                            type="text"
                            value={category.label}
                            disabled={
                              !category.enabled || savingOptionalBeerCategories
                            }
                            onChange={(event) =>
                              updateOptionalBeerCategoryDraft(category.slot, {
                                label: event.target.value,
                              })
                            }
                            placeholder="10oz, Tall Boy Can, or custom label"
                          />
                        </label>

                        <div className="inventory-draft-slots-actions">
                          <button
                            type="button"
                            className="inventory-secondary-button"
                            disabled={index === 0 || savingOptionalBeerCategories}
                            onClick={() =>
                              moveOptionalBeerCategoryDraft(category.slot, 'up')
                            }
                          >
                            Move up
                          </button>
                          <button
                            type="button"
                            className="inventory-secondary-button"
                            disabled={
                              index >= visibleOptionalBeerCategoryCount - 1 ||
                              savingOptionalBeerCategories
                            }
                            onClick={() =>
                              moveOptionalBeerCategoryDraft(category.slot, 'down')
                            }
                          >
                            Move down
                          </button>
                        </div>

                        <button
                          type="button"
                          className="inventory-secondary-button inventory-format-remove-button"
                          aria-label={`Remove ${category.label || 'format'}`}
                          title={`Remove ${category.label || 'format'}`}
                          disabled={savingOptionalBeerCategories}
                          onClick={() => removeOptionalBeerCategory(category)}
                        >
                          <Trash2 aria-hidden="true" size={18} />
                        </button>
                      </div>
                    ))}
                </div>
              ) : null}

              {visibleOptionalBeerCategoryCount <
              optionalBeerCategoryEdits.length ? (
                <button
                  type="button"
                  className="inventory-secondary-button"
                  disabled={savingOptionalBeerCategories}
                  onClick={() =>
                    setVisibleOptionalBeerCategoryCount((current) =>
                      Math.min(
                        current + 1,
                        optionalBeerCategoryEdits.length,
                      ),
                    )
                  }
                >
                  Add format
                </button>
              ) : null}

              {optionalBeerCategoryUiHasChanges ||
              visibleOptionalBeerCategoryCount > 0 ? (
                <div className="inventory-draft-slots-actions">
                  <button
                    type="button"
                    className="inventory-secondary-button"
                    disabled={
                      !optionalBeerCategoryUiHasChanges ||
                      savingOptionalBeerCategories
                    }
                    onClick={() => {
                      setBuiltInBeerFormatEdits(builtInBeerFormats)
                      setOptionalBeerCategoryEdits(
                        optionalBeerCategories.map((category) => ({ ...category })),
                      )
                      setVisibleOptionalBeerCategoryCount(
                        savedOptionalBeerCategoryCount,
                      )
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inventory-primary-button"
                    disabled={
                      (!optionalBeerCategoriesHaveChanges &&
                        !builtInBeerFormatsHaveChanges) ||
                      savingOptionalBeerCategories
                    }
                    onClick={() => void saveOptionalBeerCategorySettings()}
                  >
                    {savingOptionalBeerCategories ? 'Saving…' : 'Update'}
                  </button>
                </div>
              ) : null}
            </details>
          </div>
        ) : null}
      </section>
    </AuthenticatedInventoryShell>
  )
}

function HappyHourRangeCard({
  eyebrow,
  title,
  description,
  open,
  onOpenChange,
  enabled,
  disabled = false,
  saving,
  start,
  end,
  days,
  onEnabledChange,
  onStartChange,
  onEndChange,
  onDaysChange,
}: {
  eyebrow: string
  title: string
  description: string
  open: boolean
  onOpenChange: (open: boolean) => void
  enabled: boolean
  disabled?: boolean
  saving: boolean
  start: string
  end: string
  days: HappyHourDay[]
  onEnabledChange: (enabled: boolean) => void
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
  onDaysChange: (days: HappyHourDay[]) => void
}) {
  const controlsDisabled = disabled || !enabled || saving

  return (
    <details
      className="inventory-happy-hour-range-card"
      open={open}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
    >
      <summary className="inventory-happy-hour-range-card-summary">
        <div>
          <span>{eyebrow}</span>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <strong>{open ? 'Collapse' : 'Expand'}</strong>
      </summary>

      <div className="inventory-happy-hour-range-card-body">
        <label className="inventory-inline-toggle inventory-happy-hour-toggle">
          <input
            type="checkbox"
            checked={enabled}
            disabled={disabled || saving}
            onChange={(event) => onEnabledChange(event.target.checked)}
          />
          <span>{enabled ? 'Enabled' : 'Disabled'}</span>
        </label>

        <div className="inventory-happy-hour-range-times">
          <label className="inventory-search-control">
            <span>Start</span>
            <input
              type="time"
              value={start}
              disabled={controlsDisabled}
              onChange={(event) => onStartChange(event.target.value)}
            />
          </label>

          <label className="inventory-search-control">
            <span>End</span>
            <input
              type="time"
              value={end}
              disabled={controlsDisabled}
              onChange={(event) => onEndChange(event.target.value)}
            />
          </label>
        </div>

        <fieldset
          className="inventory-happy-hour-days"
          disabled={controlsDisabled}
        >
          <legend>Days</legend>
          <div className="inventory-happy-hour-day-options">
            {HAPPY_HOUR_DAY_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  type="checkbox"
                  checked={days.includes(option.value)}
                  onChange={(event) => {
                    onDaysChange(
                      event.target.checked
                        ? ALL_HAPPY_HOUR_DAYS.filter(
                            (day) => day === option.value || days.includes(day),
                          )
                        : days.filter((day) => day !== option.value),
                    )
                  }}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </details>
  )
}

function getMenuCategoryFlags(
  config: InventoryOrganizationConfig,
): MenuCategoryFlags {
  return {
    retailEnabled: config.retailEnabled === true,
    openItemsEnabled: config.openItemsEnabled === true,
  }
}

function getBeerFormatTitle(category: OptionalBeerCategoryConfig) {
  return isDefaultOptionalBeerCategoryLabel(category.label, category.slot - 1)
    ? 'Custom Beer format'
    : category.label.trim()
}

function buildOptionalBeerCategoryConfig(
  categories: readonly OptionalBeerCategoryConfig[],
): Pick<
  InventoryOrganizationConfig,
  | 'optionalBeerCategory1Enabled'
  | 'optionalBeerCategory1Label'
  | 'optionalBeerCategory2Enabled'
  | 'optionalBeerCategory2Label'
  | 'optionalBeerCategory3Enabled'
  | 'optionalBeerCategory3Label'
  | 'optionalBeerCategory4Enabled'
  | 'optionalBeerCategory4Label'
  | 'optionalBeerCategory5Enabled'
  | 'optionalBeerCategory5Label'
> {
  const [slot1, slot2, slot3, slot4, slot5] = categories

  return {
    optionalBeerCategory1Enabled: slot1?.enabled ?? false,
    optionalBeerCategory1Label:
      slot1?.label ?? 'Optional Beer Category 1',
    optionalBeerCategory2Enabled: slot2?.enabled ?? false,
    optionalBeerCategory2Label:
      slot2?.label ?? 'Optional Beer Category 2',
    optionalBeerCategory3Enabled: slot3?.enabled ?? false,
    optionalBeerCategory3Label:
      slot3?.label ?? 'Optional Beer Category 3',
    optionalBeerCategory4Enabled: slot4?.enabled ?? false,
    optionalBeerCategory4Label:
      slot4?.label ?? 'Optional Beer Category 4',
    optionalBeerCategory5Enabled: slot5?.enabled ?? false,
    optionalBeerCategory5Label:
      slot5?.label ?? 'Optional Beer Category 5',
  }
}

function getBuiltInBeerFormatSettings(
  config: InventoryOrganizationConfig,
): BuiltInBeerFormatSettings {
  return {
    draft8Enabled: config.draft8Enabled,
    draft8ActualSizeOz: 8,
    draft16Enabled: config.draft16Enabled,
    draft16ActualSizeOz: 16,
    draft24Enabled: config.draft24Enabled,
    draft24ActualSizeOz: 24,
    pitcherEnabled: config.pitcherEnabled,
    pitcherActualSizeOz: null,
    canEnabled: config.canEnabled,
    bottleEnabled: config.bottleEnabled,
  }
}

function getEffectiveOptionalBeerCategories(
  savedCategories: readonly OptionalBeerCategoryConfig[],
  items: readonly NormalizedMenuItem[],
): OptionalBeerCategoryConfig[] {
  const categories = savedCategories.map((category) => ({ ...category }))
  const assignedDraftSizes = new Set(
    categories.flatMap((category) => {
      const draftSizeOz = parseDraftSize(category.label)
      return draftSizeOz === null ? [] : [draftSizeOz]
    }),
  )
  const customDraftSizes = getCustomDraftSizesFromCatalog(items)
    .filter((sizeOz) => !assignedDraftSizes.has(sizeOz))
    .sort((left, right) => left - right)
  let nextCustomDraftSizeIndex = 0

  return categories.map((category, index) => {
    const configuredDraftSize = parseDraftSize(category.label)
    const hasCustomLabel = !isDefaultOptionalBeerCategoryLabel(
      category.label,
      index,
    )

    if (category.enabled || configuredDraftSize !== null || hasCustomLabel) {
      return category
    }

    const customDraftSize = customDraftSizes[nextCustomDraftSizeIndex]
    if (customDraftSize === undefined) return category

    nextCustomDraftSizeIndex += 1
    return {
      ...category,
      enabled: true,
      label: formatDraftSizeLabel(customDraftSize),
    }
  })
}

function getCustomDraftSizesFromCatalog(items: readonly NormalizedMenuItem[]) {
  const sizes = new Set<number>()

  items.forEach((item) => {
    if (item.organizationEnabled !== true || item.variantKind !== 'draft') return

    const sizeOz =
      item.variantSizeOz ?? parseDraftSize(item.variantLabel ?? '')
    if (sizeOz !== null && ![8, 16, 24].includes(sizeOz)) {
      sizes.add(sizeOz)
    }
  })

  return [...sizes]
}

function parseDraftSize(label: string) {
  const match =
    label.match(/\b(\d+(?:\.\d+)?)\s*oz\b/i) ??
    label.match(/^\s*(\d+(?:\.\d+)?)\s*$/)
  if (!match) return null

  const parsed = Number(match[1])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function formatDraftSizeLabel(sizeOz: number) {
  return `${Number.isInteger(sizeOz) ? sizeOz.toString() : sizeOz.toFixed(1)}oz`
}

function isDefaultOptionalBeerCategoryLabel(label: string, index: number) {
  const normalized = label.trim().toLowerCase()
  return (
    !normalized ||
    normalized === `optional beer category ${index + 1}`
  )
}

function getVisibleOptionalBeerCategoryCount(
  categories: readonly OptionalBeerCategoryConfig[],
) {
  let visibleCount = 0

  categories.forEach((category, index) => {
    if (category.enabled) visibleCount = index + 1
  })

  return visibleCount
}
