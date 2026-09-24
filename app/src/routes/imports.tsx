import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { AuthenticatedInventoryShell } from '#/components/authenticated-inventory-shell'
import { authClient } from '#/lib/auth-client'
import {
  listInventoryImports,
  type InventoryImportHistoryEntry,
} from '#/lib/inventory-access'
import { formatCurrency } from '#/features/menu-import/types'

export const Route = createFileRoute('/imports')({ component: ImportHistory })

function ImportHistory() {
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [imports, setImports] = useState<InventoryImportHistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!activeOrganization?.id) return

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    void listInventoryImports(activeOrganization.id, controller.signal)
      .then(setImports)
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setError(
          caught instanceof Error
            ? caught.message
            : 'Unable to load Inventory import history.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [activeOrganization?.id])

  const totalConflicts = useMemo(
    () => imports.reduce((total, entry) => total + entry.conflictCount, 0),
    [imports],
  )

  return (
    <AuthenticatedInventoryShell currentPath="/imports">
      <section className="inventory-content">
        <header className="inventory-hero">
          <p className="inventory-kicker">Import history</p>
          <h1>Inventory imports</h1>
          <p>
            Review persistent Aloha and Toast imports for the selected organization,
            including duplicate price or category conflicts detected during normalization.
          </p>
        </header>

        <section className="inventory-summary-grid" aria-label="Import history summary">
          <SummaryCard label="Imports" value={imports.length} />
          <SummaryCard
            label="Completed"
            value={imports.filter((entry) => entry.status === 'completed').length}
          />
          <SummaryCard label="Conflicts" value={totalConflicts} />
          <SummaryCard
            label="Latest variants"
            value={imports[0]?.variantCount ?? 0}
          />
        </section>

        <section className="inventory-card inventory-table-card">
          <div className="inventory-table-heading">
            <div>
              <p className="inventory-kicker">History</p>
              <h2>{activeOrganization?.name ?? 'Selected organization'}</h2>
            </div>
            <p>{imports.length.toLocaleString()} imports</p>
          </div>

          {loading ? <p>Loading import history…</p> : null}
          {error ? <p className="inventory-error">{error}</p> : null}

          {!loading && !error && imports.length === 0 ? (
            <p className="inventory-empty-state">No persistent imports yet.</p>
          ) : null}

          {imports.length > 0 ? (
            <div className="inventory-table-wrap">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Source</th>
                    <th>Items</th>
                    <th>Variants</th>
                    <th>Conflicts</th>
                    <th>Imported by</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((entry) => (
                    <tr key={entry.id}>
                      <td>{new Date(entry.createdAt).toLocaleString()}</td>
                      <td>
                        <strong>{entry.sourceName}</strong>
                        <span>{formatSourceType(entry.sourceType)} · {entry.status}</span>
                      </td>
                      <td>{entry.itemCount.toLocaleString()}</td>
                      <td>{entry.variantCount.toLocaleString()}</td>
                      <td>
                        {entry.conflictCount === 0 ? (
                          '—'
                        ) : (
                          <details>
                            <summary>
                              {entry.conflictCount.toLocaleString()} conflict
                              {entry.conflictCount === 1 ? '' : 's'}
                            </summary>
                            <ul className="inventory-warning-list">
                              {entry.conflicts.map((conflict, index) => (
                                <li key={`${entry.id}-${index}`}>
                                  {formatConflict(conflict)}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                      <td>
                        {entry.importedByName || entry.importedByEmail || entry.importedByUserId}
                        {entry.importedByName && entry.importedByEmail ? (
                          <span>{entry.importedByEmail}</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </section>
    </AuthenticatedInventoryShell>
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

function formatSourceType(sourceType: string) {
  if (sourceType === 'aloha-csv') return 'Aloha CSV'
  if (sourceType === 'toast-template') return 'Toast template'
  return sourceType
}

function formatConflict(
  conflict: InventoryImportHistoryEntry['conflicts'][number],
) {
  const source = [
    conflict.sourceName,
    conflict.sourceKey ? `#${conflict.sourceKey}` : null,
  ]
    .filter(Boolean)
    .join(' ')

  if (conflict.type === 'duplicate-variant-price') {
    return [
      source || 'Duplicate variant',
      `price ${formatCurrency(conflict.incomingPriceCents ?? null)} conflicts with ${formatCurrency(conflict.existingPriceCents ?? null)}`,
      conflict.category ? `category ${conflict.category}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  if (conflict.type === 'duplicate-variant-category') {
    return [
      source || 'Duplicate variant',
      `category ${conflict.incomingCategory ?? 'Unknown'} conflicts with ${conflict.existingCategory ?? 'Unknown'}`,
    ].join(' · ')
  }

  return [source || 'Import conflict', conflict.type].filter(Boolean).join(' · ')
}
