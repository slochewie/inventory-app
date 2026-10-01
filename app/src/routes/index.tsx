import { createFileRoute } from '@tanstack/react-router'
import { CircleCheckBig, CircleOff, CircleX, DollarSign, Info, ListChecks, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AuthenticatedInventoryShell,
  useInventoryAccessRole,
} from '#/components/authenticated-inventory-shell'
import { catalogRowToNormalizedItem } from '#/features/menu-import/catalog'
import { formatCurrency, type NormalizedMenuItem } from '#/features/menu-import/types'
import { authClient } from '#/lib/auth-client'
import {
  addInventoryOrganizationVariant,
  getInventoryOrganizationConfig,
  getOptionalBeerCategories,
  listInventoryCatalog,
  mergeInventoryItems,
  updateInventoryItemCategory,
  updateInventoryOrganizationVariant,
  updateInventoryOrganizationVariants,
  type InventoryOrganizationConfig,
  type OptionalBeerCategoryConfig,
} from '#/lib/inventory-access'
import { ManualItemEditor } from './manual-item'

export const Route = createFileRoute('/')({ component: CatalogPage })

type AvailabilityFilter = 'carried' | 'not-carried' | 'all'

const DEFAULT_PAGE_SIZE = 50
const PAGE_SIZE_OPTIONS = [25, 50, 100, 250] as const


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
  const [addingFormatKey, setAddingFormatKey] = useState<string | null>(null)
  const [bulkEditEnabled, setBulkEditEnabled] = useState(false)
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [bulkHelpOpen, setBulkHelpOpen] = useState(false)
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false)
  const [bulkPriceStep, setBulkPriceStep] = useState<'entry' | 'review'>('entry')
  const [bulkPriceValue, setBulkPriceValue] = useState('')
  const [bulkHelpPosition, setBulkHelpPosition] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
  } | null>(null)
  const bulkHelpRef = useRef<HTMLDivElement>(null)
  const bulkHelpButtonRef = useRef<HTMLButtonElement>(null)
  const bulkHelpPopoverRef = useRef<HTMLDivElement>(null)
  const [selectedBulkGroupIds, setSelectedBulkGroupIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [optionalBeerCategories, setOptionalBeerCategories] = useState<OptionalBeerCategoryConfig[]>([])
  const [organizationConfig, setOrganizationConfig] =
    useState<InventoryOrganizationConfig | null>(null)


  useEffect(() => {
    if (!activeOrganization?.id) {
      setItems([])
      setOrganizationConfig(null)
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
        setOrganizationConfig(organizationConfig)
        setItems(catalogItems)
        setSelectedGroupId(null)
        setPage(1)

        const nextOptionalBeerCategories = getOptionalBeerCategories(organizationConfig)
        setOptionalBeerCategories(
          getEffectiveOptionalBeerCategoriesForCatalog(
            nextOptionalBeerCategories,
            catalogItems,
          ),
        )
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

  const pageCount = Math.max(1, Math.ceil(filteredGroups.length / pageSize))
  const clampedPage = Math.min(page, pageCount)
  const pageStart = (clampedPage - 1) * pageSize
  const pageGroups = filteredGroups.slice(pageStart, pageStart + pageSize)
  const pageEnd = pageStart + pageGroups.length
  const pageGroupIds = pageGroups.map((group) => group.id)
  const allVisibleSelected =
    pageGroupIds.length > 0 &&
    pageGroupIds.every((groupId) => selectedBulkGroupIds.has(groupId))

  useEffect(() => {
    setPage(1)
  }, [availability, category, query])

  useEffect(() => {
    setSelectedBulkGroupIds(new Set())
  }, [availability, category, query, clampedPage, pageSize])

  useEffect(() => {
    if (!bulkEditEnabled) setSelectedBulkGroupIds(new Set())
  }, [bulkEditEnabled])

  useEffect(() => {
    if (!bulkHelpOpen) {
      setBulkHelpPosition(null)
      return
    }

    function positionBulkHelp() {
      const trigger = bulkHelpButtonRef.current
      const popover = bulkHelpPopoverRef.current
      if (!trigger || !popover) return

      const viewportPadding = 16
      const gap = 10
      const triggerRect = trigger.getBoundingClientRect()
      const width = Math.min(384, window.innerWidth - viewportPadding * 2)
      const naturalHeight = Math.min(popover.scrollHeight, 480)
      const spaceBelow =
        window.innerHeight - triggerRect.bottom - gap - viewportPadding
      const spaceAbove = triggerRect.top - gap - viewportPadding
      const placeBelow =
        spaceBelow >= naturalHeight || spaceBelow >= spaceAbove
      const availableSpace = placeBelow ? spaceBelow : spaceAbove
      const maxHeight = Math.max(96, availableSpace)
      const renderedHeight = Math.min(naturalHeight, maxHeight)

      const idealLeft =
        triggerRect.left + triggerRect.width / 2 - width / 2
      const left = Math.min(
        Math.max(viewportPadding, idealLeft),
        Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
      )
      const idealTop = placeBelow
        ? triggerRect.bottom + gap
        : triggerRect.top - gap - renderedHeight
      const top = Math.min(
        Math.max(viewportPadding, idealTop),
        Math.max(viewportPadding, window.innerHeight - renderedHeight - viewportPadding),
      )

      setBulkHelpPosition({
        top,
        left,
        width,
        maxHeight,
      })
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (
        target instanceof Node &&
        bulkHelpRef.current &&
        !bulkHelpRef.current.contains(target)
      ) {
        setBulkHelpOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setBulkHelpOpen(false)
      }
    }

    const frame = window.requestAnimationFrame(positionBulkHelp)
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', positionBulkHelp)
    window.addEventListener('scroll', positionBulkHelp, true)

    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', positionBulkHelp)
      window.removeEventListener('scroll', positionBulkHelp, true)
    }
  }, [bulkHelpOpen])

  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ?? null

  function toggleBulkGroup(groupId: string) {
    setSelectedBulkGroupIds((current) => {
      const next = new Set(current)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  function toggleAllVisibleBulkGroups() {
    setSelectedBulkGroupIds((current) => {
      const next = new Set(current)
      if (allVisibleSelected) {
        pageGroupIds.forEach((groupId) => next.delete(groupId))
      } else {
        pageGroupIds.forEach((groupId) => next.add(groupId))
      }
      return next
    })
  }

  function getBulkPriceItems() {
    return pageGroups.flatMap((group) => {
      if (!selectedBulkGroupIds.has(group.id)) return []

      return group.items
        .filter((item) => item.organizationEnabled === true)
        .map((item) => ({
          id: item.id,
          itemName: group.name,
          format: item.variantLabel || 'Standard',
          currentPriceCents: item.basePriceCents,
        }))
    })
  }

  function openBulkPrice() {
    if (selectedBulkGroupIds.size === 0 || bulkUpdating) return
    setBulkPriceStep('entry')
    setBulkPriceValue('')
    setBulkPriceOpen(true)
  }

  function closeBulkPrice() {
    if (bulkUpdating) return
    setBulkPriceOpen(false)
    setBulkPriceStep('entry')
    setBulkPriceValue('')
  }

  function parseBulkPriceCents() {
    const numeric = Number(bulkPriceValue)
    if (!Number.isFinite(numeric) || numeric < 0) return null
    return Math.round(numeric * 100)
  }

  async function saveBulkPrice() {
    if (!canEdit || !activeOrganization?.id || bulkUpdating) return

    const priceCents = parseBulkPriceCents()
    const affectedItems = getBulkPriceItems()
    if (priceCents === null || affectedItems.length === 0) return

    setBulkUpdating(true)
    setError(null)

    try {
      await updateInventoryOrganizationVariants({
        organizationId: activeOrganization.id,
        variantIds: affectedItems.map((item) => item.id),
        priceOverrideCents: priceCents,
      })

      const catalog = await listInventoryCatalog(activeOrganization.id)
      setItems(catalog.items.map(catalogRowToNormalizedItem))
      setSelectedBulkGroupIds(new Set())
      setBulkPriceOpen(false)
      setBulkPriceStep('entry')
      setBulkPriceValue('')
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to apply the bulk price update.',
      )
    } finally {
      setBulkUpdating(false)
    }
  }

  function getBulkVariantIds(action: 'enable' | 'disable' | 'export' | 'no-export') {
    const selectedGroups = pageGroups.filter((group) =>
      selectedBulkGroupIds.has(group.id),
    )

    return [
      ...new Set(
        selectedGroups.flatMap((group) => {
          if (action === 'enable') {
            if (isBeerCategoryName(group.category) && organizationConfig) {
              return group.items
                .filter((item) =>
                  isBeerVariantEnabledForOrganization(
                    item,
                    organizationConfig,
                    optionalBeerCategories,
                  ),
                )
                .map((item) => item.id)
            }
            return group.items.map((item) => item.id)
          }

          return group.items
            .filter((item) => item.organizationEnabled === true)
            .map((item) => item.id)
        }),
      ),
    ]
  }

  async function applyBulkAction(
    action: 'enable' | 'disable' | 'export' | 'no-export',
  ) {
    if (
      !canEdit ||
      !activeOrganization?.id ||
      selectedBulkGroupIds.size === 0 ||
      bulkUpdating
    ) {
      return
    }

    const variantIds = getBulkVariantIds(action)
    if (variantIds.length === 0) return

    setBulkUpdating(true)
    setError(null)

    try {
      await updateInventoryOrganizationVariants({
        organizationId: activeOrganization.id,
        variantIds,
        ...(action === 'enable'
          ? { enabled: true }
          : action === 'disable'
            ? { enabled: false }
            : action === 'export'
              ? { exportToToast: true }
              : { exportToToast: false }),
      })

      const catalog = await listInventoryCatalog(activeOrganization.id)
      setItems(catalog.items.map(catalogRowToNormalizedItem))
      setSelectedBulkGroupIds(new Set())
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to apply the bulk Catalog update.',
      )
    } finally {
      setBulkUpdating(false)
    }
  }

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

  async function addOrganizationBeerFormat(
    group: CatalogGroup,
    format: BeerFormatOption,
  ) {
    if (!canEdit || !activeOrganization?.id || addingFormatKey) return

    setAddingFormatKey(format.key)
    setError(null)

    try {
      await addInventoryOrganizationVariant({
        organizationId: activeOrganization.id,
        itemId: group.id,
        toastCategory: 'Beer',
        toastDestination: format.toastDestination,
        toastSlot: format.toastSlot,
      })

      const catalog = await listInventoryCatalog(activeOrganization.id)
      setItems(catalog.items.map(catalogRowToNormalizedItem))
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to add the Beer format.',
      )
    } finally {
      setAddingFormatKey(null)
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

    if (Object.hasOwn(patch, 'toastSlot')) {
      payload.toastSlot = patch.toastSlot ?? null
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


  async function refreshCatalogAfterManualAdd() {
    if (!activeOrganization?.id) return

    const catalog = await listInventoryCatalog(activeOrganization.id)
    const catalogItems = catalog.items.map(catalogRowToNormalizedItem)

    setItems(catalogItems)
    setSelectedGroupId(null)
    setPage(1)

    if (organizationConfig) {
      setOptionalBeerCategories(
        getEffectiveOptionalBeerCategoriesForCatalog(
          getOptionalBeerCategories(organizationConfig),
          catalogItems,
        ),
      )
    }
  }

  return (
    <AuthenticatedInventoryShell currentPath="/">
      <style>{`
        .inventory-catalog-page .inventory-catalog-toolbar {
          margin-block: 1rem;
        }

        .inventory-catalog-page .inventory-catalog-pagination {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: .65rem;
          flex-wrap: wrap;
        }

        .inventory-catalog-page .inventory-catalog-page-size {
          display: inline-flex;
          align-items: center;
          gap: .45rem;
          margin-right: auto;
          color: #4b5563;
          font-size: .85rem;
          font-weight: 700;
        }

        .inventory-catalog-page .inventory-catalog-page-size select {
          min-height: 2.25rem;
          border: 1px solid #d1d5db;
          border-radius: .55rem;
          background: #fff;
          color: #111827;
          padding: 0 .55rem;
        }

        .inventory-catalog-page .inventory-catalog-bulk-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: .65rem;
          min-height: 3.35rem;
          border-bottom: 1px solid #e5e7eb;
          background: #fff;
          padding: .65rem 1rem;
        }

        .inventory-catalog-page .inventory-catalog-bulk-toggle,
        .inventory-catalog-page .inventory-catalog-bulk-actions > button {
          display: inline-flex;
          min-width: 2.5rem;
          min-height: 2.5rem;
          align-items: center;
          justify-content: center;
          gap: .45rem;
          border: 1px solid #d1d5db;
          border-radius: .65rem;
          background: #fff;
          color: #111827;
          padding: .45rem .65rem;
          font-weight: 800;
        }

        .inventory-catalog-page .inventory-catalog-bulk-toggle[aria-pressed='true'] {
          border-color: #111827;
          background: #111827;
          color: #fff;
        }

        .inventory-catalog-page .inventory-catalog-bulk-help-button {
          display: inline-flex;
          width: 2.5rem;
          height: 2.5rem;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 999px;
          background: #f3f4f6;
          color: #374151;
          padding: 0;
        }

        .inventory-catalog-page .inventory-catalog-bulk-actions {
          display: flex;
          align-items: center;
          gap: .45rem;
          margin-left: auto;
        }

        .inventory-bulk-price-dialog {
          position: fixed;
          inset: 0;
          width: min(42rem, calc(100vw - 2rem));
          max-width: 42rem;
          max-height: min(80dvh, 42rem);
          margin: auto;
          border: 0;
          background: transparent;
          padding: 0;
        }

        .inventory-bulk-price-dialog::backdrop {
          background: rgb(15 23 42 / 45%);
        }

        .inventory-bulk-price-dialog-card {
          display: grid;
          width: 100%;
          max-height: min(80dvh, 42rem);
          overflow: hidden;
          gap: 1rem;
          border: 1px solid #d1d5db;
          border-radius: 1rem;
          background: #fff;
          padding: 1.1rem;
          box-shadow: 0 24px 60px rgb(15 23 42 / 22%);
        }

        @media (hover: none) and (pointer: coarse) {
          .inventory-catalog-page .inventory-catalog-bulk-toolbar {
            display: grid;
            grid-template-columns: auto auto minmax(0, 1fr);
            gap: .55rem;
            padding: .65rem .75rem;
          }

          .inventory-catalog-page .inventory-catalog-bulk-count {
            justify-self: end;
            white-space: nowrap;
          }

          .inventory-catalog-page .inventory-catalog-bulk-actions {
            grid-column: 1 / -1;
            display: grid;
            width: 100%;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: .5rem;
            margin-left: 0;
          }

          .inventory-catalog-page .inventory-catalog-bulk-actions > button {
            width: 100%;
            min-width: 0;
          }

          .inventory-bulk-price-dialog {
            width: min(40rem, calc(100vw - 2rem));
            max-height: min(78dvh, 40rem);
          }

          .inventory-bulk-price-dialog-card {
            max-height: min(78dvh, 40rem);
          }
        }

        @media (max-width: 700px) {
          .inventory-bulk-price-dialog {
            width: calc(100vw - 1rem);
            max-height: calc(100dvh - 1rem);
          }

          .inventory-bulk-price-dialog-card {
            max-height: calc(100dvh - 1rem);
            padding: .9rem;
          }
        }
      `}</style>
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
          <ManualItemEditor onCreated={refreshCatalogAfterManualAdd} />
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
            <span>Menu Category</span>
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

          {canEdit ? (
            <div
              className={`inventory-catalog-bulk-toolbar${bulkEditEnabled ? ' is-active' : ''}`}
              aria-label="Bulk Catalog controls"
            >
              <button
                type="button"
                className="inventory-catalog-bulk-toggle"
                aria-pressed={bulkEditEnabled}
                title={bulkEditEnabled ? 'Exit bulk edit' : 'Bulk edit'}
                onClick={() => setBulkEditEnabled((current) => !current)}
              >
                <ListChecks aria-hidden="true" />
                <span>Bulk edit</span>
              </button>

              <div ref={bulkHelpRef} className="inventory-catalog-bulk-help">
                <button
                  type="button"
                  ref={bulkHelpButtonRef}
                  className="inventory-catalog-bulk-help-button"
                  aria-label="Bulk edit button key"
                  aria-expanded={bulkHelpOpen}
                  title="Bulk edit button key"
                  onClick={() => setBulkHelpOpen((current) => !current)}
                >
                  <Info aria-hidden="true" />
                </button>

                {bulkHelpOpen ? (
                  <div
                    ref={bulkHelpPopoverRef}
                    className="inventory-catalog-bulk-help-popover"
                    role="dialog"
                    aria-label="Bulk edit button key"
                    style={{
                      position: 'fixed',
                      top: bulkHelpPosition?.top ?? 0,
                      left: bulkHelpPosition?.left ?? 0,
                      right: 'auto',
                      bottom: 'auto',
                      width: bulkHelpPosition?.width ?? 320,
                      maxWidth: 'none',
                      maxHeight: bulkHelpPosition?.maxHeight ?? 320,
                      overflowY: 'auto',
                      visibility: bulkHelpPosition ? 'visible' : 'hidden',
                    }}
                  >
                    <strong>Bulk edit key</strong>
                    <div>
                      <span><CircleCheckBig aria-hidden="true" /></span>
                      <p><b>Available here</b> — carry the selected items at this organization.</p>
                    </div>
                    <div>
                      <span><CircleX aria-hidden="true" /></span>
                      <p><b>Not carried here</b> — disable the selected items for this organization.</p>
                    </div>
                    <div>
                      <span><Upload aria-hidden="true" /></span>
                      <p><b>Export to Toast</b> — include the selected carried items in Toast export.</p>
                    </div>
                    <div>
                      <span><CircleOff aria-hidden="true" /></span>
                      <p><b>Do not export</b> — keep the selected items carried but exclude them from Toast export.</p>
                    </div>
                    <div>
                      <span><DollarSign aria-hidden="true" /></span>
                      <p><b>Set price</b> — review and apply one price to the carried formats in the selected rows.</p>
                    </div>
                  </div>
                ) : null}
              </div>

              {bulkEditEnabled ? (
                <>
                  <span className="inventory-catalog-bulk-count">
                    {selectedBulkGroupIds.size} selected
                  </span>
                  <div className="inventory-catalog-bulk-actions">
                    <button
                      type="button"
                      title="Set selected items available here"
                      aria-label="Set selected items available here"
                      disabled={selectedBulkGroupIds.size === 0 || bulkUpdating}
                      onClick={() => void applyBulkAction('enable')}
                    >
                      <CircleCheckBig aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title="Set selected items not carried here"
                      aria-label="Set selected items not carried here"
                      disabled={selectedBulkGroupIds.size === 0 || bulkUpdating}
                      onClick={() => void applyBulkAction('disable')}
                    >
                      <CircleX aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title="Export selected items to Toast"
                      aria-label="Export selected items to Toast"
                      disabled={selectedBulkGroupIds.size === 0 || bulkUpdating}
                      onClick={() => void applyBulkAction('export')}
                    >
                      <Upload aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title="Stop exporting selected items to Toast"
                      aria-label="Stop exporting selected items to Toast"
                      disabled={selectedBulkGroupIds.size === 0 || bulkUpdating}
                      onClick={() => void applyBulkAction('no-export')}
                    >
                      <CircleOff aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title="Set price for selected items"
                      aria-label="Set price for selected items"
                      disabled={selectedBulkGroupIds.size === 0 || bulkUpdating}
                      onClick={openBulkPrice}
                    >
                      <DollarSign aria-hidden="true" />
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {bulkPriceOpen ? (
            <BulkPriceDialog
              items={getBulkPriceItems()}
              priceValue={bulkPriceValue}
              step={bulkPriceStep}
              saving={bulkUpdating}
              onPriceChange={setBulkPriceValue}
              onReview={() => setBulkPriceStep('review')}
              onBack={() => setBulkPriceStep('entry')}
              onCancel={closeBulkPrice}
              onSave={() => void saveBulkPrice()}
            />
          ) : null}

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
                    {bulkEditEnabled ? (
                      <th className="inventory-catalog-select-column">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          aria-label="Select all visible rows"
                          onChange={toggleAllVisibleBulkGroups}
                        />
                      </th>
                    ) : null}
                    <th>Item</th>
                    <th className="inventory-catalog-price-column">Price</th>
                    <th className="inventory-catalog-happy-hour-column">Happy hour</th>
                    <th className="inventory-catalog-availability-column">Available here</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pageGroups.map((group) => {
                    const organizationVisibleItems =
                      isBeerCategoryName(group.category) && organizationConfig
                        ? group.items.filter((item) =>
                            isBeerVariantEnabledForOrganization(
                              item,
                              organizationConfig,
                              optionalBeerCategories,
                            ),
                          )
                        : group.items
                    const carried = organizationVisibleItems.some(
                      (item) => item.organizationEnabled === true,
                    )
                    const visibleItems =
                      availability === 'carried'
                        ? organizationVisibleItems.filter(
                            (item) => item.organizationEnabled === true,
                          )
                        : organizationVisibleItems

                    return (
                      <tr
                        key={group.id}
                        className={`inventory-catalog-row${selectedBulkGroupIds.has(group.id) ? ' is-selected' : ''}`}
                        tabIndex={0}
                        onClick={() => setSelectedGroupId(group.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setSelectedGroupId(group.id)
                          }
                        }}
                      >
                        {bulkEditEnabled ? (
                          <td
                            className="inventory-catalog-select-column"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={selectedBulkGroupIds.has(group.id)}
                              aria-label={`Select ${group.name}`}
                              onChange={() => toggleBulkGroup(group.id)}
                            />
                          </td>
                        ) : null}
                        <td>
                          <div className="inventory-catalog-item-cell">
                            <strong>{group.name}</strong>
                            <span>{group.category}</span>
                            <div className="inventory-format-list">
                              {visibleItems.map((item) => (
                                <span key={item.id}>
                                  {item.variantLabel || 'Standard'}
                                </span>
                              ))}
                            </div>
                          </div>
                        </td>
                        <td className="inventory-catalog-price-column">{getPriceRange(visibleItems)}</td>
                        <td className="inventory-catalog-happy-hour-column">{getHappyHourRange(visibleItems)}</td>
                        <td className="inventory-catalog-availability-column">
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

          {filteredGroups.length > PAGE_SIZE_OPTIONS[0] ? (
            <div className="inventory-catalog-pagination" aria-label="Catalog pagination">
              <label className="inventory-catalog-page-size">
                <span>Max records</span>
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value))
                    setPage(1)
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>

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
            optionalBeerCategories={optionalBeerCategories}
            organizationConfig={organizationConfig}
            addingFormatKey={addingFormatKey}
            savingVariantId={savingVariantId}
            merging={mergingItemId === selectedGroup.id}
            onClose={() => setSelectedGroupId(null)}
            onAddBeerFormat={addOrganizationBeerFormat}
            onUpdate={updateVariant}
            onUpdateCategory={updateGroupCategory}
            onMerge={mergeGroup}
          />
        ) : null}
      </section>
    </AuthenticatedInventoryShell>
  )
}

function BulkPriceDialog({
  items,
  priceValue,
  step,
  saving,
  onPriceChange,
  onReview,
  onBack,
  onCancel,
  onSave,
}: {
  items: Array<{
    id: string
    itemName: string
    format: string
    currentPriceCents: number | null
  }>
  priceValue: string
  step: 'entry' | 'review'
  saving: boolean
  onPriceChange: (value: string) => void
  onReview: () => void
  onBack: () => void
  onCancel: () => void
  onSave: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const numericPrice = Number(priceValue)
  const validPrice =
    priceValue.trim() !== '' &&
    Number.isFinite(numericPrice) &&
    numericPrice >= 0
  const nextPrice = validPrice ? formatCurrency(Math.round(numericPrice * 100)) : '—'

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="inventory-bulk-price-dialog"
      aria-labelledby="inventory-bulk-price-title"
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div className="inventory-bulk-price-dialog-card">
        <div className="inventory-bulk-price-dialog-heading">
          <div>
            <p className="inventory-kicker">Bulk edit</p>
            <h2 id="inventory-bulk-price-title">
              {step === 'entry' ? 'Set price' : 'Review price changes'}
            </h2>
          </div>
        </div>

        {step === 'entry' ? (
          <>
            <p className="inventory-bulk-price-dialog-copy">
              Enter the new price. Nothing changes until you review the affected items and confirm the update.
            </p>
            <label className="inventory-bulk-price-field">
              <span>New price</span>
              <div>
                <span aria-hidden="true">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={priceValue}
                  disabled={saving}
                  onChange={(event) => onPriceChange(event.target.value)}
                  placeholder="0.00"
                  autoFocus
                />
              </div>
            </label>
            <p className="inventory-bulk-price-note">
              {items.length} carried format{items.length === 1 ? '' : 's'} will be reviewed. Selected rows with no carried format are not changed.
            </p>
            <div className="inventory-bulk-price-actions">
              <button
                type="button"
                className="inventory-secondary-button"
                disabled={saving}
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inventory-primary-button"
                disabled={!validPrice || items.length === 0 || saving}
                onClick={onReview}
              >
                Review changes
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="inventory-bulk-price-warning">
              <strong>Are you sure?</strong>
              <span>
                Confirming will change the price for {items.length} carried format{items.length === 1 ? '' : 's'}.
              </span>
            </div>
            <div className="inventory-bulk-price-review">
              <div className="inventory-bulk-price-review-head">
                <span>Item</span>
                <span>Current</span>
                <span>New</span>
              </div>
              {items.map((item) => (
                <div key={item.id} className="inventory-bulk-price-review-row">
                  <div>
                    <strong>{item.itemName}</strong>
                    <span>{item.format}</span>
                  </div>
                  <span>
                    {item.currentPriceCents === null
                      ? '—'
                      : formatCurrency(item.currentPriceCents)}
                  </span>
                  <strong>{nextPrice}</strong>
                </div>
              ))}
            </div>
            <div className="inventory-bulk-price-actions">
              <button
                type="button"
                className="inventory-secondary-button"
                disabled={saving}
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inventory-secondary-button"
                disabled={saving}
                onClick={onBack}
              >
                Back
              </button>
              <button
                type="button"
                className="inventory-primary-button"
                disabled={!validPrice || items.length === 0 || saving}
                onClick={onSave}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  )
}

function CatalogDrawer({
  group,
  canEdit,
  canMerge,
  allGroups,
  categoryOptions,
  optionalBeerCategories,
  organizationConfig,
  addingFormatKey,
  savingVariantId,
  merging,
  onClose,
  onAddBeerFormat,
  onUpdate,
  onUpdateCategory,
  onMerge,
}: {
  group: CatalogGroup
  canEdit: boolean
  canMerge: boolean
  allGroups: CatalogGroup[]
  categoryOptions: CatalogCategoryOption[]
  optionalBeerCategories: OptionalBeerCategoryConfig[]
  organizationConfig: InventoryOrganizationConfig | null
  addingFormatKey: string | null
  savingVariantId: string | null
  merging: boolean
  onClose: () => void
  onAddBeerFormat: (
    group: CatalogGroup,
    format: BeerFormatOption,
  ) => Promise<void>
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
  }, [group.id, group.items])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  const [mergeTargetId, setMergeTargetId] = useState('')
  const mergeCandidates = allGroups.filter((candidate) => candidate.id !== group.id)
  const categoryChanged =
    Boolean(draftCategoryId) && draftCategoryId !== (group.categoryId ?? '')
  const selectedCategoryName =
    categoryOptions.find((option) => option.id === draftCategoryId)?.name ??
    group.category
  const selectedCategoryIsBeer = isBeerCategoryName(selectedCategoryName)
  const carriedCount =
    selectedCategoryIsBeer && organizationConfig
      ? draftItems.filter(
          (item) =>
            item.organizationEnabled === true &&
            isBeerVariantEnabledForOrganization(
              item,
              organizationConfig,
              optionalBeerCategories,
            ),
        ).length
      : draftItems.filter((item) => item.organizationEnabled === true).length
  const visibleDraftItems =
    selectedCategoryIsBeer && organizationConfig
      ? draftItems.filter(
          (item) =>
            item.organizationEnabled === true &&
            isBeerVariantEnabledForOrganization(
              item,
              organizationConfig,
              optionalBeerCategories,
            ),
        )
      : draftItems
  const availableBeerFormats =
    selectedCategoryIsBeer && organizationConfig
      ? getAvailableBeerFormats(
          organizationConfig,
          optionalBeerCategories,
        ).filter((format) =>
          !draftItems.some((item) => beerItemMatchesFormat(item, format)),
        )
      : []

  const hasChanges = categoryChanged || draftItems.some((draftItem) => {
    const original = group.items.find((item) => item.id === draftItem.id)
    if (!original) return true

    return (
      draftItem.name !== original.name ||
      draftItem.organizationEnabled !== original.organizationEnabled ||
      draftItem.exportToToast !== original.exportToToast ||
      draftItem.basePriceCents !== original.basePriceCents ||
      draftItem.happyHourPriceCents !== original.happyHourPriceCents ||
      draftItem.toastSlot !== original.toastSlot
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
        if (!selectedCategoryIsBeer) {
          if (draftItem.toastSlot !== null || original.toastSlot !== null) {
            patch.toastSlot = null
          }
        } else if (draftItem.toastSlot !== original.toastSlot) {
          patch.toastSlot = draftItem.toastSlot
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
          <p className="inventory-kicker">{selectedCategoryName}</p>
          <h2 id="inventory-catalog-drawer-title">{group.name}</h2>
          <p>
            {visibleDraftItems.length} format{visibleDraftItems.length === 1 ? '' : 's'} · {carriedCount} available here
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
          {visibleDraftItems.map((item) => {
            const saving = savingVariantId === item.id

            return (
              <article key={item.id} className="inventory-catalog-variant-card">
                <div className="inventory-catalog-variant-heading">
                  <div>
                    <strong>{item.variantLabel || 'Standard'}</strong>
                    <span>
                      {getVariantDestinationLabel(item, selectedCategoryName)}
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

                {selectedCategoryIsBeer && item.variantKind !== 'draft' ? (
                  <label className="inventory-search-control">
                    <span>Toast beer slot</span>
                    <select
                      value={item.toastSlot ?? ''}
                      disabled={!canEdit || saving || updating}
                      onChange={(event) =>
                        updateDraft(item.id, {
                          toastSlot: event.target.value || null,
                        })
                      }
                    >
                      <option value="">Standard Toast placement</option>
                      {optionalBeerCategories
                        .filter(
                          (category) =>
                            category.enabled || category.key === item.toastSlot,
                        )
                        .map((category) => (
                          <option key={category.key} value={category.key}>
                            {category.label}
                            {!category.enabled ? ' (disabled)' : ''}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}

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
                  <span>{getVariantCategoryMetaLabel(item, selectedCategoryName)}</span>
                  {saving ? <span className="inventory-save-note">Saving…</span> : null}
                </div>
              </article>
            )
          })}
        </div>

        {availableBeerFormats.length > 0 ? (
          <div className="inventory-drawer-section">
            <div className="inventory-drawer-section-heading">
              <div>
                <p className="inventory-kicker">Enabled for this organization</p>
                <h3>Add format</h3>
              </div>
            </div>
            <div className="inventory-draft-slots-actions">
              {availableBeerFormats.map((format) => (
                <button
                  key={format.key}
                  type="button"
                  className="inventory-secondary-button"
                  disabled={
                    !canEdit ||
                    updating ||
                    savingVariantId !== null ||
                    addingFormatKey !== null
                  }
                  onClick={() => void onAddBeerFormat(group, format)}
                >
                  {addingFormatKey === format.key
                    ? 'Adding…'
                    : `Add ${format.label}`}
                </button>
              ))}
            </div>
          </div>
        ) : null}
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

type BeerFormatOption = {
  key: string
  label: string
  toastDestination: string
  toastSlot: string | null
  kind: 'draft' | 'can' | 'bottle'
  sizeOz: number | null
}

function getAvailableBeerFormats(
  config: InventoryOrganizationConfig,
  optionalBeerCategories: readonly OptionalBeerCategoryConfig[],
): BeerFormatOption[] {
  const formats: BeerFormatOption[] = []

  if (config.draft8Enabled) {
    formats.push({
      key: 'draft-8',
      label: '8oz Draft',
      toastDestination: 'Beer tab · Draft Beer 8oz',
      toastSlot: null,
      kind: 'draft',
      sizeOz: 8,
    })
  }
  if (config.draft16Enabled) {
    formats.push({
      key: 'draft-16',
      label: '16oz Draft',
      toastDestination: 'Beer tab · Draft Beer 16oz',
      toastSlot: null,
      kind: 'draft',
      sizeOz: 16,
    })
  }
  if (config.draft24Enabled) {
    formats.push({
      key: 'draft-24',
      label: '24oz Draft',
      toastDestination: 'Beer tab · Draft Beer 24oz',
      toastSlot: null,
      kind: 'draft',
      sizeOz: 24,
    })
  }
  if (config.pitcherEnabled) {
    formats.push({
      key: 'pitcher',
      label: 'Pitcher',
      toastDestination: 'Beer tab · Pitcher',
      toastSlot: null,
      kind: 'draft',
      sizeOz: null,
    })
  }
  if (config.canEnabled) {
    formats.push({
      key: 'can',
      label: 'Can',
      toastDestination: 'Beer tab · Can',
      toastSlot: null,
      kind: 'can',
      sizeOz: null,
    })
  }
  if (config.bottleEnabled) {
    formats.push({
      key: 'bottle',
      label: 'Bottle',
      toastDestination: 'Beer tab · Bottle',
      toastSlot: null,
      kind: 'bottle',
      sizeOz: null,
    })
  }

  optionalBeerCategories
    .filter((category) => category.enabled)
    .forEach((category) => {
      const sizeOz = parseOptionalBeerCategoryDraftSize(category.label)
      const normalized = category.label.toLowerCase()
      const isCan = normalized.includes('can')

      formats.push({
        key: category.key,
        label: category.label,
        toastDestination:
          sizeOz !== null && !isCan
            ? `Beer tab · Draft Beer ${sizeOz}oz`
            : isCan
              ? `Beer tab · ${category.label}`
              : `Beer tab · ${category.label}`,
        toastSlot: category.key,
        kind: isCan ? 'can' : 'draft',
        sizeOz,
      })
    })

  return formats
}

function beerItemMatchesFormat(
  item: NormalizedMenuItem,
  format: BeerFormatOption,
) {
  if (format.kind === 'draft') {
    return item.variantKind === 'draft' && item.variantSizeOz === format.sizeOz
  }

  if (format.kind === 'can') {
    if (item.variantKind !== 'can') return false
    if (format.sizeOz === null) return item.variantSizeOz === null
    return item.variantSizeOz === format.sizeOz
  }

  return item.variantKind === 'bottle'
}

function isBeerVariantEnabledForOrganization(
  item: NormalizedMenuItem,
  config: InventoryOrganizationConfig,
  optionalBeerCategories: readonly OptionalBeerCategoryConfig[],
) {
  const normalizedVariantLabel = normalizeBeerFormatLabel(item.variantLabel ?? '')
  const matchingCustomCategory = optionalBeerCategories.some(
    (category) =>
      category.enabled &&
      normalizeBeerFormatLabel(category.label) === normalizedVariantLabel,
  )
  if (matchingCustomCategory) return true

  if (item.variantKind === 'draft') {
    if (item.variantSizeOz === 8) return config.draft8Enabled
    if (item.variantSizeOz === 16) return config.draft16Enabled
    if (item.variantSizeOz === 24) return config.draft24Enabled

    if (
      item.variantSizeOz === null &&
      /\bpitcher\b/i.test(item.variantLabel ?? '')
    ) {
      return config.pitcherEnabled
    }

    if (item.variantSizeOz !== null) {
      return optionalBeerCategories.some((category) => {
        if (!category.enabled) return false
        return parseOptionalBeerCategoryDraftSize(category.label) ===
          item.variantSizeOz
      })
    }

    return false
  }

  const packageText = [
    item.variantPackageType ?? '',
    item.variantLabel ?? '',
    item.toastDestination ?? '',
  ]
    .join(' ')
    .toLowerCase()

  if (packageText.includes('bottle') || /\bbtl\b/.test(packageText)) {
    return config.bottleEnabled
  }

  if (packageText.includes('can')) {
    const customPackageMatch = optionalBeerCategories.some(
      (category) =>
        category.enabled &&
        normalizeBeerFormatLabel(category.label) === normalizedVariantLabel,
    )
    return customPackageMatch || config.canEnabled
  }

  return false
}

function normalizeBeerFormatLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function getVariantDestinationLabel(item: NormalizedMenuItem, categoryName: string) {
  const workbookCategory = getCatalogWorkbookCategoryName(categoryName)
  if (workbookCategory && workbookCategory !== 'Beer') {
    return workbookCategory + ' tab'
  }

  return item.toastDestination || 'No Toast destination'
}

function getVariantCategoryMetaLabel(item: NormalizedMenuItem, categoryName: string) {
  const workbookCategory = getCatalogWorkbookCategoryName(categoryName)
  if (workbookCategory && workbookCategory !== 'Beer') {
    return 'Exports to ' + workbookCategory
  }

  return item.toastCategory
}

function getCatalogWorkbookCategoryName(categoryName: string) {
  const normalized = normalizeCatalogCategoryName(categoryName)

  if (normalized === 'beer') return 'Beer'
  if (normalized === 'cocktail' || normalized === 'cocktails') return 'Cocktails'
  if (
    normalized === 'na bev' ||
    normalized === 'na beverage' ||
    normalized === 'na beverages' ||
    normalized === 'non alcoholic' ||
    normalized === 'non-alcoholic'
  ) {
    return 'NA Bev'
  }
  if (normalized === 'retail') return 'Retail'

  return null
}

function isBeerCategoryName(categoryName: string) {
  return normalizeCatalogCategoryName(categoryName) === 'beer'
}

function normalizeCatalogCategoryName(categoryName: string) {
  return categoryName.trim().replace(/\s+/g, ' ').toLowerCase()
}

function getEffectiveOptionalBeerCategoriesForCatalog(
  savedCategories: readonly OptionalBeerCategoryConfig[],
  items: readonly NormalizedMenuItem[],
): OptionalBeerCategoryConfig[] {
  const categories = savedCategories.map((category) => ({ ...category }))
  const assignedDraftSizes = new Set(
    categories.flatMap((category) => {
      const draftSizeOz = parseOptionalBeerCategoryDraftSize(category.label)
      return draftSizeOz === null ? [] : [draftSizeOz]
    }),
  )
  const customDraftSizes = getCustomDraftSizesFromCatalog(items)
    .filter((sizeOz) => !assignedDraftSizes.has(sizeOz))
    .sort((left, right) => left - right)
  let nextCustomDraftSizeIndex = 0

  return categories.map((category, index) => {
    const configuredDraftSize = parseOptionalBeerCategoryDraftSize(category.label)
    const hasCustomLabel = !isDefaultOptionalBeerCategoryLabel(category.label, index)

    if (category.enabled || configuredDraftSize !== null || hasCustomLabel) {
      return category
    }

    const customDraftSize = customDraftSizes[nextCustomDraftSizeIndex]
    if (customDraftSize === undefined) return category

    nextCustomDraftSizeIndex += 1
    return {
      ...category,
      enabled: true,
      label: formatOptionalBeerDraftSizeLabel(customDraftSize),
    }
  })
}

function getCustomDraftSizesFromCatalog(items: readonly NormalizedMenuItem[]) {
  const sizes = new Set<number>()

  items.forEach((item) => {
    if (item.organizationEnabled !== true || item.variantKind !== 'draft') return

    const sizeOz = item.variantSizeOz ?? parseOptionalBeerCategoryDraftSize(item.variantLabel ?? '')
    if (sizeOz !== null && ![8, 16, 24].includes(sizeOz)) {
      sizes.add(sizeOz)
    }
  })

  return [...sizes]
}

function parseOptionalBeerCategoryDraftSize(label: string) {
  const match = label.match(/\b(\d+(?:\.\d+)?)\s*oz\b/i) ??
    label.match(/^\s*(\d+(?:\.\d+)?)\s*$/)
  if (!match) return null

  const parsed = Number(match[1])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function formatOptionalBeerDraftSizeLabel(sizeOz: number) {
  return `${Number.isInteger(sizeOz) ? sizeOz.toString() : sizeOz.toFixed(1)}oz`
}

function isDefaultOptionalBeerCategoryLabel(label: string, index: number) {
  const normalized = label.trim().toLowerCase()
  return !normalized ||
    normalized === `optional beer category ${index + 1}`
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