import {
  appDefinitionsById,
  buildNavigation,
  getDefaultAppUrls,
  getDeploymentBrand,
} from '@niteowl/app-config'
import { NiteOwlNavigationIcon } from '@niteowl/ui/navigation'
import { createFileRoute } from '@tanstack/react-router'
import { type ChangeEvent, useMemo, useState } from 'react'
import { normalizeAlohaMenuItems, parseAlohaMenuCsv } from '#/features/menu-import/aloha'
import { loadReviewSession, saveReviewSession } from '#/features/menu-import/review-session'
import { isToastExportReviewCsv, parseToastExportReviewCsv } from '#/features/menu-import/toast-review-import'
import {
  buildPopulatedToastTemplateWorkbook,
  downloadPopulatedToastWorkbook,
  inspectToastTemplateWorkbook,
  type ToastTemplateWorkbookInfo,
} from '#/features/menu-import/toast-template-workbook'
import {
  summarizeMenuItems,
  type NormalizedMenuItem,
  type ParsedMenuImport,
} from '#/features/menu-import/types'

export const Route = createFileRoute('/toast-workbook')({ component: ToastWorkbook })

type WorkbookState = {
  fileName: string
  arrayBuffer: ArrayBuffer
  info: ToastTemplateWorkbookInfo
}

type ReviewSource = 'saved' | 'review-csv' | 'uploaded-aloha' | null

function ToastWorkbook() {
  const savedReviewSession = useMemo(() => loadReviewSession(), [])
  const app = appDefinitionsById.inventory
  const hostname = getHostname()
  const brand = getDeploymentBrand(hostname)
  const navigation = buildNavigation({
    currentApp: 'inventory',
    currentPath: '/toast-workbook',
    urls: getDefaultAppUrls(hostname),
  })
  const [importFile, setImportFile] = useState<ParsedMenuImport | null>(savedReviewSession?.importFile ?? null)
  const [items, setItems] = useState<NormalizedMenuItem[]>(savedReviewSession?.items ?? [])
  const [reviewSource, setReviewSource] = useState<ReviewSource>(savedReviewSession?.items.length ? 'saved' : null)
  const [reviewSavedAt, setReviewSavedAt] = useState(savedReviewSession?.savedAt ?? null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [workbook, setWorkbook] = useState<WorkbookState | null>(null)
  const [workbookError, setWorkbookError] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const summary = useMemo(() => summarizeMenuItems(items), [items])
  const beerExportItemCount = items.filter((item) => item.exportIncluded && item.toastCategory.toLowerCase() === 'beer').length

  async function handleReviewCsvChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setReviewError(null)
    setDownloadError(null)

    try {
      const text = await file.text()
      const restored = isToastExportReviewCsv(text)
        ? parseToastExportReviewCsv(text, file.name)
        : parseRawAlohaCsv(text, file.name)

      setImportFile(restored.importFile)
      setItems(restored.items)
      setReviewSource(isToastExportReviewCsv(text) ? 'review-csv' : 'uploaded-aloha')
      setReviewSavedAt(null)
      saveReviewSession(restored.importFile, restored.items)
    } catch (error) {
      setImportFile(null)
      setItems([])
      setReviewSource(null)
      setReviewSavedAt(null)
      setReviewError(error instanceof Error ? error.message : 'Unable to read the selected CSV')
    } finally {
      event.target.value = ''
    }
  }

  async function handleWorkbookChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setWorkbookError(null)
    setDownloadError(null)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const info = inspectToastTemplateWorkbook(arrayBuffer, file.name)
      setWorkbook({ fileName: file.name, arrayBuffer, info })
    } catch (error) {
      setWorkbook(null)
      setWorkbookError(error instanceof Error ? error.message : 'Unable to inspect the selected Toast template workbook')
    }
  }

  function handleDownloadWorkbook() {
    if (!workbook) return

    setDownloadError(null)

    try {
      const populatedWorkbook = buildPopulatedToastTemplateWorkbook({
        templateArrayBuffer: workbook.arrayBuffer,
        items,
      })
      downloadPopulatedToastWorkbook(workbook.fileName, populatedWorkbook)
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Unable to populate the Toast workbook')
    }
  }

  return (
    <main className="inventory-shell">
      <aside className="inventory-sidebar" aria-label="Application navigation">
        <a className="inventory-brand" href="/">
          <span className="inventory-brand-icon" aria-hidden="true">
            <NiteOwlNavigationIcon icon={app.icon} />
          </span>
          <span>
            <span className="inventory-brand-eyebrow">{brand}</span>
            <span className="inventory-brand-title">{app.label}</span>
          </span>
        </a>

        <nav className="inventory-nav">
          {[...navigation.primary, ...navigation.apps].map((section) => (
            <section key={section.id} className="inventory-nav-section">
              {section.label ? <h2>{section.label}</h2> : null}
              <ul>
                {section.items.map((item) => (
                  <li key={item.id}>
                    <a
                      className={item.active ? 'inventory-nav-link is-active' : 'inventory-nav-link'}
                      href={item.href}
                    >
                      <span className="inventory-nav-icon" aria-hidden="true">
                        <NiteOwlNavigationIcon icon={item.icon} />
                      </span>
                      <span>{item.label}</span>
                      {item.external ? <span className="inventory-nav-external">↗</span> : null}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      </aside>

      <section className="inventory-content">
        <header className="inventory-hero">
          <p className="inventory-kicker">Toast workbook</p>
          <h1>Populate Toast template</h1>
          <p>
            Upload a downloaded Toast Menu Template workbook. This page uses reviewed menu
            state from the main Inventory page or from a downloaded toast-export-review.csv save file.
          </p>
        </header>

        <section className="inventory-card inventory-import-card">
          <div>
            <p className="inventory-kicker">Step 1</p>
            <h2>Reviewed menu state</h2>
            <p>
              Preferred durable save: upload <strong>toast-export-review.csv</strong>. Browser
              session state is used when available, and raw Aloha CSV upload remains a fallback.
            </p>
            {reviewSource === 'saved' ? (
              <p>
                Using saved browser reviewed state{reviewSavedAt ? ` from ${new Date(reviewSavedAt).toLocaleString()}` : ''}.
              </p>
            ) : reviewSource === 'review-csv' ? (
              <p>Using reviewed rows restored from toast-export-review.csv.</p>
            ) : reviewSource === 'uploaded-aloha' ? (
              <p>Using raw normalized Aloha CSV rows from this page.</p>
            ) : (
              <p>No reviewed state loaded yet. Upload toast-export-review.csv or review an Aloha CSV on the Menu Items page.</p>
            )}
          </div>
          <label className="inventory-upload-control">
            <span>Choose review CSV</span>
            <input type="file" accept=".csv,text/csv" onChange={handleReviewCsvChange} />
          </label>
          {reviewError ? <p className="inventory-error">{reviewError}</p> : null}
        </section>

        {items.length > 0 ? (
          <>
            <section className="inventory-summary-grid" aria-label="Aloha import summary">
              <SummaryCard label="Source rows" value={summary.rawRows} />
              <SummaryCard label="Normalized items" value={summary.normalizedItems} />
              <SummaryCard label="Exporting" value={summary.exportItems} />
              <SummaryCard label="Beer export items" value={beerExportItemCount} />
            </section>

            <section className="inventory-card inventory-source-card">
              <h2>{importFile?.sourceName ?? 'Reviewed menu state'}</h2>
              <dl>
                <div>
                  <dt>Source type</dt>
                  <dd>{getReviewSourceLabel(reviewSource)}</dd>
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
            <h2>Toast template workbook</h2>
            <p>
              Use a downloaded .xlsx copy of the Toast Menu Template. The first implementation
              inspects the Beer tab headers so bars can have different draft sizes and packaged
              beer groups.
            </p>
          </div>
          <label className="inventory-upload-control">
            <span>Choose Toast .xlsx</span>
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleWorkbookChange} />
          </label>
          {workbookError ? <p className="inventory-error">{workbookError}</p> : null}
        </section>

        {workbook ? <WorkbookInspectionCard workbook={workbook} /> : null}

        <section className="inventory-card inventory-export-panel">
          <div className="inventory-table-heading">
            <div>
              <p className="inventory-kicker">Step 3</p>
              <h2>Download populated workbook</h2>
            </div>
            <p>First pass writes Beer tab values only.</p>
          </div>

          <p>
            The populated workbook is generated from the current reviewed menu rows and the
            uploaded Toast template workbook. Later passes can add Liquor, Wine, Cocktails,
            NA Bev, Menu Build, and Modifier Build tabs.
          </p>

          <button
            className="inventory-template-download"
            type="button"
            disabled={!workbook || items.length === 0}
            onClick={handleDownloadWorkbook}
          >
            Download populated Toast workbook
          </button>

          {downloadError ? <p className="inventory-error">{downloadError}</p> : null}
        </section>
      </section>
    </main>
  )
}

function parseRawAlohaCsv(text: string, fileName: string) {
  const importFile = parseAlohaMenuCsv(text, fileName)
  return {
    importFile,
    items: normalizeAlohaMenuItems(importFile),
  }
}

function getReviewSourceLabel(source: ReviewSource) {
  if (source === 'saved') return 'Saved browser reviewed state'
  if (source === 'review-csv') return 'toast-export-review.csv'
  if (source === 'uploaded-aloha') return 'Raw Aloha CSV fallback'
  return 'None'
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

function getHostname() {
  return typeof window === 'undefined' ? 'inventory.niteowl.dev' : window.location.hostname
}
