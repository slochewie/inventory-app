import { authBaseURL } from "#/lib/auth-client"

export type InventoryLiquorModifierType = "mixer" | "bar_prep"

export type InventoryLiquorModifier = {
  id: string
  organizationId: string
  type: InventoryLiquorModifierType
  name: string
  normalizedName: string
  upchargeCents: number
  enabled: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

type LiquorModsResponse = {
  organizationId?: string
  role?: string | null
  modifiers?: InventoryLiquorModifier[]
  error?: string
}

type LiquorModifierResponse = {
  created?: boolean
  updated?: boolean
  removed?: boolean
  modifier?: InventoryLiquorModifier
  error?: string
}

function authEndpoint(path: string) {
  return `${authBaseURL.replace(/\/$/, "")}${path}`
}

async function readInventoryResponse<T extends { error?: string }>(
  response: Response,
  fallbackError: string,
) {
  const result = (await response.json()) as T

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string" && result.error.trim()
        ? result.error
        : fallbackError,
    )
  }

  return result
}

export async function listInventoryLiquorModifiers(
  organizationId: string,
  signal?: AbortSignal,
) {
  const url = new URL(authEndpoint("/api/auth/inventory/liquor-mods"))
  url.searchParams.set("organizationId", organizationId)

  const response = await fetch(url, {
    credentials: "include",
    signal,
  })
  const result = await readInventoryResponse<LiquorModsResponse>(
    response,
    "Unable to load Liquor Mods.",
  )

  return {
    organizationId:
      typeof result.organizationId === "string"
        ? result.organizationId
        : organizationId,
    role: result.role ?? null,
    modifiers: Array.isArray(result.modifiers) ? result.modifiers : [],
  }
}

export async function createInventoryLiquorModifier(input: {
  organizationId: string
  type: InventoryLiquorModifierType
  name: string
  upchargeCents: number
  enabled?: boolean
  sortOrder?: number
}) {
  const response = await fetch(authEndpoint("/api/auth/inventory/liquor-mod"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  })
  const result = await readInventoryResponse<LiquorModifierResponse>(
    response,
    "Unable to add Liquor Mod.",
  )

  if (!result.modifier) {
    throw new Error("Unable to add Liquor Mod.")
  }

  return result.modifier
}

export async function updateInventoryLiquorModifier(input: {
  organizationId: string
  modifierId: string
  type?: InventoryLiquorModifierType
  name?: string
  upchargeCents?: number
  enabled?: boolean
  sortOrder?: number
}) {
  const response = await fetch(authEndpoint("/api/auth/inventory/liquor-mod"), {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  })
  const result = await readInventoryResponse<LiquorModifierResponse>(
    response,
    "Unable to update Liquor Mod.",
  )

  if (!result.modifier) {
    throw new Error("Unable to update Liquor Mod.")
  }

  return result.modifier
}

export async function removeInventoryLiquorModifier(input: {
  organizationId: string
  modifierId: string
}) {
  const response = await fetch(
    authEndpoint("/api/auth/inventory/liquor-mod/remove"),
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  )
  const result = await readInventoryResponse<LiquorModifierResponse>(
    response,
    "Unable to remove Liquor Mod.",
  )

  return result.removed === true
}

export async function reorderInventoryLiquorModifiers(input: {
  organizationId: string
  type: InventoryLiquorModifierType
  modifierIds: string[]
}) {
  const response = await fetch(
    authEndpoint("/api/auth/inventory/liquor-mods/reorder"),
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  )
  const result = await readInventoryResponse<LiquorModsResponse>(
    response,
    "Unable to reorder Liquor Mods.",
  )

  return Array.isArray(result.modifiers) ? result.modifiers : []
}
