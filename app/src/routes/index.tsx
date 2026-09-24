import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AuthenticatedInventoryShell,
  useInventoryAccessRole,
} from '#/components/authenticated-inventory-shell'
import { catalogRowToNormalizedItem } from '#/features/menu-import/catalog'
import { formatCurrency, type NormalizedMenuItem } from '#/features/menu-import/types'
import { authClient } from '#/lib/auth-client'
import {
  listInventoryCatalog,
  mergeInventoryItems,
  updateInventoryOrganizationVariant,
} from '#/lib/inventory-access'

export const Route = createFileRoute('/')({ component: CatalogPage })

type AvailabilityFilter = 'carried' | 'not-carried' | 'all'

const PAGE_SIZE = 50

type CatalogGroup = {
  id: string
  name: string
  category: string
  items: NormalizedMenuItem[]
}

function CatalogPage() {
  const { canEdit, canImportExport } = useInventoryAccessRole()
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [items, setItems] = useState<NormalizedMenuItem[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [availability, setAvailability] = useState<AvailabilityFilter>('carried')
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingVariantId, setSavingVariantId] = useState<string | null>(null)
  const [mergingItemId, setMergingItemId] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!activeOrganization?.id) {
      setItems([])
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    void listInventoryCatalog(activeOrganization.id, controller.signal)
      .then((catalog) => {
        setItems(catalog.items.map(catalogRowToNormalizedItem))
        setSelectedGroupId(null)
        setPage(1)
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setError(
          caught instanceof Error
            ? caught.message
            : 'Unable to load the Inventory catalog.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [activeOrganization?.id])

  const groups = useMemo(() => groupCatalogItems(items), [items])

  const categories = useMemo(
    () => [...new Set(groups.map((group) => group.category))].sort((a, b) => a.localeCompare(b)),
    [groups],
  )

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return groups.filter((group) => {
      if (category !== 'all' && group.category !== category) return false

      const carried = group.items.some((item) => item.organizationEnabled === true)
      if (availability === 'carried' && !carried) return false
      if (availability === 'not-carried' && carried) return false

      if (!normalizedQuery) return true

      return [
        group.name,
        group.category,
        ...group.items.flatMap((item) => [
          item.variantLabel,
          item.toastDestination,
        ]),
      ].some((value) => value?.toLowerCase().includes(normalizedQuery))
    })
  }, [availability, category, groups, query])

  const pageCount = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount)
  const pageStart = (clampedPage - 1) * PAGE_SIZE
  const pageGroups = filteredGroups.slice(pageStart, pageStart + PAGE_SIZE)
  const pageEnd = pageStart + pageGroups.length

  useEffect(() => {
    setPage(1)
  }, [availability, category, query])

  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ?? null

  async function mergeGroup(sourceGroup: CatalogGroup, targetItemId: string) {
    if (!canEdit || !activeOrganization?.id || mergingItemId) return

    setMergingItemId(sourceGroup.id)
    setError(null)

    try {
      await mergeInventoryItems({
        organizationId: activeOrganization.id,
        sourceItemId: sourceGroup.id,
        targetItemId,
      })

      const catalog = await listInventoryCatalog(activeOrganization.id)
      setItems(catalog.items.map(catalogRowToNormalizedItem))
      setSelectedGroupId(targetItemId)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to merge Inventory items.',
      )
    } finally {
      setMergingItemId(null)
    }
  }

  async function updateVariant(
    item: NormalizedMenuItem,
    patch: Partial<NormalizedMenuItem>,
  ) {
    if (!canEdit || !activeOrganization?.id || savingVariantId) return

    setSavingVariantId(item.id)
    setError(null)

    const payload: Parameters<typeof updateInventoryOrganizationVariant>[0] = {
      organizationId: activeOrganization.id,
      variantId: item.id,
    }

    if (Object.hasOwn(patch, 'name')) {
      const nextName = patch.name?.trim() ?? ''
      payload.toastNameOverride =
        nextName && nextName !== item.masterName ? nextName : null
    }

    if (Object.hasOwn(patch, 'organizationEnabled')) {
      payload.enabled = patch.organizationEnabled
    }

    if (Object.hasOwn(patch, 'exportToToast')) {
      payload.exportToToast = patch.exportToToast
    }

    if (Object.hasOwn(patch, 'basePriceCents')) {
      payload.priceOverrideCents = patch.basePriceCents ?? null
    }

    if (Object.hasOwn(patch, 'happyHourPriceCents')) {
      payload.happyHourPriceCents = patch.happyHourPriceCents ?? null
    }

    try {
      await updateInventoryOrganizationVariant(payload)
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id
            ? {
                ...currentItem,
                ...patch,
                exportIncluded:
                  (patch.organizationEnabled ?? currentItem.organizationEnabled) === true &&
                  (patch.exportToToast ?? currentItem.exportToToast) === true,
              }
            : currentItem,
        ),
      )
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to save the Inventory item.',
      )
    } finally {
      setSavingVariantId(null)
    }
  }

  return (
    <AuthenticatedInventoryShell currentPath="/">
      <section className="inventory-content inventory-catalog-page">
        <header className="inventory-page-heading">
          <div>
            <p className="inventory-kicker">Catalog</p>
            <h1>Catalog</h1>
            <p>
              Manage what {activeOrganization?.name ?? 'this organization'} carries,
              its prices, and what exports to Toast.
            </p>
          </div>
          {canImportExport ? (
            <a className="inventory-primary-link" href="/import-review">
              Import menu
            </a>
          ) : null}
        </header>

        <section className="inventory-catalog-toolbar" aria-label="Catalog filters">
          <label className="inventory-search-control inventory-catalog-search">
            <span>Search</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search items…"
            />
          </label>

          <label className="inventory-search-control">
            <span>Toast category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="all">All categories</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="inventory-search-control">
            <span>Availability</span>
            <select
              value={availability}
              onChange={(event) => setAvailability(event.target.value as AvailabilityFilter)}
            >
              <option value="carried">Carried here</option>
              <option value="not-carried">Not carried here</option>
              <option value="all">All master items</option>
            </select>
          </label>
        </section>

        <section className="inventory-card inventory-catalog-card">
          <div className="inventory-table-heading">
            <div>
              <h2>{activeOrganization?.name ?? 'Selected organization'}</h2>
              <p className="inventory-catalog-subtitle">
                {filteredGroups.length === 0
                  ? '0 items'
                  : `Showing ${(pageStart + 1).toLocaleString()}–${pageEnd.toLocaleString()} of ${filteredGroups.length.toLocaleString()} items`}
              </p>
            </div>
          </div>

          {loading ? <p>Loading catalog…</p> : null}
          {error ? <p className="inventory-error">{error}</p> : null}

          {!loading && !error && filteredGroups.length === 0 ? (
            <p className="inventory-empty-state">No catalog items match these filters.</p>
          ) : null}

          {filteredGroups.length > 0 ? (
            <div className="inventory-table-wrap">
              <table className="inventory-table inventory-catalog-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Price</th>
                    <th>Happy hour</th>
                    <th>Available here</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pageGroups.map((group) => {
                    const carried = group.items.some((item) => item.organizationEnabled === true)

                    return (
                      <tr
                        key={group.id}
                        className="inventory-catalog-row"
                        tabIndex={0}
                        onClick={() => setSelectedGroupId(group.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setSelectedGroupId(group.id)
                          }
                        }}
                      >
                        <td>
                          <div className="inventory-catalog-item-cell">
                            <strong>{group.name}</strong>
                            <span>{group.category}</span>
                            <div className="inventory-format-list">
                              {group.items.map((item) => (
                                <span key={item.id}>{item.variantLabel || 'Standard'}</span>
                              ))}
                            </div>
                          </div>
                        </td>
                        <td>{getPriceRange(group.items)}</td>
                        <td>{getHappyHourRange(group.items)}</td>
                        <td>
                          <span className={carried ? 'inventory-carry-status is-on' : 'inventory-carry-status'}>
                            {carried ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="inventory-catalog-action-cell" aria-hidden="true">
                          <span className="inventory-catalog-chevron">›</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {filteredGroups.length > PAGE_SIZE ? (
            <div className="inventory-catalog-pagination" aria-label="Catalog pagination">
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
          ) : null}
        </section>

        {selectedGroup ? (
          <CatalogDrawer
            group={selectedGroup}
            canEdit={canEdit}
            allGroups={groups}
            savingVariantId={savingVariantId}
            merging={mergingItemId === selectedGroup.id}
            onClose={() => setSelectedGroupId(null)}
            onUpdate={updateVariant}
            onMerge={mergeGroup}
          />
        ) : null}
      </section>
    </AuthenticatedInventoryShell>
  )
}

function CatalogDrawer({
  group,
  canEdit,
  allGroups,
  savingVariantId,
  merging,
  onClose,
  onUpdate,
  onMerge,
}: {
  group: CatalogGroup
  canEdit: boolean
  allGroups: CatalogGroup[]
  savingVariantId: string | null
  merging: boolean
  onClose: () => void
  onUpdate: (
    item: NormalizedMenuItem,
    patch: Partial<NormalizedMenuItem>,
  ) => Promise<void>
  onMerge: (sourceGroup: CatalogGroup, targetItemId: string) => Promise<void>
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

  const carriedCount = group.items.filter(
    (item) => item.organizationEnabled === true,
  ).length
  const [mergeTargetId, setMergeTargetId] = useState('')
  const mergeCandidates = allGroups.filter((candidate) => candidate.id !== group.id)

  return (
    <dialog
      ref={dialogRef}
      className="inventory-edit-drawer inventory-catalog-drawer"
      aria-labelledby="inventory-catalog-drawer-title"
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
          <p className="inventory-kicker">{group.category}</p>
          <h2 id="inventory-catalog-drawer-title">{group.name}</h2>
          <p>
            {group.items.length} format{group.items.length === 1 ? '' : 's'} · {carriedCount} available here
          </p>
        </div>
        <button type="button" onClick={onClose}>Close</button>
      </div>

      <section className="inventory-drawer-section">
        <div className="inventory-drawer-section-heading">
          <div>
            <p className="inventory-kicker">Availability & pricing</p>
            <h3>Formats</h3>
          </div>
          {!canEdit ? <span className="inventory-readonly-pill">Read only</span> : null}
        </div>

        <div className="inventory-catalog-variants">
          {group.items.map((item) => {
            const saving = savingVariantId === item.id

            return (
              <article key={item.id} className="inventory-catalog-variant-card">
                <div className="inventory-catalog-variant-heading">
                  <div>
                    <strong>{item.variantLabel || 'Standard'}</strong>
                    <span>
                      {item.toastDestination || 'No Toast destination'}
                    </span>
                  </div>
                  <div className="inventory-variant-toggles">
                    <label className="inventory-inline-toggle">
                      <input
                        type="checkbox"
                        checked={item.organizationEnabled === true}
                        disabled={!canEdit || saving}
                        onChange={(event) =>
                          void onUpdate(item, {
                            organizationEnabled: event.target.checked,
                          })
                        }
                      />
                      <span>
                        {item.organizationEnabled === true
                          ? 'Available here'
                          : 'Not carried here'}
                      </span>
                    </label>

                    <label className="inventory-inline-toggle">
                      <input
                        type="checkbox"
                        checked={item.exportToToast === true}
                        disabled={
                          !canEdit ||
                          saving ||
                          item.organizationEnabled !== true
                        }
                        onChange={(event) =>
                          void onUpdate(item, {
                            exportToToast: event.target.checked,
                          })
                        }
                      />
                      <span>Export to Toast</span>
                    </label>
                  </div>
                </div>

                <NameField
                  value={item.name}
                  masterName={item.masterName ?? item.name}
                  disabled={!canEdit || saving}
                  onCommit={(value) => void onUpdate(item, { name: value })}
                />

                <div className="inventory-catalog-price-grid">
                  <MoneyField
                    label="Price"
                    value={item.basePriceCents}
                    disabled={!canEdit || saving}
                    onCommit={(value) => void onUpdate(item, { basePriceCents: value })}
                  />
                  <MoneyField
                    label="Happy hour"
                    value={item.happyHourPriceCents}
                    disabled={!canEdit || saving}
                    onCommit={(value) =>
                      void onUpdate(item, { happyHourPriceCents: value })
                    }
                  />
                </div>

                <div className="inventory-variant-meta">
                  <span>{item.toastCategory}</span>
                  {saving ? <span className="inventory-save-note">Saving…</span> : null}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {canEdit ? (
        <section className="inventory-drawer-section inventory-merge-section">
          <div className="inventory-drawer-section-heading">
            <div>
              <p className="inventory-kicker">Consolidate duplicate</p>
              <h3>Merge with another item</h3>
            </div>
          </div>
          <p>
            Move this item's variants and source mappings into an existing master item.
            The selected master item is kept.
          </p>
          <label className="inventory-search-control">
            <span>Keep this master item</span>
            <select
              value={mergeTargetId}
              disabled={merging}
              onChange={(event) => setMergeTargetId(event.target.value)}
            >
              <option value="">Choose master item…</option>
              {mergeCandidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.items[0]?.masterName ?? candidate.name} · {candidate.category}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="inventory-danger-button"
            disabled={!mergeTargetId || merging}
            onClick={() => {
              if (!mergeTargetId) return
              const target = mergeCandidates.find((candidate) => candidate.id === mergeTargetId)
              if (!target) return

              const sourceName = group.items[0]?.masterName ?? group.name
              const targetName = target.items[0]?.masterName ?? target.name

              if (
                window.confirm(
                  `Merge "${sourceName}" into "${targetName}"? This consolidates their master Inventory records.`,
                )
              ) {
                void onMerge(group, mergeTargetId)
              }
            }}
          >
            {merging ? 'Merging…' : 'Merge items'}
          </button>
        </section>
      ) : null}

      <section className="inventory-drawer-section inventory-drawer-help">
        <p className="inventory-kicker">How this works</p>
        <p>
          Availability, Toast export, price, and Happy Hour values are specific to the selected organization.
          The master item remains shared across organizations.
        </p>
      </section>
    </dialog>
  )
}

function NameField({
  value,
  masterName,
  disabled,
  onCommit,
}: {
  value: string
  masterName: string
  disabled: boolean
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  return (
    <label className="inventory-search-control inventory-catalog-name-field">
      <span>Name</span>
      <input
        value={draft}
        disabled={disabled}
        placeholder={masterName}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const nextValue = draft.trim() || masterName
          if (nextValue !== value) {
            setDraft(nextValue)
            onCommit(nextValue)
          }
        }}
      />
      {value !== masterName ? (
        <small>Master name: {masterName}</small>
      ) : null}
    </label>
  )
}

function MoneyField({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string
  value: number | null
  disabled: boolean
  onCommit: (value: number | null) => void
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
        disabled={disabled}
        placeholder="—"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const trimmed = draft.trim()
          if (!trimmed) {
            if (value !== null) onCommit(null)
            return
          }

          const number = Number(trimmed)
          if (!Number.isFinite(number)) return

          const cents = Math.round(number * 100)
          if (cents !== value) onCommit(cents)
        }}
      />
    </label>
  )
}

function groupCatalogItems(items: NormalizedMenuItem[]): CatalogGroup[] {
  const groups = new Map<string, NormalizedMenuItem[]>()

  items.forEach((item) => {
    const key = item.masterItemId ?? item.id
    const existing = groups.get(key)

    if (existing) existing.push(item)
    else groups.set(key, [item])
  })

  return [...groups.entries()]
    .map(([id, groupedItems]) => {
      const sortedItems = [...groupedItems].sort((a, b) =>
        (a.variantLabel || 'Standard').localeCompare(b.variantLabel || 'Standard'),
      )
      const first = sortedItems[0]

      return {
        id,
        name: first?.name ?? 'Unnamed item',
        category: first?.toastCategory || 'Uncategorized',
        items: sortedItems,
      }
    })
    .sort((a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    )
}

function getHappyHourRange(items: NormalizedMenuItem[]) {
  const prices = items
    .map((item) => item.happyHourPriceCents)
    .filter((value): value is number => value !== null)

  if (prices.length === 0) return '—'

  const minimum = Math.min(...prices)
  const maximum = Math.max(...prices)

  return minimum === maximum
    ? formatCurrency(minimum)
    : `${formatCurrency(minimum)}–${formatCurrency(maximum)}`
}

function getPriceRange(items: NormalizedMenuItem[]) {
  const prices = items
    .map((item) => item.basePriceCents)
    .filter((value): value is number => value !== null)

  if (prices.length === 0) return '—'

  const minimum = Math.min(...prices)
  const maximum = Math.max(...prices)

  return minimum === maximum
    ? formatCurrency(minimum)
    : `${formatCurrency(minimum)}–${formatCurrency(maximum)}`
}
