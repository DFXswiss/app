#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

trap 'bash "$STACK_DIR/scripts/down.sh"' EXIT

bash "$STACK_DIR/scripts/up.sh"

# No optional branch here. This script is the gate: if the tests service cannot be resolved, the
# run must fail rather than report success for having started a stack and executed nothing.
# `compose config` keeps its stderr for the same reason — a broken compose file has to be readable.
if ! compose config --services | grep -qx tests; then
  log_error "No 'tests' service in the compose configuration — nothing would be executed."
  log_error "Check that ${STACK_DIR}/compose.tests.yml exists and defines it."
  exit 1
fi

build_tests_image
log_info "Running e2e tests..."
# Declares that every spec is in scope, which is what lets the coverage gate check that each route
# was actually opened rather than merely claimed. A filtered run must not set this — "$@" is
# exactly how a --grep/--grep-invert reaches Playwright, and claiming full coverage on a run that
# skipped most specs would compare claims against a navigation record that was never complete. A
# filtered run instead only gets the gate's ownership check (route-coverage.spec.ts, the
# `E2E_FULL_RUN !== '1'` branch), which prints that loudly instead of claiming coverage.
if [[ $# -eq 0 ]]; then
  E2E_FULL_RUN=1 compose run --rm tests
else
  compose run --rm tests "$@"
fi
