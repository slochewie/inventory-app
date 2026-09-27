import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { AuthenticatedInventoryShell } from '#/components/authenticated-inventory-shell'
import { authClient } from '#/lib/auth-client'
import {
  getInventoryOrganizationConfig,
  getOptionalBeerCategories,
  listInventoryCatalog,
  persistInventoryImport,
  updateInventoryOrganizationVariant,
  type OptionalBeerCategoryConfig,
} from '#/lib/inventory-access'

export const Route = createFileRoute('/manual-item')({ component: ManualItemPage })

type ManualItemDraft = {
  name: string
  category: string
  toastCategory: string
  toastDestination: string
  price: string
  happyHourPrice: string
  toastSlot: string
  availableHere: boolean
  exportToToast: boolean
}

const EMPTY_DRAFT: ManualItemDraft = {
  name: '',
  category: '',
  toastCategory: '',
  toastDestination: '',
  price: '',
  happyHourPrice: '',
  toastSlot: '',
  availableHere: true,
  exportToToast: true,
}

function ManualItemPage() {
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [draft, setDraft] = useState<ManualItemDraft>(EMPTY_DRAFT)
  const [categoryOptions, setCategoryOptions] = useState<string[]>([])
  const [destinationOptions, setDestinationOptions] = useState<string[]>([])
  const [optionalBeerCategories, setOptionalBeerCategories] = useState<OptionalBeerCategoryConfig[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!activeOrganization?.id) {
      setCategoryOptions([])
      setDestinationOptions([])
      setOptionalBeerCategories([])
      return
    }

    const controller = new AbortController()
    setLoadingOptions(true)

    void Promise.all([
      listInventoryCatalog(activeOrganization.id, controller.signal),
      getInventoryOrganizationConfig(activeOrganization.id, controller.signal),
    ])
      .then(([catalog, organizationConfig]) => {
        const categories = new Set<string>()
        const destinations = new Set<string>()

        catalog.items.forEach((row) => {
          const category =
            row.organization.toastCategoryOverride ??
            row.category?.toastCategory ??
            row.category?.name
          if (category?.trim()) categories.add(category.trim())

          const destination = row.organization.toastDestinationOverride
          if (destination?.trim()) destinations.add(destination.trim())
        })

        setCategoryOptions([...categories].sort((left, right) => left.localeCompare(right)))
        setDestinationOptions([...destinations].sort((left, right) => left.localeCompare(right)))
        setOptionalBeerCategories(getOptionalBeerCategories(organizationConfig))
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setError(
          caught instanceof Error
            ? caught.message
            : 'Unable to load catalog options.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingOptions(false)
      })

    return () => controller.abort()
  }, [activeOrganization?.id])

  const enabledOptionalBeerCategories = useMemo(
    () => optionalBeerCategories.filter((category) => category.enabled),
    [optionalBeerCategories],
  )

  const normalizedCategory = draft.category.trim()
  const normalizedToastCategory =
    draft.toastCategory.trim() || normalizedCategory || 'Uncategorized'

  function updateDraft(patch: Partial<ManualItemDraft>) {
    setDraft((current) => ({ ...current, ...patch }))
    setSuccess(null)
  }

  async function submitManualItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!activeOrganization?.id || saving) return

    const name = draft.name.trim()
    if (!name) {
      setError('Set an item name before adding it.')
      return
    }

    const basePrice = parseMoneyToCents(draft.price)
    if (basePrice.kind === 'invalid') {
      setError('Enter a valid price, such as 8 or 8.50.')
      return
    }

    const happyHourPrice = parseMoneyToCents(draft.happyHourPrice)
    if (happyHourPrice.kind === 'invalid') {
      setError('Enter a valid Happy Hour price, such as 7 or 7.50.')
      return
    }

    const sourceId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const category = normalizedCategory || normalizedToastCategory
    const toastDestination = draft.toastDestination.trim()

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      // The Better Auth inventory plugin currently persists catalog additions
      // through imported source types. Use a unique manual source id so this
      // behaves like a first-class catalog item without colliding with POS rows.
      await persistInventoryImport({
        organizationId: activeOrganization.id,
        sourceType: 'aloha-csv',
        sourceName: `Manual Entry - ${name}`,
        items: [
          {
            id: sourceId,
            sourceItemNumber: sourceId,
            name,
            category,
            toastCategory: normalizedToastCategory,
            toastDestination,
            basePriceCents: basePrice.value,
            happyHourPriceCents: happyHourPrice.value,
            status: basePrice.value === null ? 'review' : 'ready',
            exportIncluded: draft.availableHere && draft.exportToToast,
          },
        ],
      })

      const catalog = await listInventoryCatalog(activeOrganization.id)
      const createdRow = catalog.items.find((row) => {
        const rowName = row.organization.toastNameOverride ?? row.name
        const rowCategory =
          row.organization.toastCategoryOverride ??
          row.category?.toastCategory ??
          row.category?.name ??
          ''

        return (
          rowName.trim().toLowerCase() === name.toLowerCase() &&
          rowCategory.trim().toLowerCase() === normalizedToastCategory.toLowerCase()
        )
      })

      if (createdRow) {
        await updateInventoryOrganizationVariant({
          organizationId: activeOrganization.id,
          variantId: createdRow.variant.id,
          enabled: draft.availableHere,
          exportToToast: draft.exportToToast,
          priceOverrideCents: basePrice.value,
          happyHourPriceCents: happyHourPrice.value,
          toastCategoryOverride: normalizedToastCategory,
          toastDestinationOverride: toastDestination || null,
          toastSlot: draft.toastSlot || null,
        })
      }

      setDraft(EMPTY_DRAFT)
      setSuccess(
        createdRow
          ? `Added ${name} to ${activeOrganization.name ?? 'this organization'}.`
          : `Added ${name}. Refresh the catalog if it does not appear immediately.`,
      )
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to add the manual item.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <AuthenticatedInventoryShell currentPath="/manual-item" requiredCapability="edit">
      <section className="inventory-content">
        <header className="inventory-page-heading">
          <div>
            <p className="inventory-kicker">Catalog</p>
            <h1>Add manual item</h1>
            <p>
              Add a catalog item for {activeOrganization?.name ?? 'the selected organization'} without uploading a POS export.
            </p>
          </div>
          <a className="inventory-secondary-link" href="/">
            Back to Catalog
          </a>
        </header>

        <section className="inventory-card">
          <div className="inventory-table-heading">
            <div>
              <h2>Item details</h2>
              <p>
                Manual items are saved into the catalog and can be edited later from the Catalog page.
              </p>
            </div>
          </div>

          {loadingOptions ? <p>Loading catalog options…</p> : null}
          {error ? <p className="inventory-error">{error}</p> : null}
          {success ? <p className="inventory-success">{success}</p> : null}

          <form className="inventory-manual-item-form" onSubmit={(event) => void submitManualItem(event)}>
            <div className="inventory-catalog-price-grid">
              <label className="inventory-search-control">
                <span>Item name</span>
                <input
                  value={draft.name}
                  disabled={saving}
                  onChange={(event) => updateDraft({ name: event.target.value })}
                  placeholder="Guinness 0.0"
                  required
                />
              </label>

              <label className="inventory-search-control">
                <span>Menu group / category</span>
                <input
                  value={draft.category}
                  disabled={saving}
                  onChange={(event) =>
                    updateDraft({
                      category: event.target.value,
                      toastCategory: draft.toastCategory || event.target.value,
                    })
                  }
                  list="manual-item-categories"
                  placeholder="Beer, Cocktails, Retail…"
                />
                <datalist id="manual-item-categories">
                  {categoryOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </label>

              <label className="inventory-search-control">
                <span>Toast category</span>
                <input
                  value={draft.toastCategory}
                  disabled={saving}
                  onChange={(event) => updateDraft({ toastCategory: event.target.value })}
                  list="manual-item-toast-categories"
                  placeholder={normalizedToastCategory}
                />
                <datalist id="manual-item-toast-categories">
                  {categoryOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </label>

              <label className="inventory-search-control">
                <span>Toast destination</span>
                <input
                  value={draft.toastDestination}
                  disabled={saving}
                  onChange={(event) => updateDraft({ toastDestination: event.target.value })}
                  list="manual-item-destinations"
                  placeholder="Bar"
                />
                <datalist id="manual-item-destinations">
                  {destinationOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </label>

              <label className="inventory-search-control">
                <span>Price</span>
                <input
                  value={draft.price}
                  disabled={saving}
                  onChange={(event) => updateDraft({ price: event.target.value })}
                  inputMode="decimal"
                  placeholder="8.00"
                />
              </label>

              <label className="inventory-search-control">
                <span>Happy Hour price</span>
                <input
                  value={draft.happyHourPrice}
                  disabled={saving}
                  onChange={(event) => updateDraft({ happyHourPrice: event.target.value })}
                  inputMode="decimal"
                  placeholder="Optional"
                />
              </label>
            </div>

            <label className="inventory-search-control">
              <span>Toast beer slot</span>
              <select
                value={draft.toastSlot}
                disabled={saving || enabledOptionalBeerCategories.length === 0}
                onChange={(event) => updateDraft({ toastSlot: event.target.value })}
              >
                <option value="">Standard Toast placement</option>
                {enabledOptionalBeerCategories.map((category) => (
                  <option key={category.key} value={category.key}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="inventory-variant-toggles">
              <label className="inventory-inline-toggle">
                <input
                  type="checkbox"
                  checked={draft.availableHere}
                  disabled={saving}
                  onChange={(event) => updateDraft({ availableHere: event.target.checked })}
                />
                <span>Available here</span>
              </label>

              <label className="inventory-inline-toggle">
                <input
                  type="checkbox"
                  checked={draft.exportToToast}
                  disabled={saving || !draft.availableHere}
                  onChange={(event) => updateDraft({ exportToToast: event.target.checked })}
                />
                <span>Export to Toast</span>
              </label>
            </div>

            <div className="inventory-drawer-actions">
              <button
                type="button"
                className="inventory-secondary-button"
                disabled={saving}
                onClick={() => {
                  setDraft(EMPTY_DRAFT)
                  setError(null)
                  setSuccess(null)
                }}
              >
                Clear
              </button>
              <button type="submit" className="inventory-primary-button" disabled={saving}>
                {saving ? 'Adding…' : 'Add item'}
              </button>
            </div>
          </form>
        </section>
      </section>
    </AuthenticatedInventoryShell>
  )
}

type ParsedMoney =
  | { kind: 'valid'; value: number | null }
  | { kind: 'invalid'; value: null }

function parseMoneyToCents(input: string): ParsedMoney {
  const trimmed = input.trim()
  if (!trimmed) return { kind: 'valid', value: null }

  const normalized = trimmed.replace(/[$,]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return { kind: 'invalid', value: null }
  }

  const amount = Number(normalized)
  if (!Number.isFinite(amount) || amount < 0) {
    return { kind: 'invalid', value: null }
  }

  return { kind: 'valid', value: Math.round(amount * 100) }
}
