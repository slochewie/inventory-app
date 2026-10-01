import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AuthenticatedInventoryShell,
  useInventoryAccessRole,
} from '#/components/authenticated-inventory-shell'
import { authClient } from '#/lib/auth-client'
import {
  createInventoryLiquorModifierMaster,
  listInventoryLiquorModifierMasters,
  updateInventoryLiquorModifierMaster,
  type InventoryLiquorModifierMaster,
  type InventoryLiquorModifierType,
} from '#/lib/liquor-mods-access'

export function LiquorModMasterPage({
  currentPath,
  type,
  title,
  singular,
  description,
}: {
  currentPath: '/master-mixers' | '/master-bar-prep'
  type: InventoryLiquorModifierType
  title: string
  singular: string
  description: string
}) {
  const { canManageMasterCatalog } = useInventoryAccessRole()

  return (
    <AuthenticatedInventoryShell
      currentPath={currentPath}
      requiredCapability="manage-master-catalog"
    >
      {canManageMasterCatalog ? (
        <LiquorModMasterContent
          type={type}
          title={title}
          singular={singular}
          description={description}
        />
      ) : null}
    </AuthenticatedInventoryShell>
  )
}

function LiquorModMasterContent({
  type,
  title,
  singular,
  description,
}: {
  type: InventoryLiquorModifierType
  title: string
  singular: string
  description: string
}) {
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [masters, setMasters] = useState<InventoryLiquorModifierMaster[]>([])
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function reload(signal?: AbortSignal) {
    if (!activeOrganization?.id) {
      setMasters([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await listInventoryLiquorModifierMasters(
        activeOrganization.id,
        type,
        signal,
      )
      setMasters(result.modifiers)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(
        caught instanceof Error
          ? caught.message
          : `Unable to load ${title.toLowerCase()}.`,
      )
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    setEditingId(null)
    setEditingName('')
    void reload(controller.signal)
    return () => controller.abort()
  }, [activeOrganization?.id, type])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return masters

    return masters.filter((master) =>
      [master.name, master.normalizedName].some((value) =>
        value.toLowerCase().includes(normalized),
      ),
    )
  }, [masters, query])

  async function addMaster(event: FormEvent) {
    event.preventDefault()
    if (!activeOrganization?.id || saving) return

    const nextName = name.trim()
    if (!nextName) {
      setError(`${singular} name is required.`)
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await createInventoryLiquorModifierMaster({
        organizationId: activeOrganization.id,
        type,
        name: nextName,
      })
      setName('')
      await reload()
      setSuccess(`${singular} master added.`)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : `Unable to add ${singular.toLowerCase()} master.`,
      )
    } finally {
      setSaving(false)
    }
  }

  function beginEdit(master: InventoryLiquorModifierMaster) {
    setEditingId(master.id)
    setEditingName(master.name)
    setError(null)
    setSuccess(null)
  }

  async function saveMaster(master: InventoryLiquorModifierMaster) {
    if (!activeOrganization?.id || saving) return

    const nextName = editingName.trim()
    if (!nextName) {
      setError(`${singular} name is required.`)
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await updateInventoryLiquorModifierMaster({
        organizationId: activeOrganization.id,
        inventoryLiquorModifierId: master.id,
        name: nextName,
      })
      setEditingId(null)
      setEditingName('')
      await reload()
      setSuccess(`${singular} master updated.`)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : `Unable to update ${singular.toLowerCase()} master.`,
      )
    } finally {
      setSaving(false)
    }
  }

  async function setActive(
    master: InventoryLiquorModifierMaster,
    active: boolean,
  ) {
    if (!activeOrganization?.id || saving) return

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await updateInventoryLiquorModifierMaster({
        organizationId: activeOrganization.id,
        inventoryLiquorModifierId: master.id,
        active,
      })
      await reload()
      setSuccess(
        `${master.name} ${active ? 'activated' : 'deactivated'}.`,
      )
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : `Unable to update ${singular.toLowerCase()} master.`,
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="inventory-content liquor-mod-master-page">
      <style>{`
        .liquor-mod-master-page {
          display: grid;
          gap: 1rem;
        }

        .liquor-mod-master-page .liquor-master-form {
          display: grid;
          grid-template-columns: minmax(16rem, 1fr) auto;
          gap: .65rem;
          align-items: end;
        }

        .liquor-mod-master-page .liquor-master-form label,
        .liquor-mod-master-page .liquor-master-search {
          display: grid;
          gap: .35rem;
        }

        .liquor-mod-master-page label > span {
          color: #64748b;
          font-size: .76rem;
          font-weight: 700;
          letter-spacing: .04em;
          text-transform: uppercase;
        }

        .liquor-mod-master-page input {
          min-height: 2.5rem;
          width: 100%;
          border: 1px solid #d0d5dd;
          border-radius: .65rem;
          padding: 0 .75rem;
          font: inherit;
        }

        .liquor-mod-master-page .liquor-master-list {
          display: grid;
          gap: .5rem;
        }

        .liquor-mod-master-page .liquor-master-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 1rem;
          align-items: center;
          border-bottom: 1px solid #eaecf0;
          padding: .85rem 0;
        }

        .liquor-mod-master-page .liquor-master-row:last-child {
          border-bottom: 0;
        }

        .liquor-mod-master-page .liquor-master-row-main {
          min-width: 0;
        }

        .liquor-mod-master-page .liquor-master-row-main strong,
        .liquor-mod-master-page .liquor-master-row-main small {
          display: block;
        }

        .liquor-mod-master-page .liquor-master-row-main small {
          margin-top: .2rem;
          color: #64748b;
        }

        .liquor-mod-master-page .liquor-master-row-actions,
        .liquor-mod-master-page .liquor-master-edit-actions {
          display: flex;
          gap: .5rem;
          align-items: center;
        }

        .liquor-mod-master-page .liquor-master-edit {
          display: grid;
          grid-template-columns: minmax(14rem, 1fr) auto;
          gap: .6rem;
          align-items: center;
        }

        @media (max-width: 700px) {
          .liquor-mod-master-page .liquor-master-form,
          .liquor-mod-master-page .liquor-master-row,
          .liquor-mod-master-page .liquor-master-edit {
            grid-template-columns: 1fr;
          }

          .liquor-mod-master-page .liquor-master-row-actions {
            justify-content: flex-start;
          }
        }
      `}</style>

      <header className="inventory-page-heading">
        <div>
          <p className="inventory-kicker">Master catalog</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </header>

      {error ? <p className="inventory-error">{error}</p> : null}
      {success ? <p className="inventory-success">{success}</p> : null}

      <section className="inventory-card">
        <div className="inventory-table-heading">
          <div>
            <h2>Add {singular.toLowerCase()}</h2>
            <p>
              Creates one shared master that organizations can assign from
              Liquor Mods.
            </p>
          </div>
        </div>

        <form className="liquor-master-form" onSubmit={(event) => void addMaster(event)}>
          <label>
            <span>Name</span>
            <input
              value={name}
              disabled={saving}
              placeholder={type === 'mixer' ? 'Ginger Beer' : 'Lemon garnish'}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button
            className="inventory-primary-button"
            type="submit"
            disabled={saving || !name.trim()}
          >
            {saving ? 'Saving…' : 'Add master'}
          </button>
        </form>
      </section>

      <section className="inventory-card">
        <div className="inventory-table-heading">
          <div>
            <h2>{title}</h2>
            <p>
              Canonical shared names. Deactivated masters stay in the catalog but
              cannot be newly assigned.
            </p>
          </div>
          <strong>{masters.length}</strong>
        </div>

        <label className="liquor-master-search">
          <span>Search</span>
          <input
            value={query}
            placeholder={`Search ${title.toLowerCase()}`}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        {loading ? <p>Loading…</p> : null}

        {!loading && filtered.length === 0 ? (
          <p>No {title.toLowerCase()} found.</p>
        ) : (
          <div className="liquor-master-list">
            {filtered.map((master) => (
              <div className="liquor-master-row" key={master.id}>
                <div className="liquor-master-row-main">
                  {editingId === master.id ? (
                    <div className="liquor-master-edit">
                      <input
                        value={editingName}
                        disabled={saving}
                        onChange={(event) => setEditingName(event.target.value)}
                      />
                      <div className="liquor-master-edit-actions">
                        <button
                          type="button"
                          className="inventory-secondary-button"
                          disabled={saving}
                          onClick={() => {
                            setEditingId(null)
                            setEditingName('')
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="inventory-primary-button"
                          disabled={
                            saving ||
                            !editingName.trim() ||
                            editingName.trim() === master.name
                          }
                          onClick={() => void saveMaster(master)}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <strong>{master.name}</strong>
                      <small>
                        {master.active ? 'Active' : 'Inactive'}
                        {master.assigned ? ' · Assigned to selected organization' : ''}
                      </small>
                    </>
                  )}
                </div>

                {editingId !== master.id ? (
                  <div className="liquor-master-row-actions">
                    <button
                      type="button"
                      className="inventory-secondary-button"
                      disabled={saving}
                      onClick={() => beginEdit(master)}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="inventory-secondary-button"
                      disabled={saving}
                      onClick={() => void setActive(master, !master.active)}
                    >
                      {master.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
