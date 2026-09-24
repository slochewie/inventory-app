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
