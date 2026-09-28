import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
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

function MenuCategoriesPage() {
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [categories, setCategories] = useState<InventoryMenuCategory[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!activeOrganization?.id) {
      setCategories([])
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

  function removeCategory(category: InventoryMenuCategory) {
    if (!activeOrganization?.id) return

    const removed = deleteMenuCategory(activeOrganization.id, category.id)
    if (!removed) return

    reloadCategories()
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
              Manage optional menu categories for {activeOrganization?.name ?? 'the selected organization'}. Beer, Cocktails, and NA Bev are always available in Add Item.
            </p>
          </div>
          <a className="inventory-secondary-link" href="/manual-item">
            Add Item
          </a>
        </header>

        <section className="inventory-card inventory-menu-category-card">
          <div className="inventory-table-heading">
            <div>
              <h2>Optional categories</h2>
              <p>
                Enable only the extra categories this organization uses. Beer, Cocktails, and NA Bev are always available.
              </p>
            </div>
          </div>

          {error ? <p className="inventory-error">{error}</p> : null}
          {success ? <p className="inventory-success">{success}</p> : null}

          {categories.length ? (
            <div className="inventory-menu-category-list">
              {categories.map((category) => (
                <article key={category.id} className="inventory-menu-category-row">
                  <div>
                    <strong>{category.name}</strong>
                    <span>Available in Add Item and Toast export routing.</span>
                  </div>
                  <div className="inventory-menu-category-row-actions">
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
              No optional categories are enabled.
            </p>
          )}

          {suggestions.length ? (
            <div className="inventory-menu-category-suggestions">
              <span>Available to add</span>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="inventory-primary-button"
                  onClick={() => addSuggestion(suggestion)}
                >
                  Add {suggestion}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      </section>
    </AuthenticatedInventoryShell>
  )
}
