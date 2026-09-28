# Inventory App How-To

This guide documents the current authenticated Inventory workflow.

The normal operating model is:

```text
source menu / manual item
        ↓
Import & Review / Add Item
        ↓
shared master Inventory catalog
        ↓
organization availability, prices, categories, Beer formats
        ↓
Export to Toast
```

The frozen `/wip` routes are legacy snapshots and are not the source of truth.

## 1. Sign in and choose an organization

Sign in through the NiteOwl Better Auth service.

The organization selector in the header controls which location you are viewing or editing. Inventory access is organization-specific.

### Roles

| Role | Main abilities |
| --- | --- |
| Viewer | Browse Catalog and history |
| Staff | Viewer + import/export |
| Manager | Staff + edit Catalog, settings, categories, mappings |
| Admin | Manager + Assignments and shared master-item merge |

Server-side access checks are enforced by the Auth service.

## 2. Add an item manually

Open:

```text
/manual-item
```

Use **Add Item** when a product should be created without an Aloha/Toast import.

Choose:

- item name,
- Menu Category,
- Beer/Toast placement when applicable,
- regular price,
- Happy Hour price when applicable,
- Available here,
- Export to Toast.

Beer choices are filtered by the selected organization's Beer Format settings. Disabled built-in Beer formats do not appear as valid choices.

For custom Beer formats, enable the format first in **Organization Settings**.

## 3. Manage optional Menu Categories

Open:

```text
/menu-categories
```

Built-in categories always available in Add Item:

- Beer
- Cocktails
- NA Bev

Optional organization categories:

- Retail
- Open Items

Enable only the extra categories the organization uses.

Removing an optional category from this page removes it from future Add Item choices; it does not rewrite existing catalog items.

**Open Items** may have a blank price and can still export.

## 4. Configure Organization Settings

Open:

```text
/organization-settings
```

### Happy Hour

Configure:

- Time Range 1 start/end and selected days,
- optional Time Range 2 start/end and selected days.

Changes require explicit **Update**. **Cancel** restores the current saved state.

The exporter writes the schedule into the Toast Notes tab and validates it before download.

### Beer Formats

Toast built-in Beer formats are fixed workbook structures:

- 8oz Draft
- 16oz Draft
- 24oz Draft
- Pitcher
- Can
- Bottle

Enable only the formats the organization actually uses.

Disabled built-in formats:

- stay out of Beer-format dropdowns,
- are hidden in the generated Beer worksheet.

Custom formats use Toast's hidden Optional Beer Category groups. Use **Add format** to reveal another slot, up to five. Each custom format has:

- enabled state,
- label/import mapping,
- order/slot position,
- remove control.

Examples include custom draft sizes such as 10oz or 12oz and packaged formats such as Tall Boy Can.

Custom formats remain distinct from Toast's built-in formats; they are not remapped into a different built-in size.

## 5. Import an Aloha menu

Open:

```text
/import-review
```

In **New import**, choose the Aloha CSV.

The app:

1. parses the report,
2. removes structural noise,
3. normalizes item/variant data,
4. detects regular and Happy Hour pricing,
5. flags suspicious rows,
6. stages rows for review.

Nothing is persisted just by selecting a file.

Review/edit staged rows, then save approved rows to Inventory.

## 6. Review import history

In `/import-review`, open **History**.

History records include source type/name, user, counts, conflicts, status, and timestamps.

The older `/imports` route exposes the history panel as a standalone compatibility page.

## 7. Review persistent source mappings

Managers/Admins can open **Mapping review** in `/import-review`.

A source mapping connects an organization/source row to a shared master item variant.

Mappings may be:

- automatically created,
- flagged for review when a similar item could be confused,
- manually redirected,
- explicitly confirmed.

A confirmed mapping no longer remains in **Needs review** simply because a similarity warning originally existed.

The standalone `/reconcile` route remains for compatibility.

## 8. Stage a populated Toast workbook

The preferred staged Toast-review workflow is on:

```text
/toast-workbook
```

Use the staged-workbook source controls to load a populated Toast Menu Template.

Staging is organization-scoped. Bull's staged workbook does not become McCarthy's staged workbook, and switching organizations restores each organization's own staging state.

The staging parser reads business content from relevant visible sheets and ignores generated/helper sheets.

### Staged row review

Open a staged row to review/edit it.

The drawer uses explicit controls:

- **Update** — save the row edit,
- **Cancel** — discard row edits,
- **Ignore** — exclude the row,
- **Close** — close without autosaving unsaved edits.

Do not treat closing the drawer as Save.

## 9. Reconcile staged Toast rows to the master catalog

After staged rows are reviewed, continue to the master reconciliation step.

For each row being imported, explicitly choose either:

- an existing master variant, or
- **Create new master item**.

The import API's explicit reconciliation mode requires one of those decisions for every row included in that import request.

This prevents a reviewed Toast row from being silently attached to a merely similar master item.

After persistence, source mappings are recorded/confirmed and can be reviewed later in **Mapping review**.

## 10. Use the Catalog

Open:

```text
/
```

The Catalog groups organization-visible variants under shared master items.

Filters:

- Search
- Menu Category
- Availability:
  - Carried here
  - Not carried here
  - All master items

Open a row to use the edit drawer.

### Shared vs organization-specific data

Shared master data includes the canonical item identity and canonical category.

Organization-specific variant data includes:

- Available here,
- Export to Toast,
- local price,
- Happy Hour price,
- display/Toast name override,
- Toast placement/slot data.

Changing a shared canonical category affects the master item across organizations. Local availability/pricing changes affect only the selected organization.

### Master item names

The shared master item name is currently read-only in the UI.

You can:

- edit organization-specific variant names,
- change canonical category,
- merge duplicate master items.

There is not yet a dedicated shared master-item rename control.

## 11. Add an organization Beer format to an existing master item

When a shared Beer item exists but the selected organization needs a different enabled format, open the Catalog drawer.

The drawer offers only Beer formats enabled for the selected organization.

For example, if Bull's enables Can, Bottle, and a custom 12oz format, McCarthy's 10oz/16oz variants do not become Bull's choices merely because they exist on the shared master item.

Choose an available format to create/reuse the shared master variant and attach the selected organization to it.

## 12. Bulk edit Catalog rows

Use the **Bulk edit** control above the Catalog table.

When enabled, a checkbox column appears before the visible rows. The header checkbox selects/deselects the currently visible page.

Selection clears when page/filter context changes so actions remain scoped to what is visible.

Current icon actions:

- Available here
- Not carried here
- Export to Toast
- Do not export
- Set price

The info icon opens a key explaining the icons. The key closes on outside click or Escape and is positioned near the info button while remaining inside the viewport.

### Bulk price workflow

Bulk price is intentionally not immediate.

1. Select rows.
2. Press the **$** action.
3. Enter the new price.
4. Press **Review changes**.
5. Review every affected carried format with:
   - item,
   - format,
   - current price,
   - new price.
6. Choose:
   - **Cancel**,
   - **Back**,
   - **Save changes**.

Nothing is changed until **Save changes**.

Only carried formats in selected rows are affected.

## 13. Merge duplicate master items

Inventory Admins can merge duplicate shared master items from the Catalog drawer.

Choose the duplicate/source item, select the master item to keep, then confirm the merge.

The merge moves/composes variants and source mappings into the kept master item.

Because this changes shared identity across organizations, merge is Admin-only.

## 14. Manage Inventory assignments

Open:

```text
/assignments
```

Admins can:

- enable/disable Inventory access,
- assign Viewer, Staff, Manager, or Admin.

The organization selector determines which organization's assignments are being managed.

## 15. Export to Toast

Open:

```text
/toast-workbook
```

Normal export source: the selected organization's persistent Catalog.

The pristine workbook is loaded from:

```text
toast/menu/Toast-Menu-Template-Your-Restaurant-Name.xlsx
```

Every download starts from a fresh in-memory copy.

Available downloads:

- populated XLSX,
- ZIP containing the same populated workbook.

Generated filenames use the organization/store name and timestamp.

### Workbook content currently handled

The exporter populates/validates:

- Beer
- Liquor
- Cocktails
- NA Bev
- Retail
- Open Items
- Notes / Happy Hour schedule

Retail and Open Items are created only when needed by cloning the pristine NA Bev worksheet and renaming the clone.

Open Items rows may have blank prices.

The Notes tab is always moved to the final workbook-tab position after dynamic worksheet creation.

## 16. Toast routing rules

Canonical Inventory category is authoritative for workbook routing.

Examples:

- NA Bev stays in NA Bev even if stale old Toast metadata says Retail.
- Retail stays in Retail.
- Open Items stays in Open Items.
- canonical Scotch routes to the Scotch section rather than an old organization Whiskey destination.

This prevents organization/source metadata from bleeding one category into another.

## 17. Beer workbook visibility

Inventory preserves Toast's worksheet structure.

It does not delete/move the fixed Beer columns.

Instead, export toggles column visibility:

- disabled built-in draft slots are hidden,
- Can/Bottle are hidden when disabled,
- the shared Draft Beer name column is hidden if no built-in draft format is enabled,
- enabled Optional Beer Category groups are unhidden and relabeled,
- disabled Optional Beer Category groups remain hidden.

Example: an organization with only **Can** and custom **12oz** enabled can produce a Beer sheet whose visible product sections are effectively Can + 12oz while the underlying Toast template structure remains intact.

## 18. Advanced source override

The Export to Toast page retains **Advanced source override** for diagnostics/recovery.

It can temporarily source an export from older review data/raw source data instead of the persistent Catalog.

Use persistent Inventory for normal ongoing operations.

## Development workflow

### Start/rebuild

```bash
cd ~/docker/inventory-app
docker compose up -d --build
```

The Compose service starts the TanStack/Vite development server automatically.

### Address

```text
http://localhost:3350
```

### Logs

```bash
docker compose logs -f inventory-app
```

### Dependencies

```bash
docker compose exec inventory-app npm install
```

### Generate routes

```bash
docker compose exec inventory-app npm run generate-routes
```

### Build check

```bash
docker compose exec inventory-app npm run build
```

Run a build after route, auth, shared-package, import/reconciliation, Catalog, or workbook-generation changes.

## Shared repository mounts

Expected layout:

```text
~/docker/
├── inventory-app/
├── niteowl-ui/
└── niteowl-app-config/
```

Toast source mount:

```text
./toast → /app/public/toast:ro
```

The pristine Toast workbook must not be modified in place.

## Auth / Inventory API dependency

Persistent storage belongs to the Auth service Inventory plugin.

The frontend uses authenticated API operations for:

- access/assignments,
- catalog,
- organization config,
- organization-variant updates,
- bulk variant updates,
- Beer format creation/reuse,
- imports,
- explicit reconciliation,
- import history,
- source mappings,
- mapping confirmation,
- canonical category updates,
- master-item merge.

Database/schema work is done in the Auth repository, not directly in this frontend.

## CLI pipeline

The older Aloha CLI remains under `bash-scripts/`.

```bash
bash ./bash-scripts/test-all.sh
```

See `bash-scripts/README.md` for CLI-specific behavior.

## Troubleshooting

### An item exports to the wrong worksheet/section

Check its canonical Menu Category first. Canonical category is authoritative for workbook routing.

### An item is carried but does not export

Check both:

1. **Available here**
2. **Export to Toast**

For most priced categories, also verify a valid price. Open Items is the exception: blank prices are allowed.

### An organization sees another organization's Beer formats

Check Organization Settings. Catalog Beer choices are supposed to be filtered to formats enabled for the selected organization; shared variants from another location should not automatically appear as valid local choices.

### A custom Beer format does not export

Verify the custom Optional Beer Category is enabled and the variant is assigned to its stable slot.

### A built-in Beer section is visible but disabled

Regenerate the workbook after saving Organization Settings. Export validation checks built-in Beer column visibility.

### Mapping Review still says Review after I picked the correct master

The mapping must be explicitly saved/confirmed. Confirmed mappings are tracked with `mappingConfirmed`.

### The generated workbook tab order looks wrong

Notes should be the final tab. Retail/Open Items are inserted before Notes when dynamically created.

### The app cannot resolve @niteowl packages

Confirm sibling directories:

```text
../niteowl-ui
../niteowl-app-config
```

### Docker says niteowl-dev does not exist

Create it once:

```bash
docker network create niteowl-dev
```

Then:

```bash
docker compose up -d
```
