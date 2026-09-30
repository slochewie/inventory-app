import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AuthenticatedInventoryShell } from '#/components/authenticated-inventory-shell'
import { authClient } from '#/lib/auth-client'
import {
  listInventoryCatalog,
  persistInventoryImport,
  type InventoryCatalogRow,
} from '#/lib/inventory-access'
import './cocktails.css'

export const Route = createFileRoute('/cocktails')({ component: CocktailsPage })

const OFF_MENU_GROUPS = [
  'Vodka Cocktails',
  'Gin Cocktails',
  'Rum Cocktails',
  'Tequila Cocktails',
  'Whiskey/Bourbon Cocktails',
] as const

type CocktailGroup = 'House Cocktails' | (typeof OFF_MENU_GROUPS)[number]

type Draft = {
  group: CocktailGroup
  name: string
  price: string
  happyHourPrice: string
}

const EMPTY_DRAFT: Draft = {
  group: 'House Cocktails',
  name: '',
  price: '',
  happyHourPrice: '',
}

function CocktailsPage() {
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [catalog, setCatalog] = useState<InventoryCatalogRow[]>([])
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function reload(signal?: AbortSignal) {
    if (!activeOrganization?.id) {
      setCatalog([])
      return
    }

    setLoading(true)
    try {
      const result = await listInventoryCatalog(activeOrganization.id, signal)
      setCatalog(result.items)
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

  const cocktailRows = useMemo(
    () =>
      catalog.filter((row) => {
        const category = (
          row.organization.toastCategoryOverride ??
          row.category?.toastCategory ??
          row.category?.name ??
          ''
        ).toLowerCase()
        const destination = (
          row.organization.toastDestinationOverride ?? ''
        ).toLowerCase()
        return category.includes('cocktail') || destination.includes('cocktail')
      }),
    [catalog],
  )

  const grouped = useMemo(() => {
    const result = new Map<CocktailGroup, InventoryCatalogRow[]>()
    result.set('House Cocktails', [])
    OFF_MENU_GROUPS.forEach((group) => result.set(group, []))

    cocktailRows.forEach((row) => {
      const rawGroup =
        row.organization.toastCategoryOverride ??
        row.category?.toastCategory ??
        row.category?.name ??
        ''
      const group =
        OFF_MENU_GROUPS.find(
          (candidate) => candidate.toLowerCase() === rawGroup.trim().toLowerCase(),
        ) ?? 'House Cocktails'
      result.get(group)!.push(row)
    })

    result.forEach((rows) =>
      rows.sort((left, right) => displayName(left).localeCompare(displayName(right))),
    )
    return result
  }, [cocktailRows])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!activeOrganization?.id || saving) return

    const name = draft.name.trim()
    const price = moneyToCents(draft.price)
    const happyHourPrice =
      draft.group === 'House Cocktails'
        ? moneyToCents(draft.happyHourPrice, true)
        : null

    if (!name) {
      setError('Enter a cocktail name.')
      return
    }
    if (price === null) {
      setError(
        draft.group === 'House Cocktails'
          ? 'Enter a valid base price.'
          : 'Enter a valid upcharge price.',
      )
      return
    }
    if (draft.group === 'House Cocktails' && draft.happyHourPrice.trim() && happyHourPrice === null) {
      setError('Enter a valid Happy Hour price.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const sourceId =
        'manual-cocktail-' +
        Date.now() +
        '-' +
        Math.random().toString(36).slice(2, 8)

      await persistInventoryImport({
        organizationId: activeOrganization.id,
        sourceType: 'aloha-csv',
        sourceName: 'Manual Cocktail - ' + name,
        reconciliationMode: 'explicit',
        items: [
          {
            id: sourceId,
            sourceItemNumber: sourceId,
            name,
            category: 'Cocktails',
            toastCategory: draft.group,
            toastDestination: 'Cocktails',
            basePriceCents: price,
            happyHourPriceCents: happyHourPrice,
            status: 'ready',
            exportIncluded: true,
            createNewMaster: true,
          },
        ],
      })

      setDraft((current) => ({
        ...EMPTY_DRAFT,
        group: current.group,
      }))
      setSuccess(
        draft.group === 'House Cocktails'
          ? 'Added ' + name + ' as a House Cocktail.'
          : 'Added ' + name + ' to ' + draft.group + ' with its Toast upcharge.',
      )
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to add cocktail.')
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
              Manage House Cocktails and Toast off-menu cocktail upcharges for{' '}
              {activeOrganization?.name ?? 'the selected organization'}.
            </p>
          </div>
        </header>

        <section className="inventory-card cocktails-editor">
          <div className="inventory-table-heading">
            <div>
              <h2>Add cocktail</h2>
              <p>
                House Cocktails use a base price. Off-menu cocktail groups use the
                Toast upcharge amount.
              </p>
            </div>
          </div>

          {error ? <p className="inventory-error">{error}</p> : null}
          {success ? <p className="inventory-success">{success}</p> : null}

          <form className="cocktails-form" onSubmit={(event) => void submit(event)}>
            <label>
              <span>Placement</span>
              <select
                value={draft.group}
                disabled={saving}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    group: event.target.value as CocktailGroup,
                    happyHourPrice:
                      event.target.value === 'House Cocktails'
                        ? current.happyHourPrice
                        : '',
                  }))
                }
              >
                <option value="House Cocktails">House Cocktails</option>
                {OFF_MENU_GROUPS.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Cocktail name</span>
              <input
                value={draft.name}
                disabled={saving}
                placeholder={
                  draft.group === 'House Cocktails'
                    ? 'Espresso Martini'
                    : 'Moscow Mule'
                }
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>

            <label>
              <span>
                {draft.group === 'House Cocktails' ? 'Base price' : 'Upcharge price'}
              </span>
              <div className="cocktails-money-input">
                <span>$</span>
                <input
                  inputMode="decimal"
                  value={draft.price}
                  disabled={saving}
                  placeholder="0.00"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, price: event.target.value }))
                  }
                />
              </div>
            </label>

            {draft.group === 'House Cocktails' ? (
              <label>
                <span>Happy Hour price</span>
                <div className="cocktails-money-input">
                  <span>$</span>
                  <input
                    inputMode="decimal"
                    value={draft.happyHourPrice}
                    disabled={saving}
                    placeholder="Optional"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        happyHourPrice: event.target.value,
                      }))
                    }
                  />
                </div>
              </label>
            ) : null}

            <div className="cocktails-form-actions">
              <button
                type="button"
                className="inventory-secondary-button"
                disabled={saving}
                onClick={() => setDraft(EMPTY_DRAFT)}
              >
                Clear
              </button>
              <button type="submit" className="inventory-primary-button" disabled={saving}>
                {saving ? 'Adding…' : 'Add cocktail'}
              </button>
            </div>
          </form>
        </section>

        <section className="cocktails-groups">
          {(['House Cocktails', ...OFF_MENU_GROUPS] as CocktailGroup[]).map((group) => {
            const rows = grouped.get(group) ?? []
            return (
              <section className="inventory-card cocktails-group-card" key={group}>
                <div className="inventory-table-heading">
                  <div>
                    <h2>{group}</h2>
                    <p>
                      {group === 'House Cocktails'
                        ? 'Exports to columns A–E on the Toast Cocktails tab.'
                        : 'Exports as cocktail name + upcharge in the matching Toast section.'}
                    </p>
                  </div>
                  <strong>{rows.length}</strong>
                </div>

                {loading ? (
                  <p>Loading…</p>
                ) : rows.length === 0 ? (
                  <p className="cocktails-empty">No items for this organization.</p>
                ) : (
                  <div className="cocktails-list">
                    {rows.map((row) => (
                      <div className="cocktails-row" key={row.variant.id}>
                        <div>
                          <strong>{displayName(row)}</strong>
                          <span>
                            {group === 'House Cocktails' ? 'Price' : 'Upcharge'}
                          </span>
                        </div>
                        <strong>{formatMoney(row.effectivePriceCents)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </section>
      </section>
    </AuthenticatedInventoryShell>
  )
}

function displayName(row: InventoryCatalogRow) {
  return row.organization.toastNameOverride?.trim() || row.name
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
