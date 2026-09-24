import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import {
  AuthenticatedInventoryShell,
  useInventoryAccessRole,
} from '#/components/authenticated-inventory-shell'
import { authClient } from '#/lib/auth-client'
import {
  listInventoryCatalog,
  listInventorySourceMappings,
  updateInventorySourceMapping,
  type InventoryCatalogRow,
  type InventorySourceMapping,
} from '#/lib/inventory-access'

export const Route = createFileRoute('/reconcile')({ component: ReconcileRoute })

function ReconcileRoute() {
  const { canEdit } = useInventoryAccessRole()

  return (
    <AuthenticatedInventoryShell
      currentPath="/reconcile"
      requiredCapability="edit"
    >
      {canEdit ? <ReconcilePage /> : null}
    </AuthenticatedInventoryShell>
  )
}

function ReconcilePage() {
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [mappings, setMappings] = useState<InventorySourceMapping[]>([])
  const [catalog, setCatalog] = useState<InventoryCatalogRow[]>([])
  const [query, setQuery] = useState('')
  const [sourceType, setSourceType] = useState('all')
  const [loading, setLoading] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    if (!activeOrganization?.id) return

    setLoading(true)
    setError(null)

    try {
      const [nextMappings, nextCatalog] = await Promise.all([
        listInventorySourceMappings(activeOrganization.id),
        listInventoryCatalog(activeOrganization.id),
      ])

      setMappings(nextMappings)
      setCatalog(nextCatalog.items)
    } catch (caught) {
      setMappings([])
      setCatalog([])
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load Inventory reconciliation data.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [activeOrganization?.id])

  const sourceTypes = useMemo(
    () => [...new Set(mappings.map((mapping) => mapping.sourceType))].sort(),
    [mappings],
  )

  const filteredMappings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return mappings.filter((mapping) => {
      if (sourceType !== 'all' && mapping.sourceType !== sourceType) return false
      if (!normalizedQuery) return true

      return [
        mapping.sourceKey,
        mapping.sourceItemId,
        mapping.sourceName,
        mapping.itemName,
        mapping.variantName,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery))
    })
  }, [mappings, query, sourceType])

  const catalogOptions = useMemo(
    () =>
      [...catalog]
        .sort((left, right) => {
          const nameCompare = left.name.localeCompare(right.name)
          if (nameCompare !== 0) return nameCompare
          return variantLabel(left).localeCompare(variantLabel(right))
        }),
    [catalog],
  )

  async function remap(mapping: InventorySourceMapping, variantId: string) {
    if (!activeOrganization?.id || updatingId) return

    setUpdatingId(mapping.id)
    setError(null)

    try {
      await updateInventorySourceMapping({
        organizationId: activeOrganization.id,
        sourceType: mapping.sourceType,
        sourceKey: mapping.sourceKey,
        variantId,
      })
      await reload()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to update Inventory source mapping.',
      )
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <section className="inventory-content">
      <header className="inventory-hero">
        <p className="inventory-kicker">Reconciliation</p>
        <h1>Source mappings</h1>
        <p>
          Review how Aloha and Toast source rows map to the shared master Inventory catalog.
          Remapping a source key preserves that choice on later imports.
        </p>
      </header>

      <section className="inventory-summary-grid" aria-label="Reconciliation summary">
        <SummaryCard label="Source mappings" value={mappings.length} />
        <SummaryCard
          label="Aloha"
          value={mappings.filter((mapping) => mapping.sourceType === 'aloha-csv').length}
        />
        <SummaryCard
          label="Toast"
          value={mappings.filter((mapping) => mapping.sourceType === 'toast-template').length}
        />
        <SummaryCard
          label="Master variants"
          value={catalog.length}
        />
      </section>

      <section className="inventory-card inventory-table-card">
        <div className="inventory-table-heading">
          <div>
            <p className="inventory-kicker">Mappings</p>
            <h2>{activeOrganization?.name ?? 'Selected organization'}</h2>
          </div>
          <p>{filteredMappings.length.toLocaleString()} shown</p>
        </div>

        <div className="inventory-review-controls">
          <label className="inventory-search-control">
            <span>Source type</span>
            <select value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
              <option value="all">All source types</option>
              {sourceTypes.map((value) => (
                <option key={value} value={value}>
                  {formatSourceType(value)}
                </option>
              ))}
            </select>
          </label>

          <label className="inventory-search-control">
            <span>Search mappings</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Source name, source key, master item…"
            />
          </label>
        </div>

        {loading ? <p>Loading source mappings…</p> : null}
        {error ? <p className="inventory-error">{error}</p> : null}

        {!loading && !error && filteredMappings.length === 0 ? (
          <p className="inventory-empty-state">No source mappings match the current filters.</p>
        ) : null}

        {filteredMappings.length > 0 ? (
          <div className="inventory-table-wrap">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Source key</th>
                  <th>Current master mapping</th>
                  <th>Map to master variant</th>
                </tr>
              </thead>
              <tbody>
                {filteredMappings.map((mapping) => {
                  const updating = updatingId === mapping.id

                  return (
                    <tr key={mapping.id}>
                      <td>
                        <strong>{mapping.sourceName}</strong>
                        <span>{formatSourceType(mapping.sourceType)}</span>
                      </td>
                      <td>
                        <strong>{mapping.sourceKey}</strong>
                        {mapping.sourceItemId ? <span>{mapping.sourceItemId}</span> : null}
                      </td>
                      <td>
                        {mapping.itemName ? (
                          <>
                            <strong>{mapping.itemName}</strong>
                            <span>{mappingVariantLabel(mapping)}</span>
                          </>
                        ) : (
                          'Unmapped'
                        )}
                      </td>
                      <td>
                        <select
                          className="inventory-input"
                          value={mapping.inventoryItemVariantId ?? ''}
                          disabled={updating}
                          onChange={(event) => {
                            if (event.target.value) {
                              void remap(mapping, event.target.value)
                            }
                          }}
                        >
                          <option value="" disabled>
                            Select master variant
                          </option>
                          {catalogOptions.map((item) => (
                            <option key={item.variant.id} value={item.variant.id}>
                              {item.name} · {variantLabel(item)}
                            </option>
                          ))}
                        </select>
                        {updating ? <span>Saving…</span> : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
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

function formatSourceType(value: string) {
  if (value === 'aloha-csv') return 'Aloha CSV'
  if (value === 'toast-template') return 'Toast template'
  return value
}

function variantLabel(item: InventoryCatalogRow) {
  return [
    item.variant.name,
    item.variant.kind !== 'standard' ? item.variant.kind : null,
    item.variant.sizeOz !== null ? `${item.variant.sizeOz}oz` : null,
    item.variant.packageType,
  ]
    .filter(Boolean)
    .join(' · ') || 'Standard'
}

function mappingVariantLabel(mapping: InventorySourceMapping) {
  return [
    mapping.variantName,
    mapping.variantKind && mapping.variantKind !== 'standard'
      ? mapping.variantKind
      : null,
    mapping.variantSizeOz !== null ? `${mapping.variantSizeOz}oz` : null,
    mapping.variantPackageType,
  ]
    .filter(Boolean)
    .join(' · ') || 'Standard'
}
