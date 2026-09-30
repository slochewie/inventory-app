import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import {
  AuthenticatedInventoryShell,
  useInventoryAccessRole,
} from '#/components/authenticated-inventory-shell'
import { authClient } from '#/lib/auth-client'
import {
  listInventoryMasterItems,
  renameInventoryMasterItem,
  type InventoryMasterItem,
} from '#/lib/inventory-access'

export const Route = createFileRoute('/master-names')({
  component: MasterNamesRoute,
})

function MasterNamesRoute() {
  const { canManageMasterCatalog } = useInventoryAccessRole()

  return (
    <AuthenticatedInventoryShell
      currentPath="/master-names"
      requiredCapability="manage-master-catalog"
    >
      {canManageMasterCatalog ? <MasterNamesPage /> : null}
    </AuthenticatedInventoryShell>
  )
}

function MasterNamesPage() {
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [items, setItems] = useState<InventoryMasterItem[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState(1)

  const PAGE_SIZE = 50

  async function reload() {
    if (!activeOrganization?.id) return

    setLoading(true)
    setError(null)

    try {
      setItems(await listInventoryMasterItems(activeOrganization.id))
    } catch (nextError) {
      setItems([])
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to load Inventory master items.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setSelectedItemId(null)
    setDraftName('')
    void reload()
  }, [activeOrganization?.id])

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return items

    return items.filter((item) =>
      [
        item.name,
        item.categoryName ?? '',
        item.toastCategory ?? '',
        ...item.organizations.flatMap((organization) => [
          organization.organizationName,
          ...organization.overrideNames,
        ]),
      ].some((value) => value.toLowerCase().includes(normalizedQuery)),
    )
  }, [items, query])

  useEffect(() => {
    setPage(1)
  }, [query])

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount)
  const pageStart = (clampedPage - 1) * PAGE_SIZE
  const pageItems = filteredItems.slice(pageStart, pageStart + PAGE_SIZE)
  const pageEnd = pageStart + pageItems.length

  const selectedItem =
    items.find((item) => item.id === selectedItemId) ?? null

  const selectedImpact = useMemo(() => {
    if (!selectedItem) {
      return {
        organizationCount: 0,
        enabledVariantCount: 0,
        followsMasterNameCount: 0,
        overriddenExportCount: 0,
      }
    }

    return selectedItem.organizations.reduce(
      (summary, organization) => ({
        organizationCount: summary.organizationCount + 1,
        enabledVariantCount:
          summary.enabledVariantCount + organization.enabledVariantCount,
        followsMasterNameCount:
          summary.followsMasterNameCount + organization.followsMasterNameCount,
        overriddenExportCount:
          summary.overriddenExportCount +
          Math.max(
            0,
            organization.exportVariantCount -
              organization.followsMasterNameCount,
          ),
      }),
      {
        organizationCount: 0,
        enabledVariantCount: 0,
        followsMasterNameCount: 0,
        overriddenExportCount: 0,
      },
    )
  }, [selectedItem])

  function beginRename(item: InventoryMasterItem) {
    setSelectedItemId(item.id)
    setDraftName(item.name)
    setError(null)
  }

  function cancelRename() {
    if (saving) return
    setSelectedItemId(null)
    setDraftName('')
  }

  useEffect(() => {
    if (!selectedItem) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') cancelRename()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedItem, saving])

  async function saveRename() {
    if (!activeOrganization?.id || !selectedItem || saving) return

    const nextName = draftName.trim()
    if (!nextName || nextName === selectedItem.name) return

    setSaving(true)
    setError(null)

    try {
      await renameInventoryMasterItem({
        organizationId: activeOrganization.id,
        itemId: selectedItem.id,
        name: nextName,
      })
      await reload()
      setSelectedItemId(null)
      setDraftName('')
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to rename the Inventory master item.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="inventory-content inventory-master-names-page">
      <style>{`
        .inventory-master-names-page .master-names-summary {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: .75rem;
        }

        .inventory-master-names-page .master-names-summary article {
          border: 1px solid #e5e7eb;
          border-radius: .75rem;
          background: #f8fafc;
          padding: .9rem 1rem;
        }

        .inventory-master-names-page .master-names-summary span {
          display: block;
          color: #64748b;
          font-size: .72rem;
          font-weight: 700;
          letter-spacing: .04em;
          text-transform: uppercase;
        }

        .inventory-master-names-page .master-names-summary strong {
          display: block;
          margin-top: .2rem;
          color: #0f172a;
          font-size: 1.25rem;
        }

        .inventory-master-names-page .master-rename-backdrop {
          position: fixed;
          inset: 0;
          z-index: 70;
          display: grid;
          place-items: center;
          background: rgb(15 23 42 / 45%);
          padding: 1rem;
        }

        .inventory-master-names-page .master-rename-panel {
          display: grid;
          width: min(58rem, calc(100vw - 2rem));
          max-height: min(88dvh, 50rem);
          overflow: auto;
          gap: 1.15rem;
          border: 1px solid #d1d5db;
          border-radius: 1rem;
          background: #fff;
          padding: 1.25rem;
          box-shadow: 0 24px 60px rgb(15 23 42 / 22%);
        }

        .inventory-master-names-page .master-rename-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
        }

        .inventory-master-names-page .master-rename-header h2 {
          margin: .15rem 0 0;
        }

        .inventory-master-names-page .master-name-current {
          display: grid;
          gap: .15rem;
        }

        .inventory-master-names-page .master-name-current small,
        .inventory-master-names-page .master-rename-help,
        .inventory-master-names-page .master-impact-table small {
          color: #64748b;
        }

        .inventory-master-names-page .master-impact-section {
          display: grid;
          gap: .65rem;
        }

        .inventory-master-names-page .master-impact-section h3 {
          margin: 0;
        }

        .inventory-master-names-page .master-impact-table {
          overflow: hidden;
          border: 1px solid #e5e7eb;
          border-radius: .75rem;
        }

        .inventory-master-names-page .master-impact-table table {
          width: 100%;
          border-collapse: collapse;
        }

        .inventory-master-names-page .master-impact-table th,
        .inventory-master-names-page .master-impact-table td {
          padding: .75rem .85rem;
          text-align: left;
          vertical-align: top;
          border-bottom: 1px solid #e5e7eb;
        }

        .inventory-master-names-page .master-impact-table th {
          background: #f8fafc;
          color: #475569;
          font-size: .76rem;
          font-weight: 700;
          letter-spacing: .025em;
          text-transform: uppercase;
        }

        .inventory-master-names-page .master-impact-table tr:last-child td {
          border-bottom: 0;
        }

        .inventory-master-names-page .master-rename-field {
          display: grid;
          gap: .4rem;
        }

        .inventory-master-names-page .master-rename-field > span {
          font-weight: 700;
        }

        .inventory-master-names-page .master-rename-field .inventory-input {
          width: 100%;
        }

        .inventory-master-names-page .master-rename-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          border-top: 1px solid #e5e7eb;
          padding-top: 1rem;
        }

        .inventory-master-names-page .master-rename-help {
          margin: 0;
          max-width: 42rem;
          font-size: .92rem;
          line-height: 1.45;
        }

        .inventory-master-names-page .master-rename-actions {
          display: flex;
          flex: 0 0 auto;
          gap: .6rem;
        }

        .inventory-master-names-page .master-names-pagination {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: .75rem;
          border-top: 1px solid #e5e7eb;
          padding: .8rem 1rem;
        }

        .inventory-master-names-page .master-names-pagination-actions {
          display: flex;
          align-items: center;
          gap: .5rem;
        }

        @media (max-width: 900px) {
          .inventory-master-names-page .master-names-summary {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .inventory-master-names-page .master-impact-row {
            grid-template-columns: 1fr 1fr;
          }
        }

        @media (max-width: 600px) {
          .inventory-master-names-page .master-names-summary,
          .inventory-master-names-page .master-impact-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <header className="inventory-hero">
        <p className="inventory-kicker">Admin</p>
        <h1>Master Names</h1>
        <p>
          Rename shared master catalog items and review the organization-level
          impact before saving. The selected organization is used only to verify
          your Inventory Admin permission.
        </p>
      </header>

      <section className="inventory-card inventory-table-card">
        <div className="inventory-table-heading">
          <div>
            <h2>Shared master catalog</h2>
            <p>
              {items.length.toLocaleString()} master items. Renames are global.
            </p>
          </div>
          <input
            className="inventory-input"
            type="search"
            value={query}
            placeholder="Search master names or organizations"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {error ? <p className="inventory-error">{error}</p> : null}
        {loading ? <p>Loading master catalog…</p> : null}

        {!loading && filteredItems.length > 0 ? (
          <div className="inventory-table-scroll">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Master name</th>
                  <th>Category</th>
                  <th>Variants</th>
                  <th>Organizations</th>
                  <th>Toast exports affected</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item) => {
                  const exportImpact = item.organizations.reduce(
                    (sum, organization) =>
                      sum + organization.followsMasterNameCount,
                    0,
                  )

                  return (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                      </td>
                      <td>{item.categoryName ?? 'Uncategorized'}</td>
                      <td>{item.variantCount.toLocaleString()}</td>
                      <td>{item.organizations.length.toLocaleString()}</td>
                      <td>{exportImpact.toLocaleString()}</td>
                      <td>
                        <button
                          className="inventory-template-download"
                          type="button"
                          onClick={() => beginRename(item)}
                        >
                          Review / Rename
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && filteredItems.length > 0 ? (
          <div className="master-names-pagination">
            <span>
              Showing {(pageStart + 1).toLocaleString()}–{pageEnd.toLocaleString()} of{' '}
              {filteredItems.length.toLocaleString()}
            </span>
            <div className="master-names-pagination-actions">
              <button
                className="inventory-template-download"
                type="button"
                disabled={clampedPage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <span>
                Page {clampedPage} of {pageCount}
              </span>
              <button
                className="inventory-template-download"
                type="button"
                disabled={clampedPage >= pageCount}
                onClick={() =>
                  setPage((current) => Math.min(pageCount, current + 1))
                }
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {selectedItem ? (
        <div
          className="master-rename-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="master-rename-title"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) cancelRename()
          }}
        >
          <section className="master-rename-panel">
            <div className="master-rename-header">
              <div className="master-name-current">
                <small>Current master name</small>
                <h2 id="master-rename-title">{selectedItem.name}</h2>
              </div>
              <button
                className="inventory-template-download"
                type="button"
                disabled={saving}
                onClick={cancelRename}
              >
                Close
              </button>
            </div>

            <div className="master-names-summary">
              <article>
                <span>Organizations</span>
                <strong>{selectedImpact.organizationCount}</strong>
              </article>
              <article>
                <span>Carried variants</span>
                <strong>{selectedImpact.enabledVariantCount}</strong>
              </article>
              <article>
                <span>Affected exports</span>
                <strong>{selectedImpact.followsMasterNameCount}</strong>
              </article>
              <article>
                <span>Local overrides</span>
                <strong>{selectedImpact.overriddenExportCount}</strong>
              </article>
            </div>

            <div className="master-impact-section">
              <h3>Organization impact</h3>
              {selectedItem.organizations.length > 0 ? (
                <div className="master-impact-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Organization</th>
                        <th>Carried</th>
                        <th>Exporting</th>
                        <th>Affected</th>
                        <th>Name used by Toast</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedItem.organizations.map((organization) => (
                        <tr key={organization.organizationId}>
                          <td>
                            <strong>{organization.organizationName}</strong>
                            <small>
                              {organization.variantCount} linked variant
                              {organization.variantCount === 1 ? '' : 's'}
                            </small>
                          </td>
                          <td>{organization.enabledVariantCount}</td>
                          <td>{organization.exportVariantCount}</td>
                          <td>{organization.followsMasterNameCount}</td>
                          <td>
                            {organization.overrideNames.length > 0 ? (
                              <>
                                <strong>{organization.overrideNames.join(', ')}</strong>
                                <small>Local Toast override; unchanged by rename</small>
                              </>
                            ) : (
                              <>
                                <strong>{selectedItem.name}</strong>
                                <small>Follows the master name</small>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>No organization-specific variants currently reference this master item.</p>
              )}
            </div>

            <label className="master-rename-field">
              <span>New master name</span>
              <input
                className="inventory-input"
                value={draftName}
                maxLength={160}
                disabled={saving}
                autoFocus
                onChange={(event) => setDraftName(event.target.value)}
              />
            </label>

            <div className="master-rename-footer">
              <p className="master-rename-help">
                The old master name is kept as an import alias. Organization-specific
                Toast name overrides stay exactly as they are.
              </p>

              <div className="master-rename-actions">
                <button
                  className="inventory-template-download"
                  type="button"
                  disabled={saving}
                  onClick={cancelRename}
                >
                  Cancel
                </button>
                <button
                  className="inventory-template-download"
                  type="button"
                  disabled={
                    saving ||
                    !draftName.trim() ||
                    draftName.trim() === selectedItem.name
                  }
                  onClick={() => void saveRename()}
                >
                  {saving ? 'Renaming…' : 'Rename master'}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}
