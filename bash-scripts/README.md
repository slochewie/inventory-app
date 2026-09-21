# Aloha → Toast CSV normalization

This directory contains the first reusable normalization code for the inventory/menu-items project.

## Run

```bash
chmod +x bash-scripts/run-aloha-to-toast.sh
./bash-scripts/run-aloha-to-toast.sh "McCarthy's Pub Menu Items.csv"
```

That creates:

- `McCarthy's Pub Menu Items.toast-prep.csv` — reviewable normalized rows.
- `McCarthy's Pub Menu Items.skipped.csv` — rows removed from the main output with a reason.

You can also call the Node script directly:

```bash
node bash-scripts/aloha.to.toast.menu.js input.csv output.csv --skipped skipped.csv --debug
```

## Current normalization

The Node script detects the Aloha header row, removes report noise and totals, normalizes CSV cells and prices, preserves the original source columns, and adds candidate Toast fields. It also flags explicit Happy Hour rows and matching item/price pairs where the lower price is exactly $1 below the regular price.

The output is intentionally an intermediate review format rather than a final Toast bulk-import file. The next iterations can add mappings against the Toast template without throwing away the original Aloha data.
