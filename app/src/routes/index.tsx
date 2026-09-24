import { appDefinitionsById } from '@niteowl/app-config'
import { createFileRoute } from '@tanstack/react-router'
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  AuthenticatedInventoryShell,
  useInventoryAccessRole,
} from '#/components/authenticated-inventory-shell'
import { authClient } from '#/lib/auth-client'
import {
  listInventoryCatalog,
  persistInventoryImport,
  updateInventoryOrganizationVariant,
  updateInventoryOrganizationVariants,
} from '#/lib/inventory-access'
import { normalizeAlohaMenuItems, parseAlohaMenuCsv } from '#/features/menu-import/aloha'
import { buildBeerTabPreviewRows, type BeerTabPreviewRow } from '#/features/menu-import/beer-preview'
import { loadReviewSession } from '#/features/menu-import/review-session'
import { buildToastExportFiles, downloadCsv, type ToastExportFile } from '#/features/menu-import/toast-export'
import { ToastExportPanelView } from '#/features/menu-import/toast-export-panel'
import {
  formatCurrency,
  summarizeMenuItems,
  type NormalizedMenuItem,
  type ParsedMenuImport,
} from '#/features/menu-import/types'
import { catalogRowToNormalizedItem } from '#/features/menu-import/catalog'

export const Route = createFileRoute('/')({ component: Home })

type ItemFilter =
  | 'included'
  | 'excluded'
  | 'active'
  | 'ready'
  | 'review'
  | 'happy-hour'
  | 'ignored'
  | 'all'

type FilterOption = {
  id: ItemFilter
  label: string
  count: number
}

const PAGE_SIZE = 50
const ALL_CATEGORIES = '__all__'
const UNCATEGORIZED = '__uncategorized__'

function Home() {
  const app = appDefinitionsById.inventory
  const { canEdit, canImportExport } = useInventoryAccessRole()
  const [importFile, setImportFile] = useState<ParsedMenuImport | null>(null)
  const [items, setItems] = useState<NormalizedMenuItem[]>([])
  const [importError, setImportError] = useState<string | null>(null)
  const [filter, setFilter] = useState<ItemFilter>('included')
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES)
  const [toastCategoryDraft, setToastCategoryDraft] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [catalogOrganizationId, setCatalogOrganizationId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle")
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [itemSaveError, setItemSaveError] = useState<string | null>(null)

  const summary = useMemo(() => summarizeMenuItems(items), [items])
  const isPersistentCatalog = importFile?.meta?.source === 'inventory-catalog'
  const toastExportFiles = useMemo(() => buildToastExportFiles(items), [items])
  const beerPreviewItems = useMemo(() => (
    categoryFilter === ALL_CATEGORIES
      ? []
      : items.filter((item) =>
          getReviewFilterKey(item, isPersistentCatalog) === categoryFilter,
        )
  ), [categoryFilter, isPersistentCatalog, items])
  const beerTabRows = useMemo(() => buildBeerTabPreviewRows(beerPreviewItems), [beerPreviewItems])
  const filterOptions = useMemo<FilterOption[]>(() => ([
    { id: 'included', label: 'Exporting', count: summary.exportItems },
    { id: 'excluded', label: 'Not exporting', count: summary.excludedItems },
    { id: 'active', label: 'All active', count: summary.normalizedItems },
    { id: 'ready', label: 'Ready', count: items.filter((item) => item.status === 'ready').length },
    { id: 'review', label: 'Review', count: summary.reviewItems },
    { id: 'happy-hour', label: 'Happy hour', count: summary.happyHourItems },
    { id: 'ignored', label: 'Ignored', count: summary.ignoredItems },
    { id: 'all', label: 'Everything', count: items.length },
  ]), [items, summary])

  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>()

    items.forEach((item) => {
      const key = getReviewFilterKey(item, isPersistentCatalog)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    })

    return [...counts.entries()]
      .sort(([left], [right]) =>
        getReviewFilterLabel(left, isPersistentCatalog)
          .localeCompare(getReviewFilterLabel(right, isPersistentCatalog)),
      )
      .map(([value, count]) => ({
        value,
        label: getReviewFilterLabel(value, isPersistentCatalog),
        count,
      }))
  }, [isPersistentCatalog, items])

  const selectedCategoryItems = useMemo(() => (
    categoryFilter === ALL_CATEGORIES
      ? []
      : items.filter((item) =>
          getReviewFilterKey(item, isPersistentCatalog) === categoryFilter,
        )
  ), [categoryFilter, isPersistentCatalog, items])

  const selectedCategoryToastCategory = selectedCategoryItems[0]?.toastCategory ?? ''

  useEffect(() => {
    if (!activeOrganization?.id) return

    const controller = new AbortController()
    setCatalogLoading(true)
    setCatalogError(null)

    void listInventoryCatalog(activeOrganization.id, controller.signal)
      .then((catalog) => {
        if (catalog.items.length === 0) {
          const savedSession = loadReviewSession()

          if (savedSession?.items.length) {
            setImportFile(
              savedSession.importFile ??
                createSavedImportFile(savedSession.items, savedSession.savedAt),
            )
            setItems(savedSession.items)
          } else {
            setImportFile(null)
            setItems([])
          }
        } else {
          const normalizedItems = catalog.items.map(catalogRowToNormalizedItem)

          setImportFile({
            sourceKind: 'toast-template-sheet',
            sourceName: 'Persistent Inventory catalog',
            rows: [],
            warnings: [],
            meta: {
              store: activeOrganization.name,
              organizationId: activeOrganization.id,
              source: 'inventory-catalog',
            },
          })
          setItems(normalizedItems)
        }

        setCatalogOrganizationId(activeOrganization.id)
        setFilter('included')
        setCategoryFilter(ALL_CATEGORIES)
        setToastCategoryDraft('')
        setQuery('')
        setPage(1)
        setSelectedItemId(null)
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return

        setCatalogError(
          error instanceof Error
            ? error.message
            : 'Unable to load the persistent Inventory catalog',
        )

        const savedSession = loadReviewSession()
        if (savedSession?.items.length) {
          setImportFile(
            savedSession.importFile ??
              createSavedImportFile(savedSession.items, savedSession.savedAt),
          )
          setItems(savedSession.items)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false)
      })

    return () => controller.abort()
  }, [activeOrganization?.id, activeOrganization?.name])

  useEffect(() => {
    if (categoryFilter === ALL_CATEGORIES) {
      setToastCategoryDraft('')
      return
    }

    setToastCategoryDraft(selectedCategoryToastCategory || getCategoryLabel(categoryFilter))
  }, [categoryFilter, selectedCategoryToastCategory])

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return items.filter((item) => {
      if (filter === 'included' && !item.exportIncluded) return false
      if (filter === 'excluded' && item.exportIncluded) return false
      if (filter === 'active' && item.status === 'ignored') return false
      if (filter === 'ready' && item.status !== 'ready') return false
      if (filter === 'review' && item.status !== 'review') return false
      if (filter === 'happy-hour' && item.happyHourPriceCents === null) return false
      if (filter === 'ignored' && item.status !== 'ignored') return false

      if (
        categoryFilter !== ALL_CATEGORIES &&
        getReviewFilterKey(item, isPersistentCatalog) !== categoryFilter
      ) {
        return false
      }

      if (!normalizedQuery) return true

      return [
        item.sourceItemNumber,
        item.name,
        item.exportIncluded ? 'exporting include included' : 'excluded not exporting exclude',
        item.notes.join(' '),
      ].some((value) => value?.toLowerCase().includes(normalizedQuery))
    })
  }, [categoryFilter, filter, isPersistentCatalog, items, query])

  const filteredItemIds = useMemo(() => new Set(filteredItems.map((item) => item.id)), [filteredItems])
  const filteredItemGroups = useMemo(() => groupMenuItems(filteredItems), [filteredItems])
  const allItemGroups = useMemo(() => groupMenuItems(items), [items])
  const pageCount = Math.max(1, Math.ceil(filteredItemGroups.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount)
  const pageStart = (clampedPage - 1) * PAGE_SIZE
  const pageGroups = filteredItemGroups.slice(pageStart, pageStart + PAGE_SIZE)
  const pageItems = pageGroups.flatMap((group) => group.items)
  const pageEnd = pageStart + pageGroups.length
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId],
  )

  async function handleAlohaCsvChange(event: ChangeEvent<HTMLInputElement>) {
    if (!canImportExport) return

    const file = event.target.files?.[0]
    if (!file) return

    setImportError(null)

    try {
      const text = await file.text()
      const parsed = parseAlohaMenuCsv(text, file.name)
      const normalizedItems = normalizeAlohaMenuItems(parsed)

      setImportFile(parsed)
      setItems(normalizedItems)
      setFilter('included')
      setCategoryFilter(ALL_CATEGORIES)
      setToastCategoryDraft('')
      setQuery('')
      setPage(1)
      setSelectedItemId(null)
    } catch (error) {
      setImportFile(null)
      setItems([])
      setSelectedItemId(null)
      setImportError(error instanceof Error ? error.message : 'Unable to read the selected file')
    }
  }

  function updateItem(itemId: string, patch: Partial<NormalizedMenuItem>) {
    if (!canEdit) return

    setItems((currentItems) => currentItems.map((item) => (
      item.id === itemId ? { ...item, ...patch } : item
    )))

    if (
      importFile?.meta?.source !== 'inventory-catalog' ||
      !activeOrganization?.id
    ) {
      return
    }

    const currentItem = items.find((item) => item.id === itemId)
    if (!currentItem) return

    const payload: Parameters<typeof updateInventoryOrganizationVariant>[0] = {
      organizationId: activeOrganization.id,
      variantId: itemId,
    }

    if (Object.hasOwn(patch, 'exportIncluded')) {
      payload.enabled = true
      payload.exportToToast = patch.exportIncluded
    }

    if (Object.hasOwn(patch, 'basePriceCents')) {
      payload.priceOverrideCents = patch.basePriceCents ?? null
    }

    if (Object.hasOwn(patch, 'happyHourPriceCents')) {
      payload.happyHourPriceCents = patch.happyHourPriceCents ?? null
    }

    if (Object.hasOwn(patch, 'name')) {
      payload.toastNameOverride =
        patch.name && patch.name !== currentItem.name
          ? patch.name
          : null
    }

    if (Object.hasOwn(patch, 'toastCategory')) {
      payload.toastCategoryOverride = patch.toastCategory ?? null
    }

    if (Object.hasOwn(patch, 'toastDestination')) {
      payload.toastDestinationOverride = patch.toastDestination ?? null
    }

    if (Object.keys(payload).length <= 2) return

    setItemSaveError(null)

    void updateInventoryOrganizationVariant(payload).catch((error) => {
      setItemSaveError(
        error instanceof Error
          ? error.message
          : 'Unable to save the Inventory item.',
      )
    })
  }

  function persistBulkItemPatch(
    itemIds: string[],
    patch: Partial<NormalizedMenuItem>,
  ) {
    if (
      !canEdit ||
      importFile?.meta?.source !== 'inventory-catalog' ||
      !activeOrganization?.id ||
      itemIds.length === 0
    ) {
      return
    }

    const payload: Parameters<typeof updateInventoryOrganizationVariants>[0] = {
      organizationId: activeOrganization.id,
      variantIds: itemIds,
    }

    if (Object.hasOwn(patch, 'exportIncluded')) {
      payload.enabled = true
      payload.exportToToast = patch.exportIncluded
    }

    if (Object.hasOwn(patch, 'basePriceCents')) {
      payload.priceOverrideCents = patch.basePriceCents ?? null
    }

    if (Object.hasOwn(patch, 'happyHourPriceCents')) {
      payload.happyHourPriceCents = patch.happyHourPriceCents ?? null
    }

    if (Object.hasOwn(patch, 'toastCategory')) {
      payload.toastCategoryOverride = patch.toastCategory ?? null
    }

    if (Object.hasOwn(patch, 'toastDestination')) {
      payload.toastDestinationOverride = patch.toastDestination ?? null
    }

    if (Object.keys(payload).length <= 2) return

    setItemSaveError(null)

    void updateInventoryOrganizationVariants(payload).catch((error) => {
      setItemSaveError(
        error instanceof Error
          ? error.message
          : 'Unable to save Inventory item changes.',
      )
    })
  }

  function updateFilteredItems(patch: Partial<NormalizedMenuItem>) {
    const itemIds = filteredItems.map((item) => item.id)

    setItems((currentItems) => currentItems.map((item) => (
      filteredItemIds.has(item.id) ? { ...item, ...patch } : item
    )))
    setSelectedItemId(null)
    persistBulkItemPatch(itemIds, patch)
  }

  function updatePageItems(patch: Partial<NormalizedMenuItem>) {
    const itemIds = pageItems.map((item) => item.id)
    const pageItemIds = new Set(itemIds)

    setItems((currentItems) => currentItems.map((item) => (
      pageItemIds.has(item.id) ? { ...item, ...patch } : item
    )))
    setSelectedItemId(null)
    persistBulkItemPatch(itemIds, patch)
  }

  function updateSelectedCategoryItems(patch: Partial<NormalizedMenuItem>) {
    if (categoryFilter === ALL_CATEGORIES) return

    const itemIds = items
      .filter((item) =>
        getReviewFilterKey(item, isPersistentCatalog) === categoryFilter,
      )
      .map((item) => item.id)
    const itemIdSet = new Set(itemIds)

    setItems((currentItems) => currentItems.map((item) => (
      itemIdSet.has(item.id) ? { ...item, ...patch } : item
    )))
    setSelectedItemId(null)
    persistBulkItemPatch(itemIds, patch)
  }

  function handleApplyToastCategory() {
    const nextToastCategory = toastCategoryDraft.trim()
    if (!nextToastCategory) return

    updateSelectedCategoryItems({ toastCategory: nextToastCategory })
  }

  function handleFilterChange(nextFilter: ItemFilter) {
    setFilter(nextFilter)
    setPage(1)
  }

  function handleCategoryChange(event: ChangeEvent<HTMLSelectElement>) {
    setCategoryFilter(event.target.value)
    setFilter('included')
    setPage(1)
    setSelectedItemId(null)
  }

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value)
    setPage(1)
  }


  async function handleSaveToInventory() {
    if (!canImportExport || !activeOrganization?.id || !importFile || items.length === 0) return

    setSaveState("saving")
    setSaveMessage(null)

    try {
      const result = await persistInventoryImport({
        organizationId: activeOrganization.id,
        sourceType:
          importFile.sourceKind === "aloha-csv"
            ? "aloha-csv"
            : "toast-template",
        sourceName: importFile.sourceName,
        items: items.map((item) => ({
          id: item.id,
          sourceItemNumber: item.sourceItemNumber,
          name: item.name,
          category: item.category,
          toastCategory: item.toastCategory,
          toastDestination: item.toastDestination,
          basePriceCents: item.basePriceCents,
          happyHourPriceCents: item.happyHourPriceCents,
          status: item.status,
          exportIncluded: item.exportIncluded,
        })),
      })

      const catalog = await listInventoryCatalog(activeOrganization.id)
      const persistentItems = catalog.items.map(catalogRowToNormalizedItem)

      setImportFile({
        sourceKind: 'toast-template-sheet',
        sourceName: 'Persistent Inventory catalog',
        rows: [],
        warnings: [],
        meta: {
          store: activeOrganization.name,
          organizationId: activeOrganization.id,
          source: 'inventory-catalog',
        },
      })
      setItems(persistentItems)
      setFilter('included')
      setCategoryFilter(ALL_CATEGORIES)
      setToastCategoryDraft('')
      setQuery('')
      setPage(1)
      setSelectedItemId(null)
      setCatalogOrganizationId(activeOrganization.id)

      setSaveState("saved")
      setSaveMessage(
        "Saved " +
          result.importedItems.toLocaleString() +
          " items and " +
          result.importedVariants.toLocaleString() +
          " variants. Reloaded " +
          persistentItems.length.toLocaleString() +
          " persistent catalog rows.",
      )
    } catch (error) {
      setSaveState("error")
      setSaveMessage(
        error instanceof Error
          ? error.message
          : "Unable to save the Inventory import.",
      )
    }
  }

  return (
    <AuthenticatedInventoryShell currentPath="/">
      <section className="inventory-content">
        <header className="inventory-hero">
          <p className="inventory-kicker">Menu items</p>
          <h1>{app.label}</h1>
          <p>
            Import Aloha menu exports, normalize the data, review items, decide what should
            export, and generate the Toast bulk-import format from one place.
          </p>
        </header>

        <section className="inventory-card inventory-import-card">
          <div>
            <p className="inventory-kicker">Import source</p>
            <h2>Aloha CSV import</h2>
            <p>
              This first importer reads Aloha menu-price CSV exports and converts them into
              a normalized menu-item model. Use Template Import for already-populated Toast
              workbooks; those saved reviewed items also load here.
            </p>
          </div>

          {canImportExport ? (
            <label className="inventory-upload-control">
              <span>Choose Aloha CSV</span>
              <input type="file" accept=".csv,text/csv" onChange={handleAlohaCsvChange} />
            </label>
          ) : (
            <p className="inventory-readonly-note">Viewer access is read-only.</p>
          )}

          {catalogLoading ? (
            <p>Loading persistent Inventory catalog…</p>
          ) : catalogOrganizationId === activeOrganization?.id && items.length > 0 ? (
            <p>
              Loaded {items.length.toLocaleString()} item variant
              {items.length === 1 ? '' : 's'} for {activeOrganization.name}.
            </p>
          ) : null}

          {catalogError ? <p className="inventory-error">{catalogError}</p> : null}
          {importError ? <p className="inventory-error">{importError}</p> : null}
          {itemSaveError ? <p className="inventory-error">{itemSaveError}</p> : null}
        </section>

        {importFile ? (
          <>
            <section className="inventory-summary-grid" aria-label="Import summary">
              <SummaryCard label="Source rows" value={summary.rawRows} />
              <SummaryCard
                label={importFile.meta?.source === 'inventory-catalog' ? 'Master items' : 'Normalized items'}
                value={importFile.meta?.source === 'inventory-catalog' ? allItemGroups.length : summary.normalizedItems}
              />
              <SummaryCard
                label={importFile.meta?.source === 'inventory-catalog' ? 'Exporting variants' : 'Exporting'}
                value={summary.exportItems}
              />
              <SummaryCard
                label={importFile.meta?.source === 'inventory-catalog' ? 'Not exporting variants' : 'Not exporting'}
                value={summary.excludedItems}
              />
              <SummaryCard label="Needs review" value={summary.reviewItems} />
              <SummaryCard label="Happy-hour prices" value={summary.happyHourItems} />
            </section>

            <section className="inventory-card inventory-source-card">
              <div className="inventory-table-heading">
                <div>
                  <p className="inventory-kicker">Current review</p>
                  <h2>{importFile.sourceName}</h2>
                </div>

                {canImportExport && importFile.meta?.source !== 'inventory-catalog' ? (
                  <button
                    className="inventory-template-download"
                    type="button"
                    disabled={
                      saveState === "saving" ||
                      items.length === 0 ||
                      !activeOrganization?.id
                    }
                    onClick={handleSaveToInventory}
                  >
                    {saveState === "saving" ? "Saving…" : "Save to Inventory"}
                  </button>
                ) : null}
              </div>

              {saveMessage ? (
                <p className={saveState === "error" ? "inventory-error" : undefined}>
                  {saveMessage}
                </p>
              ) : null}

              <dl>
                <div>
                  <dt>Source type</dt>
                  <dd>{getSourceTypeLabel(importFile.sourceKind)}</dd>
                </div>
                <div>
                  <dt>Store</dt>
                  <dd>{importFile.meta?.store || 'Unknown'}</dd>
                </div>
                <div>
                  <dt>Ignored rows</dt>
                  <dd>{summary.ignoredItems}</dd>
                </div>
              </dl>
              {importFile.warnings.length > 0 ? (
                <ul className="inventory-warning-list">
                  {importFile.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </section>

            {canImportExport ? <ToastExportPanelView files={toastExportFiles} /> : null}

            <section className="inventory-card inventory-table-card">
              <div className="inventory-table-heading">
                <div>
                  <p className="inventory-kicker">Review</p>
                  <h2>Normalized menu items</h2>
                </div>
                <p>
                  Showing {filteredItemGroups.length === 0 ? 0 : pageStart + 1}–{pageEnd} of {filteredItemGroups.length} filtered items.
                </p>
              </div>

              <div className="inventory-review-controls">
                <div className="inventory-filter-group" aria-label="Filter menu items">
                  {filterOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={filter === option.id ? 'inventory-filter is-active' : 'inventory-filter'}
                      onClick={() => handleFilterChange(option.id)}
                    >
                      <span>{option.label}</span>
                      <strong>{option.count.toLocaleString()}</strong>
                    </button>
                  ))}
                </div>

                <div className="inventory-filter-panel">
                  <label className="inventory-search-control">
                    <span>{isPersistentCatalog ? 'Variant' : 'Aloha category'}</span>
                    <select value={categoryFilter} onChange={handleCategoryChange}>
                      <option value={ALL_CATEGORIES}>All categories ({items.length.toLocaleString()})</option>
                      {categoryOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label} ({option.count.toLocaleString()})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="inventory-search-control">
                    <span>Search items</span>
                    <input
                      type="search"
                      value={query}
                      onChange={handleQueryChange}
                      placeholder="Name, Aloha #, note…"
                    />
                  </label>
                </div>
              </div>

              {canEdit && !isPersistentCatalog && categoryFilter !== ALL_CATEGORIES ? (
                <section className="inventory-category-rule-panel">
                  <div>
                    <p className="inventory-kicker">Toast category rule</p>
                    <h3>{getCategoryLabel(categoryFilter)}</h3>
                    <p>
                      Rename this Aloha category for Toast export. Beer source groups can all
                      become <strong>Beer</strong>, matching the existing script behavior where
                      cans, bottles/tall cans, 10 oz, and pint sizes are reconciled under Beer.
                    </p>
                  </div>

                  <label>
                    <span>Toast category</span>
                    <input
                      value={toastCategoryDraft}
                      onChange={(event) => setToastCategoryDraft(event.target.value)}
                      placeholder="Toast category"
                    />
                  </label>

                  <div className="inventory-category-rule-actions">
                    <button type="button" onClick={handleApplyToastCategory}>Apply Toast category</button>
                    <button type="button" onClick={() => updateSelectedCategoryItems({ exportIncluded: true })}>Include category</button>
                    <button type="button" onClick={() => updateSelectedCategoryItems({ exportIncluded: false })}>Exclude category</button>
                  </div>
                </section>
              ) : null}

              {beerTabRows.length > 0 ? <BeerTabPreview rows={beerTabRows} /> : null}

              {canEdit ? (
                <>
                  <div className="inventory-bulk-bar">
                    <strong>{filteredItemGroups.length.toLocaleString()} matching items</strong>
                    <button type="button" onClick={() => updateFilteredItems({ exportIncluded: false })}>Exclude filtered from export</button>
                    <button type="button" onClick={() => updateFilteredItems({ exportIncluded: true })}>Include filtered in export</button>
                    <button type="button" onClick={() => updatePageItems({ exportIncluded: false })}>Exclude this page</button>
                  </div>

                  {selectedItem ? (
                    <EditItemPanel item={selectedItem} onChange={updateItem} onClose={() => setSelectedItemId(null)} />
                  ) : (
                    <p className="inventory-edit-hint">Select Edit on a row to adjust its normalized Toast-ready values and export setting.</p>
                  )}
                </>
              ) : (
                <p className="inventory-edit-hint">Your Inventory role can view these items but cannot change organization item settings.</p>
              )}

              <div className="inventory-table-wrap">
                <table className="inventory-table inventory-review-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>{isPersistentCatalog ? 'Master category' : 'Aloha category'}</th>
                      <th>Toast category</th>
                      <th>Base price</th>
                      <th>Happy hour</th>
                      <th className="inventory-review-actions-heading">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageGroups.map((group) => {
                      const item = group.items[0]
                      const groupSelected = group.items.some((variant) => selectedItemId === variant.id)
                      const status = getGroupStatus(group.items)

                      return (
                        <tr key={group.key} className={groupSelected ? 'is-selected' : undefined}>
                          <td>
                            <div className="inventory-item-name-line">
                              <strong>{item.name}</strong>
                              <span className={`inventory-status inventory-status-${status}`}>
                                {status}
                              </span>
                            </div>
                            {group.items.length === 1 && item.notes.length > 0 ? (
                              <span>{item.notes.join(' · ')}</span>
                            ) : (
                              <span>{group.items.length} variants</span>
                            )}
                          </td>
                          <td>{item.category || 'Uncategorized'}</td>
                          <td>{item.toastCategory}</td>
                          <td>
                            <div className="inventory-variant-stack">
                              {group.items.map((variant) => (
                                <span key={variant.id}>
                                  <strong>{getVariantDisplayLabel(variant)}</strong>
                                  {formatCurrency(variant.basePriceCents)}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <div className="inventory-variant-stack">
                              {group.items.map((variant) => (
                                <span key={variant.id}>
                                  <strong>{getVariantDisplayLabel(variant)}</strong>
                                  {variant.happyHourPriceCents === null
                                    ? '—'
                                    : `${formatCurrency(variant.happyHourPriceCents)}${variant.happyHourWindow ? ` · ${variant.happyHourWindow}` : ''}`}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="inventory-review-actions">
                            {canEdit ? (
                              <div className="inventory-variant-actions">
                                {group.items.map((variant) => (
                                  <div key={variant.id} className="inventory-variant-action-row">
                                    <span>{getVariantDisplayLabel(variant)}</span>
                                    <div className="inventory-review-action-buttons">
                                      <button
                                        className={variant.exportIncluded ? 'inventory-export-toggle is-included' : 'inventory-export-toggle'}
                                        type="button"
                                        onClick={() => updateItem(variant.id, { exportIncluded: !variant.exportIncluded })}
                                      >
                                        {variant.exportIncluded ? 'Export' : 'No export'}
                                      </button>
                                      <button
                                        className="inventory-row-action"
                                        type="button"
                                        onClick={() => setSelectedItemId(variant.id)}
                                      >
                                        Edit
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="inventory-variant-stack">
                                {group.items.map((variant) => (
                                  <span key={variant.id}>
                                    <strong>{getVariantDisplayLabel(variant)}</strong>
                                    {variant.exportIncluded ? 'Exporting' : 'Not exporting'}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {filteredItemGroups.length === 0 ? (
                <p className="inventory-empty-state">No menu items match the current filter.</p>
              ) : null}

              <div className="inventory-pagination" aria-label="Pagination">
                <button type="button" onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))} disabled={clampedPage <= 1}>
                  Previous
                </button>
                <span>Page {clampedPage.toLocaleString()} of {pageCount.toLocaleString()}</span>
                <button type="button" onClick={() => setPage((currentPage) => Math.min(pageCount, currentPage + 1))} disabled={clampedPage >= pageCount}>
                  Next
                </button>
              </div>
            </section>
          </>
        ) : (
          <section className="inventory-card">
            <h2>Load or import menu data</h2>
            <p>
              Upload an Aloha CSV here, or use Template Import to read an already populated
              Toast workbook. Template Import saves the reviewed data so it appears on this
              page for review, editing, and export.
            </p>
          </section>
        )}
      </section>
    </AuthenticatedInventoryShell>
  )
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="inventory-summary-card">
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </article>
  )
}

function ToastExportPanel({ files }: { files: ToastExportFile[] }) {
  const totalRows = files.reduce((total, file) => total + file.rowCount, 0)

  return (
    <section className="inventory-card inventory-export-panel">
      <div className="inventory-table-heading">
        <div>
          <p className="inventory-kicker">Toast export</p>
          <h2>Generated CSVs</h2>
        </div>
        <p>{totalRows.toLocaleString()} rows staged from currently export-included items.</p>
      </div>

      <div className="inventory-export-file-grid">
        {files.map((file) => (
          <article key={file.id} className="inventory-export-file-card">
            <div>
              <strong>{file.label}</strong>
              <span>{file.rowCount.toLocaleString()} rows</span>
            </div>
            <p>{file.note}</p>
            <button
              type="button"
              onClick={() => downloadCsv(file.filename, file.rows)}
              disabled={file.rowCount === 0}
            >
              Download {file.filename}
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}

function BeerTabPreview({ rows }: { rows: BeerTabPreviewRow[] }) {
  return (
    <details className="inventory-card inventory-beer-preview-card">
      <summary className="inventory-beer-preview-summary">
        <span>
          <span className="inventory-kicker">Toast preview</span>
          <strong>Beer tab staging</strong>
        </span>
        <span>{rows.length.toLocaleString()} grouped rows</span>
      </summary>

      <div className="inventory-table-wrap">
        <table className="inventory-table inventory-beer-preview-table">
          <thead>
            <tr>
              <th>Draft Beer</th>
              <th>10oz</th>
              <th>Happy Hour $</th>
              <th>16oz</th>
              <th>Happy Hour $</th>
              <th>Can</th>
              <th>Price $</th>
              <th>Happy Hour $</th>
              <th>24oz Can</th>
              <th>Price $</th>
              <th>Happy Hour $</th>
              <th>Bottle</th>
              <th>Price $</th>
              <th>Happy Hour $</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.beerName}>
                <td>{row.draft10ozPrice !== null || row.draft16ozPrice !== null ? row.beerName : ''}</td>
                <td>{formatCurrencyBlank(row.draft10ozPrice)}</td>
                <td>{formatCurrencyBlank(row.draft10ozHappyHour)}</td>
                <td>{formatCurrencyBlank(row.draft16ozPrice)}</td>
                <td>{formatCurrencyBlank(row.draft16ozHappyHour)}</td>
                <td>{row.canPrice !== null ? row.beerName : ''}</td>
                <td>{formatCurrencyBlank(row.canPrice)}</td>
                <td>{formatCurrencyBlank(row.canHappyHour)}</td>
                <td>{row.can24ozPrice !== null ? row.beerName : ''}</td>
                <td>{formatCurrencyBlank(row.can24ozPrice)}</td>
                <td>{formatCurrencyBlank(row.can24ozHappyHour)}</td>
                <td>{row.bottlePrice !== null ? row.beerName : ''}</td>
                <td>{formatCurrencyBlank(row.bottlePrice)}</td>
                <td>{formatCurrencyBlank(row.bottleHappyHour)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function EditItemPanel({
  item,
  onChange,
  onClose,
}: {
  item: NormalizedMenuItem
  onChange: (itemId: string, patch: Partial<NormalizedMenuItem>) => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

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
      className="inventory-edit-drawer"
      aria-labelledby="inventory-edit-drawer-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.currentTarget === event.target) onClose()
      }}
    >
      <section className="inventory-edit-panel" aria-label={`Edit ${item.name}`}>
            <div className="inventory-edit-panel-heading">
              <div>
                <p className="inventory-kicker">Editing {item.sourceItemNumber ? `Aloha #${item.sourceItemNumber}` : 'item'}</p>
                <h3 id="inventory-edit-drawer-title">{item.name}</h3>
              </div>
              <button type="button" onClick={onClose}>Close</button>
            </div>
      
            <div className="inventory-edit-grid">
              <label>
                <span>Name</span>
                <input
                  value={item.name}
                  onChange={(event) => onChange(item.id, { name: event.target.value })}
                />
              </label>
      
              <label>
                <span>Aloha category</span>
                <input
                  value={item.category || ''}
                  onChange={(event) => onChange(item.id, { category: event.target.value || undefined })}
                  placeholder="Uncategorized"
                />
              </label>
      
              <label>
                <span>Toast category</span>
                <input
                  value={item.toastCategory}
                  onChange={(event) => onChange(item.id, { toastCategory: event.target.value })}
                  placeholder="Toast category"
                />
              </label>
      
              <label>
                <span>Base price</span>
                <input
                  inputMode="decimal"
                  value={formatCentsInput(item.basePriceCents)}
                  onChange={(event) => onChange(item.id, { basePriceCents: parseCurrencyInput(event.target.value) })}
                  placeholder="Review"
                />
              </label>
      
              <label>
                <span>Happy-hour price</span>
                <input
                  inputMode="decimal"
                  value={formatCentsInput(item.happyHourPriceCents)}
                  onChange={(event) => onChange(item.id, { happyHourPriceCents: parseCurrencyInput(event.target.value) })}
                  placeholder="None"
                />
              </label>
      
              <label>
                <span>Happy-hour window</span>
                <input
                  value={item.happyHourWindow || ''}
                  onChange={(event) => onChange(item.id, { happyHourWindow: event.target.value || undefined })}
                  placeholder="17:00–19:00"
                />
              </label>
      
              <label>
                <span>Status</span>
                <select
                  value={item.status}
                  onChange={(event) => onChange(item.id, { status: event.target.value as NormalizedMenuItem['status'] })}
                >
                  <option value="ready">Ready</option>
                  <option value="review">Review</option>
                  <option value="ignored">Ignored</option>
                </select>
              </label>
      
              <label className="inventory-checkbox-label">
                <input
                  type="checkbox"
                  checked={item.exportIncluded}
                  onChange={(event) => onChange(item.id, { exportIncluded: event.target.checked })}
                />
                <span>Include this item in Toast export</span>
              </label>
            </div>
          </section>
    </dialog>
  )
}

type MenuItemGroup = {
  key: string
  items: NormalizedMenuItem[]
}

function groupMenuItems(items: NormalizedMenuItem[]): MenuItemGroup[] {
  const groups = new Map<string, NormalizedMenuItem[]>()

  items.forEach((item) => {
    const key = item.masterItemId ?? `variant:${item.id}`
    const existing = groups.get(key)

    if (existing) {
      existing.push(item)
    } else {
      groups.set(key, [item])
    }
  })

  return [...groups.entries()].map(([key, groupedItems]) => ({
    key,
    items: groupedItems.sort((left, right) =>
      getVariantDisplayLabel(left).localeCompare(getVariantDisplayLabel(right)),
    ),
  }))
}

function getVariantDisplayLabel(item: NormalizedMenuItem) {
  return item.variantLabel || item.notes[0] || 'Standard'
}

function getGroupStatus(items: NormalizedMenuItem[]): NormalizedMenuItem['status'] {
  if (items.some((item) => item.status === 'review')) return 'review'
  if (items.every((item) => item.status === 'ignored')) return 'ignored'
  return 'ready'
}

function createSavedImportFile(items: NormalizedMenuItem[], savedAt: string): ParsedMenuImport {
  const firstItem = items[0]

  return {
    sourceKind: firstItem?.sourceKind ?? 'toast-template-sheet',
    sourceName: 'Saved reviewed menu items',
    rows: [],
    warnings: [`Loaded reviewed state saved ${new Date(savedAt).toLocaleString()}`],
    meta: {
      store: firstItem?.rawRows?.[0]?.Store || firstItem?.rawRows?.[0]?.store || 'Saved review session',
      savedAt,
    },
  }
}

function getSourceTypeLabel(sourceKind: ParsedMenuImport['sourceKind']) {
  if (sourceKind === 'aloha-csv') return 'Aloha CSV'
  return 'Toast template workbook'
}

function formatCentsInput(cents: number | null) {
  if (cents === null) return ''

  return (cents / 100).toFixed(2)
}

function formatCurrencyBlank(cents: number | null) {
  return cents === null ? '' : formatCurrency(cents)
}

function parseCurrencyInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null

  const parsed = Number(trimmed.replace(/[$,]/g, ''))
  if (!Number.isFinite(parsed)) return null

  return Math.round(parsed * 100)
}

function getReviewFilterKey(
  item: NormalizedMenuItem,
  persistentCatalog: boolean,
) {
  if (!persistentCatalog) return getCategoryKey(item.category)

  return `variant:${getVariantDisplayLabel(item)}`
}

function getReviewFilterLabel(
  key: string,
  persistentCatalog: boolean,
) {
  if (!persistentCatalog) return getCategoryLabel(key)
  return key.startsWith('variant:') ? key.slice('variant:'.length) : key
}

function getCategoryKey(category?: string) {
  const normalized = category?.trim()
  return normalized ? normalized : UNCATEGORIZED
}

function getCategoryLabel(categoryKey: string) {
  return categoryKey === UNCATEGORIZED ? 'Uncategorized' : categoryKey
}
