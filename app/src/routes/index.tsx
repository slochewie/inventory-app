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
  updateInventoryOrganizationVariant,
} from '#/lib/inventory-access'

export const Route = createFileRoute('/')({ component: CatalogPage })

type AvailabilityFilter = 'carried' | 'not-carried' | 'all'

type CatalogGroup = {
  id: string
  name: string
  category: string
  items: NormalizedMenuItem[]
}

function CatalogPage() {
  const { canEdit } = useInventoryAccessRole()
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [items, setItems] = useState<NormalizedMenuItem[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [availability, setAvailability] = useState<AvailabilityFilter>('carried')
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingVariantId, setSavingVariantId] = useState<string | null>(null)

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

      const carried = group.items.some((item) => item.exportIncluded)
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

  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ?? null

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

    if (Object.hasOwn(patch, 'exportIncluded')) {
      payload.enabled = true
      payload.exportToToast = patch.exportIncluded
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
            ? { ...currentItem, ...patch }
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
            <h1>Menu catalog</h1>
            <p>
              Manage what {activeOrganization?.name ?? 'this organization'} carries,
              its prices, and what exports to Toast.
            </p>
          </div>
          <a className="inventory-primary-link" href="/import-review">
            Import menu
          </a>
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
                {filteredGroups.length.toLocaleString()} items
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
                    <th>Toast category</th>
                    <th>Formats</th>
                    <th>Price</th>
                    <th>Available here</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredGroups.map((group) => {
                    const carried = group.items.some((item) => item.exportIncluded)

                    return (
                      <tr key={group.id}>
                        <td>
                          <strong>{group.name}</strong>
                        </td>
                        <td>{group.category}</td>
                        <td>
                          <div className="inventory-format-list">
                            {group.items.map((item) => (
                              <span key={item.id}>{item.variantLabel || 'Standard'}</span>
                            ))}
                          </div>
                        </td>
                        <td>{getPriceRange(group.items)}</td>
                        <td>
                          <span className={carried ? 'inventory-carry-status is-on' : 'inventory-carry-status'}>
                            {carried ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="inventory-catalog-action-cell">
                          <button
                            className="inventory-row-action"
                            type="button"
                            onClick={() => setSelectedGroupId(group.id)}
                          >
                            {canEdit ? 'Manage' : 'View'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        {selectedGroup ? (
          <CatalogDrawer
            group={selectedGroup}
            canEdit={canEdit}
            savingVariantId={savingVariantId}
            onClose={() => setSelectedGroupId(null)}
            onUpdate={updateVariant}
          />
        ) : null}
      </section>
    </AuthenticatedInventoryShell>
  )
}

function CatalogDrawer({
  group,
  canEdit,
  savingVariantId,
  onClose,
  onUpdate,
}: {
  group: CatalogGroup
  canEdit: boolean
  savingVariantId: string | null
  onClose: () => void
  onUpdate: (
    item: NormalizedMenuItem,
    patch: Partial<NormalizedMenuItem>,
  ) => Promise<void>
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
        </div>
        <button type="button" onClick={onClose}>Close</button>
      </div>

      <div className="inventory-catalog-variants">
        {group.items.map((item) => {
          const saving = savingVariantId === item.id

          return (
            <article key={item.id} className="inventory-catalog-variant-card">
              <div className="inventory-catalog-variant-heading">
                <div>
                  <strong>{item.variantLabel || 'Standard'}</strong>
                  {item.toastDestination ? <span>{item.toastDestination}</span> : null}
                </div>
                <label className="inventory-inline-toggle">
                  <input
                    type="checkbox"
                    checked={item.exportIncluded}
                    disabled={!canEdit || saving}
                    onChange={(event) =>
                      void onUpdate(item, { exportIncluded: event.target.checked })
                    }
                  />
                  <span>Available here</span>
                </label>
              </div>

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

              {saving ? <p className="inventory-save-note">Saving…</p> : null}
            </article>
          )
        })}
      </div>
    </dialog>
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
