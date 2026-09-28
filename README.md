# Inventory App

NiteOwl Inventory is an authenticated, organization-aware menu catalog and Toast import/export application.

The current architecture uses Better Auth for session and organization context, persists Inventory data through the Auth service's Inventory API, maintains one shared master catalog with organization-specific variant state, imports Aloha CSV and populated Toast workbooks, and exports the selected organization's catalog into a fresh copy of Toast's Menu Template workbook.

See [docs/HOWTO.md](docs/HOWTO.md) for operator/development instructions and [docs/INVENTORY-DATA-MODEL.md](docs/INVENTORY-DATA-MODEL.md) for the persistent model.

## Current capabilities

- Better Auth sign-in and organization selection.
- Inventory roles: Viewer, Staff, Manager, and Admin.
- Shared canonical master items/categories with organization-specific availability, pricing, Happy Hour pricing, Toast-export state, display-name overrides, destinations, and Beer slot assignments.
- Manual Add Item workflow.
- Optional organization Menu Categories: Retail and Open Items. Beer, Cocktails, and NA Bev are built in.
- Aloha CSV import, normalization, review, persistence, history, and source reconciliation.
- Organization-scoped staging of populated Toast workbooks.
- Per-row staged review with explicit Update/Cancel/Ignore behavior.
- Pre-import master reconciliation: map to an existing master variant or explicitly create a new master item.
- Persistent Mapping Review with confirmed mappings.
- Duplicate master-item merge for Inventory Admins.
- Dedicated Organization Settings for Happy Hour and Beer Formats.
- Built-in Toast Beer format enable/disable controls: 8oz Draft, 16oz Draft, 24oz Draft, Pitcher, Can, and Bottle.
- Up to five custom Beer formats backed by Toast Optional Beer Category slots.
- Catalog bulk edit mode for availability, Toast export state, and reviewed bulk price changes.
- Toast XLSX/ZIP generation and validation.
- Toast export support for Beer, Liquor, Cocktails, NA Bev, Retail, Open Items, and Notes.
- Notes is always moved to the final worksheet position in generated workbooks.
- Disabled built-in Beer formats are hidden in the generated Beer worksheet while enabled custom formats are unhidden in their Optional Beer Category slots.

## Application routes

| Route | Purpose | Capability |
| --- | --- | --- |
| `/` | Organization Catalog | Viewer |
| `/manual-item` | Add Item | Manager/Admin edit capability |
| `/menu-categories` | Enable optional Retail/Open Items categories | Manager/Admin edit capability |
| `/organization-settings` | Happy Hour and Beer Formats | Manager/Admin |
| `/import-review` | New Import, History, Mapping Review | Role-gated by tab/action |
| `/toast-template-import` | Direct populated Toast workbook import compatibility workflow | Staff+ |
| `/toast-workbook` | Export to Toast plus organization-scoped Toast workbook staging/reconciliation | Staff+ |
| `/assignments` | Inventory access/roles | Admin |
| `/imports` | Standalone history compatibility view | Viewer |
| `/reconcile` | Standalone mapping-review compatibility view | Manager/Admin |
| `/wip` | Frozen legacy browser workflow | None |
| `/wip/toast-workbook` | Frozen legacy workbook workflow | None |

The authenticated routes are authoritative. The `/wip` routes are snapshots and should not be used as the architecture reference for new work.

## Roles

Permissions are scoped to the selected organization.

| Role | View | Import/export | Edit catalog/settings/mappings | Assignments / master merge |
| --- | ---: | ---: | ---: | ---: |
| Viewer | Yes | No | No | No |
| Staff | Yes | Yes | No | No |
| Manager | Yes | Yes | Yes | No |
| Admin | Yes | Yes | Yes | Yes |

The Auth service enforces permissions server-side in addition to UI gating.

## Catalog model

Inventory separates shared identity from location-specific state.

A shared master item such as `Guinness` or `Coors Original` can have canonical variants such as:

- Standard
- Can
- Bottle
- 10oz Draft
- 16oz Draft
- 24oz Can

Each organization independently controls whether a variant is carried, whether it exports to Toast, its local price and Happy Hour price, and optional Toast overrides.

The Catalog groups variants by shared master item. Canonical category changes affect the shared master item across organizations. Organization-specific edits affect only the selected organization.

### Current master-name limitation

The shared `inventoryItem.name` is not currently editable from the UI. The drawer can change canonical category, organization-specific variant names/settings, and merge duplicate master items, but renaming the shared master item itself still requires a future explicit master-name endpoint/UI.

## Catalog bulk edit

Bulk edit is off by default. When enabled, a checkbox column appears before the visible Catalog rows.

Current bulk actions:

- mark selected items **Available here**,
- mark selected items **Not carried here**,
- enable **Export to Toast**,
- disable **Export to Toast**,
- set a shared price for selected carried variants.

Bulk price changes are two-step: enter the new amount, review current → new prices for every affected carried variant, then explicitly save or cancel. Nothing changes from entering the amount alone.

The info icon beside Bulk edit opens a key explaining the actions. The help popover closes on outside click or Escape and positions itself above/below the icon according to available viewport space.

## Menu Categories

Beer, Cocktails, and NA Bev are built-in Add Item categories.

Organizations may optionally enable:

- **Retail**
- **Open Items**

Optional categories are organization-local UI/export routing choices. Removing one from Menu Categories does not rewrite existing catalog items.

Open Items supports blank prices. In Toast export it receives its own worksheet even when its rows have no price.

## Import and reconciliation

### Aloha

The normal Aloha workflow is `/import-review`:

1. parse and normalize the CSV,
2. review/edit staged rows,
3. persist approved rows,
4. record import history,
5. create/update source mappings,
6. use Mapping Review for ambiguous mappings.

### Toast workbook staging

`/toast-workbook` can stage a populated Toast workbook without immediately writing it to Inventory.

Staging state is keyed by organization. Switching organizations restores each organization's own staged workbook instead of sharing one browser-global staging session.

During staging:

- visible business sheets are parsed,
- helper/generated sheets are ignored,
- row edits require explicit **Update**,
- **Cancel/Close** does not autosave row edits,
- rows can be **Ignored**,
- reviewed rows are normalized before persistence.

Before persistence, ready rows must be reconciled to the master catalog: select an existing master variant or explicitly choose **Create new master item**. Explicit reconciliation is transactional and records confirmed source mappings.

## Organization Settings

Organization Settings has two main sections.

### Happy Hour

The organization stores Time Range 1 plus an optional Time Range 2, each with selected days and start/end times. Toast export writes the configured schedule into Notes and validates it before download.

### Beer Formats

Built-in Toast formats are fixed workbook structures and can be enabled/disabled per organization:

- 8oz Draft
- 16oz Draft
- 24oz Draft
- Pitcher
- Can
- Bottle

Disabled built-in formats are removed from relevant Beer dropdown choices and hidden in the generated Beer worksheet.

Custom organization formats use up to five Toast Optional Beer Category slots. Each has an enabled state and label/import mapping. The configured order maps to the hidden Optional Beer Category slot order. Custom formats do not remap into unrelated built-in Toast sizes.

Optional Beer Category 1 is still backed internally by the legacy Auth columns `tallBoyCanEnabled` / `tallBoyCanLabel`, but the frontend/API treats it generically as Optional Beer Category 1.

## Toast workbook export

The pristine source workbook is mounted read-only at:

```text
toast/menu/Toast-Menu-Template-Your-Restaurant-Name.xlsx
```

Every export starts from a fresh in-memory copy.

The exporter currently handles and validates:

- Beer
- Liquor
- Cocktails
- NA Bev
- Retail
- Open Items
- Happy Hour values
- Notes schedule
- Optional Beer Category slots

Retail and Open Items are generated by cloning the pristine NA Bev worksheet when exportable rows exist, preserving the source formatting/layout and renaming the clone.

Canonical category routing is authoritative. For example, NA Bev rows do not also fall through into Retail because of stale Toast destination metadata, and canonical Scotch routes to the Scotch liquor section rather than an old organization-level Whiskey destination.

The **Notes** worksheet is always moved to the final workbook-tab position after all dynamic worksheet creation.

### Beer worksheet visibility

Workbook columns are not deleted or structurally moved.

Instead:

- disabled built-in Beer formats are marked hidden,
- enabled built-in formats stay visible,
- when no built-in draft format is enabled the shared Draft Beer name column is hidden,
- enabled Optional Beer Category groups are unhidden and relabeled,
- disabled groups remain hidden.

This preserves Toast's workbook structure while tailoring the visible sheet to the organization.

## Repository layout

```text
inventory-app/
├── app/
│   └── src/
│       ├── components/
│       ├── features/
│       │   ├── import-review/
│       │   └── menu-import/
│       ├── lib/
│       └── routes/
├── bash-scripts/
├── docs/
│   ├── HOWTO.md
│   └── INVENTORY-DATA-MODEL.md
├── toast/
│   └── menu/
├── Dockerfile
└── docker-compose.yml
```

## Development

Stack:

- Node.js 26
- TanStack Start / TanStack Router
- React 19
- Vite 8
- TypeScript 6
- Better Auth
- Tailwind/shadcn + shared `@niteowl/ui`
- shared `@niteowl/app-config`
- Docker Compose

Expected sibling repositories:

```text
~/docker/
├── inventory-app/
├── niteowl-ui/
└── niteowl-app-config/
```

The external `niteowl-dev` network must exist.

Start/rebuild:

```bash
cd ~/docker/inventory-app
docker compose up -d --build
```

Useful checks:

```bash
docker compose logs -f inventory-app
docker compose exec inventory-app npm install
docker compose exec inventory-app npm run generate-routes
docker compose exec inventory-app npm run build
```

The app listens on container port 3000 and host port 3350.

## Auth service dependency

The frontend does not connect to Postgres directly. Persistent Inventory operations go through the Auth service Inventory plugin.

Current API responsibilities include:

- access/assignments,
- catalog reads,
- single/bulk organization-variant updates,
- organization config,
- manual/automatic imports,
- explicit reconciliation,
- import history,
- source mappings and mapping confirmation,
- master-item category updates,
- master-item merge,
- creation/reuse of an organization Beer variant from an enabled format.

Schema changes belong in the Auth repository and use its Better Auth migration workflow.

## CLI normalization pipeline

The older Aloha normalization CLI remains available under `bash-scripts/`.

```bash
bash ./bash-scripts/test-all.sh
```

See `bash-scripts/README.md` for CLI-only behavior.

## Status

The persistent authenticated architecture is active. Current work is centered on improving shared master-catalog management, organization-specific editing, reconciliation, mobile/tablet UX, and complete Toast workbook generation without mutating the pristine template in place.
