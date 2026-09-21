#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -lt 1 ]]; then
  cat >&2 <<'EOF'
Usage:
  run-aloha-pipeline.sh input.csv [output-prefix] [happy-hour-discount] [toast-template.csv]

Examples:
  ./bash-scripts/run-aloha-pipeline.sh aloha.csv
  ./bash-scripts/run-aloha-pipeline.sh aloha.csv mccarthys 1.00
  ./bash-scripts/run-aloha-pipeline.sh aloha.csv mccarthys 1.00 toast-template.csv
EOF
  exit 1
fi

input="$1"
base="$(basename "$input")"
stem="${base%.*}"
prefix="${2:-$stem}"
discount="${3:-1.00}"
toast_template="${4:-}"

normalized="${prefix}.normalized.csv"
skipped="${prefix}.skipped.csv"
toast_prep="${prefix}.toast-prep.csv"
classified="${prefix}.classified.csv"
mapped="${prefix}.mapped.csv"
happy_hour_review="${prefix}.happy-hour-review.csv"
menu_build="${prefix}.toast-menu-build.csv"
template_mapped="${prefix}.toast-template.csv"

node "$SCRIPT_DIR/aloha.normalize.js" \
  "$input" "$normalized" \
  --skipped "$skipped" \
  --debug

# The existing prep stage performs Aloha-aware candidate detection. It remains
# separate so the normalization output stays source-shaped and auditable.
node "$SCRIPT_DIR/aloha.to.toast.menu.js" \
  "$input" "$toast_prep"

node "$SCRIPT_DIR/aloha.classify-pricing.js" \
  "$toast_prep" "$classified" \
  --discount "$discount"

node "$SCRIPT_DIR/aloha.map-fields.js" \
  "$classified" "$mapped"

node "$SCRIPT_DIR/happy-hour.review.js" \
  "$mapped" "$happy_hour_review"

node "$SCRIPT_DIR/toast.menu-build.js" \
  "$mapped" "$menu_build"

if [[ -n "$toast_template" ]]; then
  node "$SCRIPT_DIR/toast.map-template.js" \
    "$mapped" "$toast_template" "$template_mapped"
fi

printf '\nAloha → Toast pipeline complete.\n\n'
printf 'Normalized source:       %s\n' "$normalized"
printf 'Skipped source rows:     %s\n' "$skipped"
printf 'Toast candidates:        %s\n' "$toast_prep"
printf 'Pricing classification:  %s\n' "$classified"
printf 'Stable mapped records:   %s\n' "$mapped"
printf 'Happy Hour review:       %s\n' "$happy_hour_review"
printf 'Toast Menu Build:        %s\n' "$menu_build"
if [[ -n "$toast_template" ]]; then
  printf 'Exact-template mapping:  %s\n' "$template_mapped"
fi
