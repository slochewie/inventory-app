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
import {
  formatCurrency,
  summarizeMenuItems,
  type NormalizedMenuItem,
  type ParsedMenuImport,
} from '#/features/menu-import/types'

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
  const [filter, setFilter] = useState<ItemFilter>('included')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const summary = useMemo(() => summarizeMenuItems(items), [items])
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

      if (!normalizedQuery) return true

      return [
        item.sourceItemNumber,
        item.name,
        item.category,
        item.exportIncluded ? 'exporting include included' : 'excluded not exporting exclude',
        item.notes.join(' '),
      ].some((value) => value?.toLowerCase().includes(normalizedQuery))
    })
  }, [filter, items, query])
  const filteredItemIds = useMemo(() => new Set(filteredItems.map((item) => item.id)), [filteredItems])
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount)
  const pageStart = (clampedPage - 1) * PAGE_SIZE
  const pageItems = filteredItems.slice(pageStart, pageStart + PAGE_SIZE)
  const pageEnd = pageStart + pageItems.length
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId],
  )

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
      setFilter('included')
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
    setItems((currentItems) => currentItems.map((item) => {
      if (item.id !== itemId) return item

      const normalizedPatch = { ...patch }
      if (normalizedPatch.status === 'ignored' && normalizedPatch.exportIncluded === undefined) {
        normalizedPatch.exportIncluded = false
      }

      return { ...item, ...normalizedPatch }
    }))
  }

  function setExportForFiltered(exportIncluded: boolean) {
    setItems((currentItems) => currentItems.map((item) => (
      filteredItemIds.has(item.id) ? { ...item, exportIncluded } : item
    )))
  }

  function setExportForPage(exportIncluded: boolean) {
    const pageItemIds = new Set(pageItems.map((item) => item.id))

    setItems((currentItems) => currentItems.map((item) => (
      pageItemIds.has(item.id) ? { ...item, exportIncluded } : item
    )))
  }

  function handleFilterChange(nextFilter: ItemFilter) {
    setFilter(nextFilter)
    setPage(1)
    setSelectedItemId(null)
  }

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value)
    setPage(1)
    setSelectedItemId(null)
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
            Import Aloha menu exports, normalize the data, review items, decide what should export,
            and generate the Toast bulk-import format from one place.
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
              <SummaryCard label="Exporting" value={summary.exportItems} />
              <SummaryCard label="Not exporting" value={summary.excludedItems} />
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

              <div className="inventory-bulk-actions" aria-label="Bulk export actions">
                <span>{filteredItems.length.toLocaleString()} matching item{filteredItems.length === 1 ? '' : 's'}</span>
                <button type="button" onClick={() => setExportForFiltered(false)} disabled={filteredItems.length === 0}>
                  Exclude filtered from export
                </button>
                <button type="button" onClick={() => setExportForFiltered(true)} disabled={filteredItems.length === 0}>
                  Include filtered in export
                </button>
                <button type="button" onClick={() => setExportForPage(false)} disabled={pageItems.length === 0}>
                  Exclude this page
                </button>
              </div>

              {selectedItem ? (
                <EditItemPanel item={selectedItem} onChange={updateItem} onClose={() => setSelectedItemId(null)} />
              ) : (
                <p className="inventory-edit-hint">Select Edit on a row to adjust its normalized Toast-ready values and export setting.</p>
              )}

              <div className="inventory-table-wrap">
                <table className="inventory-table inventory-review-table">
                  <thead>
                    <tr>
                      <th>Aloha #</th>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Base price</th>
                      <th>Happy hour</th>
                      <th>Export</th>
                      <th>Status</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((item) => (
                      <tr key={item.id} className={selectedItemId === item.id ? 'is-selected' : undefined}>
                        <td>{item.sourceItemNumber || '—'}</td>
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
                          <button
                            type="button"
                            className={item.exportIncluded ? 'inventory-export-pill is-included' : 'inventory-export-pill is-excluded'}
                            onClick={() => updateItem(item.id, { exportIncluded: !item.exportIncluded })}
                          >
                            {item.exportIncluded ? 'Export' : 'No export'}
                          </button>
                        </td>
                        <td>
                          <span className={`inventory-status inventory-status-${item.status}`}>
                            {item.status}
                          </span>
                        </td>
                        <td>
                          <button
                            className="inventory-row-action"
                            type="button"
                            onClick={() => setSelectedItemId(item.id)}
                          >
                            Edit
                          </button>
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

function EditItemPanel({
  item,
  onChange,
  onClose,
}: {
  item: NormalizedMenuItem
  onChange: (itemId: string, patch: Partial<NormalizedMenuItem>) => void
  onClose: () => void
}) {
  return (
    <section className="inventory-edit-panel" aria-label={`Edit ${item.name}`}>
      <div className="inventory-edit-panel-heading">
        <div>
          <p className="inventory-kicker">Editing {item.sourceItemNumber ? `Aloha #${item.sourceItemNumber}` : 'item'}</p>
          <h3>{item.name}</h3>
        </div>
        <button type="button" onClick={onClose}>Close</button>
      </div>

      <label className="inventory-export-toggle">
        <input
          type="checkbox"
          checked={item.exportIncluded}
          onChange={(event) => onChange(item.id, { exportIncluded: event.target.checked })}
        />
        <span>Include this item in Toast export</span>
      </label>

      <div className="inventory-edit-grid">
        <label>
          <span>Name</span>
          <input
            value={item.name}
            onChange={(event) => onChange(item.id, { name: event.target.value })}
          />
        </label>

        <label>
          <span>Category</span>
          <input
            value={item.category || ''}
            onChange={(event) => onChange(item.id, { category: event.target.value || undefined })}
            placeholder="Uncategorized"
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
      </div>
    </section>
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
