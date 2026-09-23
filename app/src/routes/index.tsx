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

type ItemFilter = 'active' | 'ready' | 'review' | 'happy-hour' | 'ignored' | 'all'

type FilterOption = {
  id: ItemFilter
  label: string
  count: number
}

const PAGE_SIZE = 50

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
  const [filter, setFilter] = useState<ItemFilter>('active')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const summary = useMemo(() => summarizeMenuItems(items), [items])
  const filterOptions = useMemo<FilterOption[]>(() => ([
    { id: 'active', label: 'All active', count: summary.normalizedItems },
    { id: 'ready', label: 'Ready', count: items.filter((item) => item.status === 'ready').length },
    { id: 'review', label: 'Review', count: summary.reviewItems },
    { id: 'happy-hour', label: 'Happy hour', count: summary.happyHourItems },
    { id: 'ignored', label: 'Ignored', count: summary.ignoredItems },
    { id: 'all', label: 'Everything', count: items.length },
  ]), [items, summary])
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return items.filter((item) => {
      if (filter === 'active' && item.status === 'ignored') return false
      if (filter === 'ready' && item.status !== 'ready') return false
      if (filter === 'review' && item.status !== 'review') return false
      if (filter === 'happy-hour' && item.happyHourPriceCents === null) return false
      if (filter === 'ignored' && item.status !== 'ignored') return false

      if (!normalizedQuery) return true

      return [
        item.sourceItemNumber,
        item.name,
        item.category,
        item.notes.join(' '),
      ].some((value) => value?.toLowerCase().includes(normalizedQuery))
    })
  }, [filter, items, query])
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount)
  const pageStart = (clampedPage - 1) * PAGE_SIZE
  const pageItems = filteredItems.slice(pageStart, pageStart + PAGE_SIZE)
  const pageEnd = pageStart + pageItems.length

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
      setFilter('active')
      setQuery('')
      setPage(1)
    } catch (error) {
      setImportFile(null)
      setItems([])
      setImportError(error instanceof Error ? error.message : 'Unable to read the selected file')
    }
  }

  function updateItem(itemId: string, patch: Partial<NormalizedMenuItem>) {
    setItems((currentItems) => currentItems.map((item) => (
      item.id === itemId ? { ...item, ...patch } : item
    )))
  }

  function handleFilterChange(nextFilter: ItemFilter) {
    setFilter(nextFilter)
    setPage(1)
  }

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value)
    setPage(1)
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
                  <h2>Normalized menu items</h2>
                </div>
                <p>
                  Showing {filteredItems.length === 0 ? 0 : pageStart + 1}–{pageEnd} of {filteredItems.length} filtered items.
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

                <label className="inventory-search-control">
                  <span>Search</span>
                  <input
                    type="search"
                    value={query}
                    onChange={handleQueryChange}
                    placeholder="Name, Aloha #, category, note…"
                  />
                </label>
              </div>

              <div className="inventory-table-wrap">
                <table className="inventory-table inventory-review-table">
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
                    {pageItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.sourceItemNumber || '—'}</td>
                        <td>
                          <input
                            className="inventory-table-input inventory-name-input"
                            value={item.name}
                            onChange={(event) => updateItem(item.id, { name: event.target.value })}
                            aria-label={`Name for ${item.sourceItemNumber || item.id}`}
                          />
                          {item.notes.length > 0 ? <span>{item.notes.join(' · ')}</span> : null}
                        </td>
                        <td>
                          <input
                            className="inventory-table-input"
                            value={item.category || ''}
                            onChange={(event) => updateItem(item.id, { category: event.target.value || undefined })}
                            placeholder="Uncategorized"
                            aria-label={`Category for ${item.name}`}
                          />
                        </td>
                        <td>
                          <input
                            className="inventory-table-input inventory-price-input"
                            inputMode="decimal"
                            value={formatCentsInput(item.basePriceCents)}
                            onChange={(event) => updateItem(item.id, { basePriceCents: parseCurrencyInput(event.target.value) })}
                            placeholder="Review"
                            aria-label={`Base price for ${item.name}`}
                          />
                        </td>
                        <td>
                          <div className="inventory-happy-hour-cell">
                            <input
                              className="inventory-table-input inventory-price-input"
                              inputMode="decimal"
                              value={formatCentsInput(item.happyHourPriceCents)}
                              onChange={(event) => updateItem(item.id, { happyHourPriceCents: parseCurrencyInput(event.target.value) })}
                              placeholder="—"
                              aria-label={`Happy hour price for ${item.name}`}
                            />
                            <input
                              className="inventory-table-input inventory-window-input"
                              value={item.happyHourWindow || ''}
                              onChange={(event) => updateItem(item.id, { happyHourWindow: event.target.value || undefined })}
                              placeholder="Window"
                              aria-label={`Happy hour window for ${item.name}`}
                            />
                          </div>
                        </td>
                        <td>
                          <select
                            className={`inventory-status-select inventory-status-${item.status}`}
                            value={item.status}
                            onChange={(event) => updateItem(item.id, { status: event.target.value as NormalizedMenuItem['status'] })}
                            aria-label={`Status for ${item.name}`}
                          >
                            <option value="ready">Ready</option>
                            <option value="review">Review</option>
                            <option value="ignored">Ignored</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredItems.length === 0 ? (
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

function formatCentsInput(cents: number | null) {
  if (cents === null) return ''

  return (cents / 100).toFixed(2)
}

function parseCurrencyInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null

  const parsed = Number(trimmed.replace(/[$,]/g, ''))
  if (!Number.isFinite(parsed)) return null

  return Math.round(parsed * 100)
}

function getHostname() {
  return typeof window === 'undefined' ? 'inventory.niteowl.dev' : window.location.hostname
}
