import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { AuthenticatedInventoryShell } from '#/components/authenticated-inventory-shell'
import { authBaseURL, authClient } from '#/lib/auth-client'
import {
  getInventoryOrganizationConfig,
  updateInventoryOrganizationConfig,
} from '#/lib/inventory-access'
import { getMenuCategorySuggestions } from '#/lib/menu-categories'
import './manual-item.css'

export const Route = createFileRoute('/menu-categories')({
  component: MenuCategoriesPage,
})

type MenuCategoryFlags = {
  retailEnabled: boolean
  openItemsEnabled: boolean
}

type MenuCategoryConfig = Awaited<
  ReturnType<typeof getInventoryOrganizationConfig>
> &
  MenuCategoryFlags

type MenuCategory = {
  id: string
  name: string
}

const OPTIONAL_MENU_CATEGORIES: MenuCategory[] = [
  { id: 'retail', name: 'Retail' },
  { id: 'open-items', name: 'Open Items' },
]

function MenuCategoriesPage() {
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [config, setConfig] = useState<MenuCategoryConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [savingCategory, setSavingCategory] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!activeOrganization?.id) {
      setConfig(null)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    void loadMenuCategoryConfig(activeOrganization.id, controller.signal)
      .then((organizationConfig) => {
        setConfig(organizationConfig)
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setError(
          caught instanceof Error
            ? caught.message
            : 'Unable to load menu categories.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [activeOrganization?.id])

  const categories = useMemo(() => {
    if (!config) return []

    return OPTIONAL_MENU_CATEGORIES.filter((category) =>
      isCategoryEnabled(config, category.name),
    )
  }, [config])

  const suggestions = useMemo(() => {
    const existingNames = new Set(
      categories.map((category) => category.name.trim().toLowerCase()),
    )

    return getMenuCategorySuggestions().filter(
      (suggestion) => !existingNames.has(suggestion.toLowerCase()),
    )
  }, [categories])

  async function setCategoryEnabled(name: string, enabled: boolean) {
    if (!activeOrganization?.id || !config || savingCategory) return

    const patch = getMenuCategoryPatch(name, enabled)
    if (!patch) return

    const nextConfig: MenuCategoryConfig = {
      ...config,
      ...patch,
    }

    setSavingCategory(name)
    setError(null)
    setSuccess(null)

    try {
      const savedConfig = await updateInventoryOrganizationConfig({
        organizationId: activeOrganization.id,
        ...config,
        ...patch,
      } as Parameters<typeof updateInventoryOrganizationConfig>[0])

      setConfig({
        ...(savedConfig ?? config),
        retailEnabled: nextConfig.retailEnabled,
        openItemsEnabled: nextConfig.openItemsEnabled,
      })
      setSuccess(
        enabled
          ? `Added ${name}. It is now available in Add Item.`
          : `Removed ${name}. Existing catalog items are unchanged.`,
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save category.')
    } finally {
      setSavingCategory(null)
    }
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
          {loading ? <p className="inventory-empty-note">Loading menu categories…</p> : null}

          {!loading && categories.length ? (
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
                      disabled={savingCategory === category.name}
                      onClick={() => void setCategoryEnabled(category.name, false)}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          {!loading && !categories.length ? (
            <p className="inventory-empty-note">
              No optional categories are enabled.
            </p>
          ) : null}

          {!loading && suggestions.length ? (
            <div className="inventory-menu-category-suggestions">
              <span>Available to add</span>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="inventory-primary-button"
                  disabled={savingCategory === suggestion}
                  onClick={() => void setCategoryEnabled(suggestion, true)}
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

async function loadMenuCategoryConfig(
  organizationId: string,
  signal: AbortSignal,
): Promise<MenuCategoryConfig> {
  const [organizationConfig, flags] = await Promise.all([
    getInventoryOrganizationConfig(organizationId, signal),
    getMenuCategoryFlags(organizationId, signal),
  ])

  return {
    ...organizationConfig,
    ...flags,
  }
}

async function getMenuCategoryFlags(
  organizationId: string,
  signal: AbortSignal,
): Promise<MenuCategoryFlags> {
  const url = new URL(
    `${authBaseURL.replace(/\/$/, '')}/api/auth/inventory/organization-config`,
  )
  url.searchParams.set('organizationId', organizationId)

  const response = await fetch(url, {
    credentials: 'include',
    signal,
  })
  const result = (await response.json()) as {
    config?: Partial<MenuCategoryFlags>
    error?: string
  }

  if (!response.ok) {
    throw new Error(
      typeof result.error === 'string'
        ? result.error
        : 'Unable to load menu categories.',
    )
  }

  return {
    retailEnabled: result.config?.retailEnabled === true,
    openItemsEnabled: result.config?.openItemsEnabled === true,
  }
}

function isCategoryEnabled(config: MenuCategoryConfig, name: string) {
  const key = normalizeCategoryKey(name)

  if (key === 'retail') return config.retailEnabled
  if (key === 'open items' || key === 'open item') return config.openItemsEnabled

  return false
}

function getMenuCategoryPatch(name: string, enabled: boolean) {
  const key = normalizeCategoryKey(name)

  if (key === 'retail') return { retailEnabled: enabled }
  if (key === 'open items' || key === 'open item') return { openItemsEnabled: enabled }

  return null
}

function normalizeCategoryKey(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}
