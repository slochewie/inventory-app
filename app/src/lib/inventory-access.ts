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

type InventoryOrganizationConfigTransport =
  Partial<InventoryOrganizationConfig> & {
    tallBoyCanEnabled?: boolean
    tallBoyCanLabel?: string
  }

type OrganizationConfigResponse = {
  organizationId?: string
  config?: InventoryOrganizationConfigTransport
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
      body: JSON.stringify({
        ...input,
        // Temporary aliases keep this client compatible with the pre-generic
        // Auth deployment during the rolling update. New Auth ignores them.
        tallBoyCanEnabled: input.optionalBeerCategory1Enabled,
        tallBoyCanLabel: input.optionalBeerCategory1Label,
      }),
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
  config?: InventoryOrganizationConfigTransport | null,
): InventoryOrganizationConfig {
  const legacyEnabled = config?.tallBoyCanEnabled === true
  const legacyLabel = config?.tallBoyCanLabel?.trim()
  const slot1Enabled =
    config?.optionalBeerCategory1Enabled ?? legacyEnabled
  const slot1ConfiguredLabel = config?.optionalBeerCategory1Label?.trim()
  const slot1Label =
    slot1ConfiguredLabel ||
    (!slot1Enabled && legacyLabel === "Tall Boy Can"
      ? "Optional Beer Category 1"
      : legacyLabel) ||
    "Optional Beer Category 1"

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
    optionalBeerCategory1Enabled: slot1Enabled,
    optionalBeerCategory1Label: slot1Label,
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


export async function persistInventoryImport(input: {
  organizationId: string
  sourceType: "aloha-csv" | "toast-template"
  sourceName: string
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
