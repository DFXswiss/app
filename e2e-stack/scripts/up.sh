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
fi

log_info "Building frontend image..."
compose build frontend

log_info "Starting stack (db, api, frontend, proxy)..."
compose up -d db api frontend proxy

if ! wait_for_healthy db 60; then
  log_error "Database failed to become healthy. Recent API logs:"
  compose logs --tail=200 api || true
  exit 1
fi

if ! wait_for_healthy api 300; then
  log_error "API failed to become healthy. Recent API logs:"
  compose logs --tail=200 api || true
  exit 1
fi

api_port="${E2E_PORT_API:-3000}"
frontend_port="${E2E_PORT_FRONTEND:-3001}"

log_info "E2E stack is up and healthy."
log_info "  API:      http://localhost:${api_port}"
log_info "  Frontend: http://localhost:${frontend_port}"
