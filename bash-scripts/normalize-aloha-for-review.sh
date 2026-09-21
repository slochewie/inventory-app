#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PIPELINE="$SCRIPT_DIR/run-aloha-pipeline.sh"

if [[ $# -lt 1 ]]; then
  cat >&2 <<'EOF'
Usage:
  normalize-aloha-for-review.sh input.csv [output-directory]

Example:
  ./bash-scripts/normalize-aloha-for-review.sh "McCarthy's Pub Menu Items.csv" ./output 1.00

Primary Toast-facing output:
  <output-directory>/<input-name>.toast-menu-build.csv

Stable mapped records for debugging/review:
  <output-directory>/<input-name>.mapped.csv

Also keep the validation CSV; it explains any rows that need attention before the Toast workbook is populated.
EOF
  exit 1
fi

input="$1"
output_dir="${2:-./output}"
mkdir -p "$output_dir"

base="$(basename "$input")"
stem="${base%.*}"
prefix="$output_dir/$stem"

bash "$PIPELINE" "$input" "$prefix"

mapped="${prefix}.mapped.csv"
validation="${prefix}.validation.csv"

printf '\n============================================================\n'
printf 'READY FOR REVIEW\n'
printf '============================================================\n'
printf 'Toast-facing output:\n  %s\n' "${prefix}.toast-menu-build.csv"
printf '\nMapped review data:\n  %s\n' "$mapped"
printf '\nSupporting review file:\n  %s\n' "$validation"
