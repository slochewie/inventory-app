import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AuthenticatedInventoryShell } from '#/components/authenticated-inventory-shell'
import { authClient } from '#/lib/auth-client'
import {
  createInventoryCocktail,
  listInventoryCocktailMasters,
  listInventoryCocktails,
  removeInventoryCocktail,
  updateInventoryCocktail,
  type InventoryCocktailMaster,
  type InventoryCocktailSection,
  type InventoryOrganizationCocktail,
} from '#/lib/inventory-access'
import './cocktails.css'

export const Route = createFileRoute('/cocktails')({ component: CocktailsPage })

const SECTION_OPTIONS: Array<{
  value: InventoryCocktailSection
  label: string
}> = [
  { value: 'house', label: 'House Cocktails' },
  { value: 'vodka', label: 'Vodka Cocktails' },
  { value: 'gin', label: 'Gin Cocktails' },
  { value: 'rum', label: 'Rum Cocktails' },
  { value: 'tequila', label: 'Tequila Cocktails' },
  { value: 'whiskey-bourbon', label: 'Whiskey/Bourbon Cocktails' },
]

type Draft = {
  section: InventoryCocktailSection
  name: string
  description: string
  price: string
  happyHourPrice: string
}

const EMPTY_DRAFT: Draft = {
  section: 'house',
  name: '',
  description: '',
  price: '',
  happyHourPrice: '',
}

function CocktailsPage() {
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [cocktails, setCocktails] = useState<InventoryOrganizationCocktail[]>([])
  const [masters, setMasters] = useState<InventoryCocktailMaster[]>([])
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [selectedMasterId, setSelectedMasterId] = useState<string | null>(null)
  const [selectedCocktailId, setSelectedCocktailId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Draft | null>(null)
  const [editEnabled, setEditEnabled] = useState(true)
  const [editExportToToast, setEditExportToToast] = useState(true)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function reload(signal?: AbortSignal) {
    if (!activeOrganization?.id) {
      setCocktails([])
      setMasters([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const [cocktailResult, masterResult] = await Promise.all([
        listInventoryCocktails(activeOrganization.id, signal),
        listInventoryCocktailMasters(activeOrganization.id, signal),
      ])
      setCocktails(cocktailResult.cocktails)
      setMasters(masterResult)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(caught instanceof Error ? caught.message : 'Unable to load cocktails.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void reload(controller.signal)
    return () => controller.abort()
  }, [activeOrganization?.id])

  const grouped = useMemo(() => {
    const result = new Map<InventoryCocktailSection, InventoryOrganizationCocktail[]>()
    SECTION_OPTIONS.forEach(({ value }) => result.set(value, []))

    cocktails.forEach((cocktail) => result.get(cocktail.section)?.push(cocktail))

    result.forEach((rows) =>
      rows.sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          displayName(left).localeCompare(displayName(right)),
      ),
    )

    return result
  }, [cocktails])

  const selectedCocktail =
    cocktails.find((cocktail) => cocktail.id === selectedCocktailId) ?? null

  useEffect(() => {
    if (!selectedCocktail) {
      setEditDraft(null)
      return
    }

    setEditDraft({
      section: selectedCocktail.section,
      name: displayName(selectedCocktail),
      description: selectedCocktail.description ?? '',
      price:
        selectedCocktail.priceCents === null
          ? ''
          : (selectedCocktail.priceCents / 100).toFixed(2),
      happyHourPrice:
        selectedCocktail.happyHourPriceCents === null
          ? ''
          : (selectedCocktail.happyHourPriceCents / 100).toFixed(2),
    })
    setEditEnabled(selectedCocktail.enabled)
    setEditExportToToast(selectedCocktail.exportToToast)
  }, [selectedCocktail?.id])

  const masterSuggestions = useMemo(() => {
    const query = normalize(draft.name)
    if (!query) return []

    return masters
      .filter((master) => !master.assigned)
      .filter((master) => normalize(master.name).includes(query))
      .slice(0, 8)
  }, [draft.name, masters])

  const selectedMaster =
    masters.find((master) => master.id === selectedMasterId) ?? null

  function selectMaster(master: InventoryCocktailMaster) {
    setSelectedMasterId(master.id)
    setDraft((current) => ({ ...current, name: master.name }))
  }

  function clearAddDraft() {
    setDraft(EMPTY_DRAFT)
    setSelectedMasterId(null)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!activeOrganization?.id || saving) return

    const name = draft.name.trim()
    const price = moneyToCents(draft.price)
    const happyHourPrice =
      draft.section === 'house'
        ? moneyToCents(draft.happyHourPrice, true)
        : null

    if (!name) {
      setError('Enter a cocktail name.')
      return
    }

    if (price === null) {
      setError(
        draft.section === 'house'
          ? 'Enter a valid base price.'
          : 'Enter a valid upcharge price.',
      )
      return
    }

    if (
      draft.section === 'house' &&
      draft.happyHourPrice.trim() &&
      happyHourPrice === null
    ) {
      setError('Enter a valid Happy Hour price.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await createInventoryCocktail({
        organizationId: activeOrganization.id,
        inventoryCocktailId: selectedMaster?.id,
        name: selectedMaster?.name ?? name,
        createNewMaster: !selectedMaster,
        section: draft.section,
        description: draft.description.trim() || null,
        priceCents: price,
        happyHourPriceCents: happyHourPrice,
        enabled: true,
        exportToToast: true,
      })

      setSuccess('Added ' + (selectedMaster?.name ?? name) + '.')
      clearAddDraft()
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to add cocktail.')
    } finally {
      setSaving(false)
    }
  }

  async function saveSelectedCocktail() {
    if (!activeOrganization?.id || !selectedCocktail || !editDraft || saving) {
      return
    }

    const price = moneyToCents(editDraft.price)
    const happyHourPrice =
      editDraft.section === 'house'
        ? moneyToCents(editDraft.happyHourPrice, true)
        : null

    if (price === null) {
      setError(
        editDraft.section === 'house'
          ? 'Enter a valid base price.'
          : 'Enter a valid upcharge price.',
      )
      return
    }

    if (
      editDraft.section === 'house' &&
      editDraft.happyHourPrice.trim() &&
      happyHourPrice === null
    ) {
      setError('Enter a valid Happy Hour price.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await updateInventoryCocktail({
        organizationId: activeOrganization.id,
        organizationCocktailId: selectedCocktail.id,
        section: editDraft.section,
        description: editDraft.description.trim() || null,
        priceCents: price,
        happyHourPriceCents: happyHourPrice,
        enabled: editEnabled,
        exportToToast: editEnabled && editExportToToast,
        toastNameOverride:
          editDraft.name.trim() &&
          editDraft.name.trim() !== selectedCocktail.masterName
            ? editDraft.name.trim()
            : null,
      })

      setSuccess('Updated ' + editDraft.name.trim() + '.')
      setSelectedCocktailId(null)
      await reload()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to update cocktail.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function removeSelected() {
    if (!activeOrganization?.id || !selectedCocktail || saving) return

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await removeInventoryCocktail({
        organizationId: activeOrganization.id,
        organizationCocktailId: selectedCocktail.id,
      })
      setSuccess(
        'Removed ' + displayName(selectedCocktail) + ' from this organization.',
      )
      setSelectedCocktailId(null)
      await reload()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to remove cocktail.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <AuthenticatedInventoryShell currentPath="/cocktails" requiredCapability="edit">
      <section className="inventory-content cocktails-page">
        <header className="inventory-page-heading">
          <div>
            <p className="inventory-kicker">Cocktails</p>
            <h1>Cocktails</h1>
            <p>
              Shared cocktail names with organization-specific pricing and Toast
              placement for {activeOrganization?.name ?? 'the selected organization'}.
            </p>
          </div>
        </header>

        <section className="inventory-card cocktails-editor">
          <div className="inventory-table-heading">
            <div>
              <h2>Add cocktail</h2>
              <p>
                Reuse an existing master cocktail when possible. Pricing,
                description, and Toast placement belong to this organization.
              </p>
            </div>
          </div>

          {error ? <p className="inventory-error">{error}</p> : null}
          {success ? <p className="inventory-success">{success}</p> : null}

          <form className="cocktails-form" onSubmit={(event) => void submit(event)}>
            <label>
              <span>Placement</span>
              <select
                value={draft.section}
                disabled={saving}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    section: event.target.value as InventoryCocktailSection,
                    happyHourPrice:
                      event.target.value === 'house'
                        ? current.happyHourPrice
                        : '',
                  }))
                }
              >
                {SECTION_OPTIONS.map((section) => (
                  <option key={section.value} value={section.value}>
                    {section.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="cocktails-master-field">
              <span>Cocktail name</span>
              <input
                value={draft.name}
                disabled={saving}
                placeholder={
                  draft.section === 'house' ? 'Espresso Martini' : 'Moscow Mule'
                }
                onChange={(event) => {
                  setSelectedMasterId(null)
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }}
              />

              {selectedMaster ? (
                <small className="cocktails-master-selected">
                  Using shared master: {selectedMaster.name}
                </small>
              ) : null}

              {!selectedMaster && masterSuggestions.length > 0 ? (
                <div className="cocktails-master-suggestions">
                  {masterSuggestions.map((master) => (
                    <button
                      key={master.id}
                      type="button"
                      onClick={() => selectMaster(master)}
                    >
                      <strong>{master.name}</strong>
                      <span>Use existing master</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </label>

            <label>
              <span>
                {draft.section === 'house' ? 'Base price' : 'Upcharge price'}
              </span>
              <MoneyInput
                value={draft.price}
                disabled={saving}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, price: value }))
                }
              />
            </label>

            {draft.section === 'house' ? (
              <label>
                <span>Happy Hour price</span>
                <MoneyInput
                  value={draft.happyHourPrice}
                  disabled={saving}
                  placeholder="Optional"
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, happyHourPrice: value }))
                  }
                />
              </label>
            ) : null}

            <label className="cocktails-description-field">
              <span>Description</span>
              <textarea
                value={draft.description}
                disabled={saving}
                placeholder="Optional Toast menu description"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>

            <div className="cocktails-form-actions">
              <button
                type="button"
                className="inventory-secondary-button"
                disabled={saving}
                onClick={clearAddDraft}
              >
                Clear
              </button>
              <button
                type="submit"
                className="inventory-primary-button"
                disabled={saving}
              >
                {saving ? 'Adding…' : selectedMaster ? 'Add existing cocktail' : 'Create cocktail'}
              </button>
            </div>
          </form>
        </section>

        <section className="cocktails-groups">
          {SECTION_OPTIONS.map((section) => {
            const rows = grouped.get(section.value) ?? []
            return (
              <section
                className={
                  rows.length === 0
                    ? 'inventory-card cocktails-group-card is-empty'
                    : 'inventory-card cocktails-group-card'
                }
                key={section.value}
              >
                <div className="inventory-table-heading">
                  <div>
                    <h2>{section.label}</h2>
                    <p>
                      {section.value === 'house'
                        ? 'Base-price cocktails exported to the House Cocktails section.'
                        : 'Common cocktail preparations exported with a Toast upcharge.'}
                    </p>
                  </div>
                  <strong>{rows.length}</strong>
                </div>

                {loading ? (
                  <p className="cocktails-empty">Loading…</p>
                ) : rows.length === 0 ? (
                  <p className="cocktails-empty">No cocktails for this organization.</p>
                ) : (
                  <div className="cocktails-list">
                    {rows.map((cocktail) => (
                      <button
                        className="cocktails-row"
                        key={cocktail.id}
                        type="button"
                        onClick={() => setSelectedCocktailId(cocktail.id)}
                      >
                        <div>
                          <strong>{displayName(cocktail)}</strong>
                          <span>
                            {section.value === 'house' ? 'Price' : 'Upcharge'}
                            {!cocktail.enabled ? ' · Not carried here' : ''}
                            {cocktail.enabled && !cocktail.exportToToast
                              ? ' · Not exporting'
                              : ''}
                          </span>
                        </div>
                        <strong>{formatMoney(cocktail.priceCents)}</strong>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </section>

        {selectedCocktail && editDraft ? (
          <div
            className="cocktails-edit-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cocktails-edit-title"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target && !saving) {
                setSelectedCocktailId(null)
              }
            }}
          >
            <section className="cocktails-edit-panel">
              <header className="cocktails-edit-header">
                <div>
                  <p className="inventory-kicker">Cocktail</p>
                  <h2 id="cocktails-edit-title">{displayName(selectedCocktail)}</h2>
                  <small>Master: {selectedCocktail.masterName}</small>
                </div>
                <button
                  type="button"
                  className="inventory-secondary-button"
                  disabled={saving}
                  onClick={() => setSelectedCocktailId(null)}
                >
                  Close
                </button>
              </header>

              <div className="cocktails-edit-grid">
                <label>
                  <span>Placement</span>
                  <select
                    value={editDraft.section}
                    disabled={saving}
                    onChange={(event) =>
                      setEditDraft((current) =>
                        current
                          ? {
                              ...current,
                              section: event.target
                                .value as InventoryCocktailSection,
                              happyHourPrice:
                                event.target.value === 'house'
                                  ? current.happyHourPrice
                                  : '',
                            }
                          : current,
                      )
                    }
                  >
                    {SECTION_OPTIONS.map((section) => (
                      <option key={section.value} value={section.value}>
                        {section.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Toast name</span>
                  <input
                    value={editDraft.name}
                    disabled={saving}
                    onChange={(event) =>
                      setEditDraft((current) =>
                        current ? { ...current, name: event.target.value } : current,
                      )
                    }
                  />
                </label>

                <label>
                  <span>
                    {editDraft.section === 'house'
                      ? 'Base price'
                      : 'Upcharge price'}
                  </span>
                  <MoneyInput
                    value={editDraft.price}
                    disabled={saving}
                    onChange={(value) =>
                      setEditDraft((current) =>
                        current ? { ...current, price: value } : current,
                      )
                    }
                  />
                </label>

                {editDraft.section === 'house' ? (
                  <label>
                    <span>Happy Hour price</span>
                    <MoneyInput
                      value={editDraft.happyHourPrice}
                      disabled={saving}
                      placeholder="Optional"
                      onChange={(value) =>
                        setEditDraft((current) =>
                          current
                            ? { ...current, happyHourPrice: value }
                            : current,
                        )
                      }
                    />
                  </label>
                ) : null}

                <label className="cocktails-description-field">
                  <span>Description</span>
                  <textarea
                    value={editDraft.description}
                    disabled={saving}
                    placeholder="Optional Toast menu description"
                    onChange={(event) =>
                      setEditDraft((current) =>
                        current
                          ? { ...current, description: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
              </div>

              <div className="cocktails-edit-toggles">
                <label>
                  <input
                    type="checkbox"
                    checked={editEnabled}
                    disabled={saving}
                    onChange={(event) => {
                      setEditEnabled(event.target.checked)
                      if (!event.target.checked) setEditExportToToast(false)
                    }}
                  />
                  <span>Available here</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={editExportToToast}
                    disabled={saving || !editEnabled}
                    onChange={(event) => setEditExportToToast(event.target.checked)}
                  />
                  <span>Export to Toast</span>
                </label>
              </div>

              <footer className="cocktails-edit-actions">
                <button
                  type="button"
                  className="inventory-danger-button"
                  disabled={saving}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Remove "' +
                          displayName(selectedCocktail) +
                          '" from this organization? The shared cocktail master is kept.',
                      )
                    ) {
                      void removeSelected()
                    }
                  }}
                >
                  Remove from organization
                </button>

                <div>
                  <button
                    type="button"
                    className="inventory-secondary-button"
                    disabled={saving}
                    onClick={() => setSelectedCocktailId(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inventory-primary-button"
                    disabled={saving}
                    onClick={() => void saveSelectedCocktail()}
                  >
                    {saving ? 'Saving…' : 'Update'}
                  </button>
                </div>
              </footer>
            </section>
          </div>
        ) : null}
      </section>
    </AuthenticatedInventoryShell>
  )
}

function MoneyInput({
  value,
  disabled,
  placeholder = '0.00',
  onChange,
}: {
  value: string
  disabled: boolean
  placeholder?: string
  onChange: (value: string) => void
}) {
  return (
    <div className="cocktails-money-input">
      <span>$</span>
      <input
        inputMode="decimal"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function displayName(cocktail: InventoryOrganizationCocktail) {
  return cocktail.toastNameOverride?.trim() || cocktail.masterName
}

function formatMoney(cents: number | null) {
  if (cents === null) return '—'
  return '$' + (cents / 100).toFixed(2)
}

function moneyToCents(value: string, allowBlank = false) {
  const cleaned = value.trim().replace(/^\$/, '').replace(/,/g, '')
  if (!cleaned) return allowBlank ? null : null
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 100)
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
