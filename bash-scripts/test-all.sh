#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

node "$SCRIPT_DIR/test/aloha-fields.test.js"
node "$SCRIPT_DIR/test/toast-template.test.js"
node "$SCRIPT_DIR/test/toast-menu-build.test.js"
node "$SCRIPT_DIR/test/collapse-scheduled-prices.test.js"
node "$SCRIPT_DIR/test/migration-rules.test.js"
node "$SCRIPT_DIR/test/toast-beverage-build.test.js"
node "$SCRIPT_DIR/test/validate-intermediate.test.js"

printf '\nAll menu conversion unit tests passed.\n'
