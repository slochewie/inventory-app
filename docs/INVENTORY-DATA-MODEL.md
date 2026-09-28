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

`mappingConfirmed` distinguishes a mapping that has been explicitly reviewed/accepted from an automatically inferred mapping that may still need review.

Aloha and Toast source rows from different organizations can map to the same shared master item/variant while retaining organization/source-specific identifiers.

## Explicit reconciliation

The import endpoint supports:

- `reconciliationMode: "automatic"`
- `reconciliationMode: "explicit"`

In explicit mode, every included item must choose exactly one:

- `targetVariantId`, or
- `createNewMaster: true`

Supplying both, or neither, is rejected.

This is used by the post-staging master mapping review so a reviewed source row cannot be silently reconciled to a merely similar product.

## Bulk organization updates

The Inventory API supports updating multiple organization variants in one request.

Supported fields include:

- `enabled`
- `exportToToast`
- `priceOverrideCents`
- `happyHourPriceCents`
- organization Toast routing overrides

The Catalog bulk UI currently uses this for availability, Toast export state, and bulk price changes.

## Master-item category and merge operations

The API supports:

- updating a shared master item's `categoryId`,
- merging one shared master item into another.

Merge reconciles/moves variants and source mappings under the target master identity.

These are shared/global catalog operations, not organization-local edits.

## Optional Menu Categories

Retail and Open Items are currently organization-local frontend configuration rather than first-class persistent Auth tables.

They control Add Item choices and workbook routing for the organization.

Built-in choices:

- Beer
- Cocktails
- NA Bev

Optional choices:

- Retail
- Open Items

Open Items is allowed to export with a null/blank price.

## Toast workbook ownership boundary

The Toast workbook is an output format, not the persistent data model.

The pristine template is never modified in place.

Each export:

1. loads a fresh template copy,
2. writes the selected organization's catalog,
3. creates Retail/Open Items clones when needed,
4. adjusts Beer column visibility,
5. writes Notes/Happy Hour schedule,
6. moves Notes to the final tab,
7. validates generated values/visibility,
8. stages the final XLSX/ZIP briefly for same-origin browser download.

The generated file is disposable output; persistent truth remains in Inventory/Auth.
