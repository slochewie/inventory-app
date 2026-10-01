import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import {
  AuthenticatedInventoryShell,
  useInventoryAccessRole,
} from '#/components/authenticated-inventory-shell'
import { authClient } from '#/lib/auth-client'
import {
  listInventoryCocktailMasters,
  listInventoryMasterItems,
  renameInventoryMasterItem,
  updateInventoryCocktailMaster,
  type InventoryCocktailMaster,
  type InventoryMasterItem,
} from '#/lib/inventory-access'
import {
  listInventoryLiquorModifierMasters,
  updateInventoryLiquorModifierMaster,
  type InventoryLiquorModifierMaster,
  type InventoryLiquorModifierType,
} from '#/lib/liquor-mods-access'

export const Route = createFileRoute('/master-names')({
  component: MasterNamesRoute,
})

function MasterNamesRoute() {
  const { canManageMasterCatalog } = useInventoryAccessRole()

  return (
    <AuthenticatedInventoryShell
      currentPath="/master-names"
      requiredCapability="manage-master-catalog"
    >
      {canManageMasterCatalog ? <MasterNamesPage /> : null}
    </AuthenticatedInventoryShell>
  )
}

type MasterFamily = 'items' | 'cocktails' | 'liquor-mods'
type ImpactFilter = 'all' | 'affected' | 'override' | 'unused'
type LiquorPlacementFilter = 'all' | InventoryLiquorModifierType
type StatusFilter = 'all' | 'active' | 'inactive'

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250] as const
const DEFAULT_PAGE_SIZE = 25

function MasterNamesPage() {
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [family, setFamily] = useState<MasterFamily>('items')
  const [items, setItems] = useState<InventoryMasterItem[]>([])
  const [cocktailMasters, setCocktailMasters] = useState<InventoryCocktailMaster[]>([])
  const [liquorMasters, setLiquorMasters] = useState<InventoryLiquorModifierMaster[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [organization, setOrganization] = useState('all')
  const [impact, setImpact] = useState<ImpactFilter>('all')
  const [liquorPlacement, setLiquorPlacement] =
    useState<LiquorPlacementFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [selectedSharedMaster, setSelectedSharedMaster] = useState<{
    family: Exclude<MasterFamily, 'items'>
    id: string
  } | null>(null)
  const [sharedDraftName, setSharedDraftName] = useState('')
  const [sharedDraftActive, setSharedDraftActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  async function reload() {
    if (!activeOrganization?.id) return

    setLoading(true)
    setError(null)

    try {
      const [nextItems, nextCocktails, mixerResult, barPrepResult] =
        await Promise.all([
          listInventoryMasterItems(activeOrganization.id),
          listInventoryCocktailMasters(activeOrganization.id),
          listInventoryLiquorModifierMasters(activeOrganization.id, 'mixer'),
          listInventoryLiquorModifierMasters(activeOrganization.id, 'bar_prep'),
        ])

      setItems(nextItems)
      setCocktailMasters(nextCocktails)
      setLiquorMasters([
        ...mixerResult.modifiers,
        ...barPrepResult.modifiers,
      ])
    } catch (nextError) {
      setItems([])
      setCocktailMasters([])
      setLiquorMasters([])
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to load Inventory master items.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setSelectedItemId(null)
    setDraftName('')
    setSelectedSharedMaster(null)
    setSharedDraftName('')
    setPage(1)
    void reload()
  }, [activeOrganization?.id])

  useEffect(() => {
    setPage(1)
    setSelectedItemId(null)
    setDraftName('')
    setSelectedSharedMaster(null)
    setSharedDraftName('')
  }, [family])

  const categories = useMemo(
    () =>
      [...new Set(items.map((item) => item.categoryName ?? 'Uncategorized'))]
        .sort((left, right) => left.localeCompare(right)),
    [items],
  )

  const organizations = useMemo(
    () =>
      [...new Set(
        items.flatMap((item) =>
          item.organizations.map((entry) => entry.organizationName),
        ),
      )].sort((left, right) => left.localeCompare(right)),
    [items],
  )

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return items.filter((item) => {
      if (
        category !== 'all' &&
        (item.categoryName ?? 'Uncategorized') !== category
      ) {
        return false
      }

      if (
        organization !== 'all' &&
        !item.organizations.some(
          (entry) => entry.organizationName === organization,
        )
      ) {
        return false
      }

      const affectedCount = item.organizations.reduce(
        (sum, entry) => sum + entry.followsMasterNameCount,
        0,
      )
      const overrideCount = item.organizations.reduce(
        (sum, entry) =>
          sum +
          Math.max(
            0,
            entry.exportVariantCount - entry.followsMasterNameCount,
          ),
        0,
      )

      if (impact === 'affected' && affectedCount === 0) return false
      if (impact === 'override' && overrideCount === 0) return false
      if (impact === 'unused' && item.organizations.length > 0) return false

      if (!normalizedQuery) return true

      return [
        item.name,
        item.normalizedName,
        item.categoryName ?? '',
        item.toastCategory ?? '',
        ...item.organizations.flatMap((entry) => [
          entry.organizationName,
          ...entry.overrideNames,
        ]),
      ].some((value) => value.toLowerCase().includes(normalizedQuery))
    })
  }, [category, impact, items, organization, query])

  useEffect(() => {
    setPage(1)
  }, [category, impact, organization, query])

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount)
  const pageStart = (clampedPage - 1) * PAGE_SIZE
  const pageItems = filteredItems.slice(pageStart, pageStart + PAGE_SIZE)
  const pageEnd = pageStart + pageItems.length

  const selectedItem =
    items.find((item) => item.id === selectedItemId) ?? null

  const selectedImpact = useMemo(() => {
    if (!selectedItem) {
      return {
        organizationCount: 0,
        enabledVariantCount: 0,
        followsMasterNameCount: 0,
        overriddenExportCount: 0,
      }
    }

    return selectedItem.organizations.reduce(
      (summary, organization) => ({
        organizationCount: summary.organizationCount + 1,
        enabledVariantCount:
          summary.enabledVariantCount + organization.enabledVariantCount,
        followsMasterNameCount:
          summary.followsMasterNameCount + organization.followsMasterNameCount,
        overriddenExportCount:
          summary.overriddenExportCount +
          Math.max(
            0,
            organization.exportVariantCount -
              organization.followsMasterNameCount,
          ),
      }),
      {
        organizationCount: 0,
        enabledVariantCount: 0,
        followsMasterNameCount: 0,
        overriddenExportCount: 0,
      },
    )
  }, [selectedItem])

  function beginRename(item: InventoryMasterItem) {
    setSelectedItemId(item.id)
    setDraftName(item.name)
    setError(null)
  }

  function cancelRename() {
    if (saving) return
    setSelectedItemId(null)
    setDraftName('')
  }

  useEffect(() => {
    if (!selectedItem) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') cancelRename()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedItem, saving])

  async function saveRename() {
    if (!activeOrganization?.id || !selectedItem || saving) return

    const nextName = draftName.trim()
    if (!nextName || nextName === selectedItem.name) return

    setSaving(true)
    setError(null)

    try {
      await renameInventoryMasterItem({
        organizationId: activeOrganization.id,
        itemId: selectedItem.id,
        name: nextName,
      })
      await reload()
      setSelectedItemId(null)
      setDraftName('')
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to rename the Inventory master item.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="inventory-content inventory-master-names-page">
      <style>{`
        .inventory-master-names-page .master-names-toolbar {
          display: grid;
          grid-template-columns: minmax(20rem, 2fr) repeat(3, minmax(10rem, 1fr));
          gap: .75rem;
          margin-bottom: 1rem;
        }

        .inventory-master-names-page .master-names-toolbar .inventory-search-control {
          min-width: 0;
        }

        .inventory-master-names-page .master-names-toolbar input,
        .inventory-master-names-page .master-names-toolbar select {
          width: 100%;
        }

        .inventory-master-names-page .master-names-result-count {
          color: #64748b;
          font-size: .9rem;
        }

        .inventory-master-names-page .inventory-table-card {
          min-width: 0;
          overflow: hidden;
        }

        .inventory-master-names-page .inventory-table-scroll {
          width: 100%;
          max-width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .inventory-master-names-page .inventory-table {
          min-width: 58rem;
        }

        .inventory-master-names-page .master-names-summary {
          display: grid;