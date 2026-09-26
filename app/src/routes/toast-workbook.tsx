import { createFileRoute } from '@tanstack/react-router'
import { type ChangeEvent, useEffect, useMemo, useState } from 'react'
import {
  AuthenticatedInventoryShell,
  useInventoryAccessRole,
} from '#/components/authenticated-inventory-shell'
import { catalogRowToNormalizedItem } from '#/features/menu-import/catalog'
import { authClient } from '#/lib/auth-client'
import {
  getInventoryOrganizationConfig,
  listInventoryCatalog,
  type InventoryOrganizationConfig,
} from '#/lib/inventory-access'
import { normalizeAlohaMenuItems, parseAlohaMenuCsv } from '#/features/menu-import/aloha'
import { loadReviewSession, saveReviewSession } from '#/features/menu-import/review-session'
import { parseToastExportReviewCsv } from '#/features/menu-import/toast-review-import'
import {
  buildPopulatedToastTemplateWorkbookWithLiquorAsync,
  validatePopulatedToastTemplateWorkbookWithLiquor,
} from '#/features/menu-import/toast-template-liquor-workbook'
import {
  buildToastWorkbookFilename,
  buildToastWorkbookZip,
  downloadToastWorkbookFile,
  inspectToastTemplateWorkbook,
  type ToastTemplateWorkbookInfo,
} from '#/features/menu-import/toast-template-workbook'
import {
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

function ToastWorkbook() {
  const savedReviewSession = useMemo(() => loadReviewSession(), [])
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [importFile, setImportFile] = useState<ParsedMenuImport | null>(savedReviewSession?.importFile ?? null)
  const [items, setItems] = useState<NormalizedMenuItem[]>(savedReviewSession?.items ?? [])
  const [reviewSource, setReviewSource] = useState<
    'catalog' | 'saved' | 'review-csv' | 'uploaded' | null
  >(savedReviewSession?.items.length ? 'saved' : null)
  const [reviewSavedAt, setReviewSavedAt] = useState(savedReviewSession?.savedAt ?? null)
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
    liquorRows: number
    happyHourNotes: boolean
  } | null>(null)

  const summary = useMemo(() => summarizeMenuItems(items), [items])
  const beerExportItemCount = items.filter((item) => item.exportIncluded && item.toastCategory === 'Beer').length
  const liquorExportItemCount = items.filter((item) => item.exportIncluded && isLiquorItem(item)).length
  const organizationName = importFile?.meta?.store?.trim() || 'Organization'

  useEffect(() => {
    if (!activeOrganization?.id) return

    const controller = new AbortController()
    setCatalogLoading(true)

    void Promise.all([
      listInventoryCatalog(activeOrganization.id, controller.signal),
      getInventoryOrganizationConfig(activeOrganization.id, controller.signal),
    ])
      .then(([catalog, config]) => {
        setOrganizationConfig(config)
        if (catalog.items.length === 0) return

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
      saveReviewSession(parsed, normalizedItems)
    } catch (error) {
      setImportFile(null)
      setItems([])
      setReviewSource(null)
      setReviewSavedAt(null)
      setAlohaError(error instanceof Error ? error.message : 'Unable to read the selected Aloha CSV')
    }
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
      saveReviewSession(parsed.importFile, parsed.items)
    } catch (error) {
      setImportFile(null)
      setItems([])
      setReviewSource(null)
      setReviewSavedAt(null)
      setAlohaError(error instanceof Error ? error.message : 'Unable to restore the selected Toast export review CSV')
    }
  }

  async function buildPopulatedWorkbook() {
    if (!workbook) throw new Error('Toast source template is not loaded')

    const happyHourEnabled = organizationConfig?.happyHourEnabled === true
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
      liquorRows: validation.liquorRows,
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
              <SummaryCard label="Normalized items" value={summary.normalizedItems} />
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
          </>
        ) : null}

        <section className="inventory-card inventory-import-card">
          <div>
            <p className="inventory-kicker">Workbook template</p>
            <h2>Fresh Toast template</h2>
            <p>
              Inventory automatically loads the repository's pristine Toast Menu Template.
              Export generation writes menu values into its existing cells without renaming
              headers or changing the workbook structure.
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
              Writes Beer and Liquor tab values
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
                {workbookValidation.bottleSlotRows} Bottle-slot rows · {workbookValidation.liquorRows} liquor rows ·{' '}
                Notes schedule checked
              </span>
            </div>
          ) : (
            <div className="inventory-workbook-validation">
              <strong>Automatic validation</strong>
              <span>
                Beer/Liquor values, Happy Hour cells, 24oz cans, and the Notes-tab schedule are checked before download.
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
  const beer = workbook.info.beer

  return (
    <section className="inventory-card inventory-template-inspection">
      <div className="inventory-table-heading">
        <div>
          <p className="inventory-kicker">Detected workbook</p>
          <h2>{workbook.info.fileName}</h2>
        </div>
        <p>{workbook.info.sheetNames.length.toLocaleString()} tabs found.</p>
      </div>

      {beer ? (
        <dl className="inventory-template-detected-grid">
          <div>
            <dt>Beer tab</dt>
            <dd>{beer.sheetName}</dd>
          </div>
          <div>
            <dt>Header row</dt>
            <dd>{beer.headerRow}</dd>
          </div>
          <div>
            <dt>Draft sizes</dt>
            <dd>{beer.draftSizes.length ? beer.draftSizes.join(', ') : 'None detected'}</dd>
          </div>
          <div>
            <dt>Packaged groups</dt>
            <dd>{formatDetectedGroups(beer.packagedGroups)}</dd>
          </div>
        </dl>
      ) : null}

      {workbook.info.warnings.length > 0 ? (
        <ul className="inventory-warning-list">
          {workbook.info.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <details className="inventory-export-preview">
        <summary>
          <span>Workbook tabs</span>
          <strong>{workbook.info.sheetNames.length.toLocaleString()}</strong>
        </summary>
        <div className="inventory-template-tab-list">
          {workbook.info.sheetNames.map((sheetName) => (
            <span key={sheetName}>{sheetName}</span>
          ))}
        </div>
      </details>
    </section>
  )
}

function formatDetectedGroups(groups: string[]) {
  if (groups.length === 0) return 'None detected'

  const counts = new Map<string, number>()
  groups.forEach((group) => {
    counts.set(group, (counts.get(group) ?? 0) + 1)
  })

  return [...counts.entries()]
    .map(([group, count]) => count > 1 ? `${group} ×${count}` : group)
    .join(', ')
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
