#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PIPELINE="$SCRIPT_DIR/run-aloha-pipeline.sh"

if [[ $# -lt 1 ]]; then
  cat >&2 <<'EOF'
Usage:
  normalize-aloha-for-review.sh input.csv [output-directory] [happy-hour-discount]

Example:
  ./bash-scripts/normalize-aloha-for-review.sh "McCarthy's Pub Menu Items.csv" ./output 1.00

The file to upload back to ChatGPT is:
  <output-directory>/<input-name>.mapped.csv

Also keep the validation and Happy Hour review CSVs; they explain any rows
that need attention before the Toast workbook is populated.
EOF
  exit 1
fi

input="$1"
output_dir="${2:-./output}"
discount="${3:-1.00}"

mkdir -p "$output_dir"

base="$(basename "$input")"
stem="${base%.*}"
prefix="$output_dir/$stem"

"$PIPELINE" "$input" "$prefix" "$discount"

mapped="${prefix}.mapped.csv"
validation="${prefix}.validation.csv"
happy_hour="${prefix}.happy-hour-review.csv"

printf '\n============================================================\n'
printf 'READY FOR REVIEW\n'
printf '============================================================\n'
printf 'Upload this file to ChatGPT:\n  %s\n' "$mapped"
printf '\nSupporting review files:\n  %s\n  %s\n' "$validation" "$happy_hour"
