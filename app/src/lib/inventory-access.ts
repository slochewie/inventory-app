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
