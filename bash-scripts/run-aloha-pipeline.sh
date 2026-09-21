#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -lt 1 ]]; then
  echo "Usage: $(basename "$0") input.csv [output-prefix] [happy-hour-discount]" >&2
  exit 1
fi

input="$1"
base="$(basename "$input")"
stem="${base%.*}"
prefix="${2:-$stem}"
discount="${3:-1.00}"

normalized="${prefix}.normalized.csv"
skipped="${prefix}.skipped.csv"
classified="${prefix}.classified.csv"

node "$SCRIPT_DIR/aloha.normalize.js" "$input" "$normalized" --skipped "$skipped" --debug

# The normalizer is intentionally source-shaped. The current combined
# Aloha→Toast prep script adds candidate name/price fields, so use it as the
# classification input until explicit source-column mappings are configured.
toast_prep="${prefix}.toast-prep.csv"
node "$SCRIPT_DIR/aloha.to.toast.menu.js" "$input" "$toast_prep" --skipped "$skipped"
node "$SCRIPT_DIR/aloha.classify-pricing.js" "$toast_prep" "$classified" --discount "$discount"

printf '\nCreated:\n  %s\n  %s\n  %s\n  %s\n' "$normalized" "$toast_prep" "$classified" "$skipped"
