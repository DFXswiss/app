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
# Flags that take their value as the NEXT argument. Without skipping that value, `--workers 1`
# would leave a bare `1` to be read as a positional spec pattern, and a genuinely complete run
# would lose the full-run check - the opposite of the mistake this function exists to prevent.
is_filtered_run() {
  local skip_value=0
  for arg in "$@"; do
    if [[ $skip_value -eq 1 ]]; then
      skip_value=0
      continue
    fi
    case "$arg" in
      # Real filters: they decide which tests run at all. --project is one of them here, and it is
      # the sharpest: the coverage gate lives in its own `coverage-gate` project (playwright.config.ts),
      # so `--project chromium` runs the suite without ever running the gate. --list executes nothing.
      --grep|--grep-invert|--project|--shard) return 0 ;;
      --grep=*|--grep-invert=*|--project=*|--shard=*) return 0 ;;
      --list) return 0 ;;
      # Value-taking flags that do not change which tests run. Their value must be skipped, or a bare
      # `1` from `--workers 1` would be read below as a positional spec pattern.
      --workers|--reporter|--timeout|--repeat-each|--retries|--output|--max-failures|--config|-j|-c)
        skip_value=1
        ;;
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
