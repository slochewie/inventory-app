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
          margin-bottom: 1rem;
        }

        .inventory-master-names-page .master-names-summary article {
          border: 1px solid #e5e7eb;
          border-radius: .8rem;
          background: #fff;
          padding: .8rem .9rem;
        }

        .inventory-master-names-page .master-names-summary span {
          display: block;
          color: #6b7280;
          font-size: .78rem;
          font-weight: 700;
          letter-spacing: .02em;
          text-transform: uppercase;
        }

        .inventory-master-names-page .master-names-summary strong {
          display: block;
          margin-top: .25rem;
          font-size: 1.25rem;
        }

        .inventory-master-names-page .master-impact-list {
          display: grid;
          gap: .55rem;
          margin-top: .65rem;
        }

        .inventory-master-names-page .master-impact-row {
          display: grid;
          grid-template-columns: minmax(11rem, 1.3fr) repeat(3, minmax(6rem, .7fr)) minmax(12rem, 1.4fr);
          gap: .75rem;
          align-items: center;
          border-top: 1px solid #e5e7eb;
          padding: .7rem 0;
        }

        .inventory-master-names-page .master-impact-row:first-child {
          border-top: 0;
        }

        .inventory-master-names-page .master-impact-row small {
          display: block;
          color: #6b7280;
        }

        .inventory-master-names-page .master-rename-panel {
          display: grid;
          gap: 1rem;
          margin-top: 1rem;
          border: 1px solid #d1d5db;
          border-radius: 1rem;
          background: #fff;
          padding: 1rem;
        }

        .inventory-master-names-page .master-rename-actions {
          display: flex;
          justify-content: flex-end;
          gap: .6rem;
        }

        .inventory-master-names-page .master-name-current {
          display: grid;
          gap: .2rem;
        }

        .inventory-master-names-page .master-name-current small,
        .inventory-master-names-page .master-rename-help {
          color: #6b7280;
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
                {filteredItems.map((item) => {
                  const exportImpact = item.organizations.reduce(
                    (sum, organization) =>
                      sum + organization.followsMasterNameCount,
                    0,
                  )

                  return (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        <div>{item.normalizedName}</div>
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
      </section>

      {selectedItem ? (
        <section className="inventory-card master-rename-panel">
          <div className="inventory-table-heading">
            <div className="master-name-current">
              <small>Current master name</small>
              <h2>{selectedItem.name}</h2>
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
              <span>Exports follow master</span>
              <strong>{selectedImpact.followsMasterNameCount}</strong>
            </article>
            <article>
              <span>Exports with override</span>
              <strong>{selectedImpact.overriddenExportCount}</strong>
            </article>
          </div>

          <div>
            <h3>Organization impact</h3>
            <div className="master-impact-list">
              {selectedItem.organizations.length > 0 ? (
                selectedItem.organizations.map((organization) => (
                  <div
                    className="master-impact-row"
                    key={organization.organizationId}
                  >
                    <div>
                      <strong>{organization.organizationName}</strong>
                      <small>
                        {organization.variantCount} linked variant
                        {organization.variantCount === 1 ? '' : 's'}
                      </small>
                    </div>
                    <div>
                      <strong>{organization.enabledVariantCount}</strong>
                      <small>carried</small>
                    </div>
                    <div>
                      <strong>{organization.exportVariantCount}</strong>
                      <small>exporting</small>
                    </div>
                    <div>
                      <strong>{organization.followsMasterNameCount}</strong>
                      <small>will use new name</small>
                    </div>
                    <div>
                      {organization.overrideNames.length > 0 ? (
                        <>
                          <strong>Local Toast override</strong>
                          <small>{organization.overrideNames.join(', ')}</small>
                        </>
                      ) : (
                        <>
                          <strong>Master name</strong>
                          <small>No local Toast-name override</small>
                        </>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p>No organization-specific variants currently reference this master item.</p>
              )}
            </div>
          </div>

          <label>
            <span>New master name</span>
            <input
              className="inventory-input"
              value={draftName}
              maxLength={160}
              disabled={saving}
              onChange={(event) => setDraftName(event.target.value)}
            />
          </label>

          <p className="master-rename-help">
            The previous master name is retained as an alias for future import
            reconciliation. Organization-specific Toast name overrides are not
            changed.
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
              {saving ? 'Renaming…' : 'Rename master item'}
            </button>
          </div>
        </section>
      ) : null}
    </section>
  )
}
