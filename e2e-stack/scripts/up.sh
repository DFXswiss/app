#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

if [[ -z "${E2E_API_IMAGE:-}" ]]; then
  # Default: API repo checked out as sibling directory "api" next to "services".
  # Relative paths resolve from the services repository root so caller cwd does not matter.
  api_repo_raw="${E2E_API_REPO:-../api}"
  if [[ "$api_repo_raw" = /* ]]; then
    api_repo="$api_repo_raw"
  else
    if api_repo="$(cd "$STACK_DIR/.." && cd "$api_repo_raw" 2>/dev/null && pwd)"; then
      :
    else
      api_repo="$(cd "$STACK_DIR/.." && pwd)/${api_repo_raw}"
    fi
  fi

  if [[ ! -d "$api_repo" ]]; then
    log_error "API image not set and API repository not found."
    log_error "Either check out the API repo as a sibling directory named 'api' next to 'services',"
    log_error "or set E2E_API_IMAGE to a pre-built image tag (e.g. export E2E_API_IMAGE=dfx-api:e2e)."
    log_error "Looked for: ${api_repo} (override with E2E_API_REPO)."
    exit 1
  fi

  log_info "Building API image dfx-api:e2e from ${api_repo} ..."
  docker build -t dfx-api:e2e --build-arg GIT_COMMIT=e2e-stack "$api_repo"
  # Export so the probe below (and compose.yml's ${E2E_API_IMAGE}) always see a concrete tag,
  # matching the image we just built — same default as when the caller sets E2E_API_IMAGE.
  export E2E_API_IMAGE=dfx-api:e2e
fi

# Probe the API image for the process-error-policy module (the unhandledRejection handler fix).
# Without it, Spark SDK init rejections kill the process in this network; up.sh then sets
# E2E_NODE_OPTIONS=--unhandled-rejections=warn for compose. Once the image ships the fix, leave
# E2E_NODE_OPTIONS empty so real unhandled rejections crash again (no permanent mask).
# The image runs as a non-root user, so a search from / walks into directories it may not read
# and find exits non-zero on those alone. Discard find's own status and its stderr and judge by
# what it printed; a Docker-level failure (missing or broken image) still surfaces, because then
# `docker run` never reaches the `exit 0` below.
if ! probe_output=$(
  docker run --rm --entrypoint sh "$E2E_API_IMAGE" -c \
    "find / -xdev -name 'process-error-policy.js' -not -path '*/node_modules/*' -print -quit 2>/dev/null; exit 0" 2>&1
); then
  log_error "Failed to probe API image '${E2E_API_IMAGE}' for process-error-policy.js."
  log_error "docker run exited non-zero (image missing/broken, or Docker error). Output:"
  log_error "${probe_output}"
  exit 1
fi

if printf '%s' "$probe_output" | grep -q .; then
  export E2E_NODE_OPTIONS=""
else
  log_warn "API image '${E2E_API_IMAGE}' does not include the unhandledRejection handler (process-error-policy.js)."
  log_warn "Running with --unhandled-rejections=warn so the API can boot in this network."
  log_warn "This downgrade disappears automatically once an image with the fix is used."
  export E2E_NODE_OPTIONS="--unhandled-rejections=warn"
fi

log_info "Building frontend image..."
compose build frontend

# Rebuild frontend-widget too: Compose auto-builds a *missing* image, but never rebuilds an
# *existing* one on its own. Without this, a source change that affects the widget bundle
# (src/index-widget.tsx or anything it imports) would leave the previous widget image running,
# and widget.spec.ts would keep testing stale code while staying green — the exact failure mode
# this harness exists to catch.
log_info "Building frontend-widget image..."
compose build frontend-widget

log_info "Starting stack (db, api, frontend, proxy)..."
compose up -d db api frontend proxy

if ! wait_for_healthy db 60; then
  log_error "Database failed to become healthy. Recent API logs:"
  compose logs --tail=200 api || true
  exit 1
fi

# API healthcheck budget (compose.yml): start_period 60s + retries 30 * interval 10s = 360s
# before Docker itself marks the container unhealthy. This timeout must stay >= that budget,
# or up.sh reports a false failure while the container is still inside its allowed window.
if ! wait_for_healthy api 360; then
  log_error "API failed to become healthy. Recent API logs:"
  compose logs --tail=200 api || true
  exit 1
fi

if ! wait_for_healthy frontend 60; then
  log_error "Frontend failed to become healthy. Recent frontend logs:"
  compose logs --tail=200 frontend || true
  exit 1
fi

if ! wait_for_healthy proxy 60; then
  log_error "Proxy failed to become healthy. Recent proxy logs:"
  compose logs --tail=200 proxy || true
  exit 1
fi

api_port="${E2E_PORT_API:-3000}"
frontend_port="${E2E_PORT_FRONTEND:-3001}"

log_info "E2E stack is up and healthy."
log_info "  API:      http://localhost:${api_port}"
log_info "  Frontend: http://localhost:${frontend_port}"
