# Inventory App

NiteOwl inventory/menu tooling for moving menu data between point-of-sale systems.

The current workflow imports an **Aloha menu-price CSV**, normalizes it into a reusable menu-item model, lets the operator review and edit the staged items in the browser, and then populates a downloaded **Toast Menu Template** workbook.

## Current capabilities

- Import Aloha menu-price CSV exports.
- Normalize Aloha report rows into menu items.
- Detect base and Happy Hour pricing.
- Review, search, filter, include, or exclude items before export.
- Edit Toast-facing category/destination data.
- Save reviewed state in the browser.
- Download a durable `toast-export-review.csv` file.
- Restore reviewed state from `toast-export-review.csv`.
- Generate Toast-facing CSV exports.
- Upload a Toast `.xlsx` Menu Template and populate the Beer and Liquor tabs.
- Import an already populated Toast Menu Template `.xlsx` back into reviewed menu state.
- Map draft beer sizes and packaged beer slots, including separate standard-can and 24oz-can items.

See [docs/HOWTO.md](docs/HOWTO.md) for the operator and development workflow.

## Application routes

| Route | Purpose |
| --- | --- |
| `/` | Import, normalize, review, edit, and export Aloha menu data |
| `/toast-workbook` | Load reviewed menu state and populate a Toast Menu Template workbook |
| `/toast-template-import` | Import a populated Toast Menu Template workbook into reviewed menu state |

## Repository layout

```text
inventory-app/
├── app/                  # TanStack Start application
│   └── src/
│       ├── features/
│       │   └── menu-import/
│       └── routes/
├── bash-scripts/         # Earlier/reusable Aloha → Toast CLI pipeline
├── docs/
│   └── HOWTO.md
├── Dockerfile
└── docker-compose.yml
```

The browser application and the scripts share the same overall goal, but the browser workflow is the primary interactive path.

## Development stack

- Node.js 26
- TanStack Start / TanStack Router
- React 19
- Vite
- TypeScript
- Shared `@niteowl/ui` and `@niteowl/app-config` packages
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

From the repository root:

```bash
docker compose up -d --build
docker compose exec inventory-app npm install
docker compose exec inventory-app npm run dev
```

The development server listens on container port 3000 and is exposed as:

```text
http://localhost:3350
```

To run a production build check:

```bash
docker compose exec inventory-app npm run build
```

## CSV safety

Root-level CSV files are ignored by Git. Aloha exports and generated CSVs can therefore be kept in the repository working directory without accidentally committing venue menu data.

Generated CLI output under `output/` is also ignored.

## Beer workbook behavior

The Toast workbook is treated as a fixed template. Export generation writes menu data into existing cells but does not rename headers, add custom columns, or otherwise repurpose the workbook structure.

Beer records remain independent source items and are mapped into the existing Toast Beer-tab slots:

- 10oz draft -> existing 8oz draft slot
- 16oz draft -> existing 16oz draft slot
- standard can -> existing Can slot
- 24oz can -> existing Bottle slot
- bottle -> existing Bottle slot

A 24oz can is **not** assumed to be the same item as a standard can with the same apparent beer name. If both 24oz cans and bottles are present, both are written as separate rows in the existing Bottle section.

Actual organization serving/package sizes are inventory data, not workbook-header changes. Differences from Toast's fixed labels should be called out in the Notes tab for the Toast representative.

## CLI normalization pipeline

The older/reusable command-line pipeline is documented separately in [bash-scripts/README.md](bash-scripts/README.md).

Run its tests with:

```bash
bash ./bash-scripts/test-all.sh
```

## Status

This project is under active development. Beer and Liquor workbook population are implemented. Additional Toast workbook tabs and broader inventory/menu-management features can be added on top of the normalized menu-item model.
