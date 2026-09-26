# Inventory App

NiteOwl Inventory is an authenticated, organization-aware menu catalog and point-of-sale import/export application.

The current application uses Better Auth for session and organization context, persists Inventory data through the Auth service's Inventory API, imports menu data from Aloha CSV or populated Toast workbooks, maintains a shared master catalog with organization-specific variants/settings, and exports the selected organization's current catalog into a fresh copy of Toast's Menu Template workbook.

See [docs/HOWTO.md](docs/HOWTO.md) for the operator and development workflow.

## Current capabilities

- Better Auth sign-in, organization selection, account switching, and per-organization Inventory access.
- Inventory application roles: Viewer, Staff, Manager, and Admin.
- Persistent shared master item catalog with organization-specific availability, pricing, Happy Hour pricing/schedule, Toast-export state, and display-name overrides.
- Aloha menu-price CSV import and normalization.
- Import review before persistence.
- Persistent import history and conflict reporting.
- Persistent source mappings for Aloha and Toast imports.
- Mapping review/reconciliation for managers and admins.
- Import already populated Toast Menu Template workbooks.
- Merge duplicate master catalog items while preserving/moving variants.
- Restrict master-item merge controls to Inventory Admins.
- Export the current organization's persistent catalog to Toast.
- Generate populated Toast XLSX or ZIP packages from the repository's pristine Toast template.
- Populate and validate the Toast Notes-tab Happy Hour schedule by organization-selected days and time window.
- Preserve Toast's fixed workbook headers and structure.
- Separate organization availability from the `Export to Toast` setting.
- Use canonical Inventory categories for Toast export and workbook summaries.
- Retain the older reusable Aloha → Toast CLI normalization pipeline.

## Application routes

| Route | Purpose | Minimum Inventory capability |
| --- | --- | --- |
| `/` | Persistent organization Catalog | Viewer |
| `/import-review` | Consolidated New Import, History, and Mapping Review workspace | Viewer; import/edit tabs are role-gated |
| `/toast-template-import` | Import a populated Toast workbook and save it to Inventory | Staff |
| `/toast-workbook` | Export the selected organization's persistent catalog to Toast | Staff |
| `/assignments` | Enable Inventory access and assign Inventory roles | Admin |
| `/imports` | Standalone import-history view retained for compatibility | Viewer |
| `/reconcile` | Standalone mapping-review view retained for compatibility | Manager |
| `/wip` | Frozen unauthenticated legacy Menu Items workflow | None |
| `/wip/toast-workbook` | Frozen unauthenticated legacy Toast workbook workflow | None |

The authenticated routes are now the primary application. The `/wip` routes are legacy snapshots and should not be used as the architecture reference for new features.

## Inventory roles

Inventory permissions are scoped to the selected organization.

| Role | View catalog/history | Import / export | Edit catalog / mappings | Manage assignments / merge master items |
| --- | ---: | ---: | ---: | ---: |
| Viewer | Yes | No | No | No |
| Staff | Yes | Yes | No | No |
| Manager | Yes | Yes | Yes | No |
| Admin | Yes | Yes | Yes | Yes |

The UI hides or blocks routes/actions that the current Inventory role cannot use. Access is also verified against the Auth service for the selected organization.

## Data model

The catalog separates shared product identity from organization-specific state.

A master Inventory item can have one or more variants, such as:

- 10oz Draft
- 16oz Draft
- standard Can
- 24oz Can
- Bottle
- Standard

Each organization can independently control variant state including:

- whether the organization carries it,
- whether it exports to Toast,
- price override,
- Happy Hour price,
- Toast name override,
- Toast category/destination overrides.

This is why **Available here** and **Export to Toast** are separate controls.

## Import workflow

The primary Aloha import workflow lives at `/import-review`.

A new import:

1. reads the Aloha menu-price CSV,
2. normalizes the source rows,
3. detects base/Happy Hour pricing and review conditions,
4. lets the operator include/exclude or edit rows,
5. saves approved rows to the persistent Inventory catalog,
6. records an import-history entry, and
7. creates/updates source mappings used for subsequent reconciliation.

The same workspace also exposes **History** and, for Managers/Admins, **Mapping review**.

Populated Toast workbooks can be imported at `/toast-template-import` and persisted through the same Inventory import API.

## Catalog workflow

The root route `/` is the persistent Catalog.

Catalog rows are grouped by master item and show their variants. Operators can filter by canonical Toast category and by organization availability.

Managers/Admins can edit organization-specific state. Admins can additionally merge duplicate master items into a selected target master item.

Catalog naming supports a shared master name plus organization-specific Toast/display-name overrides.

## Toast export

The normal `/toast-workbook` workflow loads the selected organization's persistent Inventory catalog automatically.

Advanced source overrides still allow an older review CSV or raw Aloha CSV for testing/restoration, but persistent Inventory is the default source.

Each export starts from the pristine workbook mounted read-only at:

```text
toast/menu/Toast-Menu-Template-Your-Restaurant-Name.xlsx
```

The app can download:

- a populated `.xlsx` for inspection, or
- a `.zip` containing the same populated workbook for sending to Toast.

Generated filenames use the organization/store name when available and include a Pacific-time timestamp. Downloads are staged briefly through a same-origin server route so iOS browsers receive a real attachment response with the intended filename; the staged file remains available long enough for browsers that issue a preview request before the actual download.

### Happy Hour workbook behavior

Organization settings store whether Happy Hour is enabled, one start/end time window, and the selected days of the week. When enabled, the exporter writes that schedule into the Toast **Notes** tab using Time Range 1 for the selected days only. Unselected days remain blank.

Time Range 2 is intentionally left blank. The exporter validates the Notes schedule before allowing download, alongside Beer/Liquor workbook values.

### Beer workbook behavior

Toast's workbook structure is treated as fixed: the exporter uses the template's existing rows/columns rather than inserting custom Beer columns.

Current beer mapping includes:

- organization-configured draft sizes → selected existing Toast draft slots
- standard can → existing Can slot
- Tall Boy / oversized can → first existing **Optional Beer Category** slot when Tall Boy Can is enabled
- bottle → existing Bottle slot

When Tall Boy Can is enabled for the organization, the exporter unhides the first Optional Beer Category, renames its package header cell (P14) to the configured organization label, and writes Tall Boy names, prices, and Happy Hour prices into that slot. It does not route those items into Bottle.

Standard cans, Tall Boy cans, and bottles remain separate Inventory variants/source items. The optional category reuse is structural: it repurposes Toast's existing optional Beer slot without adding columns to the workbook.

Actual serving/package size remains Inventory data. Organization draft mappings and the Tall Boy label allow the workbook presentation to reflect the venue's configured formats while preserving Toast's template structure.

## Repository layout

```text
inventory-app/
├── app/
│   └── src/
│       ├── components/          # authenticated shell + local UI
│       ├── features/
│       │   ├── import-review/   # history and mapping/reconciliation panels
│       │   └── menu-import/     # normalization, catalog adapters, Toast import/export
│       ├── lib/                 # Better Auth + Inventory API clients
│       └── routes/
├── bash-scripts/                # earlier/reusable Aloha → Toast CLI pipeline
├── docs/
│   └── HOWTO.md
├── toast/
│   └── menu/                    # pristine Toast workbook source
├── Dockerfile
└── docker-compose.yml
```

## Development stack

- Node.js 26
- TanStack Start / TanStack Router
- React 19
- Vite 8
- TypeScript 6
- Better Auth client
- Tailwind CSS / shadcn UI
- shared `@niteowl/ui` and `@niteowl/app-config` packages
- Docker Compose

## Local development

The Compose file expects the shared NiteOwl repositories beside this repository:

```text
~/docker/
├── inventory-app/
├── niteowl-ui/
└── niteowl-app-config/
```

The `niteowl-dev` Docker network must already exist.

The service now starts the TanStack/Vite development server automatically:

```bash
cd ~/docker/inventory-app
docker compose up -d --build
```

The previous `sleep infinity` command remains commented in `docker-compose.yml` so it can be restored temporarily if an interactive-only container is needed.

The app listens on container port 3000 and is exposed on host port 3350.

Useful commands:

```bash
# Follow app output
docker compose logs -f inventory-app

# Install/update dependencies
docker compose exec inventory-app npm install

# Generate TanStack routes
docker compose exec inventory-app npm run generate-routes

# Production build check
docker compose exec inventory-app npm run build
```

## Auth service dependency

The Inventory frontend does not own the persistent database directly. It uses authenticated endpoints exposed by the NiteOwl Auth service, including access, catalog, imports, mappings, assignments, organization-variant updates, and master-item merge operations.

Requests use the current Better Auth session and selected organization.

## CSV safety

Root-level CSV files are ignored by Git. Local Aloha exports and generated CSVs can therefore live in the repository working directory without accidentally committing venue menu data.

Generated CLI output under `output/` is also ignored.

## CLI normalization pipeline

The older command-line pipeline is documented in [bash-scripts/README.md](bash-scripts/README.md).

Run its tests with:

```bash
bash ./bash-scripts/test-all.sh
```

## Frozen WIP routes

`/wip` and `/wip/toast-workbook` are intentionally unauthenticated frozen snapshots of the earlier browser workflow.

Do not add Better Auth or persistent Inventory dependencies to those routes. New application work should target the authenticated Catalog / Import & Review / Export to Toast architecture instead.

## Status

The persistent authenticated Inventory architecture is active. Current work supports catalog management, organization-specific variants, Aloha and Toast imports, history/reconciliation, assignments, master-item merging, and Beer/Liquor Toast workbook export.

Additional Toast workbook tabs and broader inventory-management workflows can continue to build on the persistent master-item/variant model.
