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
import { formatCurrency, summarizeMenuItems, type NormalizedMenuItem, type ParsedMenuImport } from '#/features/menu-import/types'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const app = appDefinitionsById.inventory
  const hostname = getHostname()
  const brand = getDeploymentBrand(hostname)
  const navigation = buildNavigation({
    currentApp: 'inventory',
    currentPath: '/',
    urls: getDefaultAppUrls(hostname),
  })
  const [importFile, setImportFile] = useState<ParsedMenuImport | null>(null)
  const [items, setItems] = useState<NormalizedMenuItem[]>([])
  const [importError, setImportError] = useState<string | null>(null)
  const summary = useMemo(() => summarizeMenuItems(items), [items])
  const previewItems = useMemo(() => items.filter((item) => item.status !== 'ignored').slice(0, 75), [items])

  async function handleAlohaCsvChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setImportError(null)

    try {
      const text = await file.text()
      const parsed = parseAlohaMenuCsv(text, file.name)
      const normalizedItems = normalizeAlohaMenuItems(parsed)

      setImportFile(parsed)
      setItems(normalizedItems)
    } catch (error) {
      setImportFile(null)
      setItems([])
      setImportError(error instanceof Error ? error.message : 'Unable to read the selected file')
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
          <p className="inventory-kicker">Menu items</p>
          <h1>{app.label}</h1>
          <p>
            Import Aloha menu exports, normalize the data, review items, and generate the
            Toast bulk-import format from one place.
          </p>
        </header>

        <section className="inventory-card inventory-import-card">
          <div>
            <p className="inventory-kicker">Import source</p>
            <h2>Aloha CSV import</h2>
            <p>
              This first importer reads Aloha menu-price CSV exports and converts them into
              a normalized menu-item model. The next source can be each bar&apos;s Toast Menu
              Template Google Sheet using this same normalized shape.
            </p>
          </div>

          <label className="inventory-upload-control">
            <span>Choose Aloha CSV</span>
            <input type="file" accept=".csv,text/csv" onChange={handleAlohaCsvChange} />
          </label>

          {importError ? <p className="inventory-error">{importError}</p> : null}
        </section>

        {importFile ? (
          <>
            <section className="inventory-summary-grid" aria-label="Import summary">
              <SummaryCard label="Source rows" value={summary.rawRows} />
              <SummaryCard label="Normalized items" value={summary.normalizedItems} />
              <SummaryCard label="Needs review" value={summary.reviewItems} />
              <SummaryCard label="Happy-hour prices" value={summary.happyHourItems} />
            </section>

            <section className="inventory-card inventory-source-card">
              <h2>{importFile.sourceName}</h2>
              <dl>
                <div>
                  <dt>Source type</dt>
                  <dd>Aloha CSV</dd>
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

            <section className="inventory-card inventory-table-card">
              <div className="inventory-table-heading">
                <div>
                  <p className="inventory-kicker">Review</p>
                  <h2>Normalized menu preview</h2>
                </div>
                <p>Showing {previewItems.length} of {summary.normalizedItems} non-ignored items.</p>
              </div>

              <div className="inventory-table-wrap">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>Aloha #</th>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Base price</th>
                      <th>Happy hour</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.sourceItemNumber}</td>
                        <td>
                          <strong>{item.name}</strong>
                          {item.notes.length > 0 ? <span>{item.notes.join(' · ')}</span> : null}
                        </td>
                        <td>{item.category || 'Uncategorized'}</td>
                        <td>{formatCurrency(item.basePriceCents)}</td>
                        <td>
                          {item.happyHourPriceCents === null
                            ? '—'
                            : `${formatCurrency(item.happyHourPriceCents)}${item.happyHourWindow ? ` · ${item.happyHourWindow}` : ''}`}
                        </td>
                        <td>
                          <span className={`inventory-status inventory-status-${item.status}`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <section className="inventory-card">
            <h2>Next phase ready</h2>
            <p>
              Each location can bring its own Toast Menu Template Google Sheet later. The
              importer should treat those sheets as another source adapter, normalize each
              location&apos;s sheet rows, and then compare them against Aloha-normalized items.
            </p>
          </section>
        )}
      </section>
    </main>
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
