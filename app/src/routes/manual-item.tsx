import { createFileRoute } from '@tanstack/react-router'
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
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
import './manual-item.css'

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
  const isBeerItem = [normalizedCategory, normalizedToastCategory]
    .some((value) => value.toLowerCase().includes('beer'))
  const showToastBeerSlot = isBeerItem && enabledOptionalBeerCategories.length > 0
  const exportToToast = draft.availableHere && draft.exportToToast

  function updateDraft(patch: Partial<ManualItemDraft>) {
    setDraft((current) => ({ ...current, ...patch }))
    setSuccess(null)
  }

  function updateCategory(category: string) {
    setDraft((current) => ({
      ...current,
      category,
      toastCategory:
        !current.toastCategory.trim() || current.toastCategory === current.category
          ? category
          : current.toastCategory,
    }))
    setSuccess(null)
  }

  async function submitManualItem(event: FormEvent<HTMLFormElement>) {
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
    const toastSlot = showToastBeerSlot ? draft.toastSlot || null : null

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
            exportIncluded: exportToToast,
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
          exportToToast,
          priceOverrideCents: basePrice.value,
          happyHourPriceCents: happyHourPrice.value,
          toastCategoryOverride: normalizedToastCategory,
          toastDestinationOverride: toastDestination || null,
          toastSlot,
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

              <ManualCombobox
                label="Menu group / category"
                value={draft.category}
                options={categoryOptions}
                disabled={saving}
                placeholder="Beer, Cocktails, Retail…"
                onChange={updateCategory}
              />

              <ManualCombobox
                label="Toast category"
                value={draft.toastCategory}
                options={categoryOptions}
                disabled={saving}
                placeholder={normalizedToastCategory}
                onChange={(value) => updateDraft({ toastCategory: value })}
              />

              <ManualCombobox
                label="Toast destination"
                value={draft.toastDestination}
                options={destinationOptions}
                disabled={saving}
                placeholder="Bar"
                onChange={(value) => updateDraft({ toastDestination: value })}
              />

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

            {showToastBeerSlot ? (
              <label className="inventory-search-control">
                <span>Toast beer slot</span>
                <select
                  value={draft.toastSlot}
                  disabled={saving}
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
            ) : null}

            <div className="inventory-manual-item-footer">
              <div className="inventory-manual-item-toggles">
                <label className="inventory-inline-toggle">
                  <input
                    type="checkbox"
                    checked={draft.availableHere}
                    disabled={saving}
                    onChange={(event) => {
                      const availableHere = event.target.checked
                      updateDraft({
                        availableHere,
                        exportToToast: availableHere ? draft.exportToToast : false,
                      })
                    }}
                  />
                  <span>Available here</span>
                </label>

                <label className="inventory-inline-toggle">
                  <input
                    type="checkbox"
                    checked={exportToToast}
                    disabled={saving || !draft.availableHere}
                    onChange={(event) => updateDraft({ exportToToast: event.target.checked })}
                  />
                  <span>Export to Toast</span>
                </label>
              </div>

              <div className="inventory-manual-item-actions">
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
            </div>
          </form>
        </section>
      </section>
    </AuthenticatedInventoryShell>
  )
}

type ManualComboboxProps = {
  label: string
  value: string
  options: string[]
  placeholder?: string
  disabled?: boolean
  onChange: (value: string) => void
}

function ManualCombobox({
  label,
  value,
  options,
  placeholder,
  disabled = false,
  onChange,
}: ManualComboboxProps) {
  const inputId = useId()
  const listboxId = `${inputId}-options`
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const filteredOptions = useMemo(() => {
    const normalizedValue = value.trim().toLowerCase()
    const filtered = normalizedValue
      ? options.filter((option) => option.toLowerCase().includes(normalizedValue))
      : options

    return filtered.slice(0, 8)
  }, [options, value])

  const hasOptions = filteredOptions.length > 0
  const showOptions = open && !disabled && hasOptions

  function chooseOption(option: string) {
    onChange(option)
    setOpen(false)
    setHighlightedIndex(0)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setHighlightedIndex((current) =>
        hasOptions ? Math.min(current + 1, filteredOptions.length - 1) : 0,
      )
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setHighlightedIndex((current) => Math.max(current - 1, 0))
      return
    }

    if (event.key === 'Enter' && open && hasOptions) {
      event.preventDefault()
      chooseOption(filteredOptions[highlightedIndex] ?? filteredOptions[0])
      return
    }

    if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <label className="inventory-search-control inventory-manual-combobox">
      <span>{label}</span>
      <input
        id={inputId}
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showOptions}
        aria-controls={listboxId}
        aria-activedescendant={
          showOptions ? `${listboxId}-${highlightedIndex}` : undefined
        }
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
          setHighlightedIndex(0)
        }}
        onKeyDown={handleKeyDown}
      />
      <button
        type="button"
        className="inventory-manual-combobox-toggle"
        disabled={disabled || options.length === 0}
        aria-label={`Show ${label} suggestions`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
      >
        ▾
      </button>
      {showOptions ? (
        <div id={listboxId} className="inventory-manual-combobox-list" role="listbox">
          {filteredOptions.map((option, index) => (
            <button
              key={option}
              id={`${listboxId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === highlightedIndex}
              className={
                index === highlightedIndex
                  ? 'inventory-manual-combobox-option is-active'
                  : 'inventory-manual-combobox-option'
              }
              onMouseEnter={() => setHighlightedIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault()
                chooseOption(option)
              }}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </label>
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
