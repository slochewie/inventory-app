import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AuthenticatedInventoryShell } from '#/components/authenticated-inventory-shell'
import { authClient } from '#/lib/auth-client'
import {
  createInventoryLiquorModifier,
  listInventoryLiquorModifierMasters,
  listInventoryLiquorModifiers,
  removeInventoryLiquorModifier,
  updateInventoryLiquorModifier,
  type InventoryLiquorModifier,
  type InventoryLiquorModifierMaster,
  type InventoryLiquorModifierType,
} from '#/lib/liquor-mods-access'
import './cocktails.css'

export const Route = createFileRoute('/liquor-mods')({
  component: LiquorModsPage,
})

const PLACEMENT_OPTIONS: Array<{
  value: InventoryLiquorModifierType
  label: string
}> = [
  { value: 'mixer', label: 'Mixers' },
  { value: 'bar_prep', label: 'Bar Prep' },
]

type Draft = {
  type: InventoryLiquorModifierType
  name: string
  upcharge: string
}

const EMPTY_DRAFT: Draft = {
  type: 'mixer',
  name: '',
  upcharge: '',
}

function LiquorModsPage() {
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [modifiers, setModifiers] = useState<InventoryLiquorModifier[]>([])
  const [masters, setMasters] = useState<InventoryLiquorModifierMaster[]>([])
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [selectedMasterId, setSelectedMasterId] = useState<string | null>(null)
  const [selectedModifierId, setSelectedModifierId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Draft | null>(null)
  const [editEnabled, setEditEnabled] = useState(true)
  const [editExportToToast, setEditExportToToast] = useState(true)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function reload(signal?: AbortSignal) {
    if (!activeOrganization?.id) {
      setModifiers([])
      setMasters([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const [modifierResult, mixerMasters, barPrepMasters] = await Promise.all([
        listInventoryLiquorModifiers(activeOrganization.id, signal),
        listInventoryLiquorModifierMasters(activeOrganization.id, 'mixer', signal),
        listInventoryLiquorModifierMasters(activeOrganization.id, 'bar_prep', signal),
      ])

      setModifiers(modifierResult.modifiers)
      setMasters([...mixerMasters.modifiers, ...barPrepMasters.modifiers])
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(
        caught instanceof Error ? caught.message : 'Unable to load Liquor Mods.',
      )
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
    const result = new Map<InventoryLiquorModifierType, InventoryLiquorModifier[]>()
    PLACEMENT_OPTIONS.forEach(({ value }) => result.set(value, []))

    modifiers.forEach((modifier) => result.get(modifier.type)?.push(modifier))

    result.forEach((rows) =>
      rows.sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          displayName(left).localeCompare(displayName(right)),
      ),
    )

    return result
  }, [modifiers])

  const masterSuggestions = useMemo(() => {
    const query = normalize(draft.name)
    if (!query) return []

    return masters
      .filter((master) => master.type === draft.type)
      .filter((master) => master.active && !master.assigned)
      .filter((master) => normalize(master.name).includes(query))
      .slice(0, 8)
  }, [draft.name, draft.type, masters])

  const selectedMaster =
    masters.find((master) => master.id === selectedMasterId) ?? null

  const selectedModifier =
    modifiers.find((modifier) => modifier.id === selectedModifierId) ?? null

  useEffect(() => {
    if (!selectedModifier) {
      setEditDraft(null)
      return
    }

    setEditDraft({
      type: selectedModifier.type,
      name: displayName(selectedModifier),
      upcharge: formatMoneyValue(selectedModifier.upchargeCents),
    })
    setEditEnabled(selectedModifier.enabled)
    setEditExportToToast(selectedModifier.exportToToast)
  }, [selectedModifier?.id])

  function selectMaster(master: InventoryLiquorModifierMaster) {
    setSelectedMasterId(master.id)
    setDraft((current) => ({
      ...current,
      type: master.type,
      name: master.name,
    }))
  }

  function clearAddDraft() {
    setDraft(EMPTY_DRAFT)
    setSelectedMasterId(null)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!activeOrganization?.id || saving) return

    const name = draft.name.trim()
    const upchargeCents = moneyToCents(draft.upcharge)

    if (!name) {
      setError('Enter a Liquor Mod name.')
      return
    }

    if (upchargeCents === null) {
      setError('Enter a valid upcharge.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await createInventoryLiquorModifier({
        organizationId: activeOrganization.id,
        inventoryLiquorModifierId: selectedMaster?.id,
        type: draft.type,
        name: selectedMaster ? undefined : name,
        upchargeCents,
        enabled: true,
        exportToToast: true,
      })

      setSuccess('Added ' + (selectedMaster?.name ?? name) + '.')
      clearAddDraft()
      await reload()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to add Liquor Mod.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function saveSelectedModifier() {
    if (!activeOrganization?.id || !selectedModifier || !editDraft || saving) {
      return
    }

    const name = editDraft.name.trim()
    const upchargeCents = moneyToCents(editDraft.upcharge)

    if (!name) {
      setError('Enter a Liquor Mod name.')
      return
    }

    if (upchargeCents === null) {
      setError('Enter a valid upcharge.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await updateInventoryLiquorModifier({
        organizationId: activeOrganization.id,
        modifierId: selectedModifier.id,
        type: editDraft.type,
        name,
        upchargeCents,
        enabled: editEnabled,
        exportToToast: editEnabled && editExportToToast,
      })

      setSuccess('Updated ' + name + '.')
      setSelectedModifierId(null)
      await reload()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to update Liquor Mod.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function removeSelected() {
    if (!activeOrganization?.id || !selectedModifier || saving) return

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await removeInventoryLiquorModifier({
        organizationId: activeOrganization.id,
        modifierId: selectedModifier.id,
      })
      setSuccess(
        'Removed ' + displayName(selectedModifier) + ' from this organization.',
      )
      setSelectedModifierId(null)
      await reload()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to remove Liquor Mod.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <AuthenticatedInventoryShell currentPath="/liquor-mods" requiredCapability="edit">
      <section className="inventory-content cocktails-page">
        <header className="inventory-page-heading">
          <div>
            <p className="inventory-kicker">Liquor Mods</p>
            <h1>Liquor Mods</h1>
            <p>
              Shared Mixer and Bar Prep names with organization-specific
              upcharges and Toast availability for{' '}
              {activeOrganization?.name ?? 'the selected organization'}.
            </p>
          </div>
        </header>

        <section className="inventory-card cocktails-editor">
          <div className="inventory-table-heading">
            <div>
              <h2>Add Liquor Mod</h2>
              <p>
                Reuse an existing master Liquor Mod when possible. Placement,
                upcharge, availability, and Toast export belong to this organization.
              </p>
            </div>
          </div>

          {error ? <p className="inventory-error">{error}</p> : null}
          {success ? <p className="inventory-success">{success}</p> : null}

          <form className="cocktails-form" onSubmit={(event) => void submit(event)}>
            <label>
              <span>Placement</span>
              <select
                value={draft.type}
                disabled={saving}
                onChange={(event) => {
                  setSelectedMasterId(null)
                  setDraft((current) => ({
                    ...current,
                    type: event.target.value as InventoryLiquorModifierType,
                  }))
                }}
              >
                {PLACEMENT_OPTIONS.map((placement) => (
                  <option key={placement.value} value={placement.value}>
                    {placement.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="cocktails-master-field">
              <span>Liquor Mod name</span>
              <input
                value={draft.name}
                disabled={saving}
                placeholder={
                  draft.type === 'mixer' ? 'Ginger Beer' : 'Lemon garnish'
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
              <span>Upcharge</span>
              <MoneyInput
                value={draft.upcharge}
                disabled={saving}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, upcharge: value }))
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
                {saving
                  ? 'Adding…'
                  : selectedMaster
                    ? 'Add existing Liquor Mod'
                    : 'Create Liquor Mod'}
              </button>
            </div>
          </form>
        </section>

        <section className="cocktails-groups">
          {PLACEMENT_OPTIONS.map((placement) => {
            const rows = grouped.get(placement.value) ?? []

            return (
              <section
                className={
                  rows.length === 0
                    ? 'inventory-card cocktails-group-card is-empty'
                    : 'inventory-card cocktails-group-card'
                }
                key={placement.value}
              >
                <div className="inventory-table-heading">
                  <div>
                    <h2>{placement.label}</h2>
                    <p>
                      {placement.value === 'mixer'
                        ? 'Mixer options exported as liquor modifiers with organization-specific upcharges.'
                        : 'Prep and garnish options exported as liquor modifiers.'}
                    </p>
                  </div>
                  <strong>{rows.length}</strong>
                </div>

                {loading ? (
                  <p className="cocktails-empty">Loading…</p>
                ) : rows.length === 0 ? (
                  <p className="cocktails-empty">
                    No {placement.label.toLowerCase()} for this organization.
                  </p>
                ) : (
                  <div className="cocktails-list">
                    {rows.map((modifier) => (
                      <button
                        className="cocktails-row"
                        key={modifier.id}
                        type="button"
                        onClick={() => setSelectedModifierId(modifier.id)}
                      >
                        <div>
                          <strong>{displayName(modifier)}</strong>
                          <span>
                            Upcharge
                            {!modifier.enabled ? ' · Not carried here' : ''}
                            {modifier.enabled && !modifier.exportToToast
                              ? ' · Not exporting'
                              : ''}
                          </span>
                        </div>
                        <strong>{formatMoney(modifier.upchargeCents)}</strong>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </section>

        {selectedModifier && editDraft ? (
          <div
            className="cocktails-edit-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="liquor-mod-edit-title"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target && !saving) {
                setSelectedModifierId(null)
              }
            }}
          >
            <section className="cocktails-edit-panel">
              <header className="cocktails-edit-header">
                <div>
                  <p className="inventory-kicker">Liquor Mod</p>
                  <h2 id="liquor-mod-edit-title">{displayName(selectedModifier)}</h2>
                  <small>Master: {selectedModifier.masterName}</small>
                </div>
                <button
                  type="button"
                  className="inventory-secondary-button"
                  disabled={saving}
                  onClick={() => setSelectedModifierId(null)}
                >
                  Close
                </button>
              </header>

              <div className="cocktails-edit-grid">
                <label>
                  <span>Placement</span>
                  <select
                    value={editDraft.type}
                    disabled={saving}
                    onChange={(event) =>
                      setEditDraft((current) =>
                        current
                          ? {
                              ...current,
                              type: event.target
                                .value as InventoryLiquorModifierType,
                            }
                          : current,
                      )
                    }
                  >
                    {PLACEMENT_OPTIONS.map((placement) => (
                      <option key={placement.value} value={placement.value}>
                        {placement.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Name</span>
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
                  <span>Upcharge</span>
                  <MoneyInput
                    value={editDraft.upcharge}
                    disabled={saving}
                    onChange={(value) =>
                      setEditDraft((current) =>
                        current ? { ...current, upcharge: value } : current,
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
                          displayName(selectedModifier) +
                          '" from this organization? The shared master is kept.',
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
                    onClick={() => setSelectedModifierId(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inventory-primary-button"
                    disabled={saving}
                    onClick={() => void saveSelectedModifier()}
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
  onChange,
}: {
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  function blur() {
    const cents = moneyToCents(value)
    onChange(cents === null ? value : formatMoneyValue(cents))
  }

  return (
    <div className="cocktails-money-input">
      <span>$</span>
      <input
        inputMode="decimal"
        value={value}
        disabled={disabled}
        placeholder="0.00"
        onFocus={() => {
          if (value.trim() === '0.00' || value.trim() === '0') onChange('')
        }}
        onBlur={blur}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function displayName(modifier: InventoryLiquorModifier) {
  return modifier.nameOverride?.trim() || modifier.masterName
}

function formatMoney(cents: number) {
  return '$' + (cents / 100).toFixed(2)
}

function formatMoneyValue(cents: number) {
  return (cents / 100).toFixed(2)
}

function moneyToCents(value: string) {
  const cleaned = value.trim().replace(/^\$/, '').replace(/,/g, '')
  if (!cleaned) return 0

  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed) || parsed < 0) return null

  return Math.round(parsed * 100)
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
