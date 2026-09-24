import { createFileRoute } from '@tanstack/react-router'
import { type ChangeEvent, useMemo, useRef, useState, useEffect } from 'react'
import {
  AuthenticatedInventoryShell,
  useInventoryAccessRole,
} from '#/components/authenticated-inventory-shell'
import { normalizeAlohaMenuItems, parseAlohaMenuCsv } from '#/features/menu-import/aloha'
import {
  formatCurrency,
  summarizeMenuItems,
  type NormalizedMenuItem,
  type ParsedMenuImport,
} from '#/features/menu-import/types'
import { authClient } from '#/lib/auth-client'
import { persistInventoryImport } from '#/lib/inventory-access'

export const Route = createFileRoute('/import-review')({ component: ImportReviewPage })

type ReviewFilter = 'review' | 'included' | 'excluded' | 'all'

const PAGE_SIZE = 50

function ImportReviewPage() {
  const { canImportExport } = useInventoryAccessRole()
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [importFile, setImportFile] = useState<ParsedMenuImport | null>(null)
  const [items, setItems] = useState<NormalizedMenuItem[]>([])
  const [filter, setFilter] = useState<ReviewFilter>('review')
  const [query, setQuery] = useState('')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const summary = useMemo(() => summarizeMenuItems(items), [items])

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return items.filter((item) => {
      if (filter === 'review' && item.status !== 'review') return false
      if (filter === 'included' && !item.exportIncluded) return false
      if (filter === 'excluded' && item.exportIncluded) return false

      if (!normalizedQuery) return true

      return [
        item.name,
        item.sourceItemNumber,
        item.category,
        item.toastCategory,
        item.notes.join(' '),
      ].some((value) => value?.toLowerCase().includes(normalizedQuery))
    })
  }, [filter, items, query])

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount)
  const pageStart = (clampedPage - 1) * PAGE_SIZE
  const pageItems = filteredItems.slice(pageStart, pageStart + PAGE_SIZE)
  const pageEnd = pageStart + pageItems.length

  useEffect(() => {
    setPage(1)
  }, [filter, query])

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null

  async function handleAlohaCsvChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setError(null)
    setSaveMessage(null)
    setSaveState('idle')

    try {
      const parsed = parseAlohaMenuCsv(await file.text(), file.name)
      const normalized = normalizeAlohaMenuItems(parsed)

      setImportFile(parsed)
      setItems(normalized)
      setFilter(normalized.some((item) => item.status === 'review') ? 'review' : 'included')
      setQuery('')
      setSelectedItemId(null)
    } catch (caught) {
      setImportFile(null)
      setItems([])
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to read the selected Aloha CSV.',
      )
    } finally {
      event.target.value = ''
    }
  }

  function updateItem(itemId: string, patch: Partial<NormalizedMenuItem>) {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item,
      ),
    )
  }

  async function saveImport() {
    if (!activeOrganization?.id || !importFile || items.length === 0) return

    setSaveState('saving')
    setSaveMessage(null)
    setError(null)

    try {
      const result = await persistInventoryImport({
        organizationId: activeOrganization.id,
        sourceType: 'aloha-csv',
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
        `Saved ${result.importedItems.toLocaleString()} items and ${result.importedVariants.toLocaleString()} variants to Inventory.`,
      )
    } catch (caught) {
      setSaveState('error')
      setSaveMessage(
        caught instanceof Error
          ? caught.message
          : 'Unable to save this import.',
      )
    }
  }

  return (
    <AuthenticatedInventoryShell
      currentPath="/import-review"
      requiredCapability="import-export"
    >
      <section className="inventory-content inventory-import-review-page">
        <header className="inventory-page-heading">
          <div>
            <p className="inventory-kicker">Import & Review</p>
            <h1>Bring menu data in</h1>
            <p>
              Upload an Aloha export, review only what needs attention, then save it to the shared catalog.
            </p>
          </div>
          <a className="inventory-secondary-link" href="/toast-template-import">
            Import Toast workbook
          </a>
        </header>

        <section className="inventory-import-drop-card">
          <div>
            <strong>Aloha CSV</strong>
            <p>Choose the menu-price export from Aloha. Nothing is saved until you approve the import.</p>
          </div>
          {canImportExport ? (
            <label className="inventory-upload-control">
              <span>{importFile ? 'Choose another CSV' : 'Choose Aloha CSV'}</span>
              <input type="file" accept=".csv,text/csv" onChange={handleAlohaCsvChange} />
            </label>
          ) : null}
        </section>

        {error ? <p className="inventory-error inventory-import-message">{error}</p> : null}

        {importFile ? (
          <>
            <section className="inventory-import-review-summary">
              <div>
                <span>File</span>
                <strong>{importFile.sourceName}</strong>
              </div>
              <div>
                <span>Items</span>
                <strong>{summary.normalizedItems.toLocaleString()}</strong>
              </div>
              <div>
                <span>Needs review</span>
                <strong>{summary.reviewItems.toLocaleString()}</strong>
              </div>
              <div>
                <span>Will import</span>
                <strong>{summary.exportItems.toLocaleString()}</strong>
              </div>
            </section>

            <section className="inventory-card inventory-import-review-card">
              <div className="inventory-import-review-actions">
                <div className="inventory-filter-group" aria-label="Review filters">
                  <ReviewFilterButton
                    active={filter === 'review'}
                    label="Needs review"
                    count={summary.reviewItems}
                    onClick={() => setFilter('review')}
                  />
                  <ReviewFilterButton
                    active={filter === 'included'}
                    label="Included"
                    count={summary.exportItems}
                    onClick={() => setFilter('included')}
                  />
                  <ReviewFilterButton
                    active={filter === 'excluded'}
                    label="Excluded"
                    count={summary.excludedItems}
                    onClick={() => setFilter('excluded')}
                  />
                  <ReviewFilterButton
                    active={filter === 'all'}
                    label="All"
                    count={items.length}
                    onClick={() => setFilter('all')}
                  />
                </div>

                <label className="inventory-search-control inventory-import-review-search">
                  <span>Search</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Name, Aloha #, category…"
                  />
                </label>
              </div>

              {filteredItems.length === 0 ? (
                <p className="inventory-empty-state">
                  {filter === 'review'
                    ? 'Nothing in this import currently needs review.'
                    : 'No items match these filters.'}
                </p>
              ) : (
                <div className="inventory-table-wrap">
                  <table className="inventory-table inventory-import-review-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Aloha category</th>
                        <th>Toast category</th>
                        <th>Price</th>
                        <th>Happy hour</th>
                        <th>Import</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.name}</strong>
                            {item.sourceItemNumber ? <span>#{item.sourceItemNumber}</span> : null}
                            {item.notes.length ? <span>{item.notes.join(' · ')}</span> : null}
                          </td>
                          <td>{item.category || 'Uncategorized'}</td>
                          <td>{item.toastCategory}</td>
                          <td>{formatCurrency(item.basePriceCents)}</td>
                          <td>{item.happyHourPriceCents === null ? '—' : formatCurrency(item.happyHourPriceCents)}</td>
                          <td>
                            <button
                              type="button"
                              className={item.exportIncluded ? 'inventory-import-toggle is-on' : 'inventory-import-toggle'}
                              onClick={() =>
                                updateItem(item.id, { exportIncluded: !item.exportIncluded })
                              }
                            >
                              {item.exportIncluded ? 'Included' : 'Excluded'}
                            </button>
                          </td>
                          <td className="inventory-catalog-action-cell">
                            <button
                              type="button"
                              className="inventory-row-action"
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
              )}

              {filteredItems.length > PAGE_SIZE ? (
                <div className="inventory-import-review-pagination">
                  <span>
                    Showing {(pageStart + 1).toLocaleString()}–{pageEnd.toLocaleString()} of {filteredItems.length.toLocaleString()}
                  </span>
                  <div>
                    <button
                      type="button"
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      disabled={clampedPage <= 1}
                    >
                      Previous
                    </button>
                    <span>Page {clampedPage.toLocaleString()} of {pageCount.toLocaleString()}</span>
                    <button
                      type="button"
                      onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                      disabled={clampedPage >= pageCount}
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="inventory-import-review-footer">
                <div>
                  {saveMessage ? (
                    <p className={saveState === 'error' ? 'inventory-error' : 'inventory-save-success'}>
                      {saveMessage}
                    </p>
                  ) : (
                    <p>
                      Saving creates or updates the source mappings for {activeOrganization?.name ?? 'the selected organization'}.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="inventory-primary-button"
                  disabled={
                    saveState === 'saving' ||
                    !activeOrganization?.id ||
                    items.length === 0
                  }
                  onClick={() => void saveImport()}
                >
                  {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save to Inventory'}
                </button>
              </div>
            </section>
          </>
        ) : (
          <section className="inventory-empty-workflow">
            <strong>No import loaded</strong>
            <p>Choose an Aloha CSV above, or use Toast workbook import.</p>
          </section>
        )}

        {selectedItem ? (
          <ImportItemDrawer
            item={selectedItem}
            onChange={updateItem}
            onClose={() => setSelectedItemId(null)}
          />
        ) : null}
      </section>
    </AuthenticatedInventoryShell>
  )
}

function ReviewFilterButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={active ? 'inventory-filter is-active' : 'inventory-filter'}
      onClick={onClick}
    >
      <span>{label}</span>
      <strong>{count.toLocaleString()}</strong>
    </button>
  )
}

function ImportItemDrawer({
  item,
  onChange,
  onClose,
}: {
  item: NormalizedMenuItem
  onChange: (itemId: string, patch: Partial<NormalizedMenuItem>) => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

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
      className="inventory-edit-drawer inventory-import-drawer"
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
          <p className="inventory-kicker">Review item</p>
          <h2>{item.name}</h2>
          <p>{item.category || 'Uncategorized'}</p>
        </div>
        <button type="button" onClick={onClose}>Close</button>
      </div>

      <div className="inventory-import-edit-grid">
        <label className="inventory-search-control">
          <span>Name</span>
          <input
            value={item.name}
            onChange={(event) => onChange(item.id, { name: event.target.value })}
          />
        </label>

        <label className="inventory-search-control">
          <span>Toast category</span>
          <input
            value={item.toastCategory}
            onChange={(event) =>
              onChange(item.id, { toastCategory: event.target.value })
            }
          />
        </label>

        <label className="inventory-search-control">
          <span>Toast destination</span>
          <input
            value={item.toastDestination}
            onChange={(event) =>
              onChange(item.id, { toastDestination: event.target.value })
            }
          />
        </label>

        <ImportMoneyField
          label="Price"
          value={item.basePriceCents}
          onChange={(value) => onChange(item.id, { basePriceCents: value })}
        />

        <ImportMoneyField
          label="Happy hour"
          value={item.happyHourPriceCents}
          onChange={(value) =>
            onChange(item.id, { happyHourPriceCents: value })
          }
        />

        <label className="inventory-inline-toggle inventory-import-drawer-toggle">
          <input
            type="checkbox"
            checked={item.exportIncluded}
            onChange={(event) =>
              onChange(item.id, { exportIncluded: event.target.checked })
            }
          />
          <span>Include in import</span>
        </label>
      </div>
    </dialog>
  )
}

function ImportMoneyField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
}) {
  const [draft, setDraft] = useState(value === null ? '' : (value / 100).toFixed(2))

  useEffect(() => {
    setDraft(value === null ? '' : (value / 100).toFixed(2))
  }, [value])

  return (
    <label className="inventory-search-control">
      <span>{label}</span>
      <input
        type="number"
        min="0"
        step="0.01"
        value={draft}
        placeholder="—"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const trimmed = draft.trim()
          if (!trimmed) {
            onChange(null)
            return
          }

          const number = Number(trimmed)
          if (Number.isFinite(number)) onChange(Math.round(number * 100))
        }}
      />
    </label>
  )
}
