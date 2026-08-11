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
# E2E_FULL_RUN declares that every spec is in scope, which is what lets the coverage gate check that
# each route was actually opened rather than merely claimed. A filtered run must not set it: the
# recording it would be checked against can only ever be partial, so the gate would report routes as
# never opened just because their specs were filtered out. Any argument here narrows the run, so the
# flag is set only when there is none — and a filtered run says so instead of failing obscurely later.
# The filtered branch clears the variable rather than just not setting it: compose.tests.yml forwards
# ${E2E_FULL_RUN:-}, so a value inherited from the caller's environment would otherwise survive and
# make a filtered run declare itself complete.
if [ "$#" -eq 0 ]; then
  E2E_FULL_RUN=1 compose run --rm tests
else
  log_info "Arguments given: running a filtered subset, so the route gate checks ownership only."
  E2E_FULL_RUN= compose run --rm tests "$@"
fi
