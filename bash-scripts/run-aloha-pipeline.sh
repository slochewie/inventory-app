#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -lt 1 ]]; then
  cat >&2 <<'EOF'
Usage:
  run-aloha-pipeline.sh input.csv [output-prefix] [toast-template.csv]

Examples:
  ./bash-scripts/run-aloha-pipeline.sh aloha.csv
  ./bash-scripts/run-aloha-pipeline.sh aloha.csv mccarthys
  ./bash-scripts/run-aloha-pipeline.sh aloha.csv mccarthys toast-template.csv
EOF
  exit 1
fi

input="$1"
base="$(basename "$input")"
stem="${base%.*}"
if [[ -n "${2:-}" ]]; then
  if [[ "$2" == */ || -d "$2" ]]; then
    mkdir -p "$2"
    prefix="${2%/}/$stem"
  else
    prefix="$2"
  fi
else
  prefix="$stem"
fi
toast_template="${3:-}"

normalized="${prefix}.normalized.csv"
skipped="${prefix}.skipped.csv"
toast_prep="${prefix}.toast-prep.csv"
mapped="${prefix}.mapped.csv"
validation="${prefix}.validation.csv"
menu_build="${prefix}.toast-menu-build.csv"
beer_build="${prefix}.toast-beer.csv"
liquor_build="${prefix}.toast-liquor.csv"
beer_tab="${prefix}.toast-beer-tab.csv"
liquor_tab="${prefix}.toast-liquor-tab.csv"
template_mapped="${prefix}.toast-template.csv"

node "$SCRIPT_DIR/aloha.normalize.js" \
  "$input" "$normalized" \
  --skipped "$skipped" \
  --debug

# The existing prep stage performs Aloha-aware candidate detection. It remains
# separate so the normalization output stays source-shaped and auditable.
node "$SCRIPT_DIR/aloha.to.toast.menu.js" \
  "$input" "$toast_prep"

node "$SCRIPT_DIR/aloha.map-fields.js" \
  "$toast_prep" "$mapped"

# Validation is a hard gate for malformed data. Warnings are written to the
# report but do not stop the pipeline; errors stop before Toast output.
set +e
node "$SCRIPT_DIR/validate-intermediate.js" "$mapped" "$validation"
validation_status=$?
set -e
if [[ $validation_status -eq 2 ]]; then
  printf '\nValidation errors found. Review %s before generating Toast output.\n' "$validation" >&2
  exit 2
elif [[ $validation_status -ne 0 ]]; then
  exit "$validation_status"
fi

node "$SCRIPT_DIR/toast.menu-build.js" \
  "$mapped" "$menu_build"

node "$SCRIPT_DIR/toast.beverage-build.js" \
  "$mapped" "$beer_build" "$liquor_build"

node "$SCRIPT_DIR/toast.beer-tab.js" \
  "$beer_build" "$beer_tab"

node "$SCRIPT_DIR/toast.liquor-tab.js" \
  "$liquor_build" "$liquor_tab"

if [[ -n "$toast_template" ]]; then
  node "$SCRIPT_DIR/toast.map-template.js" \
    "$mapped" "$toast_template" "$template_mapped"
fi

printf '\nAloha → Toast pipeline complete.\n\n'
printf 'Normalized source:       %s\n' "$normalized"
printf 'Skipped source rows:     %s\n' "$skipped"
printf 'Toast candidates:        %s\n' "$toast_prep"
printf 'Stable mapped records:   %s\n' "$mapped"
printf 'Validation report:       %s\n' "$validation"
printf 'Toast Menu Build:        %s\n' "$menu_build"
printf 'Toast Beer reconciliation: %s\n' "$beer_build"
printf 'Toast Beer tab staging:     %s\n' "$beer_tab"
printf 'Toast Liquor input:        %s\n' "$liquor_build"
printf 'Toast Liquor tab staging:  %s\n' "$liquor_tab"
if [[ -n "$toast_template" ]]; then
  printf 'Exact-template mapping:  %s\n' "$template_mapped"
fi
