#!/usr/bin/env bash
# Shared helpers for e2e-stack lifecycle scripts.

set -euo pipefail

STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
E2E_PROJECT="${E2E_PROJECT:-dfx-e2e-stack}"

compose() {
  local files=(-f "$STACK_DIR/compose.yml")
  if [[ -f "$STACK_DIR/compose.tests.yml" ]]; then
    files+=(-f "$STACK_DIR/compose.tests.yml")
  fi
  docker compose -p "$E2E_PROJECT" "${files[@]}" "$@"
}

# Rebuild the `tests` image so that spec-file edits are actually picked up. The image COPYs
# spec files in at build time (no bind mounts in this environment), so a stale image silently
# runs an old spec — this makes a rebuild happen automatically before every test run instead of
# relying on callers to remember `docker compose ... build tests` by hand.
build_tests_image() {
  log_info "Building tests image (picks up spec-file changes)..."
  compose build tests
}

# ANSI colors (disabled when stdout is not a TTY)
if [[ -t 1 ]]; then
  _C_INFO=$'\033[0;32m'
  _C_WARN=$'\033[0;33m'
  _C_ERR=$'\033[0;31m'
  _C_RST=$'\033[0m'
else
  _C_INFO=
  _C_WARN=
  _C_ERR=
  _C_RST=
fi

log_info() {
  echo "${_C_INFO}[e2e-stack]${_C_RST} $*"
}

log_warn() {
  echo "${_C_WARN}[e2e-stack] WARN:${_C_RST} $*" >&2
}

log_error() {
  echo "${_C_ERR}[e2e-stack] ERROR:${_C_RST} $*" >&2
}

# Poll until the named compose service reports Health.Status == healthy.
# Returns 0 on success, 1 on timeout (does not exit the shell).
wait_for_healthy() {
  local service="$1"
  local timeout_seconds="${2:-60}"
  local elapsed=0
  local status=""
  local cid=""

  log_info "Waiting for service '${service}' to become healthy (timeout ${timeout_seconds}s)..."

  while (( elapsed < timeout_seconds )); do
    cid="$(compose ps -q "$service" 2>/dev/null || true)"
    if [[ -n "$cid" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
      if [[ "$status" == "healthy" ]]; then
        log_info "Service '${service}' is healthy."
        return 0
      fi
      if [[ "$status" == "unhealthy" ]]; then
        log_error "Service '${service}' reported unhealthy after ${elapsed}s; not waiting out the full timeout. Recent logs:"
        compose logs --tail=50 "$service" || true
        return 1
      fi
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done

  log_error "Timed out after ${timeout_seconds}s waiting for '${service}' (last status: ${status:-unknown})."
  return 1
}
