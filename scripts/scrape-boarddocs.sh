#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="${NODE_BIN:-node}"
CONFIG="${BOARDDOCS_CONFIG:-$SCRIPT_DIR/../config/boarddocs/wvm.yaml}"

exec "$NODE_BIN" "$SCRIPT_DIR/scrape-boarddocs.mjs" --config "$CONFIG" "$@"
