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

function sharedMasterOrganizations(
  master: {
    assigned?: boolean
    organizations?: Array<{
      organizationId: string
      organizationName: string
    }>
  },
  activeOrganization?: { id: string; name: string } | null,
) {
  if (master.organizations) return master.organizations

  return master.assigned && activeOrganization
    ? [
        {
          organizationId: activeOrganization.id,
          organizationName: activeOrganization.name,
        },
      ]
    : []
}

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
  const [liquorPlacement, setLiquorPlacement] = useState<LiquorPlacementFilter>('all')
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
      setLiquorMasters([...mixerResult.modifiers, ...barPrepResult.modifiers])
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
      [
        ...new Set([
          ...items.flatMap((item) =>
            item.organizations.map((entry) => entry.organizationName),
          ),
          ...cocktailMasters.flatMap((master) =>
            sharedMasterOrganizations(master, activeOrganization).map(
              (entry) => entry.organizationName,
            ),
          ),
          ...liquorMasters.flatMap((master) =>
            sharedMasterOrganizations(master, activeOrganization).map(
              (entry) => entry.organizationName,
            ),
          ),
        ]),
      ].sort((left, right) => left.localeCompare(right)),
    [
      activeOrganization?.id,
      activeOrganization?.name,
      cocktailMasters,
      items,
      liquorMasters,
    ],
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

  const filteredCocktails = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return cocktailMasters.filter((master) => {
      const masterOrganizations = sharedMasterOrganizations(
        master,
        activeOrganization,
      )
      if (
        organization !== 'all' &&
        !masterOrganizations.some(
          (entry) => entry.organizationName === organization,
        )
      ) {
        return false
      }
      if (status === 'active' && !master.active) return false
      if (status === 'inactive' && master.active) return false
      if (!normalizedQuery) return true
      return [
        master.name,
        master.normalizedName,
        ...masterOrganizations.map((entry) => entry.organizationName),
      ].some((value) => value.toLowerCase().includes(normalizedQuery))
    })
  }, [activeOrganization, cocktailMasters, organization, query, status])

  const filteredLiquorMasters = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return liquorMasters.filter((master) => {
      const masterOrganizations = sharedMasterOrganizations(
        master,
        activeOrganization,
      )
      if (
        organization !== 'all' &&
        !masterOrganizations.some(
          (entry) => entry.organizationName === organization,
        )
      ) {
        return false
      }
      if (liquorPlacement !== 'all' && master.type !== liquorPlacement) return false
      if (status === 'active' && !master.active) return false
      if (status === 'inactive' && master.active) return false
      if (!normalizedQuery) return true
      return [
        master.name,
        master.normalizedName,
        liquorPlacementLabel(master.type),
        ...masterOrganizations.map((entry) => entry.organizationName),
      ].some((value) => value.toLowerCase().includes(normalizedQuery))
    })
  }, [
    activeOrganization,
    liquorMasters,
    liquorPlacement,
    organization,
    query,
    status,
  ])

  useEffect(() => {
    setPage(1)
  }, [category, family, impact, liquorPlacement, organization, query, status, pageSize])

  const currentCount =
    family === 'items'
      ? filteredItems.length
      : family === 'cocktails'
        ? filteredCocktails.length
        : filteredLiquorMasters.length
  const pageCount = Math.max(1, Math.ceil(currentCount / pageSize))
  const clampedPage = Math.min(page, pageCount)
  const pageStart = (clampedPage - 1) * pageSize
  const pageItems = filteredItems.slice(pageStart, pageStart + pageSize)
  const pageCocktails = filteredCocktails.slice(pageStart, pageStart + pageSize)
  const pageLiquorMasters = filteredLiquorMasters.slice(pageStart, pageStart + pageSize)
  const pageEnd = Math.min(currentCount, pageStart + pageSize)

  const selectedItem =
    items.find((item) => item.id === selectedItemId) ?? null
  const selectedCocktail =
    selectedSharedMaster?.family === 'cocktails'
      ? cocktailMasters.find((master) => master.id === selectedSharedMaster.id) ?? null
      : null
  const selectedLiquorMaster =
    selectedSharedMaster?.family === 'liquor-mods'
      ? liquorMasters.find((master) => master.id === selectedSharedMaster.id) ?? null
      : null
  const selectedShared = selectedCocktail ?? selectedLiquorMaster

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

  function beginSharedRename(
    nextFamily: Exclude<MasterFamily, 'items'>,
    master: InventoryCocktailMaster | InventoryLiquorModifierMaster,
  ) {
    setSelectedSharedMaster({ family: nextFamily, id: master.id })
    setSharedDraftName(master.name)
    setSharedDraftActive(master.active)
    setError(null)
  }

  function cancelRename() {
    if (saving) return
    setSelectedItemId(null)
    setDraftName('')
  }

  function cancelSharedRename() {
    if (saving) return
    setSelectedSharedMaster(null)
    setSharedDraftName('')
  }

  useEffect(() => {
    if (!selectedItem && !selectedShared) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (selectedItem) cancelRename()
      else cancelSharedRename()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedItem, selectedShared, saving])

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
      setError(nextError instanceof Error ? nextError.message : 'Unable to rename the Inventory master item.')
    } finally {
      setSaving(false)
    }
  }

  async function saveSharedRename() {
    if (!activeOrganization?.id || !selectedShared || !selectedSharedMaster || saving) return
    const nextName = sharedDraftName.trim()
    if (!nextName) return
    setSaving(true)
    setError(null)
    try {
      if (selectedSharedMaster.family === 'cocktails') {
        await updateInventoryCocktailMaster({
          organizationId: activeOrganization.id,
          inventoryCocktailId: selectedShared.id,
          name: nextName,
          active: sharedDraftActive,
        })
      } else {
        await updateInventoryLiquorModifierMaster({
          organizationId: activeOrganization.id,
          inventoryLiquorModifierId: selectedShared.id,
          name: nextName,
          active: sharedDraftActive,
        })
      }
      await reload()
      setSelectedSharedMaster(null)
      setSharedDraftName('')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to update the master record.')
    } finally {
      setSaving(false)
    }
  }

  const sharedChanged =
    selectedShared !== null &&
    (sharedDraftName.trim() !== selectedShared.name ||
      sharedDraftActive !== selectedShared.active)

  return (
    <section className="inventory-content inventory-master-names-page">
      <style>{`
        .inventory-master-names-page {
          display: grid;
          gap: 1rem;
        }

        .inventory-master-names-page .master-family-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: .5rem;
        }

        .inventory-master-names-page .master-family-tabs button {
          min-height: 2.5rem;
          border: 1px solid #d1d5db;
          border-radius: .65rem;
          background: #fff;
          color: #374151;
          padding: .45rem .8rem;
          font-weight: 800;
        }

        .inventory-master-names-page .master-family-tabs button.is-active {
          border-color: #111827;
          background: #111827;
          color: #fff;
        }

        .inventory-master-names-page .master-names-toolbar {
          display: grid;
          grid-template-columns: minmax(20rem, 2fr) repeat(3, minmax(10rem, 1fr));
          gap: .75rem;
        }

        .inventory-master-names-page .master-names-toolbar.is-shared {
          grid-template-columns: minmax(20rem, 2fr) repeat(3, minmax(10rem, 1fr));
        }

        .inventory-master-names-page .master-names-toolbar.is-shared.is-cocktails {
          grid-template-columns: minmax(20rem, 2fr) repeat(2, minmax(10rem, 1fr));
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
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: .75rem;
        }

        .inventory-master-names-page .master-names-summary article {
          border: 1px solid #e5e7eb;
          border-radius: .75rem;
          background: #f8fafc;
          padding: .9rem 1rem;
        }

        .inventory-master-names-page .master-names-summary span {
          display: block;
          color: #64748b;
          font-size: .72rem;
          font-weight: 700;
          letter-spacing: .04em;
          text-transform: uppercase;
        }

        .inventory-master-names-page .master-names-summary strong {
          display: block;
          margin-top: .2rem;
          color: #0f172a;
          font-size: 1.25rem;
        }

        .inventory-master-names-page .master-rename-backdrop {
          position: fixed;
          inset: 0;
          z-index: 70;
          display: grid;
          place-items: center;
          background: rgb(15 23 42 / 45%);
          padding: 1rem;
        }

        .inventory-master-names-page .master-rename-panel {
          display: grid;
          width: min(58rem, calc(100vw - 2rem));
          max-height: min(88dvh, 50rem);
          overflow: auto;
          gap: 1.15rem;
          border: 1px solid #d1d5db;
          border-radius: 1rem;
          background: #fff;
          padding: 1.25rem;
          box-shadow: 0 24px 60px rgb(15 23 42 / 22%);
        }

        .inventory-master-names-page .master-rename-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
        }

        .inventory-master-names-page .master-rename-header h2 {
          margin: .15rem 0 0;
        }

        .inventory-master-names-page .master-name-current {
          display: grid;
          gap: .15rem;
        }

        .inventory-master-names-page .master-name-current small,
        .inventory-master-names-page .master-rename-help,
        .inventory-master-names-page .master-impact-table small {
          color: #64748b;
        }

        .inventory-master-names-page .master-impact-section {
          display: grid;
          gap: .65rem;
        }

        .inventory-master-names-page .master-impact-section h3 {
          margin: 0;
        }

        .inventory-master-names-page .master-impact-table {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border: 1px solid #e5e7eb;
          border-radius: .75rem;
        }

        .inventory-master-names-page .master-impact-table table {
          width: 100%;
          border-collapse: collapse;
        }

        .inventory-master-names-page .master-impact-table th,
        .inventory-master-names-page .master-impact-table td {
          padding: .75rem .85rem;
          text-align: left;
          vertical-align: top;
          border-bottom: 1px solid #e5e7eb;
        }

        .inventory-master-names-page .master-impact-table th {
          background: #f8fafc;
          color: #475569;
          font-size: .76rem;
          font-weight: 700;
          letter-spacing: .025em;
          text-transform: uppercase;
        }

        .inventory-master-names-page .master-impact-table tr:last-child td {
          border-bottom: 0;
        }

        .inventory-master-names-page .master-rename-field {
          display: grid;
          gap: .4rem;
        }

        .inventory-master-names-page .master-rename-field > span {
          font-weight: 700;
        }

        .inventory-master-names-page .master-rename-field .inventory-input {
          width: 100%;
        }

        .inventory-master-names-page .master-rename-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          border-top: 1px solid #e5e7eb;
          padding-top: 1rem;
        }

        .inventory-master-names-page .master-rename-help {
          margin: 0;
          max-width: 42rem;
          font-size: .92rem;
          line-height: 1.45;
        }

        .inventory-master-names-page .master-rename-actions {
          display: flex;
          flex: 0 0 auto;
          gap: .6rem;
        }

        .inventory-master-names-page .master-names-pagination {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: .75rem;
          border-top: 1px solid #e5e7eb;
          padding: .8rem 1rem;
        }

        .inventory-master-names-page .master-names-pagination-left,
        .inventory-master-names-page .master-names-pagination-actions,
        .inventory-master-names-page .master-page-size {
          display: flex;
          align-items: center;
          gap: .5rem;
        }

        .inventory-master-names-page .master-page-size {
          color: #475569;
          font-size: .85rem;
          font-weight: 700;
        }

        .inventory-master-names-page .master-page-size select {
          min-height: 2.25rem;
          border: 1px solid #d1d5db;
          border-radius: .55rem;
          background: #fff;
          padding: 0 .55rem;
        }

        .inventory-master-names-page .master-active-toggle {
          display: inline-flex;
          align-items: center;
          gap: .5rem;
          font-weight: 700;
        }

        @media (max-width: 1100px) {
          .inventory-master-names-page .master-names-toolbar,
          .inventory-master-names-page .master-names-toolbar.is-shared {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 900px) {
          .inventory-master-names-page .master-names-summary {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .inventory-master-names-page .master-impact-row {
            grid-template-columns: 1fr 1fr;
          }
        }

        @media (max-width: 700px) {
          .inventory-master-names-page {
            width: 100%;
            max-width: 100%;
            overflow-x: hidden;
          }

          .inventory-master-names-page .inventory-hero {
            padding: 1rem;
          }

          .inventory-master-names-page .inventory-hero h1 {
            font-size: clamp(2rem, 12vw, 3rem);
          }

          .inventory-master-names-page .master-names-toolbar,
          .inventory-master-names-page .master-names-toolbar.is-shared,
          .inventory-master-names-page .master-names-toolbar.is-shared.is-cocktails {
            grid-template-columns: 1fr;
          }

          .inventory-master-names-page .inventory-table-card {
            padding: .75rem;
          }

          .inventory-master-names-page .inventory-table-scroll {
            overflow: visible;
          }

          .inventory-master-names-page .inventory-table {
            display: block;
            width: 100%;
            min-width: 0;
          }

          .inventory-master-names-page .inventory-table thead {
            display: none;
          }

          .inventory-master-names-page .inventory-table tbody {
            display: grid;
            gap: .75rem;
          }

          .inventory-master-names-page .inventory-table tr {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: .65rem .85rem;
            border: 1px solid #e5e7eb;
            border-radius: .8rem;
            background: #fff;
            padding: .85rem;
          }

          .inventory-master-names-page .inventory-table td {
            display: grid;
            gap: .15rem;
            min-width: 0;
            border: 0;
            padding: 0;
          }

          .inventory-master-names-page .inventory-table td::before {
            content: attr(data-label);
            color: #64748b;
            font-size: .68rem;
            font-weight: 800;
            letter-spacing: .04em;
            text-transform: uppercase;
          }

          .inventory-master-names-page .inventory-table td:first-child,
          .inventory-master-names-page .inventory-table td:last-child {
            grid-column: 1 / -1;
          }

          .inventory-master-names-page .inventory-table td:first-child strong {
            font-size: 1.05rem;
          }

          .inventory-master-names-page .inventory-table td:last-child::before {
            display: none;
          }

          .inventory-master-names-page .inventory-table td:last-child button {
            width: 100%;
          }

          .inventory-master-names-page .master-names-pagination,
          .inventory-master-names-page .master-names-pagination-left {
            align-items: stretch;
            flex-direction: column;
          }

          .inventory-master-names-page .master-names-pagination-actions {
            justify-content: space-between;
          }

          .inventory-master-names-page .master-rename-backdrop {
            place-items: end center;
            padding: .5rem;
          }

          .inventory-master-names-page .master-rename-panel {
            width: 100%;
            max-height: calc(100dvh - 1rem);
            border-radius: 1rem 1rem .6rem .6rem;
            padding: 1rem;
          }

          .inventory-master-names-page .master-names-summary {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .inventory-master-names-page .master-impact-table table {
            min-width: 44rem;
          }

          .inventory-master-names-page .master-rename-footer {
            align-items: stretch;
            flex-direction: column;
          }

          .inventory-master-names-page .master-rename-actions {
            width: 100%;
          }

          .inventory-master-names-page .master-rename-actions button {
            flex: 1 1 0;
          }
        }

        @media (max-width: 420px) {
          .inventory-master-names-page .master-names-summary {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <header className="inventory-hero">
        <p className="inventory-kicker">Admin</p>
        <h1>Master Names</h1>
        <p>
          Rename shared master records used by Catalog Items, Cocktails, and Liquor Mods.
          Renames are global; organization-specific overrides remain local.
        </p>
      </header>

      <div className="master-family-tabs" role="group" aria-label="Master record type">
        <button type="button" className={family === 'items' ? 'is-active' : ''} onClick={() => setFamily('items')}>Catalog Items</button>
        <button type="button" className={family === 'cocktails' ? 'is-active' : ''} onClick={() => setFamily('cocktails')}>Cocktails</button>
        <button type="button" className={family === 'liquor-mods' ? 'is-active' : ''} onClick={() => setFamily('liquor-mods')}>Liquor Mods</button>
      </div>

      {family === 'items' ? (
        <section className="master-names-toolbar" aria-label="Master item filters">
          <label className="inventory-search-control">
            <span>Search</span>
            <input type="search" value={query} placeholder="Search master names, aliases, organizations…" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <label className="inventory-search-control">
            <span>Category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="all">All categories</option>
              {categories.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="inventory-search-control">
            <span>Organization</span>
            <select value={organization} onChange={(event) => setOrganization(event.target.value)}>
              <option value="all">All organizations</option>
              {organizations.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="inventory-search-control">
            <span>Rename impact</span>
            <select value={impact} onChange={(event) => setImpact(event.target.value as ImpactFilter)}>
              <option value="all">All master items</option>
              <option value="affected">Affects Toast exports</option>
              <option value="override">Has local Toast override</option>
              <option value="unused">Unused by organizations</option>
            </select>
          </label>
        </section>
      ) : (
        <section
          className={
            family === 'cocktails'
              ? 'master-names-toolbar is-shared is-cocktails'
              : 'master-names-toolbar is-shared'
          }
          aria-label="Shared master filters"
        >
          <label className="inventory-search-control">
            <span>Search</span>
            <input type="search" value={query} placeholder={family === 'cocktails' ? 'Search Cocktail masters…' : 'Search Liquor Mod masters…'} onChange={(event) => setQuery(event.target.value)} />
          </label>
          {family === 'liquor-mods' ? (
            <label className="inventory-search-control">
              <span>Placement</span>
              <select value={liquorPlacement} onChange={(event) => setLiquorPlacement(event.target.value as LiquorPlacementFilter)}>
                <option value="all">All placements</option>
                <option value="mixer">Mixers</option>
                <option value="bar_prep">Bar Prep</option>
              </select>
            </label>
          ) : null}
          <label className="inventory-search-control">
            <span>Organization</span>
            <select value={organization} onChange={(event) => setOrganization(event.target.value)}>
              <option value="all">All organizations</option>
              {organizations.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="inventory-search-control">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
              <option value="all">All records</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </section>
      )}

      <section className="inventory-card inventory-table-card">
        <div className="inventory-table-heading">
          <div>
            <h2>
              {family === 'items' ? 'Shared master catalog' : family === 'cocktails' ? 'Cocktail masters' : 'Liquor Mod masters'}
            </h2>
            <p className="master-names-result-count">
              {currentCount.toLocaleString()} of {(family === 'items' ? items.length : family === 'cocktails' ? cocktailMasters.length : liquorMasters.length).toLocaleString()} master records shown. Renames are global.
            </p>
          </div>
        </div>

        {error ? <p className="inventory-error">{error}</p> : null}
        {loading ? <p>Loading master catalog…</p> : null}

        {!loading && family === 'items' && filteredItems.length > 0 ? (
          <div className="inventory-table-scroll">
            <table className="inventory-table">
              <thead><tr><th>Master name</th><th>Category</th><th>Variants</th><th>Organizations</th><th>Toast exports affected</th><th /></tr></thead>
              <tbody>
                {pageItems.map((item) => {
                  const exportImpact = item.organizations.reduce((sum, entry) => sum + entry.followsMasterNameCount, 0)
                  return (
                    <tr key={item.id}>
                      <td data-label="Master name"><strong>{item.name}</strong></td>
                      <td data-label="Category">{item.categoryName ?? 'Uncategorized'}</td>
                      <td data-label="Variants">{item.variantCount.toLocaleString()}</td>
                      <td data-label="Organizations">{item.organizations.length.toLocaleString()}</td>
                      <td data-label="Toast exports affected">{exportImpact.toLocaleString()}</td>
                      <td data-label="Actions"><button className="inventory-template-download" type="button" onClick={() => beginRename(item)}>Review / Rename</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && family === 'cocktails' && filteredCocktails.length > 0 ? (
          <div className="inventory-table-scroll">
            <table className="inventory-table">
              <thead><tr><th>Master name</th><th>Status</th><th>Organizations</th><th /></tr></thead>
              <tbody>
                {pageCocktails.map((master) => (
                  <tr key={master.id}>
                    <td data-label="Master name"><strong>{master.name}</strong></td>
                    <td data-label="Status">{master.active ? 'Active' : 'Inactive'}</td>
                    <td data-label="Organizations">{sharedMasterOrganizations(master, activeOrganization).length}</td>
                    <td data-label="Actions"><button className="inventory-template-download" type="button" onClick={() => beginSharedRename('cocktails', master)}>Review / Rename</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && family === 'liquor-mods' && filteredLiquorMasters.length > 0 ? (
          <div className="inventory-table-scroll">
            <table className="inventory-table">
              <thead><tr><th>Master name</th><th>Placement</th><th>Status</th><th>Organizations</th><th /></tr></thead>
              <tbody>
                {pageLiquorMasters.map((master) => (
                  <tr key={master.id}>
                    <td data-label="Master name"><strong>{master.name}</strong></td>
                    <td data-label="Placement">{liquorPlacementLabel(master.type)}</td>
                    <td data-label="Status">{master.active ? 'Active' : 'Inactive'}</td>
                    <td data-label="Organizations">{sharedMasterOrganizations(master, activeOrganization).length}</td>
                    <td data-label="Actions"><button className="inventory-template-download" type="button" onClick={() => beginSharedRename('liquor-mods', master)}>Review / Rename</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && currentCount === 0 ? <p className="inventory-empty-state">No master records match these filters.</p> : null}

        {!loading && currentCount > 0 ? (
          <div className="master-names-pagination">
            <div className="master-names-pagination-left">
              <span>Showing {(pageStart + 1).toLocaleString()}–{pageEnd.toLocaleString()} of {currentCount.toLocaleString()}</span>
              <label className="master-page-size">
                <span>Max records</span>
                <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}>
                  {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
            </div>
            <div className="master-names-pagination-actions">
              <button className="inventory-template-download" type="button" disabled={clampedPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
              <span>Page {clampedPage} of {pageCount}</span>
              <button className="inventory-template-download" type="button" disabled={clampedPage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</button>
            </div>
          </div>
        ) : null}
      </section>

      {selectedItem ? (
        <div
          className="master-rename-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="master-rename-title"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) cancelRename()
          }}
        >
          <section className="master-rename-panel">
            <div className="master-rename-header">
              <div className="master-name-current">
                <small>Current master name</small>
                <h2 id="master-rename-title">{selectedItem.name}</h2>
              </div>
              <button
                className="inventory-template-download"
                type="button"
                disabled={saving}
                onClick={cancelRename}
              >
                Close
              </button>
            </div>

            <div className="master-names-summary">
              <article>
                <span>Organizations</span>
                <strong>{selectedImpact.organizationCount}</strong>
              </article>
              <article>
                <span>Carried variants</span>
                <strong>{selectedImpact.enabledVariantCount}</strong>
              </article>
              <article>
                <span>Affected exports</span>
                <strong>{selectedImpact.followsMasterNameCount}</strong>
              </article>
              <article>
                <span>Local overrides</span>
                <strong>{selectedImpact.overriddenExportCount}</strong>
              </article>
            </div>

            <div className="master-impact-section">
              <h3>Organization impact</h3>
              {selectedItem.organizations.length > 0 ? (
                <div className="master-impact-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Organization</th>
                        <th>Carried</th>
                        <th>Exporting</th>
                        <th>Affected</th>
                        <th>Name used by Toast</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedItem.organizations.map((organization) => (
                        <tr key={organization.organizationId}>
                          <td>
                            <strong>{organization.organizationName}</strong>
                            <small>
                              {organization.variantCount} linked variant
                              {organization.variantCount === 1 ? '' : 's'}
                            </small>
                          </td>
                          <td>{organization.enabledVariantCount}</td>
                          <td>{organization.exportVariantCount}</td>
                          <td>{organization.followsMasterNameCount}</td>
                          <td>
                            {organization.overrideNames.length > 0 ? (
                              <>
                                <strong>{organization.overrideNames.join(', ')}</strong>
                                <small>Local Toast override; unchanged by rename</small>
                              </>
                            ) : (
                              <>
                                <strong>{selectedItem.name}</strong>
                                <small>Follows the master name</small>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>No organization-specific variants currently reference this master item.</p>
              )}
            </div>

            <label className="master-rename-field">
              <span>New master name</span>
              <input
                className="inventory-input"
                value={draftName}
                maxLength={160}
                disabled={saving}
                autoFocus
                onChange={(event) => setDraftName(event.target.value)}
              />
            </label>

            <div className="master-rename-footer">
              <p className="master-rename-help">
                The old master name is kept as an import alias. Organization-specific
                Toast name overrides stay exactly as they are.
              </p>

              <div className="master-rename-actions">
                <button
                  className="inventory-template-download"
                  type="button"
                  disabled={saving}
                  onClick={cancelRename}
                >
                  Cancel
                </button>
                <button
                  className="inventory-template-download"
                  type="button"
                  disabled={
                    saving ||
                    !draftName.trim() ||
                    draftName.trim() === selectedItem.name
                  }
                  onClick={() => void saveRename()}
                >
                  {saving ? 'Renaming…' : 'Rename master'}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {selectedShared ? (
        <div
          className="master-rename-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shared-master-rename-title"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) cancelSharedRename()
          }}
        >
          <section className="master-rename-panel">
            <div className="master-rename-header">
              <div className="master-name-current">
                <small>
                  {selectedSharedMaster?.family === 'cocktails'
                    ? 'Cocktail master'
                    : selectedLiquorMaster
                      ? liquorPlacementLabel(selectedLiquorMaster.type)
                      : 'Liquor Mod master'}
                </small>
                <h2 id="shared-master-rename-title">{selectedShared.name}</h2>
              </div>
              <button
                className="inventory-template-download"
                type="button"
                disabled={saving}
                onClick={cancelSharedRename}
              >
                Close
              </button>
            </div>

            <div className="master-names-summary">
              <article>
                <span>Status</span>
                <strong>{selectedShared.active ? 'Active' : 'Inactive'}</strong>
              </article>
              <article>
                <span>Selected organization</span>
                <strong>{selectedShared.assigned ? 'Assigned' : 'Not assigned'}</strong>
              </article>
              <article>
                <span>Record type</span>
                <strong>
                  {selectedSharedMaster?.family === 'cocktails'
                    ? 'Cocktail'
                    : selectedLiquorMaster
                      ? liquorPlacementLabel(selectedLiquorMaster.type)
                      : 'Liquor Mod'}
                </strong>
              </article>
              <article>
                <span>Scope</span>
                <strong>Global</strong>
              </article>
            </div>

            <label className="master-rename-field">
              <span>New master name</span>
              <input
                className="inventory-input"
                value={sharedDraftName}
                maxLength={160}
                disabled={saving}
                autoFocus
                onChange={(event) => setSharedDraftName(event.target.value)}
              />
            </label>

            <label className="master-active-toggle">
              <input
                type="checkbox"
                checked={sharedDraftActive}
                disabled={saving}
                onChange={(event) => setSharedDraftActive(event.target.checked)}
              />
              <span>Active master</span>
            </label>

            <div className="master-rename-footer">
              <p className="master-rename-help">
                Renaming this record changes the shared master name. Existing
                organization-specific name overrides remain unchanged. Inactive
                masters cannot be newly assigned.
              </p>

              <div className="master-rename-actions">
                <button
                  className="inventory-template-download"
                  type="button"
                  disabled={saving}
                  onClick={cancelSharedRename}
                >
                  Cancel
                </button>
                <button
                  className="inventory-template-download"
                  type="button"
                  disabled={saving || !sharedDraftName.trim() || !sharedChanged}
                  onClick={() => void saveSharedRename()}
                >
                  {saving ? 'Saving…' : 'Save master'}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}

function liquorPlacementLabel(type: InventoryLiquorModifierType) {
  return type === 'mixer' ? 'Mixer' : 'Bar Prep'
}