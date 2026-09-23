# inventory-app web app

TanStack Start browser application for the Inventory project.

Current routes:

- `/` — import/review normalized menu items.
- `/toast-workbook` — load reviewed state and populate a Toast Menu Template workbook.
- `/toast-template-import` — import a populated Toast Menu Template workbook back into reviewed state.

The app uses the shared NiteOwl application configuration for Inventory navigation and the shared NiteOwl UI navigation icons.

```bash
npm install
npm run dev
```

Add route files under `src/routes`; TanStack Router generates `src/routeTree.gen.ts`.

Build the production app with:

```bash
npm run build
```
