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
# was actually opened rather than merely claimed. A filtered run instead gets only the gate's
# ownership check (route-coverage.spec.ts, the `E2E_FULL_RUN !== '1'` branch), which says so loudly
# instead of claiming coverage.
#
# The check below is an allowlist on purpose. Listing filters and treating everything else as
# complete was tried twice here and was wrong twice: --project, --shard, --last-failed and
# --only-changed were all missed in turn, and each omission let a partial run declare itself
# complete. An allowlist fails the other way - an unrecognised flag costs the strict navigation
# check on a local run, which is the harmless direction.
is_filtered_run() {
  local skip_value=0
  for arg in "$@"; do
    if [[ $skip_value -eq 1 ]]; then
      skip_value=0
      continue
    fi
    case "$arg" in
      # The ONLY flags that leave the run complete. Everything else counts as a filter, including
      # flags Playwright may add after this was written: guessing wrong in that direction merely
      # drops the strict navigation check, while guessing wrong the other way lets a partial run
      # claim full coverage - which is the whole failure this gate exists to prevent. --project is
      # deliberately not on this list even for `--project coverage-gate`, which does pull the entire
      # dependency chain: encoding one project name as "complete" would be a rule invisible from the
      # call site, and the documented way to run only the gate is `--grep @coverage-gate`. `--config`
      # and `-c` are off the list for the same reason: another config can set its own testDir,
      # testMatch or project list and drop the coverage-gate project entirely, so a flag that can
      # replace the whole selection cannot be one that promises the selection is complete.
      --workers=*|--reporter=*|--timeout=*|--global-timeout=*|--repeat-each=*|--retries=*) ;;
      --output=*|--max-failures=*|--trace=*|--tsconfig=*|--quiet|--pass-with-no-tests|--headed) ;;
      # Same flags in their separate-value form: skip the value too, or a bare `1` from
      # `--workers 1` would be read below as a positional spec pattern.
      --workers|--reporter|--timeout|--global-timeout|--repeat-each|--retries) skip_value=1 ;;
      --output|--max-failures|--trace|--tsconfig|-j) skip_value=1 ;;
      *) return 0 ;;
    esac
  done
  return 1
}

if [[ $# -eq 0 ]] || ! is_filtered_run "$@"; then
  E2E_FULL_RUN=1 compose run --rm tests "$@"
else
  # A real filter is present — this run legitimately covers only part of the suite. The variable is
  # passed empty rather than merely left unset: compose.tests.yml forwards ${E2E_FULL_RUN:-}, so a
  # value exported by the calling shell would otherwise survive into the container and let a
  # filtered run declare itself complete. CI does not go through run.sh at all — the workflow sets
  # E2E_FULL_RUN itself (see .github/workflows/e2e-stack.yml) — so this is a local/dev safety net,
  # not part of the merge gate.
  log_info "Filter argument given: running a subset, so the route gate checks ownership only."
  E2E_FULL_RUN= compose run --rm tests "$@"
fi
