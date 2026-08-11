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
# was actually opened rather than merely claimed. Only real filters flip this off: --grep /
# --grep-invert (and their =value forms) or a positional spec-file path pattern. Other flags
# (--reporter, --workers, …) do not filter which specs run and must not drop the full-run check.
# A filtered run instead only gets the gate's ownership check (route-coverage.spec.ts, the
# `E2E_FULL_RUN !== '1'` branch), which prints that loudly instead of claiming coverage.
is_filtered_run() {
  for arg in "$@"; do
    case "$arg" in
      --grep|--grep=*|--grep-invert|--grep-invert=*) return 0 ;;
      -*) ;;
      *) return 0 ;;
    esac
  done
  return 1
}

if [[ $# -eq 0 ]] || ! is_filtered_run "$@"; then
  E2E_FULL_RUN=1 compose run --rm tests "$@"
else
  # A real filter is present (--grep/--grep-invert or a spec-file pattern) — this run legitimately
  # covers only part of the suite. Explicitly clear any E2E_FULL_RUN inherited from the calling
  # shell so a filtered local run cannot accidentally claim full coverage. CI does not go through
  # run.sh at all — the workflow sets E2E_FULL_RUN itself (see .github/workflows/e2e-stack.yml) —
  # so this heuristic is a local/dev safety net only, not part of the merge gate.
  unset E2E_FULL_RUN
  compose run --rm tests "$@"
fi
