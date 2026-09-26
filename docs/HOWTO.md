# Inventory App How-To

This guide documents the current authenticated Inventory workflow.

The primary operating model is now:

```text
source menu
   ↓
Import & Review
   ↓
persistent shared Inventory catalog
   ↓
organization availability / prices / Toast settings
   ↓
Export to Toast
```

The old browser-only review-session workflow still exists in frozen/advanced paths, but it is no longer the normal source of truth.

## 1. Sign in and select an organization

Open Inventory and sign in through the NiteOwl Better Auth service.

The authenticated shell shows only organizations for which your account has Inventory access. Use the organization selector in the header to switch locations.

Inventory permissions are organization-specific.

### Role summary

| Role | Main abilities |
| --- | --- |
| Viewer | View Catalog and import history |
| Staff | Viewer abilities + import and export |
| Manager | Staff abilities + edit Catalog and source mappings |
| Admin | Manager abilities + manage Assignments and merge master items |

If a route requires a capability your current role does not have, Inventory blocks the route and displays an access message.

## 2. Import an Aloha menu

Open:

```text
/import-review
```

The **New import** tab is available to Staff, Manager, and Admin roles.

Choose the Aloha menu-price CSV.

Nothing is written to persistent Inventory just by selecting the file.

The app will:

1. parse the Aloha report,
2. remove/ignore structural report noise,
3. normalize menu items and variants,
4. detect base and Happy Hour pricing,
5. classify Toast category/destination data,
6. flag rows that need review, and
7. stage the resulting rows for approval.

## 3. Review the staged import

The review table supports these main filters:

- **Needs review**
- **Included**
- **Excluded**
- **All**

Search can match item name, Aloha item number, source category, Toast category, and notes.

For an individual staged row you can review/edit:

- item name,
- Toast category,
- Toast destination,
- base price,
- Happy Hour price,
- whether the row is included in the import.

Rows excluded here are not persisted as included import rows.

When review is complete, choose **Save to Inventory**.

The save operation creates or updates persistent Inventory items/variants and records source mappings for the selected organization.

## 4. Review import history

In `/import-review`, open the **History** tab.

History records saved imports including:

- source type,
- source filename,
- importing user,
- item count,
- variant count,
- conflict count,
- recorded conflicts,
- timestamps/status.

The older `/imports` route exposes the same history panel as a standalone compatibility view.

## 5. Review source mappings

Managers and Admins can open the **Mapping review** tab in `/import-review`.

Source mappings connect an external source row/key to a persistent Inventory master item/variant. They are used so repeated imports can reconcile against the same Inventory identity instead of creating unnecessary duplicates.

Use Mapping review for unmapped rows or mappings that need to be redirected to a different Inventory variant.

The older `/reconcile` route exposes the same reconciliation panel as a standalone compatibility view.

## 6. Import a populated Toast workbook

For a location already using Toast, open:

```text
/toast-template-import
```

Choose the populated Toast Menu Template `.xlsx`.

The importer currently reads common menu tabs including:

- Beer
- Liquor
- Wine
- Cocktails
- NA Bev
- Retail

Retail rows can also be recovered from NA Bev when the row Group is Retail.

After parsing, choose **Save to Inventory** to persist the detected items/variants for the selected organization.

The page can also download `toast-export-review.csv` as a portable legacy/diagnostic snapshot, but the persistent Inventory catalog is the normal source of truth after saving.

## 7. Work with the Catalog

Open:

```text
/
```

The Catalog is the main Inventory page.

It loads the selected organization's persistent catalog from the Inventory API and groups variants under their master Inventory item.

You can:

- search items,
- filter by canonical Toast category,
- filter by availability:
  - **Carried here**
  - **Not carried here**
  - **All master items**
- open an item drawer to inspect its variants.

### Available here vs Export to Toast

These are intentionally different controls.

**Available here** means this organization carries the variant.

**Export to Toast** means the carried variant should be included when generating this organization's Toast workbook.

A variant must be available here before it can be exported to Toast.

### Organization-specific edits

Managers and Admins can edit organization-specific variant state such as:

- displayed/Toast name override,
- availability,
- Export to Toast,
- price override,
- Happy Hour price.

They can also manage organization-level **Happy Hour** settings from the Catalog page:

- enable/disable Happy Hour,
- select the days of the week it applies,
- set one start time,
- set one end time.

Changes use explicit **Update** / **Cancel** controls and persist through the Inventory organization-config API.

The shared master item name remains separate from an organization's name override.

## 8. Merge duplicate master items

Inventory Admins can merge duplicate master Catalog items from the Catalog drawer.

Choose the incorrect/source master item, select the intended target master item, and run the merge.

The merge workflow moves or combines variants under the target master identity instead of leaving two duplicate master products.

Because this changes shared master Inventory identity, merge controls are Admin-only.

## 9. Manage Inventory access

Inventory Admins can open:

```text
/assignments
```

The Assignments page lists organization members and lets authorized admins:

- enable or disable Inventory access,
- assign Viewer, Staff, Manager, or Admin role.

The selected organization in the header determines which assignments are being managed.

## 10. Export the current organization to Toast

Open:

```text
/toast-workbook
```

This route requires Staff, Manager, or Admin access.

The normal source is now the selected organization's **persistent Inventory catalog**. You do not need to upload the earlier review CSV for a normal export.

Inventory automatically loads:

```text
toast/menu/Toast-Menu-Template-Your-Restaurant-Name.xlsx
```

from the repository's read-only Toast template mount.

Each export begins from a fresh in-memory copy of that pristine workbook.

### Advanced source override

The Export to Toast page still contains an **Advanced source override** section.

Use it only when testing or recovering older data. It can temporarily source the export from:

- `toast-export-review.csv`, or
- a raw Aloha CSV.

These overrides are session-level alternatives to the normal persistent Catalog source.

## 11. Download the Toast package

The export page provides:

- **Download populated XLSX**
- **Download ZIP for Toast**

The ZIP contains the same populated workbook packaged for delivery to the Toast representative.

Generated filenames use the store/organization name when available and include a Pacific-time timestamp.

For browser compatibility, the generated XLSX/ZIP is staged briefly on the Inventory server and then downloaded through a same-origin attachment response. This preserves the intended filename on iOS browsers, including Firefox on iOS, and tolerates the extra preview request some iOS download flows make before the final save.

The current writer populates Beer and Liquor tabs.

## 12. Happy Hour schedule in the Toast Notes tab

When Happy Hour is enabled for the selected organization, the exporter writes the organization schedule into the Toast workbook's **Notes** tab.

Current behavior:

- Monday through Sunday can be selected independently.
- The same organization start/end time is used for each selected day.
- Selected days are written into **Time Range 1**.
- Unselected days are left blank.
- **Time Range 2** is intentionally left blank.
- If Happy Hour is disabled, both ranges are left blank.
- Workbook validation checks that the Notes schedule matches the organization settings before download.

The Export to Toast page also displays the selected days and time window so the schedule can be reviewed before generating the workbook.

## 13. Understand Beer variants and Toast's workbook structure

Inventory stores the actual product/serving format as variant data.

Examples:

- 10oz Draft
- 16oz Draft
- standard Can
- 24oz Can / Tall Boy
- Bottle

Toast's supplied workbook structure remains the source template. Inventory does not add custom Beer columns; it maps organization formats into existing Toast slots.

Current mapping:

| Inventory variant | Toast workbook slot |
| --- | --- |
| organization-configured draft size | configured existing Toast draft slot |
| standard Can | existing Can slot |
| Tall Boy / oversized can | first existing Optional Beer Category slot when enabled |
| Bottle | existing Bottle slot |

The organization settings control whether the Tall Boy Can slot is enabled and what label it uses. When enabled, export:

1. unhides the first Optional Beer Category,
2. renames its package header cell (P14) to the configured organization label,
3. writes Tall Boy names into that optional section, and
4. writes its normal and Happy Hour prices into the paired price cells.

Tall Boy cans are not written into Bottle when this feature is enabled. Bottles continue using the Bottle section.

A standard can, Tall Boy can, and bottle remain separate Inventory variants/items even when their cleaned names are similar. Reusing the existing Optional Beer Category preserves Toast's workbook structure while giving the venue a dedicated Tall Boy package slot.

## 14. Canonical categories

The persistent Catalog carries canonical category information shared with Toast export.

Toast export and the Toast workbook summary use the canonical Inventory category rather than relying only on old source text.

This matters especially after repeated imports, source reconciliation, and organization-specific overrides, because the persistent catalog—not the original CSV label—is the source of truth.

## Development workflow

### Start/rebuild

From the repository root:

```bash
cd ~/docker/inventory-app
docker compose up -d --build
```

The Compose service currently starts the TanStack/Vite app automatically.

The old interactive-only command is intentionally retained as a commented block in `docker-compose.yml`:

```yaml
# command:
#   - sleep
#   - infinity
```

You can temporarily switch back to that mode when needed, but normal development should use the active `npm run dev` command.

### App address

The dev server runs on container port 3000 and is exposed on:

```text
http://localhost:3350
```

### Follow logs

```bash
docker compose logs -f inventory-app
```

### Install/update dependencies

```bash
docker compose exec inventory-app npm install
```

### Generate routes

```bash
docker compose exec inventory-app npm run generate-routes
```

`app/src/routeTree.gen.ts` is generated and ignored by Git.

### Build check

```bash
docker compose exec inventory-app npm run build
```

Run a build after changes to routes, auth integration, shared packages, import logic, catalog behavior, or workbook generation.

## Shared repository mounts

The Compose setup expects:

```text
~/docker/
├── inventory-app/
├── niteowl-ui/
└── niteowl-app-config/
```

These are mounted into the app so Inventory uses the shared NiteOwl UI and navigation/app configuration packages.

The Toast source directory is mounted read-only:

```text
./toast → /app/public/toast:ro
```

## Auth / Inventory API dependency

Persistent Inventory storage is exposed through the Auth service rather than implemented as a database connection in this frontend.

The Inventory client currently uses authenticated endpoints for operations including:

- access checks,
- assignments,
- catalog reads,
- imports,
- import history,
- source mappings,
- organization-variant updates,
- master-item merges.

All requests use the current Better Auth session and organization context.

## CLI pipeline

The repository still contains the earlier Node/bash Aloha normalization pipeline.

Run its tests:

```bash
bash ./bash-scripts/test-all.sh
```

Normalize an Aloha file for review:

```bash
bash ./bash-scripts/normalize-aloha-for-review.sh \
  "McCarthy's Pub Menu Items.csv" \
  ./output
```

See `bash-scripts/README.md` for the CLI-specific outputs and normalization details.

## Troubleshooting

### I cannot see an organization

Inventory only displays organizations for which your signed-in account passes the Inventory access check.

Confirm the organization membership and Inventory assignment in the Auth service / Inventory Assignments page.

### I can see Inventory but cannot import/export

A Viewer can browse but cannot import/export. Staff or higher is required.

### I can import but cannot edit Catalog mappings

Catalog/mapping edits require Manager or Admin.

### I cannot see Assignments or merge items

Those operations require Inventory Admin.

### A Catalog item does not export to Toast

Check both organization controls:

1. **Available here** must be enabled.
2. **Export to Toast** must be enabled.

Also verify the variant is active and has a valid Toast category/destination for its export path.

### A Tall Boy / oversized can does not appear where expected

Verify the item is classified as an oversized can and that the organization's **Tall Boy Can** setting is enabled.

When enabled, the writer uses the first existing Optional Beer Category, unhides it, and applies the configured organization label to P14. Tall Boy cans should not appear in Bottle.

### An import creates or maps to the wrong product

Review the **Mapping review** workspace. Persistent source mappings determine which master item/variant repeated source rows reconcile to.

### I need to recover an older browser review file

Use the **Advanced source override** section on `/toast-workbook` and upload `toast-export-review.csv`.

For normal ongoing use, save imports to persistent Inventory and export from the Catalog instead.

### The app cannot resolve @niteowl packages

Confirm these sibling directories exist:

```text
../niteowl-ui
../niteowl-app-config
```

### Docker says niteowl-dev does not exist

Create the external network once:

```bash
docker network create niteowl-dev
```

Then rerun:

```bash
docker compose up -d
```
