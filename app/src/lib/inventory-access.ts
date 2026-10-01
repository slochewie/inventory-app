import { authBaseURL } from "#/lib/auth-client"

export type InventoryRole = "viewer" | "staff" | "manager" | "admin"

export type InventoryAssignment = {
  memberId: string
  userId: string
  name: string
  email: string
  systemAdmin: boolean
  enabled: boolean
  role: InventoryRole
  canUpdateAccess: boolean
  canUpdateRole: boolean
}

type AccessResponse = {
  allowed?: boolean
  role?: InventoryRole | null
  organizationName?: string | null
  error?: string
}

type AssignmentsResponse = {
  assignments?: InventoryAssignment[]
  error?: string
}

export type InventoryCatalogRow = {
  id: string
  name: string
  normalizedName: string
  active: boolean
  category: {
    id: string
    name: string | null
    toastCategory: string | null
  } | null
  variant: {
    id: string
    kind: string
    sizeOz: number | null
    packageType: string | null
    name: string | null
    defaultPriceCents: number | null
    active: boolean
  }
  organization: {
    enabled: boolean
    exportToToast: boolean
    priceOverrideCents: number | null
    happyHourPriceCents: number | null
    toastNameOverride: string | null
    toastCategoryOverride: string | null
    toastDestinationOverride: string | null
    toastSlot: string | null
  }
  effectivePriceCents: number | null
}

type CatalogResponse = {
  organizationId?: string
  role?: InventoryRole | null
  items?: InventoryCatalogRow[]
  error?: string
}

export type InventoryCocktailSection =
  | "house"
  | "vodka"
  | "gin"
  | "rum"
  | "tequila"
  | "whiskey-bourbon"

export type InventoryCocktailMaster = {
  id: string
  name: string
  normalizedName: string
  active: boolean
  organizationCocktailId: string | null
  assigned: boolean
}

export type InventoryOrganizationCocktail = {
  id: string
  organizationId: string
  inventoryCocktailId: string
  masterName: string
  normalizedName: string
  enabled: boolean
  exportToToast: boolean
  section: InventoryCocktailSection
  description: string | null
  priceCents: number | null
  happyHourPriceCents: number | null
  toastNameOverride: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

type CocktailMastersResponse = {
  cocktails?: InventoryCocktailMaster[]
  error?: string
}

type CocktailsResponse = {
  organizationId?: string
  role?: InventoryRole | null
  cocktails?: InventoryOrganizationCocktail[]
  error?: string
}

export type HappyHourDay =
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat"
  | "sun"

export type OptionalBeerCategorySlot = 1 | 2 | 3 | 4 | 5

export type OptionalBeerCategoryConfig = {
  slot: OptionalBeerCategorySlot
  key: `optional-beer-${OptionalBeerCategorySlot}`
  enabled: boolean
  label: string
}

export const OPTIONAL_BEER_CATEGORY_SLOTS: readonly OptionalBeerCategorySlot[] = [
  1, 2, 3, 4, 5,
]

export function getOptionalBeerSlotKey(
  slot: OptionalBeerCategorySlot,
): OptionalBeerCategoryConfig["key"] {
  return `optional-beer-${slot}`
}

export function getOptionalBeerCategories(
  config: InventoryOrganizationConfig,
): OptionalBeerCategoryConfig[] {
  return OPTIONAL_BEER_CATEGORY_SLOTS.map((slot) => ({
    slot,
    key: getOptionalBeerSlotKey(slot),
    enabled: config[`optionalBeerCategory${slot}Enabled`],
    label: config[`optionalBeerCategory${slot}Label`],
  }))
}

export type InventoryOrganizationBeerFormat = {
  key: string
  label: string
  toastDestination: string
  toastSlot: OptionalBeerCategoryConfig["key"] | null
  kind: "draft" | "pitcher" | "can" | "bottle" | "custom"
}

export function getInventoryOrganizationBeerFormats(
  config: InventoryOrganizationConfig,
): InventoryOrganizationBeerFormat[] {
  const formats: InventoryOrganizationBeerFormat[] = []

  const addDraft = (
    enabled: boolean,
    actualSizeOz: number | null,
    toastSlotSizeOz: number,
  ) => {
    if (!enabled) return
    const sizeOz = actualSizeOz ?? toastSlotSizeOz
    const label = `${sizeOz}oz Draft`
    formats.push({
      key: `draft-${sizeOz}oz`,
      label,
      toastDestination: `Beer tab · Draft Beer ${sizeOz}oz`,
      toastSlot: null,
      kind: "draft",
    })
  }

  addDraft(config.draft8Enabled, config.draft8ActualSizeOz, 8)
  addDraft(config.draft16Enabled, config.draft16ActualSizeOz, 16)
  addDraft(config.draft24Enabled, config.draft24ActualSizeOz, 24)

  if (config.pitcherEnabled) {
    formats.push({
      key: "pitcher",
      label: "Pitcher",
      toastDestination: "Beer tab · Pitcher",
      toastSlot: null,
      kind: "pitcher",
    })
  }

  if (config.canEnabled) {
    formats.push({
      key: "can",
      label: "Can",
      toastDestination: "Beer tab · Can",
      toastSlot: null,
      kind: "can",
    })
  }

  if (config.bottleEnabled) {
    formats.push({
      key: "bottle",
      label: "Bottle",
      toastDestination: "Beer tab · Bottle",
      toastSlot: null,
      kind: "bottle",
    })
  }

  for (const category of getOptionalBeerCategories(config)) {
    if (!category.enabled) continue

    const label = category.label.trim()
    if (!label) continue

    const draftSizeMatch = label.match(/^(\d+(?:\.\d+)?)\s*oz$/i)
    formats.push({
      key: category.key,
      label: draftSizeMatch ? `${draftSizeMatch[1]}oz Draft` : label,
      toastDestination: draftSizeMatch
        ? `Beer tab · Draft Beer ${draftSizeMatch[1]}oz`
        : `Beer tab · ${label}`,
      toastSlot: category.key,
      kind: draftSizeMatch ? "draft" : "custom",
    })
  }

  const byDestination = new Map<string, InventoryOrganizationBeerFormat>()
  for (const format of formats) {
    const key = format.toastDestination.trim().toLowerCase()
    if (!byDestination.has(key)) byDestination.set(key, format)
  }

  return [...byDestination.values()]
}

export const ALL_HAPPY_HOUR_DAYS: HappyHourDay[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
]

export type InventoryOrganizationConfig = {
  enabled: boolean
  happyHourEnabled: boolean
  happyHourStart: string | null
  happyHourEnd: string | null
  happyHourDays: HappyHourDay[]
  happyHourRange2Enabled: boolean
  happyHourRange2Start: string | null
  happyHourRange2End: string | null
  happyHourRange2Days: HappyHourDay[]
  draft8Enabled: boolean
  draft8ActualSizeOz: number | null
  draft16Enabled: boolean
  draft16ActualSizeOz: number | null
  draft24Enabled: boolean
  draft24ActualSizeOz: number | null
  pitcherEnabled: boolean
  pitcherActualSizeOz: number | null
  canEnabled: boolean
  bottleEnabled: boolean
  retailEnabled: boolean
  openItemsEnabled: boolean
  optionalBeerCategory1Enabled: boolean
  optionalBeerCategory1Label: string
  optionalBeerCategory2Enabled: boolean
  optionalBeerCategory2Label: string
  optionalBeerCategory3Enabled: boolean
  optionalBeerCategory3Label: string
  optionalBeerCategory4Enabled: boolean
  optionalBeerCategory4Label: string
  optionalBeerCategory5Enabled: boolean
  optionalBeerCategory5Label: string
}

type OrganizationConfigResponse = {
  organizationId?: string
  config?: Partial<InventoryOrganizationConfig>
  updated?: boolean
  error?: string
}


export type InventoryImportItem = {
  id: string
  sourceItemNumber?: string
  name: string
  category?: string
  toastCategory: string
  toastDestination: string
  basePriceCents: number | null
  happyHourPriceCents: number | null
  status: "ready" | "review" | "ignored"
  exportIncluded: boolean
  targetVariantId?: string
  createNewMaster?: boolean
}

type ImportResponse = {
  importId?: string
  importedItems?: number
  importedVariants?: number
  error?: string
}


export type InventoryImportConflict = {
  type: string
  sourceKey?: string
  sourceName?: string
  variantId?: string
  existingPriceCents?: number | null
  incomingPriceCents?: number | null
  category?: string | null
  existingCategory?: string | null
  incomingCategory?: string | null
}

export type InventoryImportHistoryEntry = {
  id: string
  sourceType: string
  sourceName: string
  importedByUserId: string
  importedByName: string | null
  importedByEmail: string | null
  status: string
  createdAt: string
  updatedAt: string
  itemCount: number
  variantCount: number
  conflictCount: number
  conflicts: InventoryImportConflict[]
}

type ImportHistoryResponse = {
  imports?: InventoryImportHistoryEntry[]
  error?: string
}


type OrganizationVariantUpdateResponse = {
  updated?: boolean
  error?: string
}


export type InventorySourceMapping = {
  id: string
  sourceType: "aloha-csv" | "toast-template" | string
  sourceKey: string
  sourceItemId: string | null
  sourceName: string
  normalizedSourceName: string
  inventoryItemId: string | null
  inventoryItemVariantId: string | null
  mappingConfirmed: boolean
  itemName: string | null
  variantName: string | null
  variantKind: string | null
  variantSizeOz: number | null
  variantPackageType: string | null
  updatedAt: string
}

type SourceMappingsResponse = {
  mappings?: InventorySourceMapping[]
  error?: string
}

export type InventoryMasterOrganizationImpact = {
  organizationId: string
  organizationName: string
  variantCount: number
  enabledVariantCount: number
  exportVariantCount: number
  followsMasterNameCount: number
  overrideNames: string[]
}

export type InventoryMasterItem = {
  id: string
  name: string
  normalizedName: string
  categoryName: string | null
  toastCategory: string | null
  variantCount: number
  organizations: InventoryMasterOrganizationImpact[]
}

type MasterItemsResponse = {
  items?: InventoryMasterItem[]
  error?: string
}

type MasterItemRenameResponse = {
  updated?: boolean
  item?: {
    id: string
    name: string
    normalizedName: string
  }
  error?: string
}

function authEndpoint(path: string) {
  return `${authBaseURL.replace(/\/$/, "")}${path}`
}

export async function getInventoryAccess(
  organizationId: string,
  signal?: AbortSignal,
) {
  const url = new URL(authEndpoint("/api/auth/inventory/access"))
  url.searchParams.set("organizationId", organizationId)

  const response = await fetch(url, {
    credentials: "include",
    signal,
  })
  const result = (await response.json()) as AccessResponse

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to verify Inventory access.",
    )
  }

  return {
    allowed: result.allowed === true,
    role: result.role ?? null,
    organizationName:
      typeof result.organizationName === "string"
        ? result.organizationName
        : null,
  }
}

export async function listInventoryAssignments(organizationId: string) {
  const url = new URL(authEndpoint("/api/auth/inventory/assignments"))
  url.searchParams.set("organizationId", organizationId)

  const response = await fetch(url, { credentials: "include" })
  const result = (await response.json()) as AssignmentsResponse

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to load Inventory assignments.",
    )
  }

  return Array.isArray(result.assignments) ? result.assignments : []
}


export async function getInventoryOrganizationConfig(
  organizationId: string,
  signal?: AbortSignal,
) {
  const url = new URL(authEndpoint("/api/auth/inventory/organization-config"))
  url.searchParams.set("organizationId", organizationId)

  const response = await fetch(url, {
    credentials: "include",
    signal,
  })
  const result = (await response.json()) as OrganizationConfigResponse

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to load Inventory organization settings.",
    )
  }

  return normalizeInventoryOrganizationConfig(result.config)
}

export async function updateInventoryOrganizationConfig(input: {
  organizationId: string
  happyHourEnabled: boolean
  happyHourStart: string | null
  happyHourEnd: string | null
  happyHourDays: HappyHourDay[]
  happyHourRange2Enabled: boolean
  happyHourRange2Start: string | null
  happyHourRange2End: string | null
  happyHourRange2Days: HappyHourDay[]
  draft8Enabled: boolean
  draft8ActualSizeOz: number | null
  draft16Enabled: boolean
  draft16ActualSizeOz: number | null
  draft24Enabled: boolean
  draft24ActualSizeOz: number | null
  pitcherEnabled: boolean
  pitcherActualSizeOz: number | null
  canEnabled: boolean
  bottleEnabled: boolean
  retailEnabled?: boolean
  openItemsEnabled?: boolean
  optionalBeerCategory1Enabled: boolean
  optionalBeerCategory1Label: string
  optionalBeerCategory2Enabled: boolean
  optionalBeerCategory2Label: string
  optionalBeerCategory3Enabled: boolean
  optionalBeerCategory3Label: string
  optionalBeerCategory4Enabled: boolean
  optionalBeerCategory4Label: string
  optionalBeerCategory5Enabled: boolean
  optionalBeerCategory5Label: string
}) {
  const response = await fetch(
    authEndpoint("/api/auth/inventory/organization-config"),
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  )
  const result = (await response.json()) as OrganizationConfigResponse

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to update Inventory organization settings.",
    )
  }

  return result.config
    ? normalizeInventoryOrganizationConfig(result.config)
    : null
}

function normalizeInventoryOrganizationConfig(
  config?: Partial<InventoryOrganizationConfig> | null,
): InventoryOrganizationConfig {
  return {
    enabled: config?.enabled ?? true,
    happyHourEnabled: config?.happyHourEnabled ?? false,
    happyHourStart: config?.happyHourStart ?? null,
    happyHourEnd: config?.happyHourEnd ?? null,
    happyHourDays: config?.happyHourDays?.length
      ? config.happyHourDays
      : [...ALL_HAPPY_HOUR_DAYS],
    happyHourRange2Enabled: config?.happyHourRange2Enabled ?? false,
    happyHourRange2Start: config?.happyHourRange2Start ?? null,
    happyHourRange2End: config?.happyHourRange2End ?? null,
    happyHourRange2Days: config?.happyHourRange2Days?.length
      ? config.happyHourRange2Days
      : [...ALL_HAPPY_HOUR_DAYS],
    draft8Enabled: config?.draft8Enabled ?? false,
    draft8ActualSizeOz: config?.draft8ActualSizeOz ?? null,
    draft16Enabled: config?.draft16Enabled ?? false,
    draft16ActualSizeOz: config?.draft16ActualSizeOz ?? null,
    draft24Enabled: config?.draft24Enabled ?? false,
    draft24ActualSizeOz: config?.draft24ActualSizeOz ?? null,
    pitcherEnabled: config?.pitcherEnabled ?? false,
    pitcherActualSizeOz: config?.pitcherActualSizeOz ?? null,
    canEnabled: config?.canEnabled ?? true,
    bottleEnabled: config?.bottleEnabled ?? true,
    retailEnabled: config?.retailEnabled ?? false,
    openItemsEnabled: config?.openItemsEnabled ?? false,
    optionalBeerCategory1Enabled:
      config?.optionalBeerCategory1Enabled ?? false,
    optionalBeerCategory1Label:
      config?.optionalBeerCategory1Label?.trim() ||
      "Optional Beer Category 1",
    optionalBeerCategory2Enabled:
      config?.optionalBeerCategory2Enabled ?? false,
    optionalBeerCategory2Label:
      config?.optionalBeerCategory2Label?.trim() ||
      "Optional Beer Category 2",
    optionalBeerCategory3Enabled:
      config?.optionalBeerCategory3Enabled ?? false,
    optionalBeerCategory3Label:
      config?.optionalBeerCategory3Label?.trim() ||
      "Optional Beer Category 3",
    optionalBeerCategory4Enabled:
      config?.optionalBeerCategory4Enabled ?? false,
    optionalBeerCategory4Label:
      config?.optionalBeerCategory4Label?.trim() ||
      "Optional Beer Category 4",
    optionalBeerCategory5Enabled:
      config?.optionalBeerCategory5Enabled ?? false,
    optionalBeerCategory5Label:
      config?.optionalBeerCategory5Label?.trim() ||
      "Optional Beer Category 5",
  }
}


export async function listInventoryCatalog(
  organizationId: string,
  signal?: AbortSignal,
) {
  const url = new URL(authEndpoint("/api/auth/inventory/catalog"))
  url.searchParams.set("organizationId", organizationId)

  const response = await fetch(url, {
    credentials: "include",
    signal,
  })
  const result = (await response.json()) as CatalogResponse

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to load the Inventory catalog.",
    )
  }

  return {
    organizationId:
      typeof result.organizationId === "string"
        ? result.organizationId
        : organizationId,
    role: result.role ?? null,
    items: Array.isArray(result.items) ? result.items : [],
  }
}


export async function listInventoryCocktailMasters(
  organizationId: string,
  signal?: AbortSignal,
) {
  const url = new URL(authEndpoint("/api/auth/inventory/cocktail-masters"))
  url.searchParams.set("organizationId", organizationId)

  const response = await fetch(url, {
    credentials: "include",
    signal,
  })
  const result = (await response.json()) as CocktailMastersResponse

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to load cocktail masters.",
    )
  }

  return Array.isArray(result.cocktails) ? result.cocktails : []
}

export async function updateInventoryCocktailMaster(input: {
  organizationId: string
  inventoryCocktailId: string
  name?: string
  active?: boolean
}) {
  const response = await fetch(
    authEndpoint("/api/auth/inventory/cocktail-master"),
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  )
  const result = (await response.json()) as {
    updated?: boolean
    cocktail?: InventoryCocktailMaster
    error?: string
  }

  if (!response.ok || result.updated !== true || !result.cocktail) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to update Cocktail master.",
    )
  }

  return result.cocktail
}

export async function listInventoryCocktails(
  organizationId: string,
  signal?: AbortSignal,
) {
  const url = new URL(authEndpoint("/api/auth/inventory/cocktails"))
  url.searchParams.set("organizationId", organizationId)

  const response = await fetch(url, {
    credentials: "include",
    signal,
  })
  const result = (await response.json()) as CocktailsResponse

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to load cocktails.",
    )
  }

  return {
    organizationId:
      typeof result.organizationId === "string"
        ? result.organizationId
        : organizationId,
    role: result.role ?? null,
    cocktails: Array.isArray(result.cocktails) ? result.cocktails : [],
  }
}

export async function createInventoryCocktail(input: {
  organizationId: string
  inventoryCocktailId?: string
  name: string
  createNewMaster?: boolean
  section: InventoryCocktailSection
  description?: string | null
  priceCents: number | null
  happyHourPriceCents?: number | null
  enabled?: boolean
  exportToToast?: boolean
  toastNameOverride?: string | null
  sortOrder?: number
}) {
  const response = await fetch(authEndpoint("/api/auth/inventory/cocktail"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  })
  const result = (await response.json()) as {
    created?: boolean
    inventoryCocktailId?: string
    organizationCocktailId?: string
    error?: string
  }

  if (
    !response.ok ||
    result.created !== true ||
    typeof result.organizationCocktailId !== "string"
  ) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to add cocktail.",
    )
  }

  return {
    inventoryCocktailId: result.inventoryCocktailId ?? null,
    organizationCocktailId: result.organizationCocktailId,
  }
}

export async function updateInventoryCocktail(input: {
  organizationId: string
  organizationCocktailId: string
  section?: InventoryCocktailSection
  description?: string | null
  priceCents?: number | null
  happyHourPriceCents?: number | null
  enabled?: boolean
  exportToToast?: boolean
  toastNameOverride?: string | null
  sortOrder?: number
}) {
  const response = await fetch(authEndpoint("/api/auth/inventory/cocktail"), {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  })
  const result = (await response.json()) as {
    updated?: boolean
    error?: string
  }

  if (!response.ok || result.updated !== true) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to update cocktail.",
    )
  }

  return true
}

export async function removeInventoryCocktail(input: {
  organizationId: string
  organizationCocktailId: string
}) {
  const response = await fetch(
    authEndpoint("/api/auth/inventory/cocktail/remove"),
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  )
  const result = (await response.json()) as {
    removed?: boolean
    error?: string
  }

  if (!response.ok || result.removed !== true) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to remove cocktail.",
    )
  }

  return true
}


export async function persistInventoryImport(input: {
  organizationId: string
  sourceType: "aloha-csv" | "toast-template"
  sourceName: string
  reconciliationMode?: "automatic" | "explicit"
  items: InventoryImportItem[]
}) {
  const response = await fetch(authEndpoint("/api/auth/inventory/import"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  })
  const result = (await response.json()) as ImportResponse

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to save the Inventory import.",
    )
  }

  return {
    importId: result.importId ?? null,
    importedItems: result.importedItems ?? 0,
    importedVariants: result.importedVariants ?? 0,
  }
}


export async function listInventoryImports(
  organizationId: string,
  signal?: AbortSignal,
) {
  const url = new URL(authEndpoint("/api/auth/inventory/imports"))
  url.searchParams.set("organizationId", organizationId)

  const response = await fetch(url, {
    credentials: "include",
    signal,
  })
  const result = (await response.json()) as ImportHistoryResponse

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to load Inventory import history.",
    )
  }

  return Array.isArray(result.imports) ? result.imports : []
}


export async function addInventoryOrganizationVariant(input: {
  organizationId: string
  itemId: string
  toastCategory: string
  toastDestination: string
  toastSlot?: string | null
}) {
  const response = await fetch(
    authEndpoint("/api/auth/inventory/organization-variant"),
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  )
  const result = (await response.json()) as {
    variantId?: string
    error?: string
  }

  if (!response.ok || typeof result.variantId !== "string") {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to add Inventory format.",
    )
  }

  return result.variantId
}

export async function updateInventoryOrganizationVariant(input: {
  organizationId: string
  variantId: string
  enabled?: boolean
  exportToToast?: boolean
  priceOverrideCents?: number | null
  happyHourPriceCents?: number | null
  toastNameOverride?: string | null
  toastCategoryOverride?: string | null
  toastDestinationOverride?: string | null
  toastSlot?: string | null
}) {
  const response = await fetch(
    authEndpoint("/api/auth/inventory/organization-variant"),
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  )
  const result = (await response.json()) as OrganizationVariantUpdateResponse

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to update the Inventory item.",
    )
  }

  return result.updated === true
}


export async function updateInventoryOrganizationVariants(input: {
  organizationId: string
  variantIds: string[]
  enabled?: boolean
  exportToToast?: boolean
  priceOverrideCents?: number | null
  happyHourPriceCents?: number | null
  toastCategoryOverride?: string | null
  toastDestinationOverride?: string | null
}) {
  const response = await fetch(
    authEndpoint("/api/auth/inventory/organization-variants"),
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  )
  const result = (await response.json()) as {
    updated?: number
    error?: string
  }

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to update Inventory items.",
    )
  }

  return typeof result.updated === "number" ? result.updated : 0
}


export async function updateInventoryAssignment(input: {
  organizationId: string
  userId: string
  enabled?: boolean
  role?: InventoryRole
}) {
  const response = await fetch(authEndpoint("/api/auth/inventory/assignment"), {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  })
  const result = (await response.json()) as {
    updated?: boolean
    error?: string
  }

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to update Inventory assignment.",
    )
  }

  return result.updated === true
}


export async function listInventorySourceMappings(
  organizationId: string,
  signal?: AbortSignal,
) {
  const url = new URL(authEndpoint("/api/auth/inventory/source-mappings"))
  url.searchParams.set("organizationId", organizationId)

  const response = await fetch(url, {
    credentials: "include",
    signal,
  })
  const result = (await response.json()) as SourceMappingsResponse

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to load Inventory source mappings.",
    )
  }

  return Array.isArray(result.mappings) ? result.mappings : []
}

export async function listInventoryMasterItems(
  organizationId: string,
  signal?: AbortSignal,
) {
  const url = new URL(authEndpoint("/api/auth/inventory/master-items"))
  url.searchParams.set("organizationId", organizationId)

  const response = await fetch(url, {
    credentials: "include",
    signal,
  })
  const result = (await response.json()) as MasterItemsResponse

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to load Inventory master items.",
    )
  }

  return Array.isArray(result.items) ? result.items : []
}

export async function renameInventoryMasterItem(input: {
  organizationId: string
  itemId: string
  name: string
}) {
  const response = await fetch(
    authEndpoint("/api/auth/inventory/master-item-name"),
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  )
  const result = (await response.json()) as MasterItemRenameResponse

  if (!response.ok || result.updated !== true || !result.item) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to rename the Inventory master item.",
    )
  }

  return result.item
}


export async function updateInventoryItemCategory(input: {
  organizationId: string
  itemId: string
  categoryId: string
}) {
  const response = await fetch(
    authEndpoint("/api/auth/inventory/item-category"),
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  )
  const result = (await response.json()) as {
    updated?: boolean
    error?: string
  }

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to update the Inventory category.",
    )
  }

  return result.updated === true
}


export async function mergeInventoryItems(input: {
  organizationId: string
  sourceItemId: string
  targetItemId: string
}) {
  const response = await fetch(authEndpoint("/api/auth/inventory/item-merge"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  })
  const result = (await response.json()) as {
    merged?: boolean
    targetItemId?: string
    movedVariants?: number
    mergedVariants?: number
    error?: string
  }

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to merge Inventory items.",
    )
  }

  return {
    merged: result.merged === true,
    targetItemId:
      typeof result.targetItemId === "string"
        ? result.targetItemId
        : input.targetItemId,
    movedVariants:
      typeof result.movedVariants === "number" ? result.movedVariants : 0,
    mergedVariants:
      typeof result.mergedVariants === "number" ? result.mergedVariants : 0,
  }
}


export async function updateInventorySourceMapping(input: {
  organizationId: string
  sourceType: string
  sourceKey: string
  variantId: string
}) {
  const response = await fetch(
    authEndpoint("/api/auth/inventory/source-mapping"),
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  )
  const result = (await response.json()) as {
    updated?: boolean
    error?: string
  }

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to update Inventory source mapping.",
    )
  }

  return result.updated === true
}