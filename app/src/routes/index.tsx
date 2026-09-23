import {
  appDefinitionsById,
  buildNavigation,
  getDefaultAppUrls,
  getDeploymentBrand,
} from '@niteowl/app-config'
import { NiteOwlNavigationIcon } from '@niteowl/ui/navigation'
import { createFileRoute } from '@tanstack/react-router'
import { type ChangeEvent, useEffect, useMemo, useState } from 'react'
import { normalizeAlohaMenuItems, parseAlohaMenuCsv } from '#/features/menu-import/aloha'
import { buildBeerTabPreviewRows, type BeerTabPreviewRow } from '#/features/menu-import/beer-preview'
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
const ALL_CATEGORIES = '__all__'
const UNCATEGORIZED = '__uncategorized__'

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
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES)
  const [toastCategoryDraft, setToastCategoryDraft] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)

  const summary = useMemo(() => summarizeMenuItems(items), [items])
  const beerPreviewItems = useMemo(() => (
    categoryFilter === ALL_CATEGORIES
      ? items
      : items.filter((item) => getCategoryKey(item.category) === categoryFilter)
  ), [categoryFilter, items])
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
      const category = getCategoryKey(item.category)
      counts.set(category, (counts.get(category) ?? 0) + 1)
    })

    return [...counts.entries()]
      .sort(([left], [right]) => getCategoryLabel(left).localeCompare(getCategoryLabel(right)))
      .map(([value, count]) => ({ value, label: getCategoryLabel(value), count }))
  }, [items])

  const selectedCategoryItems = useMemo(() => (
    categoryFilter === ALL_CATEGORIES
      ? []
      : items.filter((item) => getCategoryKey(item.category) === categoryFilter)
  ), [categoryFilter, items])

  const selectedCategoryToastCategory = selectedCategoryItems[0]?.toastCategory ?? ''

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

      if (categoryFilter !== ALL_CATEGORIES && getCategoryKey(item.category) !== categoryFilter) {
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
  }, [categoryFilter, filter, items, query])

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
    setItems((currentItems) => currentItems.map((item) => (
      item.id === itemId ? { ...item, ...patch } : item
    )))
  }

  function updateFilteredItems(patch: Partial<NormalizedMenuItem>) {
    setItems((currentItems) => currentItems.map((item) => (
      filteredItemIds.has(item.id) ? { ...item, ...patch } : item
    )))
    setSelectedItemId(null)
  }

  function updatePageItems(patch: Partial<NormalizedMenuItem>) {
    const pageItemIds = new Set(pageItems.map((item) => item.id))
    setItems((currentItems) => currentItems.map((item) => (
      pageItemIds.has(item.id) ? { ...item, ...patch } : item
    )))
    setSelectedItemId(null)
  }

  function updateSelectedCategoryItems(patch: Partial<NormalizedMenuItem>) {
    if (categoryFilter === ALL_CATEGORIES) return

    setItems((currentItems) => currentItems.map((item) => (
      getCategoryKey(item.category) === categoryFilter ? { ...item, ...patch } : item
    )))
    setSelectedItemId(null)
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
    setPage(1)
    setSelectedItemId(null)
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

            {beerTabRows.length > 0 ? <BeerTabPreview rows={beerTabRows} /> : null}

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

                <div className="inventory-filter-panel">
                  <label className="inventory-search-control">
                    <span>Aloha category</span>
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

              {categoryFilter !== ALL_CATEGORIES ? (
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

              <div className="inventory-bulk-bar">
                <strong>{filteredItems.length.toLocaleString()} matching items</strong>
                <button type="button" onClick={() => updateFilteredItems({ exportIncluded: false })}>Exclude filtered from export</button>
                <button type="button" onClick={() => updateFilteredItems({ exportIncluded: true })}>Include filtered in export</button>
                <button type="button" onClick={() => updatePageItems({ exportIncluded: false })}>Exclude this page</button>
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
                      <th>Aloha category</th>
                      <th>Toast category</th>
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
                        <td>{item.toastCategory}</td>
                        <td>{formatCurrency(item.basePriceCents)}</td>
                        <td>
                          {item.happyHourPriceCents === null
                            ? '—'
                            : `${formatCurrency(item.happyHourPriceCents)}${item.happyHourWindow ? ` · ${item.happyHourWindow}` : ''}`}
                        </td>
                        <td>
                          <button
                            className={item.exportIncluded ? 'inventory-export-toggle is-included' : 'inventory-export-toggle'}
                            type="button"
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

function BeerTabPreview({ rows }: { rows: BeerTabPreviewRow[] }) {
  return (
    <section className="inventory-card inventory-beer-preview-card">
      <div className="inventory-table-heading">
        <div>
          <p className="inventory-kicker">Toast preview</p>
          <h2>Beer tab staging</h2>
        </div>
        <p>{rows.length.toLocaleString()} beer rows grouped for the Toast Beer tab.</p>
      </div>

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
    </section>
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
  )
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

function getCategoryKey(category?: string) {
  const normalized = category?.trim()
  return normalized ? normalized : UNCATEGORIZED
}

function getCategoryLabel(categoryKey: string) {
  return categoryKey === UNCATEGORIZED ? 'Uncategorized' : categoryKey
}

function getHostname() {
  return typeof window === 'undefined' ? 'inventory.niteowl.dev' : window.location.hostname
}