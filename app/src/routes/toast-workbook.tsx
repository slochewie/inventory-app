import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  CircleCheckBig,
  CircleOff,
  CircleX,
  Info,
  ListChecks,
  Upload,
} from 'lucide-react'
import {
  AuthenticatedInventoryShell,
  useInventoryAccessRole,
} from '#/components/authenticated-inventory-shell'
import { catalogRowToNormalizedItem } from '#/features/menu-import/catalog'
import { authClient } from '#/lib/auth-client'
import {
  addInventoryOrganizationVariant,
  getInventoryOrganizationConfig,
  getOptionalBeerCategories,
  listInventoryCatalog,
  persistInventoryImport,
  type InventoryCatalogRow,
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
import { getBuiltInToastDestinations } from '#/features/menu-import/toast-destination'
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
  getBuiltInMenuCategories,
  listSavedMenuCategories,
  mergeCategoryOptions,
} from '#/lib/menu-categories'
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

type ReconciliationDecision =
  | { kind: 'existing'; variantId: string }
  | { kind: 'new-variant'; itemId: string }
  | { kind: 'new' }

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

function isReviewCsvSession(importFile: ParsedMenuImport | null | undefined) {
  if (!importFile) return false

  return (
    importFile.meta?.source === 'toast-review-csv-staging' ||
    importFile.meta?.restoredFrom === 'toast-export-review.csv' ||
    /(?:^|[\\/])toast-export-review(?:[^\\/]*)\.csv$/i.test(
      importFile.sourceName.trim(),
    )
  )
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
    openItemsRows: number
    happyHourNotes: boolean
  } | null>(null)
  const [stagedReviewQuery, setStagedReviewQuery] = useState('')
  const [stagedReviewStatus, setStagedReviewStatus] =
    useState<StagedReviewStatus>('review')
  const [stagedReviewCategory, setStagedReviewCategory] = useState('all')
  const [stagedReviewPage, setStagedReviewPage] = useState(1)
  const [stagedBulkEditEnabled, setStagedBulkEditEnabled] = useState(false)
  const [selectedStagedBulkIds, setSelectedStagedBulkIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [stagedBulkHelpOpen, setStagedBulkHelpOpen] = useState(false)
  const stagedBulkHelpRef = useRef<HTMLDivElement>(null)
  const [selectedStagedItemId, setSelectedStagedItemId] =
    useState<string | null>(null)
  const [importingReviewedItems, setImportingReviewedItems] = useState(false)
  const [importReviewedError, setImportReviewedError] = useState<string | null>(null)
  const [masterCatalog, setMasterCatalog] = useState<InventoryCatalogRow[]>([])
  const [reconciliationActive, setReconciliationActive] = useState(false)
  const [reconciliationScopeIds, setReconciliationScopeIds] = useState<Set<string> | null>(null)
  const [reconciliationDecisions, setReconciliationDecisions] = useState<
    Record<string, ReconciliationDecision>
  >({})
  const [selectedReconciliationItemId, setSelectedReconciliationItemId] =
    useState<string | null>(null)
  const [reconciliationQuery, setReconciliationQuery] = useState('')

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
  const stagedVisibleIds = stagedReviewPageItems.map((item) => item.id)
  const allVisibleStagedSelected =
    stagedVisibleIds.length > 0 &&
    stagedVisibleIds.every((itemId) => selectedStagedBulkIds.has(itemId))
  const selectedStagedItem =
    items.find((item) => item.id === selectedStagedItemId) ?? null
  const isStagedReviewSource =
    reviewSource === 'toast-workbook' || reviewSource === 'review-csv'

  useEffect(() => {
    setStagedReviewPage(1)
    setSelectedStagedBulkIds(new Set())
  }, [stagedReviewCategory, stagedReviewQuery, stagedReviewStatus])

  useEffect(() => {
    if (!stagedBulkHelpOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (
        stagedBulkHelpRef.current &&
        !stagedBulkHelpRef.current.contains(event.target as Node)
      ) {
        setStagedBulkHelpOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setStagedBulkHelpOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [stagedBulkHelpOpen])

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
    setStagedBulkEditEnabled(false)
    setSelectedStagedBulkIds(new Set())
    setStagedBulkHelpOpen(false)
    setStagedReviewQuery('')
    setStagedReviewStatus('review')
    setStagedReviewCategory('all')
    setStagedReviewPage(1)
    setWorkbookValidation(null)
    setDownloadError(null)
    setAlohaError(null)
    setReconciliationActive(false)
    setReconciliationScopeIds(null)
    setReconciliationDecisions({})
    setSelectedReconciliationItemId(null)
    setReconciliationQuery('')

    if (savedReviewSession?.items.length) {
      setImportFile(savedReviewSession.importFile)
      setItems(savedReviewSession.items)
      const savedSource =
        savedReviewSession.importFile?.meta?.source === 'toast-workbook-staging'
          ? 'toast-workbook'
          : isReviewCsvSession(savedReviewSession.importFile)
            ? 'review-csv'
            : 'saved'

      setReviewSource(savedSource)
      if (savedSource === 'review-csv') {
        setStagedReviewStatus('all')
      }
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
        setMasterCatalog(catalog.items)

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
      setMasterCatalog(catalog.items)
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

  function toggleAllVisibleStagedItems() {
    setSelectedStagedBulkIds((current) => {
      const next = new Set(current)
      const shouldSelect = !stagedVisibleIds.every((itemId) => next.has(itemId))

      stagedVisibleIds.forEach((itemId) => {
        if (shouldSelect) next.add(itemId)
        else next.delete(itemId)
      })

      return next
    })
  }

  function toggleStagedBulkItem(itemId: string) {
    setSelectedStagedBulkIds((current) => {
      const next = new Set(current)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  function applyStagedBulkAction(
    action: 'ready' | 'ignore' | 'include' | 'exclude',
  ) {
    if (selectedStagedBulkIds.size === 0) return

    setItems((current) => {
      const next = current.map((item) => {
        if (!selectedStagedBulkIds.has(item.id)) return item

        const structurallyReady =
          item.name.trim() !== '' &&
          !/^\[Review /i.test(item.name) &&
          item.basePriceCents !== null

        if (action === 'ignore') {
          return {
            ...item,
            status: 'ignored' as const,
            exportToToast: false,
            exportIncluded: false,
            stagingExplicitlyExcluded: true,
          }
        }

        if (action === 'exclude') {
          return {
            ...item,
            status: structurallyReady ? ('ready' as const) : ('review' as const),
            exportToToast: false,
            exportIncluded: false,
            stagingExplicitlyExcluded: structurallyReady,
          }
        }

        if (!structurallyReady) return item

        return {
          ...item,
          status: 'ready' as const,
          exportToToast: true,
          exportIncluded: true,
          stagingExplicitlyExcluded: false,
        }
      })

      saveReviewSession(importFile, next, activeOrganization?.id)
      return next
    })

    setSelectedStagedBulkIds(new Set())
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
      const stagedImportFile: ParsedMenuImport = {
        ...parsed.importFile,
        meta: {
          ...parsed.importFile.meta,
          source: 'toast-review-csv-staging',
          store: activeOrganization?.name ?? 'Organization',
          organizationId: activeOrganization?.id ?? '',
        },
      }

      setImportFile(stagedImportFile)
      setItems(parsed.items)
      setReviewSource('review-csv')
      setReviewSavedAt(null)
      setStagedReviewQuery('')
      setStagedReviewStatus('all')
      setStagedReviewCategory('all')
      setStagedReviewPage(1)
      saveReviewSession(stagedImportFile, parsed.items, activeOrganization?.id)
    } catch (error) {
      setImportFile(null)
      setItems([])
      setReviewSource(null)
      setReviewSavedAt(null)
      setAlohaError(error instanceof Error ? error.message : 'Unable to restore the selected Toast export review CSV')
    }
  }

  function applyMasterItemToReconciliation(
    masterItemId: string,
    scopedItems: NormalizedMenuItem[],
  ) {
    setReconciliationDecisions((current) => {
      const next = { ...current }

      for (const item of scopedItems) {
        const compatibleVariant = findMasterCandidates(item, masterCatalog).find(
          (candidate) => candidate.id === masterItemId,
        )

        next[item.id] = compatibleVariant
          ? {
              kind: 'existing',
              variantId: compatibleVariant.variant.id,
            }
          : {
              kind: 'new-variant',
              itemId: masterItemId,
            }
      }

      return next
    })
  }

  function beginReconciliation() {
    const readyExportableIds = new Set(
      items
        .filter(
          (item) => item.status === 'ready' && item.exportIncluded,
        )
        .map((item) => item.id),
    )
    const selectedReadyIds = new Set(
      [...selectedStagedBulkIds].filter((itemId) =>
        readyExportableIds.has(itemId),
      ),
    )

    setReconciliationScopeIds(
      selectedReadyIds.size > 0 ? selectedReadyIds : null,
    )
    setReconciliationDecisions({})
    setReconciliationActive(true)
    setSelectedReconciliationItemId(null)
    setReconciliationQuery('')
    setImportReviewedError(null)
  }

  async function handleImportReviewedItems() {
    if (
      !activeOrganization?.id ||
      !importFile ||
      !isStagedReviewSource ||
      importingReviewedItems
    ) {
      return
    }

    const reviewedItems = items.filter(
      (item) =>
        item.status === 'ready' &&
        item.exportIncluded &&
        reconciliationDecisions[item.id],
    )

    if (reviewedItems.length === 0) {
      setImportReviewedError(
        'Review at least one staged item before importing.',
      )
      return
    }

    setImportingReviewedItems(true)
    setImportReviewedError(null)

    try {
      const resolvedVariantIds = new Map<string, string>()

      for (const item of reviewedItems) {
        const decision = reconciliationDecisions[item.id]
        if (decision?.kind !== 'new-variant') continue

        const variantId = await addInventoryOrganizationVariant({
          organizationId: activeOrganization.id,
          itemId: decision.itemId,
          toastCategory: item.toastCategory,
          toastDestination: getVariantCreationDestination(
            item,
            organizationConfig,
          ),
          toastSlot: item.toastSlot ?? null,
        })

        resolvedVariantIds.set(item.id, variantId)
      }

      await persistInventoryImport({
        organizationId: activeOrganization.id,
        sourceType: 'toast-template',
        sourceName: importFile.sourceName,
        reconciliationMode: 'explicit',
        items: reviewedItems.map((item) => {
          const decision = reconciliationDecisions[item.id]
          return {
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
            targetVariantId:
              decision?.kind === 'existing'
                ? decision.variantId
                : decision?.kind === 'new-variant'
                  ? resolvedVariantIds.get(item.id)
                  : undefined,
            createNewMaster:
              decision?.kind === 'new' ? true : undefined,
          }
        }),
      })

      const importedItemIds = new Set(
        reviewedItems.map((item) => item.id),
      )
      const remainingItems = items.filter(
        (item) => !importedItemIds.has(item.id),
      )

      if (remainingItems.length > 0) {
        saveReviewSession(
          importFile,
          remainingItems,
          activeOrganization.id,
        )
      } else {
        clearReviewSession(activeOrganization.id)
      }

      setItems(remainingItems)
      setSelectedStagedBulkIds((current) => {
        const next = new Set(current)
        importedItemIds.forEach((itemId) => next.delete(itemId))
        return next
      })
      setSelectedStagedItemId(null)
      setSelectedReconciliationItemId(null)
      setReconciliationDecisions({})
      setReconciliationActive(false)
      setReconciliationScopeIds(null)
      setReconciliationQuery('')

      const refreshedCatalog = await listInventoryCatalog(
        activeOrganization.id,
      )
      setMasterCatalog(refreshedCatalog.items)

      if (remainingItems.length === 0) {
        await navigate({
          to: '/import-review',
          search: { workspace: 'history' },
        })
      }
    } catch (error) {
      setImportReviewedError(
        error instanceof Error
          ? error.message
          : 'Unable to import the reconciled Toast items.',
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
    const builtInFormatVisibility = organizationConfig
      ? {
          draft8Enabled: organizationConfig.draft8Enabled,
          draft16Enabled: organizationConfig.draft16Enabled,
          draft24Enabled: organizationConfig.draft24Enabled,
          pitcherEnabled: organizationConfig.pitcherEnabled,
          canEnabled: organizationConfig.canEnabled,
          bottleEnabled: organizationConfig.bottleEnabled,
        }
      : undefined
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
      builtInFormatVisibility,
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
      builtInFormatVisibility,
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
      openItemsRows: validation.openItemsRows,
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
              <div>
                <p>
                  <strong>Staged export preview CSV — not saved to Inventory.</strong>{' '}
                  Review and normalize this source before exporting.
                </p>
                <button
                  type="button"
                  className="inventory-secondary-button"
                  onClick={() => void handleClearStagedImport()}
                >
                  Clear staged import
                </button>
              </div>
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
              <span>Stage export preview CSV for review</span>
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

            {isStagedReviewSource ? (
              <>
                <section
                  className="inventory-catalog-toolbar"
                  aria-label="Staged source review filters"
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
                      <option value="ready">Ready ({items.filter((item) => item.status === 'ready').length})</option>
                      <option value="all">All staged items ({items.length})</option>
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
                      <h2>Normalized staged rows</h2>
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

                  <div
                    className={`inventory-catalog-bulk-toolbar${stagedBulkEditEnabled ? ' is-active' : ''}`}
                    aria-label="Bulk staged review controls"
                  >
                    <button
                      type="button"
                      className="inventory-catalog-bulk-toggle"
                      aria-pressed={stagedBulkEditEnabled}
                      title={stagedBulkEditEnabled ? 'Exit bulk edit' : 'Bulk edit'}
                      onClick={() => {
                        setStagedBulkEditEnabled((current) => !current)
                        setSelectedStagedBulkIds(new Set())
                      }}
                    >
                      <ListChecks aria-hidden="true" />
                      <span>Bulk edit</span>
                    </button>

                    <div
                      ref={stagedBulkHelpRef}
                      className="inventory-catalog-bulk-help"
                    >
                      <button
                        type="button"
                        className="inventory-catalog-bulk-help-button"
                        aria-label="Staged bulk edit button key"
                        aria-expanded={stagedBulkHelpOpen}
                        title="Bulk edit button key"
                        onClick={() => setStagedBulkHelpOpen((current) => !current)}
                      >
                        <Info aria-hidden="true" />
                      </button>

                      {stagedBulkHelpOpen ? (
                        <div
                          className="inventory-catalog-bulk-help-popover"
                          role="dialog"
                          aria-label="Staged bulk edit button key"
                        >
                          <strong>Bulk edit key</strong>
                          <div>
                            <span><CircleCheckBig aria-hidden="true" /></span>
                            <p><b>Ready</b> — mark valid selected rows ready and included.</p>
                          </div>
                          <div>
                            <span><CircleX aria-hidden="true" /></span>
                            <p><b>Ignore</b> — remove selected rows from staging and reconciliation.</p>
                          </div>
                          <div>
                            <span><Upload aria-hidden="true" /></span>
                            <p><b>Include</b> — include valid selected rows in export and reconciliation.</p>
                          </div>
                          <div>
                            <span><CircleOff aria-hidden="true" /></span>
                            <p><b>Exclude</b> — keep selected rows staged but exclude them from export and reconciliation.</p>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {stagedBulkEditEnabled ? (
                      <>
                        <span className="inventory-catalog-bulk-count">
                          {selectedStagedBulkIds.size} selected
                        </span>
                        <div className="inventory-catalog-bulk-actions">
                          <button
                            type="button"
                            title="Mark selected staged items ready"
                            aria-label="Mark selected staged items ready"
                            disabled={selectedStagedBulkIds.size === 0}
                            onClick={() => applyStagedBulkAction('ready')}
                          >
                            <CircleCheckBig aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            title="Ignore selected staged items"
                            aria-label="Ignore selected staged items"
                            disabled={selectedStagedBulkIds.size === 0}
                            onClick={() => applyStagedBulkAction('ignore')}
                          >
                            <CircleX aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            title="Include selected staged items"
                            aria-label="Include selected staged items"
                            disabled={selectedStagedBulkIds.size === 0}
                            onClick={() => applyStagedBulkAction('include')}
                          >
                            <Upload aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            title="Exclude selected staged items"
                            aria-label="Exclude selected staged items"
                            disabled={selectedStagedBulkIds.size === 0}
                            onClick={() => applyStagedBulkAction('exclude')}
                          >
                            <CircleOff aria-hidden="true" />
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>

                  {importFile?.warnings.length ? (
                    <details className="inventory-export-preview">
                      <summary>
                        <span>Source warnings</span>
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
                            {stagedBulkEditEnabled ? (
                              <th className="inventory-catalog-select-column">
                                <input
                                  type="checkbox"
                                  checked={allVisibleStagedSelected}
                                  aria-label="Select all visible staged rows"
                                  onChange={toggleAllVisibleStagedItems}
                                />
                              </th>
                            ) : null}
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
                              tabIndex={stagedBulkEditEnabled ? -1 : 0}
                              onClick={() => {
                                if (!stagedBulkEditEnabled) {
                                  setSelectedStagedItemId(item.id)
                                }
                              }}
                              onKeyDown={(event) => {
                                if (
                                  !stagedBulkEditEnabled &&
                                  (event.key === 'Enter' || event.key === ' ')
                                ) {
                                  event.preventDefault()
                                  setSelectedStagedItemId(item.id)
                                }
                              }}
                            >
                              {stagedBulkEditEnabled ? (
                                <td className="inventory-catalog-select-column">
                                  <input
                                    type="checkbox"
                                    checked={selectedStagedBulkIds.has(item.id)}
                                    aria-label={`Select ${item.name}`}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={() => toggleStagedBulkItem(item.id)}
                                  />
                                </td>
                              ) : null}
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
                                    : item.status === 'ignored'
                                      ? 'Ignored'
                                      : item.exportIncluded
                                        ? 'Ready'
                                        : 'Excluded'}
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

                {isStagedReviewSource ? (
                  <section className="inventory-card inventory-post-staging-card">
                    <div className="inventory-post-staging-heading">
                      <div>
                        <p className="inventory-kicker">Post staging</p>
                        <h2>
                          {reconciliationActive
                            ? 'Reconcile with master catalog'
                            : 'Master mapping review'}
                        </h2>
                        <p>
                          {reconciliationActive
                            ? 'Choose the shared master item once, then verify each staged format before importing.'
                            : 'Only reviewed mappings are written to Inventory. Selected ready rows can be handled independently.'}
                        </p>
                      </div>
                    {!reconciliationActive ? (
                      <button
                        type="button"
                        className="inventory-primary-button"
                        disabled={
                          selectedStagedBulkIds.size > 0
                            ? !items.some(
                                (item) =>
                                  selectedStagedBulkIds.has(item.id) &&
                                  item.status === 'ready' &&
                                  item.exportIncluded,
                              )
                            : summary.reviewItems > 0 ||
                              items.filter(
                                (item) =>
                                  item.status === 'ready' &&
                                  item.exportIncluded,
                              ).length === 0
                        }
                        onClick={beginReconciliation}
                      >
                        {selectedStagedBulkIds.size > 0
                          ? `Review selected mappings (${[...selectedStagedBulkIds].filter((itemId) =>
                              items.some(
                                (item) =>
                                  item.id === itemId &&
                                  item.status === 'ready' &&
                                  item.exportIncluded,
                              ),
                            ).length})`
                          : 'Review master mappings'}
                      </button>
                    ) : null}
                  </div>

                  <div className="inventory-post-staging-status">
                    <span>
                      {selectedStagedBulkIds.size > 0
                        ? `${selectedStagedBulkIds.size.toLocaleString()} selected`
                        : `${items.filter((item) => item.status === 'ready' && item.exportIncluded).length.toLocaleString()} ready`}
                    </span>
                    {summary.reviewItems > 0 ? (
                      <span className="is-warning">
                        {summary.reviewItems.toLocaleString()} still need review
                      </span>
                    ) : (
                      <span className="is-ready">Staging review complete</span>
                    )}
                  </div>

                  {reconciliationActive ? (
                    <StagedReconciliationPanel
                      items={items.filter(
                        (item) =>
                          item.status === 'ready' &&
                          item.exportIncluded &&
                          (!reconciliationScopeIds ||
                            reconciliationScopeIds.has(item.id)),
                      )}
                      catalog={masterCatalog}
                      decisions={reconciliationDecisions}
                      query={reconciliationQuery}
                      onQueryChange={setReconciliationQuery}
                      onReview={setSelectedReconciliationItemId}
                      onApplyMaster={(masterItemId, scopedItems) =>
                        applyMasterItemToReconciliation(
                          masterItemId,
                          scopedItems,
                        )
                      }
                      onCancel={() => {
                        setReconciliationActive(false)
                        setReconciliationScopeIds(null)
                        setReconciliationDecisions({})
                        setSelectedReconciliationItemId(null)
                        setReconciliationQuery('')
                      }}
                      onImport={() => void handleImportReviewedItems()}
                      importing={importingReviewedItems}
                    />
                  ) : null}

                    {importReviewedError ? (
                      <p className="inventory-error">{importReviewedError}</p>
                    ) : null}
                  </section>
                ) : null}

                {isStagedReviewSource && selectedReconciliationItemId ? (
                  <StagedReconciliationDrawer
                    item={
                      items.find(
                        (item) => item.id === selectedReconciliationItemId,
                      )!
                    }
                    catalog={masterCatalog}
                    decision={
                      reconciliationDecisions[selectedReconciliationItemId]
                    }
                    onClose={() => setSelectedReconciliationItemId(null)}
                    onChooseExisting={(variantId) => {
                      setReconciliationDecisions((current) => ({
                        ...current,
                        [selectedReconciliationItemId]: {
                          kind: 'existing',
                          variantId,
                        },
                      }))
                      setSelectedReconciliationItemId(null)
                    }}
                    onChooseNewVariant={(itemId) => {
                      setReconciliationDecisions((current) => ({
                        ...current,
                        [selectedReconciliationItemId]: {
                          kind: 'new-variant',
                          itemId,
                        },
                      }))
                      setSelectedReconciliationItemId(null)
                    }}
                    newMasterGroupCount={items.filter(
                      (candidate) =>
                        candidate.status === 'ready' &&
                        candidate.exportIncluded &&
                        (!reconciliationScopeIds ||
                          reconciliationScopeIds.has(candidate.id)) &&
                        normalizeMasterName(candidate.name) ===
                          normalizeMasterName(
                            items.find(
                              (item) =>
                                item.id === selectedReconciliationItemId,
                            )?.name ?? '',
                          ),
                    ).length}
                    onChooseNew={() => {
                      const selectedItem = items.find(
                        (item) => item.id === selectedReconciliationItemId,
                      )
                      const normalizedSelectedName = normalizeMasterName(
                        selectedItem?.name ?? '',
                      )

                      setReconciliationDecisions((current) => {
                        const next = { ...current }

                        items
                          .filter(
                            (candidate) =>
                              candidate.status === 'ready' &&
                              candidate.exportIncluded &&
                              (!reconciliationScopeIds ||
                                reconciliationScopeIds.has(candidate.id)) &&
                              normalizeMasterName(candidate.name) ===
                                normalizedSelectedName,
                          )
                          .forEach((candidate) => {
                            next[candidate.id] = { kind: 'new' }
                          })

                        return next
                      })
                      setSelectedReconciliationItemId(null)
                    }}
                  />
                ) : null}

                {selectedStagedItem ? (
                  <StagedItemDrawer
                    item={selectedStagedItem}
                    organizationId={activeOrganization?.id ?? ''}
                    organizationConfig={organizationConfig}
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
                {workbookValidation.retailRows} retail rows · {workbookValidation.openItemsRows} Open Items rows · Notes schedule checked
              </span>
            </div>
          ) : (
            <div className="inventory-workbook-validation">
              <strong>Automatic validation</strong>
              <span>
                Beer, Liquor, Cocktails, NA Bev, Retail, Open Items, Happy Hour cells, optional Beer categories, 24oz cans, and the Notes schedule are checked before download.
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

function StagedReconciliationPanel({
  items,
  catalog,
  decisions,
  query,
  onQueryChange,
  onReview,
  onApplyMaster,
  onCancel,
  onImport,
  importing,
}: {
  items: NormalizedMenuItem[]
  catalog: InventoryCatalogRow[]
  decisions: Record<string, ReconciliationDecision>
  query: string
  onQueryChange: (value: string) => void
  onReview: (itemId: string) => void
  onApplyMaster: (
    masterItemId: string,
    scopedItems: NormalizedMenuItem[],
  ) => void
  onCancel: () => void
  onImport: () => void
  importing: boolean
}) {
  const normalizedQuery = query.trim().toLowerCase()
  const filteredItems = items.filter((item) =>
    !normalizedQuery ||
    [item.name, item.category ?? '', item.toastCategory, item.variantLabel ?? '']
      .some((value) => value.toLowerCase().includes(normalizedQuery)),
  )
  const decidedCount = items.filter((item) => decisions[item.id]).length
  const unresolvedCount = items.length - decidedCount
  const newCount = items.filter(
    (item) => decisions[item.id]?.kind === 'new',
  ).length
  const newVariantCount = items.filter(
    (item) => decisions[item.id]?.kind === 'new-variant',
  ).length
  const mappedCount = decidedCount - newCount - newVariantCount
  const masterItems = getUniqueMasterItems(catalog)
  const normalizedNames = [...new Set(items.map((item) => normalizeMasterName(item.name)))]
  const exactMaster =
    normalizedNames.length === 1
      ? masterItems.find(
          (candidate) =>
            normalizeMasterName(candidate.name) === normalizedNames[0],
        ) ?? null
      : null
  const [groupMasterItemId, setGroupMasterItemId] = useState(
    exactMaster?.id ?? '',
  )

  useEffect(() => {
    setGroupMasterItemId(exactMaster?.id ?? '')
  }, [exactMaster?.id, items])

  return (
    <div className="inventory-import-workspace">
      <div className="inventory-reconciliation-overview">
        <div className="inventory-reconciliation-counts">
          <span><strong>{items.length}</strong> selected</span>
          <span><strong>{unresolvedCount}</strong> unresolved</span>
          <span><strong>{mappedCount}</strong> existing variants</span>
          <span><strong>{newVariantCount}</strong> new variants</span>
          {newCount > 0 ? (
            <span><strong>{newCount}</strong> new masters</span>
          ) : null}
        </div>

        <div className="inventory-reconciliation-master-picker">
          <div>
            <strong>Master item for selected rows</strong>
            <span>
              Apply one master item to the group. Compatible formats map to an
              existing variant; missing formats become new variants.
            </span>
          </div>
          <div className="inventory-reconciliation-master-controls">
            <select
              value={groupMasterItemId}
              onChange={(event) => setGroupMasterItemId(event.target.value)}
              aria-label="Master item for selected staged rows"
            >
              <option value="">Choose master item…</option>
              {masterItems.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="inventory-primary-button"
              disabled={!groupMasterItemId || importing}
              onClick={() => onApplyMaster(groupMasterItemId, items)}
            >
              Apply to all {items.length}
            </button>
          </div>
        </div>

        <label className="inventory-search-control inventory-reconciliation-search">
          <span>Filter selected rows</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Item name, category, format…"
          />
        </label>
      </div>

      <div className="inventory-table-wrap">
        <table className="inventory-table inventory-reconcile-table">
          <thead>
            <tr>
              <th>Staged item</th>
              <th>Decision</th>
              <th>Suggested match</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => {
              const decision = decisions[item.id]
              const selected =
                decision?.kind === 'existing'
                  ? catalog.find(
                      (candidate) =>
                        candidate.variant.id === decision.variantId,
                    )
                  : null
              const suggested = findMasterCandidates(item, catalog)[0] ?? null

              return (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                    <span>
                      {item.variantLabel ||
                        item.category ||
                        item.toastCategory}
                    </span>
                  </td>
                  <td>
                    {decision?.kind === 'new'
                      ? 'Will create new master'
                      : decision?.kind === 'new-variant'
                        ? `Add new variant to ${catalog.find((candidate) => candidate.id === decision.itemId)?.name ?? 'existing master'}`
                        : selected
                          ? `Map to ${formatMasterVariant(selected)}`
                          : 'Needs decision'}
                  </td>
                  <td>
                    {suggested
                      ? formatMasterVariant(suggested)
                      : 'No close match'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="inventory-row-action"
                      onClick={() => onReview(item.id)}
                    >
                      {decision ? 'Change' : 'Review'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {unresolvedCount > 0 ? (
        <p className="inventory-reconciliation-note">
          {unresolvedCount.toLocaleString()} unresolved item
          {unresolvedCount === 1 ? '' : 's'} will remain staged. Only rows with a
          mapping decision are imported.
        </p>
      ) : null}

      <div className="inventory-reconciliation-actions">
        <button
          type="button"
          className="inventory-secondary-button"
          disabled={importing}
          onClick={onCancel}
        >
          Back
        </button>
        <button
          type="button"
          className="inventory-primary-button"
          disabled={importing || decidedCount === 0}
          onClick={onImport}
        >
          {importing
            ? 'Importing…'
            : newCount > 0
              ? `Create/import ${decidedCount.toLocaleString()} reviewed item${decidedCount === 1 ? '' : 's'}`
              : `Import ${decidedCount.toLocaleString()} reviewed item${decidedCount === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  )
}

function StagedReconciliationDrawer({
  item,
  catalog,
  decision,
  onClose,
  onChooseExisting,
  onChooseNewVariant,
  newMasterGroupCount,
  onChooseNew,
}: {
  item: NormalizedMenuItem
  catalog: InventoryCatalogRow[]
  decision?: ReconciliationDecision
  onClose: () => void
  onChooseExisting: (variantId: string) => void
  onChooseNewVariant: (itemId: string) => void
  newMasterGroupCount: number
  onChooseNew: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState('')
  const candidates = findMasterCandidates(item, catalog, query)
  const masterItems = findMasterItems(item, catalog, query)

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
      className="inventory-edit-drawer inventory-catalog-drawer"
      aria-labelledby="staged-reconciliation-title"
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
          <p className="inventory-kicker">Master reconciliation</p>
          <h2 id="staged-reconciliation-title">{item.name}</h2>
          <p>
            {item.variantLabel || item.category || item.toastCategory}
          </p>
        </div>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>

      <section className="inventory-drawer-section">
        <div className="inventory-drawer-section-heading">
          <div>
            <p className="inventory-kicker">Decision</p>
            <h3>Choose master destination</h3>
            <p>
              This only sets the reconciliation decision. Nothing is written to
              Inventory until you click Import reviewed items.
            </p>
          </div>
        </div>

        <button
          type="button"
          className={
            decision?.kind === 'new'
              ? 'inventory-primary-button'
              : 'inventory-secondary-button'
          }
          onClick={onChooseNew}
        >
          {newMasterGroupCount > 1
            ? `Create one new master on import with ${newMasterGroupCount} formats`
            : 'Create new master on import'}
        </button>
      </section>

      <section className="inventory-drawer-section">
        <div className="inventory-drawer-section-heading">
          <div>
            <p className="inventory-kicker">Existing master item</p>
            <h3>Add as a new variant</h3>
            <p>
              Use this when the product already exists in the master catalog but
              this organization needs a new format or size.
            </p>
          </div>
        </div>

        <label className="inventory-search-control">
          <span>Find master item</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search master catalog…"
          />
        </label>

        <div className="inventory-reconcile-candidate-list">
          {masterItems.length === 0 ? (
            <p className="inventory-empty-state">
              No master items match this search.
            </p>
          ) : (
            masterItems.slice(0, 50).map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className={
                  decision?.kind === 'new-variant' &&
                  decision.itemId === candidate.id
                    ? 'inventory-reconcile-candidate is-selected'
                    : 'inventory-reconcile-candidate'
                }
                onClick={() => onChooseNewVariant(candidate.id)}
              >
                <strong>{candidate.name}</strong>
                <span>
                  Add {formatStagedVariantForDecision(item)} to this master item
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="inventory-drawer-section">
        <label className="inventory-search-control">
          <span>Map to existing master variant</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search master catalog…"
          />
        </label>

        <div className="inventory-reconcile-candidate-list">
          {candidates.length === 0 ? (
            <p className="inventory-empty-state">
              No compatible master variants match this search.
            </p>
          ) : (
            candidates.slice(0, 50).map((candidate) => (
              <button
                key={candidate.variant.id}
                type="button"
                className={
                  decision?.kind === 'existing' &&
                  decision.variantId === candidate.variant.id
                    ? 'inventory-reconcile-candidate is-selected'
                    : 'inventory-reconcile-candidate'
                }
                onClick={() => onChooseExisting(candidate.variant.id)}
              >
                <strong>{candidate.name}</strong>
                <span>{formatMasterVariant(candidate)}</span>
              </button>
            ))
          )}
        </div>
      </section>
    </dialog>
  )
}

function getUniqueMasterItems(catalog: InventoryCatalogRow[]) {
  const unique = new Map<string, InventoryCatalogRow>()

  catalog
    .filter((candidate) => candidate.active)
    .forEach((candidate) => {
      if (!unique.has(candidate.id)) unique.set(candidate.id, candidate)
    })

  return [...unique.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  )
}

function findMasterItems(
  item: NormalizedMenuItem,
  catalog: InventoryCatalogRow[],
  query = '',
) {
  const normalizedQuery = normalizeMasterName(query)
  const normalizedItemName = normalizeMasterName(item.name)
  const unique = new Map<string, InventoryCatalogRow>()

  catalog
    .filter((candidate) => candidate.active)
    .forEach((candidate) => {
      if (!unique.has(candidate.id)) unique.set(candidate.id, candidate)
    })

  return [...unique.values()]
    .filter((candidate) => {
      if (!normalizedQuery) return true
      return normalizeMasterName(
        `${candidate.name} ${candidate.category?.name ?? ''}`,
      ).includes(normalizedQuery)
    })
    .map((candidate) => ({
      candidate,
      exact:
        normalizeMasterName(candidate.name) === normalizedItemName ? 0 : 1,
      distance: masterNameDistance(
        normalizedItemName,
        normalizeMasterName(candidate.name),
      ),
    }))
    .sort(
      (left, right) =>
        left.exact - right.exact ||
        left.distance - right.distance ||
        left.candidate.name.localeCompare(right.candidate.name),
    )
    .map(({ candidate }) => candidate)
}

function formatStagedVariantForDecision(item: NormalizedMenuItem) {
  return (
    item.toastDestination
      .replace(/^Beer tab\s*[·:-]?\s*/i, '')
      .trim() ||
    item.variantLabel ||
    item.category ||
    item.toastCategory
  )
}

function getVariantCreationDestination(
  item: NormalizedMenuItem,
  config: InventoryOrganizationConfig | null,
) {
  if (
    item.toastCategory.toLowerCase() === 'beer' &&
    item.toastSlot &&
    config
  ) {
    const optional = getOptionalBeerCategories(config).find(
      (category) => category.key === item.toastSlot,
    )

    if (optional) {
      const label = optional.label.trim()
      if (/^\d+(?:\.\d+)?\s*oz$/i.test(label)) {
        return `Beer tab · ${label} Draft`
      }
      return `Beer tab · ${label}`
    }
  }

  return item.toastDestination
}

function findMasterCandidates(
  item: NormalizedMenuItem,
  catalog: InventoryCatalogRow[],
  query = '',
) {
  const normalizedQuery = normalizeMasterName(query)
  const normalizedItemName = normalizeMasterName(item.name)

  return catalog
    .filter((candidate) => candidate.active && candidate.variant.active)
    .filter((candidate) => masterVariantCompatible(item, candidate))
    .filter((candidate) => {
      if (!normalizedQuery) return true
      return normalizeMasterName(
        `${candidate.name} ${candidate.variant.name ?? ''} ${candidate.category?.name ?? ''}`,
      ).includes(normalizedQuery)
    })
    .map((candidate) => ({
      candidate,
      exact:
        normalizeMasterName(candidate.name) === normalizedItemName ? 0 : 1,
      distance: masterNameDistance(
        normalizedItemName,
        normalizeMasterName(candidate.name),
      ),
    }))
    .sort(
      (left, right) =>
        left.exact - right.exact ||
        left.distance - right.distance ||
        left.candidate.name.localeCompare(right.candidate.name),
    )
    .map(({ candidate }) => candidate)
}

function masterVariantCompatible(
  item: NormalizedMenuItem,
  candidate: InventoryCatalogRow,
) {
  if (item.variantKind && candidate.variant.kind !== item.variantKind) {
    return false
  }

  if (
    item.variantSizeOz !== undefined &&
    item.variantSizeOz !== candidate.variant.sizeOz
  ) {
    return false
  }

  if (
    item.variantPackageType !== undefined &&
    item.variantPackageType !== candidate.variant.packageType
  ) {
    return false
  }

  return true
}

function normalizeMasterName(value: string) {
  return value
    .toLowerCase()
    .replace(/\b\d+(?:\.\d+)?\s*oz\b/g, ' ')
    .replace(
      /\b(draft|pint|imperial|imp|reg|regular|can|bottle|btl|tall)\b/g,
      ' ',
    )
    .replace(/[^a-z0-9]+/g, '')
}

function masterNameDistance(left: string, right: string) {
  if (left === right) return 0
  if (!left) return right.length
  if (!right) return left.length

  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  )

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1

      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      )
    }

    for (let index = 0; index < current.length; index += 1) {
      previous[index] = current[index]
    }
  }

  return previous[right.length]
}

function formatMasterVariant(item: InventoryCatalogRow) {
  const details = [
    item.variant.name,
    item.variant.sizeOz !== null ? `${item.variant.sizeOz}oz` : null,
    item.variant.packageType,
    item.category?.name,
  ].filter(Boolean)

  return details.length > 0
    ? `${item.name} · ${details.join(' · ')}`
    : item.name
}

function StagedItemDrawer({
  item,
  organizationId,
  organizationConfig,
  onClose,
  onUpdate,
  onIgnore,
}: {
  item: NormalizedMenuItem
  organizationId: string
  organizationConfig: InventoryOrganizationConfig | null
  onClose: () => void
  onUpdate: (patch: Partial<NormalizedMenuItem>) => void
  onIgnore: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState(() => ({ ...item }))
  const savedMenuCategories = organizationId
    ? listSavedMenuCategories(organizationId)
    : []
  const menuCategoryOptions = mergeCategoryOptions(
    getBuiltInMenuCategories(),
    mergeCategoryOptions(
      [...LIQUOR_CATEGORIES].map((category) => formatLiquorCategoryLabel(category)),
      savedMenuCategories.map((category) => category.name),
    ),
  )
  const normalizedDraftCategory = normalizeStagedMenuCategory(
    draft.category || draft.toastCategory,
  )
  const beerDestinationOptions = getStagedBeerDestinationOptions(
    organizationConfig,
  )
  const nonBeerDestinationOptions = mergeCategoryOptions(
    getBuiltInToastDestinations().filter(
      (destination) => !destination.toLowerCase().startsWith('beer tab'),
    ),
    savedMenuCategories
      .map((category) => category.toastDestination)
      .filter(Boolean),
  )
  const destinationOptions =
    normalizedDraftCategory.toLowerCase() === 'beer'
      ? beerDestinationOptions.map((option) => option.value)
      : nonBeerDestinationOptions

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
    draft.toastSlot !== item.toastSlot ||
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
          <select
            value={normalizedDraftCategory}
            onChange={(event) => {
              const category = event.target.value
              const isBeer = category.toLowerCase() === 'beer'
              setDraft((current) => ({
                ...current,
                category,
                toastCategory: category,
                toastDestination: isBeer ? '' : category,
                toastSlot: null,
              }))
            }}
          >
            {menuCategoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className="inventory-search-control">
          <span>Toast destination</span>
          <select
            value={getStagedDestinationSelectValue(
              draft,
              beerDestinationOptions,
            )}
            onChange={(event) => {
              const value = event.target.value
              const beerOption = beerDestinationOptions.find(
                (option) => option.value === value,
              )

              setDraft((current) => ({
                ...current,
                toastDestination: value,
                toastSlot: beerOption?.toastSlot ?? null,
              }))
            }}
          >
            <option value="">Choose destination…</option>
            {destinationOptions.map((destination) => (
              <option key={destination} value={destination}>
                {formatStagedDestinationLabel(
                  destination,
                  beerDestinationOptions,
                )}
              </option>
            ))}
          </select>
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
              toastSlot: draft.toastSlot ?? null,
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

type StagedBeerDestinationOption = {
  value: string
  label: string
  toastSlot: string | null
}

function normalizeStagedMenuCategory(value: string) {
  const normalized = clean(value)
  if (/^beer(?:\s*\/|$)/i.test(normalized)) return 'Beer'
  if (/^cocktails?$/i.test(normalized)) return 'Cocktails'
  if (/^na\s+bev/i.test(normalized)) return 'NA Bev'
  return normalized || 'Beer'
}

function formatLiquorCategoryLabel(value: string) {
  const labels: Record<string, string> = {
    'BRANDY/COGNAC': 'Brandy/Cognac',
    GIN: 'Gin',
    LIQUEURS: 'Liqueurs',
    RUM: 'Rum',
    SCOTCH: 'Scotch',
    TEQUILA: 'Tequila',
    VODKA: 'Vodka',
    'WHISKEY/BOURBON': 'Whiskey/Bourbon',
  }
  return labels[value] ?? value
}

function getStagedBeerDestinationOptions(
  config: InventoryOrganizationConfig | null,
): StagedBeerDestinationOption[] {
  if (!config) return []

  const options: StagedBeerDestinationOption[] = []

  if (config.draft8Enabled) {
    options.push({
      value: 'Beer tab · Draft Beer 8oz',
      label: '8oz Draft',
      toastSlot: null,
    })
  }
  if (config.draft16Enabled) {
    options.push({
      value: 'Beer tab · Draft Beer 16oz',
      label: '16oz Draft',
      toastSlot: null,
    })
  }
  if (config.draft24Enabled) {
    options.push({
      value: 'Beer tab · Draft Beer 24oz',
      label: '24oz Draft',
      toastSlot: null,
    })
  }
  if (config.pitcherEnabled) {
    options.push({
      value: 'Beer tab · Pitcher',
      label: 'Pitcher',
      toastSlot: null,
    })
  }
  if (config.canEnabled) {
    options.push({
      value: 'Beer tab · Can',
      label: 'Can',
      toastSlot: null,
    })
  }
  if (config.bottleEnabled) {
    options.push({
      value: 'Beer tab · Bottle',
      label: 'Bottle',
      toastSlot: null,
    })
  }

  getOptionalBeerCategories(config)
    .filter((category) => category.enabled)
    .forEach((category) => {
      const destinationLabel = /^\d+(?:\.\d+)?\s*oz$/i.test(
        category.label.trim(),
      )
        ? `${category.label} Draft`
        : category.label

      options.push({
        value: `Beer tab · ${destinationLabel}`,
        label: category.label,
        toastSlot: category.key,
      })
    })

  return options
}

function getStagedDestinationSelectValue(
  item: NormalizedMenuItem,
  beerOptions: StagedBeerDestinationOption[],
) {
  if (item.toastSlot) {
    const bySlot = beerOptions.find(
      (option) => option.toastSlot === item.toastSlot,
    )
    if (bySlot) return bySlot.value
  }

  if (beerOptions.some((option) => option.value === item.toastDestination)) {
    return item.toastDestination
  }

  const normalizedDestination = clean(item.toastDestination).toLowerCase()
  const byLabel = beerOptions.find((option) =>
    normalizedDestination.includes(option.label.toLowerCase()),
  )
  return byLabel?.value ?? item.toastDestination
}

function formatStagedDestinationLabel(
  value: string,
  beerOptions: StagedBeerDestinationOption[],
) {
  return beerOptions.find((option) => option.value === value)?.label ?? value
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
