# Aloha → Toast menu normalization

This directory contains the reusable Aloha menu export → Toast Menu Build conversion pipeline.

## Run

```bash
bash ./bash-scripts/test-all.sh

bash ./bash-scripts/normalize-aloha-for-review.sh \
  "McCarthy's Pub Menu Items.csv" \
  ./output
```

The primary migration output is:

- `<name>.toast-menu-build.csv` — Toast-facing Menu Build rows, one base/normal-price item per Aloha PLU.
- `<name>.validation.csv` — errors and review warnings.
- `<name>.mapped.csv` — stable source-to-Toast intermediate records for debugging/review.
- `<name>.skipped.csv` — source rows excluded during normalization.

## Current normalization

The pipeline detects the Aloha header, removes report noise, legacy pre-menu food rows, blank item slots and structural/index rows, carries Aloha section labels into Toast Menu Group names, preserves PLU and effective-time data for reconciliation, and validates the stable intermediate records.

Aloha scheduled pricing is intentionally not migrated. Repeated scheduled rows for the same PLU are collapsed to one Toast Menu Build item using the normal/base price. Happy Hour classification and review are not part of the normal migration workflow.

Aloha `Ask` prices are retained as open-price review items and emitted with a blank Toast Base Price rather than an invalid text price.
