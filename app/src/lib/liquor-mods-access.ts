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

const LOCAL_STORAGE_PREFIX = "inventory-liquor-mods:v1:"

function authEndpoint(path: string) {
  return `${authBaseURL.replace(/\/$/, "")}${path}`
}

function shouldUseLocalFallback(response: Response) {
  return response.status === 404 || response.status === 405
}

async function readInventoryResponse<T extends { error?: string }>(
  response: Response,
  fallbackError: string,
) {
  const result = (await readJson(response)) as T

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string" && result.error.trim()
        ? result.error
        : fallbackError,
    )
  }

  return result
}

async function readJson(response: Response) {
  try {
    return await response.json()
  } catch {
    return {}
  }
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

  if (shouldUseLocalFallback(response)) {
    return {
      organizationId,
      role: null,
      modifiers: loadLocalModifiers(organizationId),
    }
  }

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

  if (shouldUseLocalFallback(response)) {
    return createLocalModifier(input)
  }

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

  if (shouldUseLocalFallback(response)) {
    return updateLocalModifier(input)
  }

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

  if (shouldUseLocalFallback(response)) {
    return removeLocalModifier(input)
  }

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

  if (shouldUseLocalFallback(response)) {
    return reorderLocalModifiers(input)
  }

  const result = await readInventoryResponse<LiquorModsResponse>(
    response,
    "Unable to reorder Liquor Mods.",
  )

  return Array.isArray(result.modifiers) ? result.modifiers : []
}

function loadLocalModifiers(organizationId: string): InventoryLiquorModifier[] {
  if (typeof window === "undefined") return []

  try {
    const raw = window.localStorage.getItem(localStorageKey(organizationId))
    if (!raw) return []

    const parsed = JSON.parse(raw) as InventoryLiquorModifier[]
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(isLiquorModifier)
      .sort(
        (left, right) =>
          left.type.localeCompare(right.type) ||
          left.sortOrder - right.sortOrder ||
          left.name.localeCompare(right.name),
      )
  } catch {
    return []
  }
}

function saveLocalModifiers(
  organizationId: string,
  modifiers: InventoryLiquorModifier[],
) {
  if (typeof window === "undefined") return

  window.localStorage.setItem(
    localStorageKey(organizationId),
    JSON.stringify(modifiers),
  )
}

function createLocalModifier(input: {
  organizationId: string
  type: InventoryLiquorModifierType
  name: string
  upchargeCents: number
  enabled?: boolean
  sortOrder?: number
}) {
  const modifiers = loadLocalModifiers(input.organizationId)
  const normalizedName = normalizeName(input.name)
  const now = new Date().toISOString()
  const existing = modifiers.find(
    (modifier) =>
      modifier.type === input.type && modifier.normalizedName === normalizedName,
  )

  if (existing) {
    const updated = {
      ...existing,
      name: input.name.trim(),
      upchargeCents: input.upchargeCents,
      enabled: input.enabled ?? true,
      updatedAt: now,
    }
    saveLocalModifiers(
      input.organizationId,
      modifiers.map((modifier) =>
        modifier.id === updated.id ? updated : modifier,
      ),
    )
    return updated
  }

  const modifier: InventoryLiquorModifier = {
    id: makeLocalId(),
    organizationId: input.organizationId,
    type: input.type,
    name: input.name.trim(),
    normalizedName,
    upchargeCents: input.upchargeCents,
    enabled: input.enabled ?? true,
    sortOrder: input.sortOrder ?? getNextLocalSortOrder(modifiers, input.type),
    createdAt: now,
    updatedAt: now,
  }

  saveLocalModifiers(input.organizationId, [...modifiers, modifier])
  return modifier
}

function updateLocalModifier(input: {
  organizationId: string
  modifierId: string
  type?: InventoryLiquorModifierType
  name?: string
  upchargeCents?: number
  enabled?: boolean
  sortOrder?: number
}) {
  const modifiers = loadLocalModifiers(input.organizationId)
  const existing = modifiers.find((modifier) => modifier.id === input.modifierId)

  if (!existing) {
    throw new Error("Liquor Mod not found.")
  }

  const name = input.name?.trim() || existing.name
  const updated: InventoryLiquorModifier = {
    ...existing,
    type: input.type ?? existing.type,
    name,
    normalizedName: normalizeName(name),
    upchargeCents: input.upchargeCents ?? existing.upchargeCents,
    enabled: input.enabled ?? existing.enabled,
    sortOrder: input.sortOrder ?? existing.sortOrder,
    updatedAt: new Date().toISOString(),
  }

  saveLocalModifiers(
    input.organizationId,
    modifiers.map((modifier) =>
      modifier.id === input.modifierId ? updated : modifier,
    ),
  )

  return updated
}

function removeLocalModifier(input: {
  organizationId: string
  modifierId: string
}) {
  const modifiers = loadLocalModifiers(input.organizationId)
  saveLocalModifiers(
    input.organizationId,
    modifiers.filter((modifier) => modifier.id !== input.modifierId),
  )

  return true
}

function reorderLocalModifiers(input: {
  organizationId: string
  type: InventoryLiquorModifierType
  modifierIds: string[]
}) {
  const modifiers = loadLocalModifiers(input.organizationId)
  const order = new Map(input.modifierIds.map((id, index) => [id, index]))
  const updated = modifiers.map((modifier) =>
    modifier.type === input.type && order.has(modifier.id)
      ? {
          ...modifier,
          sortOrder: order.get(modifier.id) ?? modifier.sortOrder,
          updatedAt: new Date().toISOString(),
        }
      : modifier,
  )

  saveLocalModifiers(input.organizationId, updated)

  return updated
    .filter((modifier) => modifier.type === input.type)
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
    )
}

function getNextLocalSortOrder(
  modifiers: InventoryLiquorModifier[],
  type: InventoryLiquorModifierType,
) {
  const sameType = modifiers.filter((modifier) => modifier.type === type)
  if (!sameType.length) return 0

  return Math.max(...sameType.map((modifier) => modifier.sortOrder)) + 1
}

function localStorageKey(organizationId: string) {
  return `${LOCAL_STORAGE_PREFIX}${organizationId}`
}

function makeLocalId() {
  const randomUUID = window.crypto?.randomUUID?.()
  if (randomUUID) return `local-${randomUUID}`

  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function isLiquorModifier(value: unknown): value is InventoryLiquorModifier {
  if (!value || typeof value !== "object") return false
  const candidate = value as InventoryLiquorModifier

  return (
    typeof candidate.id === "string" &&
    typeof candidate.organizationId === "string" &&
    (candidate.type === "mixer" || candidate.type === "bar_prep") &&
    typeof candidate.name === "string" &&
    typeof candidate.normalizedName === "string" &&
    typeof candidate.upchargeCents === "number" &&
    typeof candidate.enabled === "boolean" &&
    typeof candidate.sortOrder === "number" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string"
  )
}
