import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AuthenticatedInventoryShell } from '#/components/authenticated-inventory-shell'
import { authClient } from '#/lib/auth-client'
import {
  deleteMenuCategory,
  getMenuCategorySuggestions,
  listSavedMenuCategories,
  saveMenuCategory,
  type InventoryMenuCategory,
} from '#/lib/menu-categories'
import './manual-item.css'

export const Route = createFileRoute('/menu-categories')({
  component: MenuCategoriesPage,
})

type MenuCategoryDraft = {
  id: string | null
  name: string
  toastDestination: string
}

const EMPTY_DRAFT: MenuCategoryDraft = {
  id: null,
  name: '',
  toastDestination: '',
}

function MenuCategoriesPage() {
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [categories, setCategories] = useState<InventoryMenuCategory[]>([])
  const [draft, setDraft] = useState<MenuCategoryDraft>(EMPTY_DRAFT)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!activeOrganization?.id) {
      setCategories([])
      setDraft(EMPTY_DRAFT)
      return
    }

    setCategories(listSavedMenuCategories(activeOrganization.id))
  }, [activeOrganization?.id])

  const suggestions = useMemo(() => {
    const existingNames = new Set(
      categories.map((category) => category.name.trim().toLowerCase()),
    )

    return getMenuCategorySuggestions().filter(
      (suggestion) => !existingNames.has(suggestion.toLowerCase()),
    )
  }, [categories])

  function reloadCategories() {
    if (!activeOrganization?.id) return
    setCategories(listSavedMenuCategories(activeOrganization.id))
  }

  function updateDraft(patch: Partial<MenuCategoryDraft>) {
    setDraft((current) => ({ ...current, ...patch }))
    setError(null)
    setSuccess(null)
  }

  function editCategory(category: InventoryMenuCategory) {
    setDraft({
      id: category.id,
      name: category.name,
      toastDestination: category.toastDestination,
    })
    setError(null)
    setSuccess(null)
  }

  function addSuggestion(name: string) {
    if (!activeOrganization?.id) return

    try {
      const category = saveMenuCategory(activeOrganization.id, {
        name,
        toastDestination: '',
      })
      reloadCategories()
      setSuccess(`Added ${category.name}. It is now available in Add Item.`)
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save category.')
      setSuccess(null)
    }
  }

  function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!activeOrganization?.id) return

    try {
      const category = saveMenuCategory(activeOrganization.id, {
        id: draft.id,
        name: draft.name,
        toastDestination: draft.toastDestination,
      })
      reloadCategories()
      setDraft(EMPTY_DRAFT)
      setSuccess(`${category.name} is now available in Add Item.`)
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save category.')
      setSuccess(null)
    }
  }

  function removeCategory(category: InventoryMenuCategory) {
    if (!activeOrganization?.id) return

    const removed = deleteMenuCategory(activeOrganization.id, category.id)
    if (!removed) return

    reloadCategories()
    if (draft.id === category.id) setDraft(EMPTY_DRAFT)
    setSuccess(`Removed ${category.name}. Existing catalog items are unchanged.`)
    setError(null)
  }

  return (
    <AuthenticatedInventoryShell currentPath="/menu-categories" requiredCapability="edit">
      <section className="inventory-content">
        <header className="inventory-page-heading">
          <div>
            <p className="inventory-kicker">Catalog</p>
            <h1>Menu Categories</h1>
            <p>
              Add menu categories for {activeOrganization?.name ?? 'the selected organization'} before items exist, then use them from Add Item.
            </p>
          </div>
          <a className="inventory-secondary-link" href="/manual-item">
            Add Item
          </a>
        </header>

        <section className="inventory-card inventory-menu-category-card">
          <div className="inventory-table-heading">
            <div>
              <h2>{draft.id ? 'Edit category' : 'Add category'}</h2>
              <p>
                Menu Category controls how items are grouped and routed during Toast export. Toast Destination is optional and should only name a real Toast destination such as Bar, Dining Room, or Patio.
              </p>
            </div>
          </div>

          {error ? <p className="inventory-error">{error}</p> : null}
          {success ? <p className="inventory-success">{success}</p> : null}

          {suggestions.length ? (
            <div className="inventory-menu-category-suggestions">
              <span>Quick add</span>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="inventory-secondary-button"
                  onClick={() => addSuggestion(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}

          <form className="inventory-manual-item-form" onSubmit={submitCategory}>
            <div className="inventory-catalog-price-grid">
              <label className="inventory-search-control">
                <span>Menu category</span>
                <input
                  value={draft.name}
                  placeholder="NA Bev, Retail, Cocktails…"
                  onChange={(event) => updateDraft({ name: event.target.value })}
                  required
                />
              </label>

              <label className="inventory-search-control">
                <span>Toast destination</span>
                <input
                  value={draft.toastDestination}
                  placeholder="Optional, for example Bar"
                  onChange={(event) => updateDraft({ toastDestination: event.target.value })}
                />
              </label>
            </div>

            <div className="inventory-manual-item-actions inventory-menu-category-form-actions">
              <button
                type="button"
                className="inventory-secondary-button"
                onClick={() => {
                  setDraft(EMPTY_DRAFT)
                  setError(null)
                  setSuccess(null)
                }}
              >
                Clear
              </button>
              <button type="submit" className="inventory-primary-button">
                {draft.id ? 'Save category' : 'Add category'}
              </button>
            </div>
          </form>
        </section>

        <section className="inventory-card inventory-menu-category-card">
          <div className="inventory-table-heading">
            <div>
              <h2>Saved Menu Categories</h2>
              <p>
                These appear in the Menu Category field when manually adding items.
              </p>
            </div>
          </div>

          {categories.length ? (
            <div className="inventory-menu-category-list">
              {categories.map((category) => (
                <article key={category.id} className="inventory-menu-category-row">
                  <div>
                    <strong>{category.name}</strong>
                    {category.toastDestination ? (
                      <span>Destination: {category.toastDestination}</span>
                    ) : null}
                  </div>
                  <div className="inventory-menu-category-row-actions">
                    <button
                      type="button"
                      className="inventory-secondary-button"
                      onClick={() => editCategory(category)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="inventory-secondary-button"
                      onClick={() => removeCategory(category)}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="inventory-empty-note">
              No menu categories have been added yet. Add NA Bev or Retail here to make them available when adding an item.
            </p>
          )}
        </section>
      </section>
    </AuthenticatedInventoryShell>
  )
}
