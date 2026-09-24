# How to use Inventory App

This guide covers the current Aloha → reviewed menu → Toast workbook workflow.

## 1. Export the menu from Aloha

Export the menu-price report from Aloha as CSV.

Keep the original file unchanged. The application reads the Aloha report structure directly and performs normalization in the browser.

Root-level `.csv` files are ignored by Git, so a local Aloha export can safely live in the repository root while you work.

## 2. Open Menu Items

Open the Inventory app root page:

```text
/
```

For the current McCarthy's deployment, this is the Menu Items page.

Choose **Aloha CSV** and select the exported file.

The app will:

1. parse the Aloha report,
2. remove/report non-menu noise,
3. normalize menu items,
4. detect pricing variants such as Happy Hour,
5. assign preliminary Toast categories/destinations, and
6. show the result in the review table.

## 3. Review the normalized items

Use the status filters to focus on the records you need:

- **Exporting** — rows currently included in output.
- **Not exporting** — rows explicitly excluded.
- **All active** — normalized rows excluding ignored source noise.
- **Ready** — rows with no current review requirement.
- **Review** — rows that need operator attention.
- **Happy hour** — rows with detected Happy Hour pricing.
- **Ignored** — source rows intentionally ignored.
- **Everything** — every parsed/normalized row.

You can also filter by source category and search for an item.

Review these fields carefully before generating the Toast workbook:

- item name,
- base price,
- Happy Hour price,
- include/exclude state,
- Toast category,
- Toast destination,
- review notes.

### Category-level changes

When a source category is selected, the page can apply a Toast category to the items in that category together. This is useful when an Aloha category should map cleanly to a Toast tab or grouping.

## 4. Understand beer destinations

Beer destinations control which columns are populated in the Toast Beer tab.

The current normalized beer model supports:

| Destination | Workbook result |
| --- | --- |
| Draft Beer 10oz | Existing Toast 8oz draft slot |
| Draft Beer 16oz | Existing Toast 16oz draft slot |
| Can | Existing Can slot |
| 24oz Can | Existing Bottle slot |
| Bottle | Existing Bottle slot |

Standard cans and 24oz cans are separate source items.

For example, a 12oz/standard can and a 24oz can are not combined merely because their cleaned beer names match. Each source item remains independent even though 24oz cans and bottles share Toast's fixed Bottle section.

### Fixed Toast workbook structure

The workbook writer does not rename Toast headers or add custom columns. It writes menu data into the existing template cells only.

Organization-specific serving and package sizes remain inventory data. When a real size differs from the fixed Toast header, call that out in the Notes tab for the Toast representative instead of changing the workbook structure.

## 5. Save the reviewed state

The browser saves the current reviewed state locally so the Toast workbook page can reuse it.

For a durable copy, download:

```text
toast-export-review.csv
```

Treat this as the portable save file for the review session. It is preferable to re-uploading the raw Aloha CSV later because it preserves the reviewed/export decisions rather than starting again from freshly normalized data.

The export panel may also provide other Toast-facing CSV files and previews.

## 6. Import an existing populated Toast workbook

If you are starting from a Toast Menu Template workbook that already contains menu data, navigate to:

```text
/toast-template-import
```

Choose the populated Toast `.xlsx` file. The importer reads supported Toast tabs into the same normalized reviewed-item model used by the Aloha workflow and saves that reviewed state in the browser.

The current template importer reads:

- Beer
- Liquor
- Wine
- Cocktails
- NA Bev
- Retail

Beer headers may represent draft sizes, standard cans, bottles, or 24oz cans. Retail rows can also be recovered from the NA Bev tab when the row Group is Retail.

After import, the saved reviewed state is available on both **Menu Items** and **Toast Workbook**. Download `toast-export-review.csv` from the Template Import page when you want a durable portable copy.

## 7. Open Toast Workbook

Navigate to:

```text
/toast-workbook
```

The page can obtain reviewed menu state in three ways, in this preference order:

1. upload `toast-export-review.csv`,
2. use the saved browser review session automatically, or
3. upload the raw Aloha CSV as a fallback.

The raw Aloha option starts from unedited normalized data, so use the review CSV when you want to preserve prior edits.

## 8. Download a Toast Menu Template

In Toast's Menu Bulk Import workflow, make/download a local `.xlsx` copy of the Toast Menu Template that you want this app to populate.

Do not upload a Google Sheets URL to the Inventory app. The current workbook page accepts an actual `.xlsx` file.

## 9. Upload the Toast template

On `/toast-workbook`, choose the Toast `.xlsx` file.

The application inspects the workbook and identifies the supported Beer-tab structure before writing data.

Current workbook population covers:

- Beer
- Liquor

The UI reports counts for staged Beer and Liquor export items.

## 10. Generate the populated workbook

Choose **Download populated workbook**.

The generated filename uses the source workbook name with a `-populated.xlsx` suffix.

Before importing anything into Toast, open the resulting workbook and inspect at minimum:

- beer names,
- 10oz draft values in Toast's existing 8oz slot,
- 16oz draft values in Toast's existing 16oz slot,
- standard-can names/prices,
- 24oz-can names/prices in the existing Bottle section,
- bottle names/prices when applicable,
- Happy Hour values,
- liquor rows,
- Toast headers remain unchanged.

The generated workbook is an import artifact, not a replacement for a final human review.

## Development workflow

### Start the container

From the repository root:

```bash
docker compose up -d --build
```

The current Compose service intentionally starts with `sleep infinity`, which keeps the development container available for interactive commands.

### Install/update dependencies

```bash
docker compose exec inventory-app npm install
```

### Start TanStack/Vite

```bash
docker compose exec inventory-app npm run dev
```

The app is exposed on host port 3350.

### Generate routes

```bash
docker compose exec inventory-app npm run generate-routes
```

The generated `app/src/routeTree.gen.ts` file is ignored by Git.

### Build check

```bash
docker compose exec inventory-app npm run build
```

Run this after code changes that affect imports, routes, workbook generation, or shared packages.

## CLI pipeline

The repository also retains the earlier Node/bash normalization pipeline.

Run all CLI tests:

```bash
bash ./bash-scripts/test-all.sh
```

Normalize an Aloha file for review:

```bash
bash ./bash-scripts/normalize-aloha-for-review.sh \
  "McCarthy's Pub Menu Items.csv" \
  ./output
```

See `bash-scripts/README.md` for the generated intermediate/export files and normalization details.

## Troubleshooting

### The app cannot resolve @niteowl packages

Confirm these sibling directories exist relative to `inventory-app`:

```text
../niteowl-ui
../niteowl-app-config
```

They are bind-mounted into `/app/packages/` by Docker Compose.

### Docker says the niteowl-dev network does not exist

Create it once:

```bash
docker network create niteowl-dev
```

Then run `docker compose up -d` again.

### A 24oz can does not appear in the expected columns

Check the item's Toast destination first. It must classify as **24oz Can**.

The exporter intentionally writes 24oz cans into the existing Toast **Bottle** section. It does not rename that header. If the location also carries bottles, both types appear as separate rows in that fixed section and the actual package sizes should be clarified in the Notes tab.

### Changes disappear on the Toast workbook page

Download `toast-export-review.csv` after reviewing items and upload that file on the workbook page. The browser session is convenient, but the review CSV is the durable handoff.

### A raw Aloha upload does not contain my previous edits

That is expected. Raw Aloha import reruns normalization from the original source data. Restore `toast-export-review.csv` instead.
