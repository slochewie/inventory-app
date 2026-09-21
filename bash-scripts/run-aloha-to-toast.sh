#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
NODE_SCRIPT="$SCRIPT_DIR/aloha.to.toast.menu.js"

if [[ $# -lt 1 ]]; then
  echo "Usage: $(basename "$0") input.csv [output.csv] [skipped.csv]" >&2
  exit 1
fi

input="$1"
base="$(basename "$input")"
stem="${base%.*}"
output="${2:-${stem}.toast-prep.csv}"
skipped="${3:-${stem}.skipped.csv}"

node "$NODE_SCRIPT" "$input" "$output" --skipped "$skipped" --debug
printf '\nCreated:\n  %s\n  %s\n' "$output" "$skipped"
