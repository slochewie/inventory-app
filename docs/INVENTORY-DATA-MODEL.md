# Inventory Data Model

The authenticated Inventory application uses one global master catalog with organization-specific selections, pricing, and Toast export behavior.

The temporary unauthenticated routes at `/wip` and `/wip/toast-workbook` remain browser/session based and must not depend on this schema.

## Authorization

### inventoryAssignment

Organization-scoped application access.

- `id`
- `organizationId`
- `userId`
- `enabled`
- `role` — initially `viewer`, `staff`, `manager`, or `admin`
- `createdAt`
- `updatedAt`
- unique: `organizationId + userId`

System administrators retain implicit full access. Organization owners/admins may administer Inventory access. Inventory `admin` assignments may administer ordinary Inventory assignments.

## Organization configuration

### inventoryOrganizationConfig

Inventory and Toast behavior for one Better Auth organization/location.

- `id`
- `organizationId`
- `enabled`
- `happyHourEnabled`
- `happyHourStart` — nullable local wall-clock value
- `happyHourEnd` — nullable local wall-clock value
- `createdAt`
- `updatedAt`
- unique: `organizationId`

Real-world serving/package sizes belong in Inventory data. Toast's XLSX column labels are treated as fixed and are never renamed.

## Master catalog

### inventoryCategory

Canonical categories shared by every organization.

- `id`
- `name`
- `normalizedName`
- `toastCategory`
- `sortOrder`
- `active`
- `createdAt`
- `updatedAt`

### inventoryItem

Canonical product identity shared by every organization.

- `id`
- `categoryId`
- `name`
- `normalizedName`
- `active`
- `createdAt`
- `updatedAt`

Examples: Guinness, Coors Light, Jameson.

POS item numbers are deliberately not used as master identities because they are source/location specific.

### inventoryItemAlias

Known alternate names for a canonical item.

- `id`
- `inventoryItemId`
- `alias`
- `normalizedAlias`
- `createdAt`
- `updatedAt`

Examples for one item may include `COORS LT`, `Coors Lt.`, and `Coors Light`.

### inventoryItemVariant

A canonical sellable form of a master item.

- `id`
- `inventoryItemId`
- `kind` — examples: `standard`, `draft`, `can`, `bottle`, `pour`
- `sizeOz` — nullable
- `packageType` — nullable
- `name` — nullable variant label
- `defaultPriceCents` — nullable
- `active`
- `createdAt`
- `updatedAt`

Examples:

- Guinness / draft / 16 oz
- Guinness / draft / 20 oz
- Coors Light / can / 12 oz
- Coors Light / can / 24 oz

Items without meaningful variants receive one `standard` variant.

## Organization catalog

### inventoryOrganizationVariant

Defines which master variants an organization/location carries and any location-specific overrides.

- `id`
- `organizationId`
- `inventoryItemVariantId`
- `enabled`
- `exportToToast`
- `priceOverrideCents` — nullable; falls back to the variant default price
- `happyHourPriceCents` — nullable
- `toastNameOverride` — nullable
- `toastCategoryOverride` — nullable
- `toastDestinationOverride` — nullable
- `toastSlot` — nullable export mapping
- `createdAt`
- `updatedAt`
- unique: `organizationId + inventoryItemVariantId`

Effective regular price:

```text
organization priceOverrideCents
    ?? inventoryItemVariant.defaultPriceCents
```

The database stores actual serving/package truth. The Toast exporter maps that truth to Toast's fixed workbook:

- 10 oz draft -> existing 8 oz Toast slot
- 16 oz draft -> existing 16 oz Toast slot
- standard can -> existing Can slot
- 24 oz can -> existing Bottle slot
- bottle -> existing Bottle slot

Any differences are disclosed in the workbook Notes tab rather than by changing Toast headers.

## Import and reconciliation

### inventoryImport

One source import for one organization.

- `id`
- `organizationId`
- `sourceType` — `aloha-csv` or `toast-template`
- `sourceName`
- `importedByUserId`
- `status`
- `metadataJson`
- `createdAt`
- `updatedAt`

### inventorySourceItem

Persistent source-to-master mapping so the same normalization does not need to be repeated on every import.

- `id`
- `organizationId`
- `sourceType`
- `sourceKey` — stable required key generated from the source record
- `sourceItemId` — nullable original POS identifier
- `sourceName`
- `normalizedSourceName`
- `inventoryItemId` — nullable while awaiting reconciliation
- `inventoryItemVariantId` — nullable while awaiting reconciliation
- `lastImportId`
- `createdAt`
- `updatedAt`
- unique: `organizationId + sourceType + sourceKey`

Aloha/Toast imports from different locations can therefore converge on the same canonical item and variant while preserving each source system's original naming and identifiers.

## Ownership boundaries

Better Auth / Inventory plugin owns:

- Inventory application access
- organization context
- master catalog
- organization catalog selections and price overrides
- source reconciliation mappings

The Toast workbook remains an output format, not the data model.

The pristine repository workbook is never modified in place. Each export starts from a fresh copy and writes values only into existing cells.
