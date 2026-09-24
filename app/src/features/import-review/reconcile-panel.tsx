import { useEffect, useMemo, useState } from 'react'
import { getInventoryVariantLabel } from '#/features/menu-import/catalog'
import { authClient } from '#/lib/auth-client'
import {
  listInventoryCatalog,
  listInventorySourceMappings,
  updateInventorySourceMapping,
  type InventoryCatalogRow,
  type InventorySourceMapping,
} from '#/lib/inventory-access'

type ReviewFilter =
  | 'attention'
  | 'possible-duplicate'
  | 'unmapped'
  | 'mapped'
  | 'all'

type MappingAssessment = {
  status: 'mapped' | 'unmapped' | 'possible-duplicate'
  alternatives: InventoryCatalogRow[]
}

export function ReconcilePanel() {
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [mappings, setMappings] = useState<InventorySourceMapping[]>([])
  const [catalog, setCatalog] = useState<InventoryCatalogRow[]>([])
  const [query, setQuery] = useState('')
  const [sourceType, setSourceType] = useState('all')
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('attention')
  const [editingMappingId, setEditingMappingId] = useState<string | null>(null)
  const [candidateQuery, setCandidateQuery] = useState('')
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
    setEditingMappingId(null)
    setCandidateQuery('')
    void reload()
  }, [activeOrganization?.id])

  const sourceTypes = useMemo(
    () => [...new Set(mappings.map((mapping) => mapping.sourceType))].sort(),
    [mappings],
  )

  const assessments = useMemo(() => {
    const result = new Map<string, MappingAssessment>()

    mappings.forEach((mapping) => {
      result.set(mapping.id, assessMapping(mapping, catalog))
    })

    return result
  }, [catalog, mappings])

  const counts = useMemo(() => {
    let mapped = 0
    let unmapped = 0
    let possibleDuplicate = 0

    mappings.forEach((mapping) => {
      const status = assessments.get(mapping.id)?.status
      if (status === 'unmapped') unmapped += 1
      else if (status === 'possible-duplicate') possibleDuplicate += 1
      else mapped += 1
    })

    return {
      mapped,
      unmapped,
      possibleDuplicate,
      attention: unmapped + possibleDuplicate,
    }
  }, [assessments, mappings])

  const filteredMappings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return mappings.filter((mapping) => {
      if (sourceType !== 'all' && mapping.sourceType !== sourceType) return false

      const status = assessments.get(mapping.id)?.status ?? 'mapped'

      if (reviewFilter === 'attention' && status === 'mapped') return false
      if (reviewFilter === 'possible-duplicate' && status !== 'possible-duplicate') return false
      if (reviewFilter === 'unmapped' && status !== 'unmapped') return false
      if (reviewFilter === 'mapped' && status !== 'mapped') return false

      if (!normalizedQuery) return true

      return [
        mapping.sourceKey,
        mapping.sourceItemId,
        mapping.sourceName,
        mapping.itemName,
        mapping.variantName,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery))
    })
  }, [assessments, mappings, query, reviewFilter, sourceType])

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
      setEditingMappingId(null)
      setCandidateQuery('')
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

  function beginChange(mappingId: string) {
    setEditingMappingId(mappingId)
    setCandidateQuery('')
  }

  return (
    <section className="inventory-content">
      <header className="inventory-hero">
        <p className="inventory-kicker">Reconciliation</p>
        <h1>Source mappings</h1>
        <p>
          Review only source rows that may need attention. Confirmed mappings stay out of the
          way, while possible duplicate names and unmapped rows surface for review.
        </p>
      </header>

      <section className="inventory-summary-grid" aria-label="Reconciliation summary">
        <SummaryCard label="Needs review" value={counts.attention} />
        <SummaryCard label="Possible duplicates" value={counts.possibleDuplicate} />
        <SummaryCard label="Unmapped" value={counts.unmapped} />
        <SummaryCard label="Mapped" value={counts.mapped} />
      </section>

      <section className="inventory-card inventory-table-card">
        <div className="inventory-table-heading">
          <div>
            <p className="inventory-kicker">Mappings</p>
            <h2>{activeOrganization?.name ?? 'Selected organization'}</h2>
          </div>
          <p>{filteredMappings.length.toLocaleString()} shown</p>
        </div>

        <div className="inventory-reconcile-filters">
          <div className="inventory-filter-group" aria-label="Reconciliation status">
            <FilterButton
              active={reviewFilter === 'attention'}
              label="Needs review"
              count={counts.attention}
              onClick={() => setReviewFilter('attention')}
            />
            <FilterButton
              active={reviewFilter === 'possible-duplicate'}
              label="Possible duplicates"
              count={counts.possibleDuplicate}
              onClick={() => setReviewFilter('possible-duplicate')}
            />
            <FilterButton
              active={reviewFilter === 'unmapped'}
              label="Unmapped"
              count={counts.unmapped}
              onClick={() => setReviewFilter('unmapped')}
            />
            <FilterButton
              active={reviewFilter === 'mapped'}
              label="Mapped"
              count={counts.mapped}
              onClick={() => setReviewFilter('mapped')}
            />
            <FilterButton
              active={reviewFilter === 'all'}
              label="All mappings"
              count={mappings.length}
              onClick={() => setReviewFilter('all')}
            />
          </div>

          <div className="inventory-reconcile-searches">
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
        </div>

        {loading ? <p>Loading source mappings…</p> : null}
        {error ? <p className="inventory-error">{error}</p> : null}

        {!loading && !error && filteredMappings.length === 0 ? (
          <p className="inventory-empty-state">
            {reviewFilter === 'attention'
              ? 'No source mappings currently need review.'
              : 'No source mappings match the current filters.'}
          </p>
        ) : null}

        {filteredMappings.length > 0 ? (
          <div className="inventory-table-wrap">
            <table className="inventory-table inventory-reconcile-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Source key</th>
                  <th>Status</th>
                  <th>Current master mapping</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredMappings.map((mapping) => {
                  const updating = updatingId === mapping.id
                  const editing = editingMappingId === mapping.id
                  const assessment = assessments.get(mapping.id) ?? {
                    status: 'mapped',
                    alternatives: [],
                  }
                  const candidates = buildCandidates(
                    mapping,
                    catalog,
                    assessment.alternatives,
                    candidateQuery,
                  )

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
                        <StatusBadge status={assessment.status} />
                        {assessment.status === 'possible-duplicate' &&
                        assessment.alternatives.length > 0 ? (
                          <span>
                            Similar to {assessment.alternatives[0].name}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        {mapping.itemName ? (
                          <>
                            <strong>{mapping.itemName}</strong>
                            <span>{mappingVariantLabel(mapping)}</span>
                          </>
                        ) : (
                          <strong>Unmapped</strong>
                        )}
                      </td>
                      <td className="inventory-reconcile-action">
                        {editing ? (
                          <div className="inventory-reconcile-editor">
                            <input
                              type="search"
                              value={candidateQuery}
                              onChange={(event) => setCandidateQuery(event.target.value)}
                              placeholder="Search master items…"
                              autoFocus
                            />
                            <select
                              className="inventory-input"
                              value=""
                              disabled={updating}
                              onChange={(event) => {
                                if (event.target.value) {
                                  void remap(mapping, event.target.value)
                                }
                              }}
                            >
                              <option value="" disabled>
                                {candidateQuery
                                  ? 'Choose matching variant'
                                  : 'Choose suggested variant'}
                              </option>
                              {candidates.map((item) => (
                                <option key={item.variant.id} value={item.variant.id}>
                                  {item.name} · {variantLabel(item)}
                                </option>
                              ))}
                            </select>
                            <div className="inventory-reconcile-editor-actions">
                              <span>
                                {updating
                                  ? 'Saving…'
                                  : candidateQuery
                                    ? `${candidates.length} matches`
                                    : `${candidates.length} suggestions`}
                              </span>
                              <button
                                type="button"
                                disabled={updating}
                                onClick={() => {
                                  setEditingMappingId(null)
                                  setCandidateQuery('')
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            className="inventory-row-action"
                            type="button"
                            onClick={() => beginChange(mapping.id)}
                          >
                            {mapping.inventoryItemVariantId ? 'Change' : 'Map'}
                          </button>
                        )}
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

function FilterButton({
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

function StatusBadge({
  status,
}: {
  status: MappingAssessment['status']
}) {
  const labels = {
    mapped: 'Mapped',
    unmapped: 'Unmapped',
    'possible-duplicate': 'Review',
  }

  return (
    <span className={`inventory-reconcile-status inventory-reconcile-status-${status}`}>
      {labels[status]}
    </span>
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

function assessMapping(
  mapping: InventorySourceMapping,
  catalog: InventoryCatalogRow[],
): MappingAssessment {
  if (!mapping.inventoryItemVariantId || !mapping.inventoryItemId) {
    return {
      status: 'unmapped',
      alternatives: findSimilarCatalogItems(mapping, catalog),
    }
  }

  const compatibleAlternatives = findSimilarCatalogItems(mapping, catalog)
    .filter((item) => item.id !== mapping.inventoryItemId)

  return {
    status: compatibleAlternatives.length > 0
      ? 'possible-duplicate'
      : 'mapped',
    alternatives: compatibleAlternatives,
  }
}

function findSimilarCatalogItems(
  mapping: InventorySourceMapping,
  catalog: InventoryCatalogRow[],
) {
  const currentName = mapping.itemName ?? mapping.sourceName
  const normalizedCurrent = normalizeComparableName(currentName)
  const normalizedSource = normalizeComparableName(mapping.sourceName)

  return catalog
    .filter((item) => variantCompatible(mapping, item))
    .map((item) => ({
      item,
      score: Math.min(
        nameDistance(normalizedCurrent, normalizeComparableName(item.name)),
        nameDistance(normalizedSource, normalizeComparableName(item.name)),
      ),
    }))
    .filter(({ item, score }) => {
      if (item.id === mapping.inventoryItemId) return false
      const length = Math.max(
        normalizeComparableName(item.name).length,
        normalizedCurrent.length,
        normalizedSource.length,
      )
      const threshold = length <= 6 ? 1 : length <= 12 ? 2 : 3
      return score <= threshold
    })
    .sort((left, right) => left.score - right.score || left.item.name.localeCompare(right.item.name))
    .map(({ item }) => item)
}

function buildCandidates(
  mapping: InventorySourceMapping,
  catalog: InventoryCatalogRow[],
  alternatives: InventoryCatalogRow[],
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase()

  if (normalizedQuery) {
    return catalog
      .filter((item) => variantCompatible(mapping, item))
      .filter((item) =>
        [item.name, item.category?.name, variantLabel(item)]
          .some((value) => value?.toLowerCase().includes(normalizedQuery)),
      )
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, 50)
  }

  const current = catalog.find(
    (item) => item.variant.id === mapping.inventoryItemVariantId,
  )

  const ranked = [
    ...alternatives,
    ...catalog
      .filter((item) => variantCompatible(mapping, item))
      .sort((left, right) => {
        const source = normalizeComparableName(mapping.sourceName)
        const leftDistance = nameDistance(source, normalizeComparableName(left.name))
        const rightDistance = nameDistance(source, normalizeComparableName(right.name))
        return leftDistance - rightDistance || left.name.localeCompare(right.name)
      }),
  ]

  const unique = new Map<string, InventoryCatalogRow>()
  if (current) unique.set(current.variant.id, current)
  ranked.forEach((item) => unique.set(item.variant.id, item))

  return [...unique.values()].slice(0, 12)
}

function variantCompatible(
  mapping: InventorySourceMapping,
  item: InventoryCatalogRow,
) {
  if (!mapping.inventoryItemVariantId) return true

  return (
    item.variant.kind === mapping.variantKind &&
    item.variant.sizeOz === mapping.variantSizeOz &&
    item.variant.packageType === mapping.variantPackageType
  )
}

function normalizeComparableName(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(8|10|12|16|20|24)\s*oz\b/g, ' ')
    .replace(/\b(draft|pint|imperial|imp|regular|reg|can|bottle|btl|tall)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
}

function nameDistance(left: string, right: string) {
  if (left === right) return 0
  if (!left) return right.length
  if (!right) return left.length

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1

      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      )
    }

    for (let index = 0; index < current.length; index += 1) {
      previous[index] = current[index]
    }
  }

  return previous[right.length]
}

function formatSourceType(value: string) {
  if (value === 'aloha-csv') return 'Aloha CSV'
  if (value === 'toast-template') return 'Toast template'
  return value
}

function variantLabel(item: InventoryCatalogRow) {
  return getInventoryVariantLabel(item.variant)
}

function mappingVariantLabel(mapping: InventorySourceMapping) {
  return getInventoryVariantLabel({
    kind: mapping.variantKind ?? 'standard',
    sizeOz: mapping.variantSizeOz,
    packageType: mapping.variantPackageType,
    name: mapping.variantName,
  })
}
