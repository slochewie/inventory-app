# Inventory Data Model

The authenticated Inventory application uses one shared master catalog with organization-specific availability, pricing, Toast behavior, and source reconciliation.

The frontend does not connect to Postgres directly. Persistent data is owned by the Auth service Inventory plugin.

## Authorization

### inventoryAssignment

Organization-scoped Inventory access.

- `id`
- `organizationId`
- `userId`
- `enabled`
- `role` — `viewer`, `staff`, `manager`, or `admin`
- `createdAt`
- `updatedAt`
- unique: `organizationId + userId`

Inventory permissions are checked against the selected organization. System administrators retain implicit full access.

## Organization configuration

### inventoryOrganizationConfig

Organization-level Inventory/Toast settings.

Core fields:

- `id`
- `organizationId`
- `enabled`
- `createdAt`
- `updatedAt`
- unique: `organizationId`

Happy Hour fields:

- `happyHourEnabled`
- `happyHourStart`
- `happyHourEnd`
- `happyHourDays`
- `happyHourRange2Enabled`
- `happyHourRange2Start`
- `happyHourRange2End`
- `happyHourRange2Days`

The API exposes day selections as arrays of `mon..sun`; the database stores the persisted representation used by the Auth plugin.

Built-in Beer format fields:

- `draft8Enabled`
- `draft8ActualSizeOz`
- `draft16Enabled`
- `draft16ActualSizeOz`
- `draft24Enabled`
- `draft24ActualSizeOz`
- `pitcherEnabled`
- `pitcherActualSizeOz`
- `canEnabled`
- `bottleEnabled`

Custom Beer format fields exposed by the API:

- `optionalBeerCategory1Enabled`
- `optionalBeerCategory1Label`
- `optionalBeerCategory2Enabled`
- `optionalBeerCategory2Label`
- `optionalBeerCategory3Enabled`
- `optionalBeerCategory3Label`
- `optionalBeerCategory4Enabled`
- `optionalBeerCategory4Label`
- `optionalBeerCategory5Enabled`
- `optionalBeerCategory5Label`

Optional Beer Category 1 is still stored internally in legacy columns:

- `tallBoyCanEnabled`
- `tallBoyCanLabel`

The frontend/API treat that slot generically; it is not semantically hardcoded to Tall Boy.

## Master catalog

### inventoryCategory

Canonical shared category.

- `id`
- `name`
- `normalizedName`
- `toastCategory`
- `sortOrder`
- `active`
- `createdAt`
- `updatedAt`

Canonical category is shared across organizations and is authoritative for workbook routing.

### inventoryItem

Canonical shared product identity.

- `id`
- `categoryId`
- `name`
- `normalizedName`
- `active`
- `createdAt`
- `updatedAt`

Examples: Guinness, Coors Original, Jameson.

The shared master name is currently not editable from the Inventory UI. Canonical category can be changed, and duplicate master items can be merged.

### inventoryItemAlias

Known alternate names for a master item.

- `id`
- `inventoryItemId`
- `alias`
- `normalizedAlias`
- `createdAt`
- `updatedAt`

Aliases support matching/reconciliation without replacing the canonical item identity.

### inventoryItemVariant

Canonical sellable form of a master item.

- `id`
- `inventoryItemId`
- `kind` — examples: `standard`, `draft`, `can`, `bottle`, `pour`
- `sizeOz` — nullable
- `packageType` — nullable
- `name` — nullable canonical variant label
- `defaultPriceCents` — nullable
- `active`
- `createdAt`
- `updatedAt`

Examples:

- Guinness / draft / 16oz
- Guinness / can
- PBR / can / 24oz
- Johnny Walker Black / standard

A master item can have variants that are used by different organizations without every organization carrying every variant.

## Liquor modifier catalog

Liquor modifiers follow the same shared-master / organization-variant separation used elsewhere in Inventory.

### inventoryLiquorModifier

Canonical shared Mixer or Bar Prep modifier.

- `id`
- `type` — `mixer` or `bar_prep`
- `name`
- `normalizedName`
- `active`
- `createdAt`
- `updatedAt`
- unique: `type + normalizedName`

Mixer and Bar Prep masters remain global catalog records, but they are created/reused through the single `/liquor-mods` workflow rather than separate master-management pages.

### inventoryOrganizationLiquorModifier

Joins one organization to one shared Liquor Mod master.

- `id`
- `organizationId`
- `inventoryLiquorModifierId`
- `enabled`
- `exportToToast`
- `nameOverride` — nullable organization-specific display/export name
- `upchargeCents`
- `sortOrder`
- `createdAt`
- `updatedAt`
- unique: `organizationId + inventoryLiquorModifierId`

The `/liquor-mods` page follows the Cocktails flow: the user chooses a Placement of Mixers or Bar Prep, enters a name, reuses a matching active master when appropriate, or creates a new master through the same add flow. The resulting organization variant stores the local upcharge, availability, export state, ordering, and optional name override.

Important separation:

- master `active` controls whether a canonical Mixer/Bar Prep entry may be newly assigned,
- organization `enabled` means **Available here**,
- organization `exportToToast` controls Toast export independently,
- `nameOverride` changes only the selected organization's name and never renames the master.

## Organization catalog

### inventoryOrganizationVariant

Joins one organization to one shared master variant.

- `id`
- `organizationId`
- `inventoryItemVariantId`
- `enabled`
- `exportToToast`
- `priceOverrideCents` — nullable
- `happyHourPriceCents` — nullable
- `toastNameOverride` — nullable
- `toastCategoryOverride` — nullable
- `toastDestinationOverride` — nullable
- `toastSlot` — nullable
- `createdAt`
- `updatedAt`
- unique: `organizationId + inventoryItemVariantId`

Effective regular price:

```text
organization priceOverrideCents
    ?? inventoryItemVariant.defaultPriceCents
```

Important separation:

- `enabled` means **Available here**.
- `exportToToast` means include the carried variant in Toast export.

These are intentionally independent.

### toastSlot

For custom Beer formats, `toastSlot` identifies a stable Optional Beer Category assignment, for example:

- `optional-beer-1`
- `optional-beer-2`
- `optional-beer-3`
- `optional-beer-4`
- `optional-beer-5`

The stable key is independent from the human-visible label.

## Beer format model

Built-in Toast Beer formats are fixed structural slots and are exact-match choices at the organization layer.

Custom draft/package formats do not get coerced into an unrelated built-in format. They use an enabled Optional Beer Category slot.

The exporter preserves Toast's workbook structure by changing visibility, not by deleting/reordering fixed Beer columns:

- disabled built-in format columns are hidden,
- enabled built-in columns remain visible,
- the Draft Beer name column is hidden when no built-in draft format is enabled,
- enabled Optional Beer Category groups are unhidden/relabelled,
- disabled Optional Beer Category groups stay hidden.

This corrects the older model where custom real-world sizes were described as being remapped into built-in Toast sizes.

## Import history

### inventoryImport

One persisted source import for one organization.

- `id`
- `organizationId`
- `sourceType` — `aloha-csv` or `toast-template`
- `sourceName`
- `importedByUserId`
- `status`
- `metadataJson`
- `createdAt`
- `updatedAt`

Toast workbook staging itself is browser-side review state until an explicit persist/import action occurs.

## Source reconciliation

### inventorySourceItem

Persistent organization/source → master mapping.

- `id`
- `organizationId`
- `sourceType`
- `sourceKey`
- `sourceItemId` — nullable source POS identifier
- `sourceName`
- `normalizedSourceName`
- `inventoryItemId` — nullable while unresolved
- `inventoryItemVariantId` — nullable while unresolved
- `lastImportId`
- `mappingConfirmed` — boolean, default false
- `createdAt`
- `updatedAt`
- unique: `organizationId + sourceType + sourceKey`
