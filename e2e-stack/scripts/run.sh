#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

trap 'bash "$STACK_DIR/scripts/down.sh"' EXIT

bash "$STACK_DIR/scripts/up.sh"

if compose config --services 2>/dev/null | grep -qx tests; then
  log_info "Running e2e tests..."
  compose run --rm tests "$@"
else
  log_info "Test suite is not yet part of the stack (no 'tests' service in compose config)."
  log_info "Stack was brought up successfully; tearing down via EXIT trap."
  exit 0
fi
