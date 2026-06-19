#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="$SCRIPT_DIR/../config/boarddocs/wvm.yaml"

exec "$SCRIPT_DIR/scrape-boarddocs.sh" --config "$CONFIG" "$@"
