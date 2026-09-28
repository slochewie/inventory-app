import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  AuthenticatedInventoryShell,
  useInventoryAccessRole,
} from '#/components/authenticated-inventory-shell'
import { catalogRowToNormalizedItem } from '#/features/menu-import/catalog'
import { authClient } from '#/lib/auth-client'
import {
  getInventoryOrganizationConfig,
  getOptionalBeerCategories,
  listInventoryCatalog,
  persistInventoryImport,
  type InventoryOrganizationConfig,
} from '#/lib/inventory-access'
import { normalizeAlohaMenuItems, parseAlohaMenuCsv } from '#/features/menu-import/aloha'
import {
  clearReviewSession,
  loadReviewSession,
  saveReviewSession,
} from '#/features/menu-import/review-session'
import { parseToastExportReviewCsv } from '#/features/menu-import/toast-review-import'
import {
  parseToastWorkbookForReview,
  TOAST_WORKBOOK_STAGING_PARSER_VERSION,
} from '#/features/menu-import/toast-workbook-import'
import { getToastWorkbookCategory } from '#/features/menu-import/workbook-routing'
import {
  buildPopulatedToastTemplateWorkbookWithLiquorAsync,
  validatePopulatedToastTemplateWorkbookWithLiquor,
} from '#/features/menu-import/toast-template-liquor-workbook'
import {
  buildToastWorkbookFilename,
  buildToastWorkbookZip,
  downloadToastWorkbookFile,
  inspectToastTemplateWorkbook,
  type ToastDraftSlotMapping,
  type ToastTemplateWorkbookInfo,
} from '#/features/menu-import/toast-template-workbook'
import {
  formatCurrency,
  summarizeMenuItems,
  type NormalizedMenuItem,
  type ParsedMenuImport,
} from '#/features/menu-import/types'

export const Route = createFileRoute('/toast-workbook')({ component: ToastWorkbookRoute })

const TOAST_TEMPLATE_FILE_NAME = 'Toast-Menu-Template-Your-Restaurant-Name.xlsx'
const TOAST_TEMPLATE_URL = `/toast/menu/${TOAST_TEMPLATE_FILE_NAME}`

type WorkbookState = {
  fileName: string
  arrayBuffer: ArrayBuffer
  info: ToastTemplateWorkbookInfo
}

type StagedReviewStatus = 'review' | 'ready' | 'all'

const STAGED_REVIEW_PAGE_SIZE = 25

function ToastWorkbookRoute() {
  const { canImportExport } = useInventoryAccessRole()

  return (
    <AuthenticatedInventoryShell
      currentPath="/toast-workbook"
      requiredCapability="import-export"
    >
      {canImportExport ? <ToastWorkbook /> : null}
    </AuthenticatedInventoryShell>
  )
}

function loadOrganizationReviewSession(organizationId: string) {
  const saved = loadReviewSession(organizationId)
  if (
    saved?.importFile?.meta?.source === 'toast-workbook-staging' &&
    saved.importFile.meta.parserVersion !==
      TOAST_WORKBOOK_STAGING_PARSER_VERSION
  ) {
    return null
  }

  if (
    saved?.importFile?.meta?.source === 'toast-workbook-staging' &&
    saved.items.length
  ) {
    const repairedItems = saved.items.map((item) => {
      const validReadyItem =
        item.status === 'ready' &&
        item.name.trim() !== '' &&
        !/^\[Review /i.test(item.name) &&
        item.basePriceCents !== null

      if (
        !validReadyItem ||
        item.stagingExplicitlyExcluded === true ||
        (item.exportIncluded && item.exportToToast !== false)
      ) {
        return item
      }

      return {
        ...item,
        exportToToast: true,
        exportIncluded: true,
        stagingExplicitlyExcluded: false,
      }
    })

    const changed = repairedItems.some(
      (item, index) => item !== saved.items[index],
    )

    if (changed) {
      saveReviewSession(saved.importFile, repairedItems, organizationId)
      return {
        ...saved,
        items: repairedItems,
      }
    }
  }

  return saved
}

function ToastWorkbook() {
  const navigate = useNavigate()
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [importFile, setImportFile] = useState<ParsedMenuImport | null>(null)
  const [items, setItems] = useState<NormalizedMenuItem[]>([])
  const [reviewSource, setReviewSource] = useState<
    'catalog' | 'saved' | 'review-csv' | 'uploaded' | 'toast-workbook' | null
  >(null)
  const [reviewSavedAt, setReviewSavedAt] = useState<string | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [organizationConfig, setOrganizationConfig] =
    useState<InventoryOrganizationConfig | null>(null)
  const [alohaError, setAlohaError] = useState<string | null>(null)
  const [workbook, setWorkbook] = useState<WorkbookState | null>(null)
  const [workbookError, setWorkbookError] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [workbookValidation, setWorkbookValidation] = useState<{
    draftRows: number
    canRows: number
    bottleSlotRows: number
    optionalBeerCategory1Rows: number
    optionalBeerCategoryRows: number[]
    liquorRows: number
    cocktailRows: number
    naBevRows: number
    retailRows: number
    happyHourNotes: boolean
  } | null>(null)
  const [stagedReviewQuery, setStagedReviewQuery] = useState('')
  const [stagedReviewStatus, setStagedReviewStatus] =
    useState<StagedReviewStatus>('review')
  const [stagedReviewCategory, setStagedReviewCategory] = useState('all')
  const [stagedReviewPage, setStagedReviewPage] = useState(1)
  const [selectedStagedItemId, setSelectedStagedItemId] =
    useState<string | null>(null)
  const [importingReviewedItems, setImportingReviewedItems] = useState(false)
  const [importReviewedError, setImportReviewedError] = useState<string | null>(null)

  const summary = useMemo(() => summarizeMenuItems(items), [items])
  const beerExportItemCount = items.filter(
    (item) => item.exportIncluded && getToastWorkbookCategory(item) === 'Beer',
  ).length
  const liquorExportItemCount = items.filter((item) => item.exportIncluded && isLiquorItem(item)).length
  const organizationName = importFile?.meta?.store?.trim() || 'Organization'
  const stagedReviewCategories = useMemo(
    () =>
      [
        ...new Set(
          items
            .map((item) => item.category || item.toastCategory)
            .filter(Boolean),
        ),
      ].sort((left, right) => left.localeCompare(right)),
    [items],
  )
  const filteredStagedItems = useMemo(() => {
    const query = stagedReviewQuery.trim().toLowerCase()

    return items.filter((item) => {
      if (
        stagedReviewStatus !== 'all' &&
        item.status !== stagedReviewStatus
      ) {
        return false
      }

      if (
        stagedReviewCategory !== 'all' &&
        (item.category || item.toastCategory) !== stagedReviewCategory
      ) {
        return false
      }

      if (!query) return true

      return [
        item.name,
        item.category || '',
        item.toastCategory,
        item.toastDestination,
        item.variantLabel ?? '',
        ...item.notes,
      ].some((value) => value.toLowerCase().includes(query))
    })
  }, [
    items,
    stagedReviewCategory,
    stagedReviewQuery,
    stagedReviewStatus,
  ])
  const stagedReviewPageCount = Math.max(
    1,
    Math.ceil(filteredStagedItems.length / STAGED_REVIEW_PAGE_SIZE),
  )
  const stagedReviewClampedPage = Math.min(
    stagedReviewPage,
    stagedReviewPageCount,
  )
  const stagedReviewPageStart =
    (stagedReviewClampedPage - 1) * STAGED_REVIEW_PAGE_SIZE
  const stagedReviewPageItems = filteredStagedItems.slice(
    stagedReviewPageStart,
    stagedReviewPageStart + STAGED_REVIEW_PAGE_SIZE,
  )
  const selectedStagedItem =
    items.find((item) => item.id === selectedStagedItemId) ?? null

  useEffect(() => {
    setStagedReviewPage(1)
  }, [stagedReviewCategory, stagedReviewQuery, stagedReviewStatus])

  useEffect(() => {
    if (!activeOrganization?.id) {
      setOrganizationConfig(null)
      setImportFile(null)
      setItems([])
      setReviewSource(null)
      setReviewSavedAt(null)
      return
    }

    const organizationId = activeOrganization.id
    const savedReviewSession = loadOrganizationReviewSession(organizationId)

    setSelectedStagedItemId(null)
    setStagedReviewQuery('')
    setStagedReviewStatus('review')
    setStagedReviewCategory('all')
    setStagedReviewPage(1)
    setWorkbookValidation(null)
    setDownloadError(null)
    setAlohaError(null)

    if (savedReviewSession?.items.length) {
      setImportFile(savedReviewSession.importFile)
      setItems(savedReviewSession.items)
      setReviewSource(
        savedReviewSession.importFile?.meta?.source === 'toast-workbook-staging'
          ? 'toast-workbook'
          : 'saved',
      )
      setReviewSavedAt(savedReviewSession.savedAt)
    } else {
      setImportFile(null)
      setItems([])
      setReviewSource(null)
      setReviewSavedAt(null)
    }

    const controller = new AbortController()
    setCatalogLoading(true)

    void Promise.all([
      listInventoryCatalog(organizationId, controller.signal),
      getInventoryOrganizationConfig(organizationId, controller.signal),
    ])
      .then(([catalog, config]) => {
        setOrganizationConfig(config)

        if (savedReviewSession?.items.length) return

        if (catalog.items.length === 0) {
          setImportFile(null)
          setItems([])
          setReviewSource(null)
          setReviewSavedAt(null)
          return
        }

        const persistentItems = catalog.items.map(catalogRowToNormalizedItem)

        setImportFile({
          sourceKind: 'toast-template-sheet',
          sourceName: 'Persistent Inventory catalog',
          rows: [],
          warnings: [],
          meta: {
            store: activeOrganization.name,
            organizationId,
            source: 'inventory-catalog',
          },
        })
        setItems(persistentItems)
        setReviewSource('catalog')
        setReviewSavedAt(null)
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setAlohaError(
          error instanceof Error
            ? error.message
            : 'Unable to load the persistent Inventory catalog',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false)
      })

    return () => controller.abort()
  }, [activeOrganization?.id, activeOrganization?.name])

  useEffect(() => {
    let cancelled = false

    async function loadToastTemplate() {
      setWorkbookError(null)

      try {
        const response = await fetch(TOAST_TEMPLATE_URL)
        if (!response.ok) {
          throw new Error(`Unable to load the bundled Toast template (${response.status})`)
        }

        const arrayBuffer = await response.arrayBuffer()
        const info = inspectToastTemplateWorkbook(arrayBuffer, TOAST_TEMPLATE_FILE_NAME)

        if (!cancelled) {
          setWorkbook({
            fileName: TOAST_TEMPLATE_FILE_NAME,
            arrayBuffer,
            info,
          })
        }
      } catch (error) {
        if (!cancelled) {
          setWorkbook(null)
          setWorkbookError(
            error instanceof Error
              ? error.message
              : 'Unable to load the bundled Toast template workbook',
          )
        }
      }
    }

    void loadToastTemplate()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleClearStagedImport() {
    clearReviewSession(activeOrganization?.id)
    setSelectedStagedItemId(null)
    setStagedReviewQuery('')
    setStagedReviewStatus('review')
    setStagedReviewCategory('all')
    setStagedReviewPage(1)
    setWorkbookValidation(null)
    setDownloadError(null)
    setAlohaError(null)

    if (!activeOrganization?.id) {
      setImportFile(null)
      setItems([])
      setReviewSource(null)
      setReviewSavedAt(null)
      return
    }

    setCatalogLoading(true)

    try {
      const [catalog, config] = await Promise.all([
        listInventoryCatalog(activeOrganization.id),
        getInventoryOrganizationConfig(activeOrganization.id),
      ])
      const persistentItems = catalog.items.map(catalogRowToNormalizedItem)

      setOrganizationConfig(config)
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
      setReviewSource('catalog')
      setReviewSavedAt(null)
    } catch (error) {
      setImportFile(null)
      setItems([])
      setReviewSource(null)
      setReviewSavedAt(null)
      setAlohaError(
        error instanceof Error
          ? error.message
          : 'Unable to reload the persistent Inventory catalog',
      )
    } finally {
      setCatalogLoading(false)
    }
  }

  async function handleAlohaCsvChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setAlohaError(null)
    setDownloadError(null)

    try {
      const text = await file.text()
      const parsed = parseAlohaMenuCsv(text, file.name)
      const normalizedItems = normalizeAlohaMenuItems(parsed)

      setImportFile(parsed)
      setItems(normalizedItems)
      setReviewSource('uploaded')
      setReviewSavedAt(null)
      saveReviewSession(parsed, normalizedItems, activeOrganization?.id)
    } catch (error) {
      setImportFile(null)
      setItems([])
      setReviewSource(null)
      setReviewSavedAt(null)
      setAlohaError(error instanceof Error ? error.message : 'Unable to read the selected Aloha CSV')
    }
  }

  async function handleToastWorkbookChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0]
    if (!file) return

    setAlohaError(null)
    setDownloadError(null)
    setWorkbookValidation(null)

    try {
      const parsed = parseToastWorkbookForReview(
        await file.arrayBuffer(),
        file.name,
      )
      const stagedImportFile: ParsedMenuImport = {
        ...parsed.importFile,
        meta: {
          ...parsed.importFile.meta,
          store: activeOrganization?.name ?? 'Organization',
          organizationId: activeOrganization?.id ?? '',
        },
      }

      setImportFile(stagedImportFile)
      setItems(parsed.items)
      setReviewSource('toast-workbook')
      setReviewSavedAt(null)
      saveReviewSession(stagedImportFile, parsed.items, activeOrganization?.id)
    } catch (error) {
      setAlohaError(
        error instanceof Error
          ? error.message
          : 'Unable to stage the selected Toast workbook',
      )
    } finally {
      event.target.value = ''
    }
  }

  function updateStagedItem(
    itemId: string,
    patch: Partial<NormalizedMenuItem>,
  ) {
    setItems((current) => {
      const next = current.map((item) => {
        if (item.id !== itemId) return item

        const updated = { ...item, ...patch }
        const ready =
          updated.name.trim() !== '' &&
          !/^\[Review /i.test(updated.name) &&
          updated.basePriceCents !== null
        const included =
          ready &&
          (Object.hasOwn(patch, 'exportIncluded')
            ? patch.exportIncluded === true
            : updated.exportIncluded !== false)

        return {
          ...updated,
          status: ready ? 'ready' : 'review',
          exportToToast: included,
          exportIncluded: included,
          stagingExplicitlyExcluded: ready ? !included : false,
        } satisfies NormalizedMenuItem
      })

      saveReviewSession(importFile, next, activeOrganization?.id)
      return next
    })
  }

  function ignoreStagedItem(itemId: string) {
    setItems((current) => {
      const next = current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              status: 'ignored' as const,
              exportToToast: false,
              exportIncluded: false,
              stagingExplicitlyExcluded: true,
            }
          : item,
      )
      saveReviewSession(importFile, next, activeOrganization?.id)
      return next
    })
  }

  async function handleReviewCsvChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setAlohaError(null)
    setDownloadError(null)

    try {
      const text = await file.text()
      const parsed = parseToastExportReviewCsv(text, file.name)

      setImportFile(parsed.importFile)
      setItems(parsed.items)
      setReviewSource('review-csv')
      setReviewSavedAt(null)
      saveReviewSession(parsed.importFile, parsed.items, activeOrganization?.id)
    } catch (error) {
      setImportFile(null)
      setItems([])
      setReviewSource(null)
      setReviewSavedAt(null)
      setAlohaError(error instanceof Error ? error.message : 'Unable to restore the selected Toast export review CSV')
    }
  }

  async function handleImportReviewedItems() {
    if (
      !activeOrganization?.id ||
      !importFile ||
      reviewSource !== 'toast-workbook' ||
      importingReviewedItems
    ) {
      return
    }

    const unresolvedItems = items.filter((item) => item.status === 'review')
    if (unresolvedItems.length > 0) {
      setImportReviewedError(
        `Resolve or ignore all staged review items before importing. ${unresolvedItems.length.toLocaleString()} still need review.`,
      )
      return
    }

    const reviewedItems = items.filter(
      (item) => item.status === 'ready' && item.exportIncluded,
    )

    if (reviewedItems.length === 0) {
      setImportReviewedError('There are no reviewed items selected for import.')
      return
    }

    setImportingReviewedItems(true)
    setImportReviewedError(null)

    try {
      await persistInventoryImport({
        organizationId: activeOrganization.id,
        sourceType: 'toast-template',
        sourceName: importFile.sourceName,
        items: reviewedItems.map((item) => ({
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

      clearReviewSession(activeOrganization.id)
      setSelectedStagedItemId(null)

      await navigate({
        to: '/import-review',
        search: { workspace: 'mappings' },
      })
    } catch (error) {
      setImportReviewedError(
        error instanceof Error
          ? error.message
          : 'Unable to import the reviewed Toast items.',
      )
    } finally {
      setImportingReviewedItems(false)
    }
  }

  async function buildPopulatedWorkbook() {
    if (!workbook) throw new Error('Toast source template is not loaded')

    const happyHourEnabled = organizationConfig?.happyHourEnabled === true
    const stagedDraftSlotMappings =
      reviewSource === 'toast-workbook'
        ? getStagedDraftSlotMappings(importFile)
        : []
    const draftSlotMappings =
      stagedDraftSlotMappings.length > 0
        ? stagedDraftSlotMappings
        : getOrganizationDraftSlotMappings(organizationConfig)
    const optionalBeerCategories = organizationConfig
      ? getOptionalBeerCategories(organizationConfig).map(({ enabled, label }) => ({
          enabled,
          label,
        }))
      : []
    const populatedWorkbook = await buildPopulatedToastTemplateWorkbookWithLiquorAsync({
      templateArrayBuffer: workbook.arrayBuffer.slice(0),
      items,
      happyHourEnabled,
      happyHourStart: organizationConfig?.happyHourStart ?? null,
      happyHourEnd: organizationConfig?.happyHourEnd ?? null,
      happyHourDays: organizationConfig?.happyHourDays,
      happyHourRange2Enabled: organizationConfig?.happyHourRange2Enabled === true,
      happyHourRange2Start: organizationConfig?.happyHourRange2Start ?? null,
      happyHourRange2End: organizationConfig?.happyHourRange2End ?? null,
      happyHourRange2Days: organizationConfig?.happyHourRange2Days,
      draftSlotMappings,
      optionalBeerCategories,
    })
    const populatedWorkbookArrayBuffer = await populatedWorkbook.arrayBuffer()
    const validation = validatePopulatedToastTemplateWorkbookWithLiquor({
      workbookArrayBuffer: populatedWorkbookArrayBuffer,
      items,
      happyHourEnabled,
      happyHourStart: organizationConfig?.happyHourStart ?? null,
      happyHourEnd: organizationConfig?.happyHourEnd ?? null,
      happyHourDays: organizationConfig?.happyHourDays,
      happyHourRange2Enabled: organizationConfig?.happyHourRange2Enabled === true,
      happyHourRange2Start: organizationConfig?.happyHourRange2Start ?? null,
      happyHourRange2End: organizationConfig?.happyHourRange2End ?? null,
      happyHourRange2Days: organizationConfig?.happyHourRange2Days,
      draftSlotMappings,
      optionalBeerCategories,
    })

    if (!validation.valid) {
      setWorkbookValidation(null)
      throw new Error(
        `Generated Toast workbook validation failed: ${validation.issues.slice(0, 3).join('; ')}`,
      )
    }

    setWorkbookValidation({
      draftRows: validation.beer.draftRows,
      canRows: validation.beer.canRows,
      bottleSlotRows: validation.beer.bottleSlotRows,
      optionalBeerCategory1Rows: validation.beer.optionalBeerCategory1Rows,
      optionalBeerCategoryRows: validation.beer.optionalBeerCategoryRows,
      liquorRows: validation.liquorRows,
      cocktailRows: validation.cocktailRows,
      naBevRows: validation.naBevRows,
      retailRows: validation.retailRows,
      happyHourNotes: validation.happyHourNotes,
    })

    return populatedWorkbook
  }

  async function handleDownloadWorkbook() {
    setDownloadError(null)

    try {
      const populatedWorkbook = await buildPopulatedWorkbook()
      const filename = buildToastWorkbookFilename(organizationName)
      await downloadToastWorkbookFile(filename, populatedWorkbook)
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Unable to populate the Toast workbook')
    }
  }

  async function handleDownloadWorkbookZip() {
    setDownloadError(null)

    try {
      const populatedWorkbook = await buildPopulatedWorkbook()
      const workbookFilename = buildToastWorkbookFilename(organizationName)
      const zip = await buildToastWorkbookZip(workbookFilename, populatedWorkbook)
      await downloadToastWorkbookFile(workbookFilename.replace(/\.xlsx$/i, '.zip'), zip)
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Unable to package the Toast workbook')
    }
  }

  return (
      <section className="inventory-content">
        <header className="inventory-page-heading">
          <div>
            <p className="inventory-kicker">Export to Toast</p>
            <h1>Export to Toast</h1>
            <p>
              Build a fresh Toast workbook from the selected organization's current Inventory catalog.
            </p>
          </div>
        </header>

        <section className="inventory-card inventory-import-card">
          <div>
            <p className="inventory-kicker">Catalog source</p>
            <h2>{activeOrganization?.name ?? 'Selected organization'}</h2>
            {catalogLoading ? (
              <p>Loading Inventory catalog…</p>
            ) : reviewSource === 'catalog' ? (
              <p>The current Inventory catalog is ready for export.</p>
            ) : reviewSource === 'saved' ? (
              <p>
                Using saved reviewed state{reviewSavedAt ? ` from ${new Date(reviewSavedAt).toLocaleString()}` : ''}.
              </p>
            ) : reviewSource === 'toast-workbook' ? (
              <div>
                <p>
                  <strong>Staged Toast workbook — not saved to Inventory.</strong>{' '}
                  Review and normalize this source before any future master import.
                </p>
                <button
                  type="button"
                  className="inventory-secondary-button"
                  onClick={() => void handleClearStagedImport()}
                >
                  Clear staged import
                </button>
              </div>
            ) : reviewSource === 'review-csv' ? (
              <p>Using an advanced review CSV override for this export session.</p>
            ) : reviewSource === 'uploaded' ? (
              <p>Using an advanced source-file override for this export session.</p>
            ) : (
              <p>No Inventory catalog rows are available for export yet.</p>
            )}
          </div>
          {alohaError ? <p className="inventory-error">{alohaError}</p> : null}
        </section>

        <details className="inventory-card inventory-export-advanced">
          <summary>Advanced source override</summary>
          <p>
            Normally this page exports directly from Inventory. Use these only when testing or
            restoring an older review session.
          </p>
          <div className="inventory-upload-stack">
            <label className="inventory-upload-control">
              <span>Stage Toast workbook for review</span>
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleToastWorkbookChange}
              />
            </label>
            <label className="inventory-upload-control">
              <span>Choose review CSV</span>
              <input type="file" accept=".csv,text/csv" onChange={handleReviewCsvChange} />
            </label>
            <label className="inventory-upload-control">
              <span>Choose source CSV</span>
              <input type="file" accept=".csv,text/csv" onChange={handleAlohaCsvChange} />
            </label>
          </div>
        </details>

        {items.length > 0 ? (
          <>
            <section className="inventory-summary-grid inventory-toast-summary-grid" aria-label="Toast export summary">
              <SummaryCard label="Source rows" value={summary.rawRows} />
              <SummaryCard
                label={reviewSource === 'catalog' ? 'Catalog variants' : 'Normalized items'}
                value={summary.normalizedItems}
              />
              <SummaryCard label="Exporting" value={summary.exportItems} />
              <SummaryCard label="Beer export items" value={beerExportItemCount} />
              <SummaryCard label="Liquor export items" value={liquorExportItemCount} />
            </section>

            <section className="inventory-card inventory-source-card">
              <h2>{importFile?.sourceName ?? 'Saved reviewed menu state'}</h2>
              <dl>
                <div>
                  <dt>Source type</dt>
                  <dd>
                    {reviewSource === 'catalog'
                      ? 'Persistent Inventory catalog'
                      : reviewSource === 'toast-workbook'
                        ? 'Staged Toast workbook — browser only'
                        : reviewSource === 'review-csv'
                          ? 'Toast export review CSV'
                          : reviewSource === 'saved'
                            ? 'Reviewed Inventory state'
                            : 'Aloha CSV'}
                  </dd>
                </div>
                <div>
                  <dt>Store</dt>
                  <dd>{importFile?.meta?.store || 'Unknown'}</dd>
                </div>
                <div>
                  <dt>Ignored rows</dt>
                  <dd>{summary.ignoredItems}</dd>
                </div>
                <div>
                  <dt>Happy Hour</dt>
                  <dd>{formatHappyHourSetting(organizationConfig)}</dd>
                </div>
              </dl>
            </section>

            {reviewSource === 'toast-workbook' ? (
              <>
                <section
                  className="inventory-catalog-toolbar"
                  aria-label="Staged workbook review filters"
                >
                  <label className="inventory-search-control inventory-catalog-search">
                    <span>Search</span>
                    <input
                      type="search"
                      value={stagedReviewQuery}
                      onChange={(event) =>
                        setStagedReviewQuery(event.target.value)
                      }
                      placeholder="Search staged items…"
                    />
                  </label>

                  <label className="inventory-search-control">
                    <span>Status</span>
                    <select
                      value={stagedReviewStatus}
                      onChange={(event) =>
                        setStagedReviewStatus(
                          event.target.value as StagedReviewStatus,
                        )
                      }
                    >
                      <option value="review">
                        Needs review ({summary.reviewItems})
                      </option>
                      <option value="ready">Ready</option>
                      <option value="all">All staged items</option>
                    </select>
                  </label>

                  <label className="inventory-search-control">
                    <span>Category</span>
                    <select
                      value={stagedReviewCategory}
                      onChange={(event) =>
                        setStagedReviewCategory(event.target.value)
                      }
                    >
                      <option value="all">All categories</option>
                      {stagedReviewCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                </section>

                <section className="inventory-card inventory-catalog-card">
                  <div className="inventory-table-heading">
                    <div>
                      <p className="inventory-kicker">Staging review</p>
                      <h2>Normalized workbook rows</h2>
                      <p className="inventory-catalog-subtitle">
                        {filteredStagedItems.length === 0
                          ? '0 items'
                          : `Showing ${(
                              stagedReviewPageStart + 1
                            ).toLocaleString()}–${Math.min(
                              stagedReviewPageStart +
                                STAGED_REVIEW_PAGE_SIZE,
                              filteredStagedItems.length,
                            ).toLocaleString()} of ${filteredStagedItems.length.toLocaleString()} items`}
                      </p>
                    </div>
                  </div>

                  {importFile?.warnings.length ? (
                    <details className="inventory-export-preview">
                      <summary>
                        <span>Workbook warnings</span>
                        <strong>
                          {importFile.warnings.length.toLocaleString()}
                        </strong>
                      </summary>
                      <ul className="inventory-warning-list">
                        {importFile.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}

                  {filteredStagedItems.length === 0 ? (
                    <p className="inventory-empty-state">
                      No staged items match these filters.
                    </p>
                  ) : (
                    <div className="inventory-table-wrap">
                      <table className="inventory-table inventory-catalog-table">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Price</th>
                            <th>Status</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {stagedReviewPageItems.map((item) => (
                            <tr
                              key={item.id}
                              className="inventory-catalog-row"
                              tabIndex={0}
                              onClick={() => setSelectedStagedItemId(item.id)}
                              onKeyDown={(event) => {
                                if (
                                  event.key === 'Enter' ||
                                  event.key === ' '
                                ) {
                                  event.preventDefault()
                                  setSelectedStagedItemId(item.id)
                                }
                              }}
                            >
                              <td>
                                <div className="inventory-catalog-item-cell">
                                  <strong>{item.name}</strong>
                                  <span>{item.category || item.toastCategory}</span>
                                  <div className="inventory-format-list">
                                    <span>
                                      {item.variantLabel || 'Standard'}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td>{formatCurrency(item.basePriceCents)}</td>
                              <td>
                                <span
                                  className={
                                    item.status === 'review'
                                      ? 'inventory-carry-status'
                                      : 'inventory-carry-status is-on'
                                  }
                                >
                                  {item.status === 'review'
                                    ? 'Review'
                                    : 'Ready'}
                                </span>
                              </td>
                              <td
                                className="inventory-catalog-action-cell"
                                aria-hidden="true"
                              >
                                <span className="inventory-catalog-chevron">
                                  ›
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {filteredStagedItems.length > STAGED_REVIEW_PAGE_SIZE ? (
                    <div
                      className="inventory-catalog-pagination"
                      aria-label="Staged review pagination"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setStagedReviewPage((current) =>
                            Math.max(1, current - 1),
                          )
                        }
                        disabled={stagedReviewClampedPage <= 1}
                      >
                        Previous
                      </button>
                      <span>
                        Page {stagedReviewClampedPage.toLocaleString()} of{' '}
                        {stagedReviewPageCount.toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setStagedReviewPage((current) =>
                            Math.min(
                              stagedReviewPageCount,
                              current + 1,
                            ),
                          )
                        }
                        disabled={
                          stagedReviewClampedPage >= stagedReviewPageCount
                        }
                      >
                        Next
                      </button>
                    </div>
                  ) : null}
                </section>

                <section className="inventory-card inventory-import-card">
                  <div className="inventory-table-heading">
                    <div>
                      <p className="inventory-kicker">Post staging</p>
                      <h2>Import reviewed items</h2>
                      <p>
                        Save the reviewed rows to Inventory, then continue directly
                        to Mapping review to reconcile them with the master catalog.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="inventory-primary-button"
                      disabled={
                        importingReviewedItems ||
                        summary.reviewItems > 0 ||
                        items.filter(
                          (item) =>
                            item.status === 'ready' &&
                            item.exportIncluded,
                        ).length === 0
                      }
                      onClick={() => void handleImportReviewedItems()}
                    >
                      {importingReviewedItems
                        ? 'Importing…'
                        : 'Import reviewed items'}
                    </button>
                  </div>

                  {summary.reviewItems > 0 ? (
                    <p className="inventory-import-message">
                      {summary.reviewItems.toLocaleString()} staged item
                      {summary.reviewItems === 1 ? '' : 's'} still need review or
                      must be ignored before import.
                    </p>
                  ) : null}

                  {importReviewedError ? (
                    <p className="inventory-error">{importReviewedError}</p>
                  ) : null}
                </section>

                {selectedStagedItem ? (
                  <StagedItemDrawer
                    item={selectedStagedItem}
                    onClose={() => setSelectedStagedItemId(null)}
                    onUpdate={(patch) => {
                      updateStagedItem(selectedStagedItem.id, patch)
                      setSelectedStagedItemId(null)
                    }}
                    onIgnore={() => {
                      ignoreStagedItem(selectedStagedItem.id)
                      setSelectedStagedItemId(null)
                    }}
                  />
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        <section className="inventory-card inventory-import-card">
          <div>
            <p className="inventory-kicker">Workbook template</p>
            <h2>Fresh Toast template</h2>
            <p>
              Inventory automatically loads the repository's pristine Toast Menu Template.
              Export generation writes menu values into the existing Toast template, including
              organization-specific draft headers and enabled optional Beer categories.
            </p>
            <p><strong>{TOAST_TEMPLATE_FILE_NAME}</strong></p>
          </div>
          {workbookError ? <p className="inventory-error">{workbookError}</p> : null}
        </section>

        {workbook ? <WorkbookInspectionCard workbook={workbook} /> : null}

        <section className="inventory-card inventory-export-panel inventory-toast-export-panel">
          <div className="inventory-table-heading">
            <div>
              <p className="inventory-kicker">Ready to export</p>
              <h2>Download Toast workbook</h2>
            </div>
            <p className="inventory-export-context">
              Uses each item's Toast Destination to place it in the workbook
              {organizationConfig?.happyHourEnabled
                ? ` with Happy Hour pricing for ${formatHappyHourSetting(organizationConfig)}.`
                : ' without Happy Hour pricing.'}
            </p>
          </div>

          <p>
            Each download starts from a fresh in-memory copy of the pristine source template.
            The XLSX is ready for review, while the ZIP contains that same populated workbook
            packaged for sending to the Toast representative.
          </p>

          {workbookValidation ? (
            <div className="inventory-workbook-validation is-valid">
              <strong>Workbook validated</strong>
              <span>
                {workbookValidation.draftRows} draft rows · {workbookValidation.canRows} can rows ·{' '}
                {organizationConfig
                  ? getOptionalBeerCategories(organizationConfig)
                      .filter((category) => category.enabled)
                      .map((category) =>
                        `${workbookValidation.optionalBeerCategoryRows[category.slot - 1] ?? 0} ${category.label} rows`,
                      )
                      .join(' · ')
                  : '0 optional Beer rows'}
                {' · '}
                {workbookValidation.bottleSlotRows} Bottle-slot rows · {workbookValidation.liquorRows} liquor rows ·{' '}
                {workbookValidation.cocktailRows} cocktail rows · {workbookValidation.naBevRows} NA Bev rows ·{' '}
                {workbookValidation.retailRows} retail rows · Notes schedule checked
              </span>
            </div>
          ) : (
            <div className="inventory-workbook-validation">
              <strong>Automatic validation</strong>
              <span>
                Beer, Liquor, Cocktails, NA Bev, Retail, Happy Hour cells, optional Beer categories, 24oz cans, and the Notes schedule are checked before download.
              </span>
            </div>
          )}


          <div className="inventory-upload-stack">
            <button
              className="inventory-template-download"
              type="button"
              disabled={!workbook || items.length === 0}
              onClick={handleDownloadWorkbook}
            >
              Download populated XLSX
            </button>

            <button
              className="inventory-template-download"
              type="button"
              disabled={!workbook || items.length === 0}
              onClick={handleDownloadWorkbookZip}
            >
              Download ZIP for Toast
            </button>
          </div>

          {downloadError ? <p className="inventory-error">{downloadError}</p> : null}
        </section>
      </section>
  )
}

function StagedItemDrawer({
  item,
  onClose,
  onUpdate,
  onIgnore,
}: {
  item: NormalizedMenuItem
  onClose: () => void
  onUpdate: (patch: Partial<NormalizedMenuItem>) => void
  onIgnore: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState(() => ({ ...item }))

  useEffect(() => {
    setDraft({ ...item })
  }, [item.id])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()

    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  const hasChanges =
    draft.name !== item.name ||
    draft.category !== item.category ||
    draft.toastCategory !== item.toastCategory ||
    draft.toastDestination !== item.toastDestination ||
    draft.basePriceCents !== item.basePriceCents ||
    draft.exportIncluded !== item.exportIncluded

  const ready =
    draft.name.trim() !== '' &&
    !/^\[Review /i.test(draft.name) &&
    draft.basePriceCents !== null

  function closeWithoutSaving() {
    setDraft({ ...item })
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="inventory-edit-drawer inventory-catalog-drawer"
      aria-labelledby="staged-item-drawer-title"
      onCancel={(event) => {
        event.preventDefault()
        closeWithoutSaving()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeWithoutSaving()
      }}
    >
      <div className="inventory-catalog-drawer-heading">
        <div>
          <p className="inventory-kicker">Staged Toast workbook</p>
          <h2 id="staged-item-drawer-title">{item.name}</h2>
          <p>
            Browser-only review ·{' '}
            {item.status === 'review'
              ? 'Needs review'
              : item.status === 'ignored'
                ? 'Ignored'
                : 'Ready'}
          </p>
        </div>
        <button type="button" onClick={closeWithoutSaving}>
          Close
        </button>
      </div>

      {item.notes.length ? (
        <section className="inventory-drawer-section">
          <div className="inventory-drawer-section-heading">
            <div>
              <p className="inventory-kicker">Source warnings</p>
              <h3>Review notes</h3>
            </div>
          </div>
          <ul className="inventory-warning-list">
            {item.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="inventory-drawer-section">
        <div className="inventory-drawer-section-heading">
          <div>
            <p className="inventory-kicker">Normalized values</p>
            <h3>Toast item</h3>
          </div>
        </div>

        <label className="inventory-search-control">
          <span>Item name</span>
          <input
            type="text"
            value={draft.name}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />
        </label>

        <label className="inventory-search-control">
          <span>Menu Category</span>
          <input
            type="text"
            value={draft.category || draft.toastCategory}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                category: event.target.value,
                toastCategory: event.target.value,
              }))
            }
          />
        </label>

        <label className="inventory-search-control">
          <span>Toast destination</span>
          <input
            type="text"
            value={draft.toastDestination}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                toastDestination: event.target.value,
              }))
            }
          />
        </label>

        <label className="inventory-search-control">
          <span>Price</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={
              draft.basePriceCents === null
                ? ''
                : (draft.basePriceCents / 100).toFixed(2)
            }
            onChange={(event) => {
              const value = event.target.value.trim()
              const dollars = Number(value)
              setDraft((current) => ({
                ...current,
                basePriceCents:
                  value && Number.isFinite(dollars) && dollars > 0
                    ? Math.round(dollars * 100)
                    : null,
              }))
            }}
          />
        </label>

        <label className="inventory-inline-toggle">
          <input
            type="checkbox"
            checked={draft.exportIncluded}
            disabled={!ready}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                exportIncluded: event.target.checked,
                exportToToast: event.target.checked,
              }))
            }
          />
          <span>Include in staged Toast export</span>
        </label>
      </section>

      <div className="inventory-drawer-actions">
        <button
          type="button"
          className="inventory-danger-button"
          onClick={onIgnore}
        >
          Ignore
        </button>
        <button
          type="button"
          className="inventory-secondary-button"
          onClick={closeWithoutSaving}
        >
          Cancel
        </button>
        <button
          type="button"
          className="inventory-primary-button"
          disabled={!hasChanges && item.status === 'ready'}
          onClick={() =>
            onUpdate({
              name: draft.name,
              category: draft.category,
              toastCategory: draft.toastCategory,
              toastDestination: draft.toastDestination,
              basePriceCents: draft.basePriceCents,
              exportIncluded: draft.exportIncluded,
              exportToToast: draft.exportIncluded,
            })
          }
        >
          Update
        </button>
      </div>
    </dialog>
  )
}

function getStagedDraftSlotMappings(
  importFile: ParsedMenuImport | null,
): ToastDraftSlotMapping[] {
  const raw = importFile?.meta?.draftSlotMappings
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.flatMap((mapping): ToastDraftSlotMapping[] => {
      if (
        !mapping ||
        typeof mapping !== 'object' ||
        !('toastSizeOz' in mapping) ||
        !('actualSizeOz' in mapping)
      ) {
        return []
      }

      const toastSizeOz =
        mapping.toastSizeOz === null ? null : Number(mapping.toastSizeOz)
      const actualSizeOz = Number(mapping.actualSizeOz)

      if (
        (toastSizeOz !== null &&
          ![8, 16, 24].includes(toastSizeOz)) ||
        !Number.isFinite(actualSizeOz) ||
        actualSizeOz <= 0
      ) {
        return []
      }

      return [{ toastSizeOz, actualSizeOz }]
    })
  } catch {
    return []
  }
}

function getOrganizationDraftSlotMappings(
  config: InventoryOrganizationConfig | null,
): ToastDraftSlotMapping[] {
  const fixedDraftMappings: ToastDraftSlotMapping[] = [
    { toastSizeOz: 8, actualSizeOz: 8 },
    { toastSizeOz: 16, actualSizeOz: 16 },
    { toastSizeOz: 24, actualSizeOz: 24 },
  ]

  if (!config) return fixedDraftMappings

  const pitcherMapping =
    config.pitcherEnabled && config.pitcherActualSizeOz !== null
      ? [{ toastSizeOz: null, actualSizeOz: config.pitcherActualSizeOz }]
      : []

  return [...fixedDraftMappings, ...pitcherMapping]
}

function formatHappyHourSetting(
  config: InventoryOrganizationConfig | null,
) {
  if (!config?.happyHourEnabled) return 'Disabled'
  const range1 = `${formatHappyHourDays(config.happyHourDays)} · ${formatHappyHourWindow(config)}`
  if (!config.happyHourRange2Enabled) return range1

  const range2Days =
    config.happyHourRange2Days?.length > 0
      ? config.happyHourRange2Days
      : config.happyHourDays
  const range2Window =
    config.happyHourRange2Start && config.happyHourRange2End
      ? `${formatTime(config.happyHourRange2Start)}–${formatTime(config.happyHourRange2End)}`
      : 'Enabled'

  return `${range1} · Range 2: ${formatHappyHourDays(range2Days)} · ${range2Window}`
}

function formatHappyHourDays(days: readonly string[]) {
  if (days.length === 7) return 'Daily'

  const labels: Record<string, string> = {
    mon: 'Mon',
    tue: 'Tue',
    wed: 'Wed',
    thu: 'Thu',
    fri: 'Fri',
    sat: 'Sat',
    sun: 'Sun',
  }

  return days.map((day) => labels[day] ?? day).join(', ')
}

function formatHappyHourWindow(config: InventoryOrganizationConfig) {
  if (!config.happyHourStart || !config.happyHourEnd) return 'Enabled'

  return `${formatTime(config.happyHourStart)}–${formatTime(config.happyHourEnd)}`
}

function formatTime(value: string) {
  const [hourText, minute = '00'] = value.split(':')
  const hour = Number(hourText)
  if (!Number.isFinite(hour)) return value

  const suffix = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${minute} ${suffix}`
}

function WorkbookInspectionCard({ workbook }: { workbook: WorkbookState }) {
  return (
    <section className="inventory-card inventory-template-inspection">
      <div className="inventory-table-heading">
        <div>
          <p className="inventory-kicker">Template ready</p>
          <h2>{workbook.info.fileName}</h2>
        </div>
        <p>
          {workbook.info.warnings.length === 0
            ? 'Template compatibility checked.'
            : `${workbook.info.warnings.length} compatibility warning${workbook.info.warnings.length === 1 ? '' : 's'} detected.`}
        </p>
      </div>
    </section>
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

function isLiquorItem(item: NormalizedMenuItem) {
  return LIQUOR_CATEGORIES.has(normalizeLiquorCategory(item.toastCategory))
}

const LIQUOR_CATEGORIES = new Set([
  'BRANDY/COGNAC',
  'GIN',
  'LIQUEURS',
  'RUM',
  'SCOTCH',
  'TEQUILA',
  'VODKA',
  'WHISKEY/BOURBON',
])

function normalizeLiquorCategory(value?: string) {
  const category = clean(value).toUpperCase().replace(/&/g, '/')

  if (category.includes('WHISKEY') || category.includes('BOURBON')) return 'WHISKEY/BOURBON'
  if (category.includes('BRANDY') || category.includes('COGNAC')) return 'BRANDY/COGNAC'
  if (category.includes('LIQUEUR') || category.includes('CORDIAL')) return 'LIQUEURS'

  return category
}

function clean(value?: string) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}
