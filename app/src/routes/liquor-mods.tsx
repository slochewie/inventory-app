import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react'
import {
  AuthenticatedInventoryShell,
  useInventoryAccessRole,
} from '#/components/authenticated-inventory-shell'
import { authClient } from '#/lib/auth-client'
import {
  createInventoryLiquorModifier,
  listInventoryLiquorModifiers,
  removeInventoryLiquorModifier,
  reorderInventoryLiquorModifiers,
  updateInventoryLiquorModifier,
  type InventoryLiquorModifier,
  type InventoryLiquorModifierType,
} from '#/lib/liquor-mods-access'
import './liquor-mods.css'

export const Route = createFileRoute('/liquor-mods')({
  component: LiquorModsPage,
})

type ModifierDraft = {
  name: string
  upcharge: string
}

type RowDraft = ModifierDraft & {
  enabled: boolean
}

const MODIFIER_TYPES: Array<{
  type: InventoryLiquorModifierType
  title: string
  singular: string
  description: string
}> = [
  {
    type: 'mixer',
    title: 'Mixers',
    singular: 'Mixer',
    description:
      'Mixer options used for liquor drinks, including soda, tonic, ginger beer, and energy drink upcharges.',
  },
  {
    type: 'bar_prep',
    title: 'Bar Prep Modifiers',
    singular: 'Bar Prep Modifier',
    description:
      'Prep and garnish options used for liquor drinks, such as rocks, tall, salted rim, or citrus garnish.',
  },
]

function emptyDrafts(): Record<InventoryLiquorModifierType, ModifierDraft> {
  return {
    mixer: { name: '', upcharge: '0.00' },
    bar_prep: { name: '', upcharge: '0.00' },
  }
}

function LiquorModsPage() {
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const { canEdit } = useInventoryAccessRole()
  const [modifiers, setModifiers] = useState<InventoryLiquorModifier[]>([])
  const [drafts, setDrafts] = useState(emptyDrafts)
  const [rowDrafts, setRowDrafts] = useState<Record<string, RowDraft>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function reload(signal?: AbortSignal) {
    if (!activeOrganization?.id) {
      setModifiers([])
      setRowDrafts({})
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await listInventoryLiquorModifiers(
        activeOrganization.id,
        signal,
      )
      setModifiers(result.modifiers)
      setRowDrafts(buildRowDrafts(result.modifiers))
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load Liquor Mods.',
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
    const groups: Record<InventoryLiquorModifierType, InventoryLiquorModifier[]> = {
      mixer: [],
      bar_prep: [],
    }

    for (const modifier of modifiers) {
      groups[modifier.type].push(modifier)
    }

    for (const rows of Object.values(groups)) {
      rows.sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
      )
    }

    return groups
  }, [modifiers])

  function updateDraft(
    type: InventoryLiquorModifierType,
    patch: Partial<ModifierDraft>,
  ) {
    setDrafts((current) => ({
      ...current,
      [type]: {
        ...current[type],
        ...patch,
      },
    }))
  }

  function updateRowDraft(modifierId: string, patch: Partial<RowDraft>) {
    setRowDrafts((current) => ({
      ...current,
      [modifierId]: {
        ...(current[modifierId] ?? { name: '', upcharge: '0.00', enabled: true }),
        ...patch,
      },
    }))
  }

  function focusNewUpcharge(type: InventoryLiquorModifierType) {
    const current = drafts[type].upcharge.trim()
    if (current === '0.00' || current === '0') {
      updateDraft(type, { upcharge: '' })
    }
  }

  function blurNewUpcharge(type: InventoryLiquorModifierType) {
    const current = drafts[type].upcharge.trim()
    if (!current) {
      updateDraft(type, { upcharge: '0.00' })
      return
    }

    const upchargeCents = parseDollarInput(current)
    if (upchargeCents !== null) {
      updateDraft(type, { upcharge: formatCents(upchargeCents) })
    }
  }

  async function addModifier(
    event: FormEvent,
    type: InventoryLiquorModifierType,
  ) {
    event.preventDefault()
    if (!canEdit || !activeOrganization?.id || saving) return

    const draft = drafts[type]
    const name = draft.name.trim()
    const upchargeCents = parseDollarInput(draft.upcharge)

    if (!name) {
      setError('Name is required.')
      return
    }

    if (upchargeCents === null) {
      setError('Enter a valid upcharge dollar amount.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await createInventoryLiquorModifier({
        organizationId: activeOrganization.id,
        type,
        name,
        upchargeCents,
      })
      updateDraft(type, { name: '', upcharge: '0.00' })
      await reload()
      setSuccess('Liquor Mod added.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to add Liquor Mod.')
    } finally {
      setSaving(false)
    }
  }

  async function saveModifier(modifier: InventoryLiquorModifier) {
    if (!canEdit || !activeOrganization?.id || saving) return

    const draft = rowDrafts[modifier.id]
    const name = draft?.name.trim() ?? ''
    const upchargeCents = parseDollarInput(draft?.upcharge ?? '')

    if (!name) {
      setError('Name is required.')
      return
    }

    if (upchargeCents === null) {
      setError('Enter a valid upcharge dollar amount.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await updateInventoryLiquorModifier({
        organizationId: activeOrganization.id,
        modifierId: modifier.id,
        name,
        upchargeCents,
        enabled: draft?.enabled ?? modifier.enabled,
      })
      await reload()
      setSuccess('Liquor Mod saved.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save Liquor Mod.')
    } finally {
      setSaving(false)
    }
  }

  async function removeModifier(modifier: InventoryLiquorModifier) {
    if (!canEdit || !activeOrganization?.id || saving) return

    const confirmed = window.confirm(`Remove ${modifier.name}?`)
    if (!confirmed) return

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await removeInventoryLiquorModifier({
        organizationId: activeOrganization.id,
        modifierId: modifier.id,
      })
      await reload()
      setSuccess('Liquor Mod removed.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to remove Liquor Mod.')
    } finally {
      setSaving(false)
    }
  }

  async function moveModifier(
    type: InventoryLiquorModifierType,
    modifierId: string,
    direction: 'up' | 'down',
  ) {
    if (!canEdit || !activeOrganization?.id || saving) return

    const rows = grouped[type]
    const currentIndex = rows.findIndex((row) => row.id === modifierId)
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= rows.length) return

    const nextRows = [...rows]
    const [moved] = nextRows.splice(currentIndex, 1)
    nextRows.splice(nextIndex, 0, moved)

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const nextGroup = await reorderInventoryLiquorModifiers({
        organizationId: activeOrganization.id,
        type,
        modifierIds: nextRows.map((row) => row.id),
      })
      setModifiers((current) => [
        ...current.filter((modifier) => modifier.type !== type),
        ...nextGroup,
      ])
      setRowDrafts((current) => ({
        ...current,
        ...buildRowDrafts(nextGroup),
      }))
      setSuccess('Liquor Mods reordered.')
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to reorder Liquor Mods.',
      )
      await reload()
    } finally {
      setSaving(false)
    }
  }

  return (
    <AuthenticatedInventoryShell currentPath="/liquor-mods">
      <main className="inventory-page liquor-mods-page">
        <header className="liquor-mods-header">
          <div>
            <p className="eyebrow">Liquor modifier setup</p>
            <h1>Liquor Mods</h1>
            <p>
              Manage organization-specific Mixers and Bar Prep Modifiers for
              liquor drinks.
            </p>
          </div>
          <p className="liquor-mods-note">
            {canEdit
              ? 'Managers and Admins can add, edit, reorder, and remove modifiers.'
              : 'Read-only access. Ask a Manager or Admin to make changes.'}
          </p>
        </header>

        {error ? <div className="liquor-mods-status is-error">{error}</div> : null}
        {success ? (
          <div className="liquor-mods-status is-success">{success}</div>
        ) : null}
        {loading ? <div className="liquor-mods-status">Loading Liquor Mods…</div> : null}

        <section className="liquor-mods-grid" aria-label="Liquor modifiers">
          {MODIFIER_TYPES.map((section) => (
            <article className="inventory-card liquor-mods-card" key={section.type}>
              <div className="liquor-mods-card-header">
                <div>
                  <h2>{section.title}</h2>
                  <p>{section.description}</p>
                </div>
              </div>

              <form
                className="liquor-mods-add-form"
                onSubmit={(event) => addModifier(event, section.type)}
              >
                <label className="liquor-mods-field">
                  <span>{section.singular} name</span>
                  <input
                    value={drafts[section.type].name}
                    onChange={(event) =>
                      updateDraft(section.type, { name: event.target.value })
                    }
                    placeholder={
                      section.type === 'mixer' ? 'Ginger Beer' : 'Orange garnish'
                    }
                    disabled={!canEdit || saving}
                  />
                </label>

                <label className="liquor-mods-field">
                  <span>Upcharge</span>
                  <span className="liquor-mods-money-input">
                    <span>$</span>
                    <input
                      value={drafts[section.type].upcharge}
                      onFocus={() => focusNewUpcharge(section.type)}
                      onBlur={() => blurNewUpcharge(section.type)}
                      onChange={(event) =>
                        updateDraft(section.type, { upcharge: event.target.value })
                      }
                      inputMode="decimal"
                      placeholder="0.00"
                      disabled={!canEdit || saving}
                    />
                  </span>
                </label>

                <button type="submit" disabled={!canEdit || saving}>
                  <Plus size={16} aria-hidden="true" />
                  Add
                </button>
              </form>

              {grouped[section.type].length ? (
                grouped[section.type].map((modifier, index) => {
                  const draft = rowDrafts[modifier.id] ?? {
                    name: modifier.name,
                    upcharge: formatCents(modifier.upchargeCents),
                    enabled: modifier.enabled,
                  }
                  const changed = rowHasChanges(modifier, draft)

                  return (
                    <div className="liquor-mods-row" key={modifier.id}>
                      <div className="liquor-mods-row-body">
                        <label className="liquor-mods-field">
                          <span>Name</span>
                          <input
                            value={draft.name}
                            onChange={(event) =>
                              updateRowDraft(modifier.id, {
                                name: event.target.value,
                              })
                            }
                            disabled={!canEdit || saving}
                          />
                        </label>
                        <div className="liquor-mods-row-meta">
                          <span>Display order {index + 1}</span>
                          {!draft.enabled ? <span>Disabled</span> : null}
                        </div>
                      </div>

                      <label className="liquor-mods-field">
                        <span>Upcharge</span>
                        <span className="liquor-mods-money-input">
                          <span>$</span>
                          <input
                            value={draft.upcharge}
                            onChange={(event) =>
                              updateRowDraft(modifier.id, {
                                upcharge: event.target.value,
                              })
                            }
                            inputMode="decimal"
                            disabled={!canEdit || saving}
                          />
                        </span>
                      </label>

                      <div className="liquor-mods-row-actions">
                        <label className="liquor-mods-enabled">
                          <input
                            type="checkbox"
                            checked={draft.enabled}
                            onChange={(event) =>
                              updateRowDraft(modifier.id, {
                                enabled: event.target.checked,
                              })
                            }
                            disabled={!canEdit || saving}
                          />
                          <span>Enabled</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => moveModifier(section.type, modifier.id, 'up')}
                          disabled={!canEdit || saving || index === 0}
                          aria-label={`Move ${modifier.name} up`}
                        >
                          <ArrowUp size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveModifier(section.type, modifier.id, 'down')}
                          disabled={
                            !canEdit ||
                            saving ||
                            index === grouped[section.type].length - 1
                          }
                          aria-label={`Move ${modifier.name} down`}
                        >
                          <ArrowDown size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => saveModifier(modifier)}
                          disabled={!canEdit || saving || !changed}
                          aria-label={`Save ${modifier.name}`}
                        >
                          <Save size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeModifier(modifier)}
                          disabled={!canEdit || saving}
                          aria-label={`Remove ${modifier.name}`}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )
                })
              ) : (
                <p className="liquor-mods-empty">
                  No {section.title.toLowerCase()} have been added yet.
                </p>
              )}
            </article>
          ))}
        </section>
      </main>
    </AuthenticatedInventoryShell>
  )
}

function buildRowDrafts(modifiers: InventoryLiquorModifier[]) {
  return Object.fromEntries(
    modifiers.map((modifier) => [
      modifier.id,
      {
        name: modifier.name,
        upcharge: formatCents(modifier.upchargeCents),
        enabled: modifier.enabled,
      } satisfies RowDraft,
    ]),
  )
}

function rowHasChanges(modifier: InventoryLiquorModifier, draft: RowDraft) {
  const cents = parseDollarInput(draft.upcharge)

  return (
    draft.name.trim() !== modifier.name ||
    cents !== modifier.upchargeCents ||
    draft.enabled !== modifier.enabled
  )
}

function parseDollarInput(value: string) {
  const normalized = value.trim().replace(/^\$/, '')
  if (!normalized) return 0
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null

  const dollars = Number(normalized)
  if (!Number.isFinite(dollars) || dollars < 0) return null

  return Math.round(dollars * 100)
}

function formatCents(cents: number) {
  return (cents / 100).toFixed(2)
}