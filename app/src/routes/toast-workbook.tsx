import { createFileRoute } from '@tanstack/react-router'
import { type ChangeEvent, useEffect, useMemo, useState } from 'react'
import { AuthenticatedInventoryShell } from '#/components/authenticated-inventory-shell'
import { normalizeAlohaMenuItems, parseAlohaMenuCsv } from '#/features/menu-import/aloha'
import { loadReviewSession, saveReviewSession } from '#/features/menu-import/review-session'
import { parseToastExportReviewCsv } from '#/features/menu-import/toast-review-import'
import { buildPopulatedToastTemplateWorkbookWithLiquorAsync } from '#/features/menu-import/toast-template-liquor-workbook'
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

export const Route = createFileRoute('/toast-workbook')({ component: ToastWorkbook })

const TOAST_TEMPLATE_FILE_NAME = 'Toast-Menu-Template-Your-Restaurant-Name.xlsx'
const TOAST_TEMPLATE_URL = `/toast/menu/${TOAST_TEMPLATE_FILE_NAME}`

type WorkbookState = {
  fileName: string
  arrayBuffer: ArrayBuffer
  info: ToastTemplateWorkbookInfo
}

function ToastWorkbook() {
  const savedReviewSession = useMemo(() => loadReviewSession(), [])
  const [importFile, setImportFile] = useState<ParsedMenuImport | null>(savedReviewSession?.importFile ?? null)
  const [items, setItems] = useState<NormalizedMenuItem[]>(savedReviewSession?.items ?? [])
  const [reviewSource, setReviewSource] = useState<'saved' | 'review-csv' | 'uploaded' | null>(savedReviewSession?.items.length ? 'saved' : null)
  const [reviewSavedAt, setReviewSavedAt] = useState(savedReviewSession?.savedAt ?? null)
  const [alohaError, setAlohaError] = useState<string | null>(null)
  const [workbook, setWorkbook] = useState<WorkbookState | null>(null)
  const [workbookError, setWorkbookError] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const summary = useMemo(() => summarizeMenuItems(items), [items])
  const beerExportItemCount = items.filter((item) => item.exportIncluded && item.toastCategory === 'Beer').length
  const liquorExportItemCount = items.filter((item) => item.exportIncluded && isLiquorItem(item)).length
  const organizationName = importFile?.meta?.store?.trim() || 'Organization'

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

    return buildPopulatedToastTemplateWorkbookWithLiquorAsync({
      templateArrayBuffer: workbook.arrayBuffer.slice(0),
      items,
    })
  }

  async function handleDownloadWorkbook() {
    setDownloadError(null)

    try {
      const populatedWorkbook = await buildPopulatedWorkbook()
      const filename = buildToastWorkbookFilename(organizationName)
      downloadToastWorkbookFile(filename, populatedWorkbook)
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
      downloadToastWorkbookFile(workbookFilename.replace(/\.xlsx$/i, '.zip'), zip)
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Unable to package the Toast workbook')
    }
  }

  return (
    <AuthenticatedInventoryShell currentPath="/toast-workbook">
      <section className="inventory-content">
        <header className="inventory-hero">
          <p className="inventory-kicker">Toast workbook</p>
          <h1>Populate Toast template</h1>
          <p>
            Populate a fresh copy of the bundled, unaltered Toast Menu Template using reviewed
            menu rows from the main Inventory page or a saved toast-export-review.csv file.
          </p>
        </header>

        <section className="inventory-card inventory-import-card">
          <div>
            <p className="inventory-kicker">Step 1</p>
            <h2>Reviewed menu state</h2>
            <p>
              Preferred: upload <strong>toast-export-review.csv</strong>, your durable save file.
              A saved browser review state is used automatically when present. Raw Aloha CSV is
              still available as a fallback, but it starts from unedited normalized data.
            </p>
            {reviewSource === 'saved' ? (
              <p>
                Using saved reviewed state{reviewSavedAt ? ` from ${new Date(reviewSavedAt).toLocaleString()}` : ''}.
              </p>
            ) : reviewSource === 'review-csv' ? (
              <p>Using restored reviewed rows from toast-export-review.csv.</p>
            ) : reviewSource === 'uploaded' ? (
              <p>Using the raw Aloha CSV uploaded on this workbook page.</p>
            ) : (
              <p>No reviewed state found yet. Upload toast-export-review.csv or go to Menu Items to review the Aloha CSV.</p>
            )}
          </div>
          <div className="inventory-upload-stack">
            <label className="inventory-upload-control">
              <span>Choose toast-export-review.csv</span>
              <input type="file" accept=".csv,text/csv" onChange={handleReviewCsvChange} />
            </label>
            <label className="inventory-upload-control">
              <span>Choose raw Aloha CSV</span>
              <input type="file" accept=".csv,text/csv" onChange={handleAlohaCsvChange} />
            </label>
          </div>
          {alohaError ? <p className="inventory-error">{alohaError}</p> : null}
        </section>

        {items.length > 0 ? (
          <>
            <section className="inventory-summary-grid" aria-label="Aloha import summary">
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
                  <dd>{reviewSource === 'review-csv' ? 'Toast export review CSV' : reviewSource === 'saved' ? 'Reviewed Inventory state' : 'Aloha CSV'}</dd>
                </div>
                <div>
                  <dt>Store</dt>
                  <dd>{importFile?.meta?.store || 'Unknown'}</dd>
                </div>
                <div>
                  <dt>Ignored rows</dt>
                  <dd>{summary.ignoredItems}</dd>
                </div>
              </dl>
            </section>
          </>
        ) : null}

        <section className="inventory-card inventory-import-card">
          <div>
            <p className="inventory-kicker">Step 2</p>
            <h2>Toast source template</h2>
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

        <section className="inventory-card inventory-export-panel">
          <div className="inventory-table-heading">
            <div>
              <p className="inventory-kicker">Step 3</p>
              <h2>Download populated workbook</h2>
            </div>
            <p>Writes Beer and Liquor tab values.</p>
          </div>

          <p>
            Each download starts from a fresh in-memory copy of the pristine source template.
            The XLSX is ready for review, while the ZIP contains that same populated workbook
            packaged for sending to the Toast representative.
          </p>

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
    </AuthenticatedInventoryShell>
  )
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
            <dd>{beer.packagedGroups.length ? beer.packagedGroups.join(', ') : 'None detected'}</dd>
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

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="inventory-summary-card">
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </article>
  )
}

function isLiquorItem(item: NormalizedMenuItem) {
  const category = clean(item.category).toUpperCase()
  const toastCategory = clean(item.toastCategory).toUpperCase()

  if (category === 'WINE GLASS') return false

  return ['BOURB WHISK', 'BRANDY/COGNAC', 'GIN', 'LIQUEURS', 'RUM', 'SCOTCH', 'TEQUILA', 'VODKA', 'WHISKEY/BOURBON']
    .includes(category || toastCategory)
}

function clean(value?: string) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}
