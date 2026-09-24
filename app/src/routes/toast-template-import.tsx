import { createFileRoute } from '@tanstack/react-router'
import { type ChangeEvent, useMemo, useState } from 'react'
import {
  AuthenticatedInventoryShell,
  useInventoryAccessRole,
} from '#/components/authenticated-inventory-shell'
import { authClient } from '#/lib/auth-client'
import { persistInventoryImport } from '#/lib/inventory-access'
import { saveReviewSession } from '#/features/menu-import/review-session'
import { buildToastExportFiles, downloadCsv } from '#/features/menu-import/toast-export'
import { parseToastTemplateWorkbook } from '#/features/menu-import/toast-template-import'
import {
  summarizeMenuItems,
  type NormalizedMenuItem,
  type ParsedMenuImport,
} from '#/features/menu-import/types'

export const Route = createFileRoute('/toast-template-import')({ component: ToastTemplateImportRoute })

function ToastTemplateImportRoute() {
  const { canImportExport } = useInventoryAccessRole()

  return (
    <AuthenticatedInventoryShell
      currentPath="/toast-template-import"
      requiredCapability="import-export"
    >
      {canImportExport ? <ToastTemplateImport /> : null}
    </AuthenticatedInventoryShell>
  )
}

function ToastTemplateImport() {
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [importFile, setImportFile] = useState<ParsedMenuImport | null>(null)
  const [items, setItems] = useState<NormalizedMenuItem[]>([])
  const [importError, setImportError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const summary = useMemo(() => summarizeMenuItems(items), [items])
  const exportReviewFile = useMemo(() => (
    buildToastExportFiles(items).find((file) => file.id === 'export-review') ?? null
  ), [items])
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    items.forEach((item) => counts.set(item.toastCategory, (counts.get(item.toastCategory) ?? 0) + 1))
    return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right))
  }, [items])

  async function handleSaveToInventory() {
    if (!activeOrganization?.id || !importFile || items.length === 0) return

    setSaveState('saving')
    setSaveMessage(null)

    try {
      const result = await persistInventoryImport({
        organizationId: activeOrganization.id,
        sourceType: 'toast-template',
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

      setSaveState('saved')
      setSaveMessage(
        'Saved ' +
          result.importedItems.toLocaleString() +
          ' items and ' +
          result.importedVariants.toLocaleString() +
          ' variants to the persistent Inventory catalog.',
      )
    } catch (error) {
      setSaveState('error')
      setSaveMessage(
        error instanceof Error
          ? error.message
          : 'Unable to save the Toast workbook import.',
      )
    }
  }

  async function handleWorkbookChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setImportError(null)

    try {
      const parsed = parseToastTemplateWorkbook(await file.arrayBuffer(), file.name)
      setImportFile(parsed.importFile)
      setItems(parsed.items)
      setSaveState('idle')
      setSaveMessage(null)
      saveReviewSession(parsed.importFile, parsed.items)
    } catch (error) {
      setImportFile(null)
      setItems([])
      setImportError(error instanceof Error ? error.message : 'Unable to read the selected Toast template workbook')
    }
  }

  return (
      <section className="inventory-content">
        <header className="inventory-hero">
          <p className="inventory-kicker">Toast template import</p>
          <h1>Import populated Toast workbook</h1>
          <p>
            Upload an already populated Toast Menu Template .xlsx. The importer reads common
            Toast tabs, normalizes rows into the Inventory item model, and can save the result
            into the selected organization's persistent Inventory catalog.
          </p>
        </header>

        <section className="inventory-card inventory-import-card">
          <div>
            <p className="inventory-kicker">Import source</p>
            <h2>Populated Toast template .xlsx</h2>
            <p>
              First pass reads Beer, Liquor, Wine, Cocktails, NA Bev, and Retail tabs. Beer
              headers can be renamed for draft sizes, cans, bottles, or 24oz cans. Retail can
              come from a Retail tab or the NA Bev tab when the row&apos;s Group says Retail.
            </p>
          </div>

          <label className="inventory-upload-control">
            <span>Choose Toast .xlsx</span>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleWorkbookChange}
            />
          </label>

          {importError ? <p className="inventory-error">{importError}</p> : null}
        </section>

        {importFile ? (
          <>
            <section className="inventory-summary-grid" aria-label="Toast template import summary">
              <SummaryCard label="Imported items" value={items.length} />
              <SummaryCard label="Exporting" value={summary.exportItems} />
              <SummaryCard label="Categories" value={categoryCounts.length} />
              <SummaryCard label="Needs review" value={summary.reviewItems} />
            </section>

            <section className="inventory-card inventory-source-card">
              <div className="inventory-table-heading">
                <div>
                  <p className="inventory-kicker">Parsed workbook</p>
                  <h2>{importFile.sourceName}</h2>
                </div>

                <button
                  className="inventory-template-download"
                  type="button"
                  disabled={
                    !canImportExport ||
                    saveState === 'saving' ||
                    items.length === 0 ||
                    !activeOrganization?.id
                  }
                  onClick={handleSaveToInventory}
                >
                  {saveState === 'saving' ? 'Saving…' : 'Save to Inventory'}
                </button>
              </div>

              {saveMessage ? (
                <p className={saveState === 'error' ? 'inventory-error' : undefined}>
                  {saveMessage}
                </p>
              ) : null}

              <dl>
                <div>
                  <dt>Source type</dt>
                  <dd>Toast Menu Template workbook</dd>
                </div>
                <div>
                  <dt>Imported tabs</dt>
                  <dd>{importFile.meta?.tabs || 'Unknown'}</dd>
                </div>
                <div>
                  <dt>Saved state</dt>
                  <dd>
                    {saveState === 'saved'
                      ? 'Saved to persistent Inventory'
                      : 'Ready to save to persistent Inventory'}
                  </dd>
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

            <section className="inventory-card inventory-export-panel">
              <div className="inventory-table-heading">
                <div>
                  <p className="inventory-kicker">Durable save</p>
                  <h2>Export review CSV</h2>
                </div>
                <p>{exportReviewFile?.rowCount.toLocaleString() ?? 0} reviewed rows.</p>
              </div>
              <p>
                Download this file as the portable save point. You can upload it on the Toast
                Workbook page later, even after the browser session is gone.
              </p>
              <button
                className="inventory-template-download"
                type="button"
                disabled={!exportReviewFile || exportReviewFile.rowCount === 0}
                onClick={() => exportReviewFile ? downloadCsv(exportReviewFile.filename, exportReviewFile.rows) : undefined}
              >
                Download toast-export-review.csv
              </button>
            </section>

            <section className="inventory-card inventory-table-card">
              <div className="inventory-table-heading">
                <div>
                  <p className="inventory-kicker">Detected categories</p>
                  <h2>Imported item groups</h2>
                </div>
                <p>{categoryCounts.length.toLocaleString()} groups.</p>
              </div>

              <div className="inventory-template-tab-list">
                {categoryCounts.map(([category, count]) => (
                  <span key={category}>{category} ({count.toLocaleString()})</span>
                ))}
              </div>
            </section>
          </>
        ) : null}
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
