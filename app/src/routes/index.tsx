import { createFileRoute } from '@tanstack/react-router'
import { CircleCheckBig, CircleOff, CircleX, DollarSign, Info, ListChecks, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AuthenticatedInventoryShell,
  useInventoryAccessRole,
} from '#/components/authenticated-inventory-shell'
import { catalogRowToNormalizedItem } from '#/features/menu-import/catalog'
import { formatCurrency, type NormalizedMenuItem } from '#/features/menu-import/types'
import { authClient } from '#/lib/auth-client'
import {
  addInventoryOrganizationVariant,
  getInventoryOrganizationConfig,
  getOptionalBeerCategories,
  listInventoryCatalog,
  mergeInventoryItems,
  updateInventoryItemCategory,
  updateInventoryOrganizationVariant,
  updateInventoryOrganizationVariants,
  type InventoryOrganizationConfig,
  type OptionalBeerCategoryConfig,
} from '#/lib/inventory-access'
import { ManualItemEditor } from './manual-item'

export const Route = createFileRoute('/')({ component: CatalogPage })

type AvailabilityFilter = 'carried' | 'not-carried' | 'all'

const DEFAULT_PAGE_SIZE = 25
const PAGE_SIZE_OPTIONS = [25, 50, 100, 250] as const


type CatalogGroup = {
  id: string
  name: string
  category: string
  categoryId?: string
  items: NormalizedMenuItem[]
}

type CatalogCategoryOption = {
  id: string
  name: string
}

function CatalogPage() {
  const { canEdit, canImportExport, canManageAssignments } = useInventoryAccessRole()
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [items, setItems] = useState<NormalizedMenuItem[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [availability, setAvailability] = useState<AvailabilityFilter>('carried')
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingVariantId, setSavingVariantId] = useState<string | null>(null)
  const [mergingItemId, setMergingItemId] = useState<string | null>(null)
  const [addingFormatKey, setAddingFormatKey] = useState<string | null>(null)
  const [bulkEditEnabled, setBulkEditEnabled] = useState(false)
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [bulkHelpOpen, setBulkHelpOpen] = useState(false)
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false)
  const [bulkPriceStep, setBulkPriceStep] = useState<'entry' | 'review'>('entry')
  const [bulkPriceValue, setBulkPriceValue] = useState('')
  const [bulkHelpPosition, setBulkHelpPosition] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
  } | null>(null)
  const bulkHelpRef = useRef<HTMLDivElement>(null)
  const bulkHelpButtonRef = useRef<HTMLButtonElement>(null)
  const bulkHelpPopoverRef = useRef<HTMLDivElement>(null)
  const [selectedBulkGroupIds, setSelectedBulkGroupIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [optionalBeerCategories, setOptionalBeerCategories] = useState<OptionalBeerCategoryConfig[]>([])
  const [organizationConfig, setOrganizationConfig] =
    useState<InventoryOrganizationConfig | null>(null)


  useEffect(() => {
    if (!activeOrganization?.id) {
      setItems([])
      setOrganizationConfig(null)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    void Promise.all([
      listInventoryCatalog(activeOrganization.id, controller.signal),
      getInventoryOrganizationConfig(activeOrganization.id, controller.signal),
    ])
      .then(([catalog, organizationConfig]) => {
        const catalogItems = catalog.items.map(catalogRowToNormalizedItem)
        setOrganizationConfig(organizationConfig)
        setItems(catalogItems)
        setSelectedGroupId(null)
        setPage(1)

        const nextOptionalBeerCategories = getOptionalBeerCategories(organizationConfig)
        setOptionalBeerCategories(
          getEffectiveOptionalBeerCategoriesForCatalog(
            nextOptionalBeerCategories,
            catalogItems,
          ),
        )
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setError(
          caught instanceof Error
            ? caught.message
            : 'Unable to load the Inventory catalog.',
        )