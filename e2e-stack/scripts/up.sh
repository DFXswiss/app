#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

if [[ -z "${E2E_API_IMAGE:-}" ]]; then
  # Default: backend repo checked out as sibling directory "api" next to "app".
  # Relative paths resolve from the app repository root so caller cwd does not matter.
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
    log_error "Either check out the backend repo as a sibling directory named 'api' next to 'app',"
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

# Same pattern for the two images built from this repository: remember whether the caller
# provided a prebuilt image BEFORE defaulting — after the exports below the variables are
# always set and that distinction is gone. CI sets them to tags it already pulled (see
# .github/workflows/e2e-images.yml); locally they stay unset and the harness builds as usual.
frontend_prebuilt=${E2E_FRONTEND_IMAGE:+1}
widget_prebuilt=${E2E_WIDGET_IMAGE:+1}
# Export concrete defaults so the ${E2E_FRONTEND_IMAGE}/${E2E_WIDGET_IMAGE} references in
# compose.yml / compose.tests.yml resolve to the same tag in every compose invocation:
# `compose build` tags the local build with exactly this name, and `compose up` runs it.
export E2E_FRONTEND_IMAGE="${E2E_FRONTEND_IMAGE:-dfx-services-frontend:e2e}"
export E2E_WIDGET_IMAGE="${E2E_WIDGET_IMAGE:-dfx-services-widget:e2e}"

# The API has to be able to survive an unreachable third party on its own. It could not always:
# a Spark SDK failure reached the process error handler, whose own logging call threw on the value
# it was handed, and the process exited. An image without that fix cannot come up in this network,
# and the harness will not paper over it — an earlier version set --unhandled-rejections=warn for
# the whole process, which silences every unhandled rejection, including ones introduced later.
#
# safe-log is the module that closes it, so its presence is what gets probed. The image runs as a
# non-root user, so a search from / walks into directories it may not read and find exits non-zero
# on those alone: discard find's own status and its stderr, and answer with one exact word so a
# stray line from the Docker client cannot be mistaken for a match. A Docker-level failure still
# surfaces, because then `docker run` never reaches the `exit 0` below.
if ! probe_output=$(
  docker run --rm --entrypoint sh "$E2E_API_IMAGE" -c \
    "if find / -xdev -name 'safe-log.js' -not -path '*/node_modules/*' -print -quit 2>/dev/null | grep -q .; then echo E2E_PROBE_FOUND; fi; exit 0" 2>&1
); then
  log_error "Failed to probe API image '${E2E_API_IMAGE}' for safe-log.js."
  log_error "docker run exited non-zero (image missing/broken, or Docker error). Output:"
  log_error "${probe_output}"
  exit 1
fi

if ! printf '%s\n' "$probe_output" | grep -qx 'E2E_PROBE_FOUND'; then
  log_error "API image '${E2E_API_IMAGE}' predates the guarded process error handling (no safe-log.js)."
  log_error "It cannot stay up in this network: the error handler throws while logging and the"
  log_error "process exits. Build the image from an API revision that carries the fix."
  exit 1
fi

# Record the decision where every later Compose invocation will read it. Exporting alone is not
# enough: the test run is a separate `docker compose` call in a separate shell, and a service whose
# resolved configuration differs from the running container gets recreated — which restarted the
# API without the option and killed it mid-run.
#
# The file is generated and rewritten on every up, so it carries its own name rather than `.env`,
# which belongs to whoever works here. Because an explicit --env-file replaces Compose's own `.env`
# handling, a developer's `.env` is copied in first, so their settings keep working.
generated_env="$STACK_DIR/.env.generated"
: > "$generated_env"
if [[ -f "$STACK_DIR/.env" ]]; then
  cat "$STACK_DIR/.env" >> "$generated_env"
  printf '\n' >> "$generated_env"
fi
printf 'E2E_API_IMAGE=%s\n' "$E2E_API_IMAGE" >> "$generated_env"
# Same reasoning for the frontend and widget images: every later compose call must resolve
# them to the tags decided here, prebuilt or locally built.
printf 'E2E_FRONTEND_IMAGE=%s\n' "$E2E_FRONTEND_IMAGE" >> "$generated_env"
printf 'E2E_WIDGET_IMAGE=%s\n' "$E2E_WIDGET_IMAGE" >> "$generated_env"

if [[ -z "$frontend_prebuilt" ]]; then
  log_info "Building frontend image..."
  compose build frontend
else
  log_info "Using prebuilt frontend image ${E2E_FRONTEND_IMAGE} - skipping the local build."
fi

# Rebuild frontend-widget too: Compose auto-builds a *missing* image, but never rebuilds an
# *existing* one on its own. Without this, a source change that affects the widget bundle
# (src/index-widget.tsx or anything it imports) would leave the previous widget image running,
# and widget.spec.ts would keep testing stale code while staying green — the exact failure mode
# this harness exists to catch. A prebuilt image passed in via E2E_WIDGET_IMAGE does not have
# that problem: CI pulls it SHA-tagged for exactly the revision it checked out.
if [[ -z "$widget_prebuilt" ]]; then
  log_info "Building frontend-widget image..."
  compose build frontend-widget
else
  log_info "Using prebuilt frontend-widget image ${E2E_WIDGET_IMAGE} - skipping the local build."
fi

# The LNURL configuration and static responses are COPYed into its image (bind mounts are not
# supported in every harness environment). Rebuild explicitly so edits cannot leave a stale
# existing image serving old callback behavior while the Lightning spec stays green.
log_info "Building LNURL image..."
compose build lnurl

log_info "Starting stack (db, api, frontend, proxy)..."
compose up -d db api frontend proxy

# db healthcheck budget (compose.yml): a probe may take its own timeout before it counts as a
# failure, so the budget is start_period 10s + retries 20 * (interval 5s + timeout 5s) = 210s.
if ! wait_for_healthy db 240; then
  log_error "Database failed to become healthy. Recent API logs:"
  compose logs --tail=200 api || true
  exit 1
fi

# API healthcheck budget (compose.yml): start_period 60s + retries 30 * (interval 10s + timeout
# 5s) = 510s before Docker itself marks the container unhealthy. This wait must stay >= that
# budget, or up.sh reports a false failure while the container is still inside its allowed window.
if ! wait_for_healthy api 540; then
  log_error "API failed to become healthy. Recent API logs:"
  compose logs --tail=200 api || true
  exit 1
fi

# Rows the API reads into memory once at boot have to exist before that boot, and the schema only
# exists after the API has created it — so the API starts, gets seeded, and starts again. The one
# row that needs this today is the transaction specification behind the minimum-amount check:
# TransactionHelper fills its cache in onModuleInit and refreshes it only every five minutes, so a
# row written afterwards stays invisible for the length of a whole test run.
log_info "Seeding boot-cached master data and restarting the API so it reads it..."
compose exec -T db psql -v ON_ERROR_STOP=1 -U sa -d dfx <<'SQL'
INSERT INTO transaction_specification (system, asset, direction, "minVolume", "minFee")
SELECT 'Fiat', 'CHF', 'In', 1, 0
WHERE NOT EXISTS (
  SELECT 1 FROM transaction_specification WHERE system = 'Fiat' AND asset = 'CHF' AND direction = 'In'
);
SQL
compose restart api
if ! wait_for_healthy api 540; then
  log_error "API failed to become healthy after the seed restart. Recent API logs:"
  compose logs --tail=200 api || true
  exit 1
fi

# Recreate the running sidecar from the image built above. Its healthcheck budget is start_period
# 5s + retries 10 * (interval 5s + timeout 3s) = 85s, rounded up.
compose up -d --no-deps lnurl
if ! wait_for_healthy lnurl 120; then
  log_error "LNURL failed to become healthy. Recent LNURL logs:"
  compose logs --tail=200 lnurl || true
  exit 1
fi

# frontend healthcheck budget (compose.yml): start_period 5s + retries 10 * (interval 5s +
# timeout 3s) = 85s, rounded up.
if ! wait_for_healthy frontend 120; then
  log_error "Frontend failed to become healthy. Recent frontend logs:"
  compose logs --tail=200 frontend || true
  exit 1
fi

# proxy healthcheck budget (compose.yml): start_period 5s + retries 10 * (interval 5s + timeout
# 3s) = 85s, rounded up; it also has to wait on the frontend it proxies to.
if ! wait_for_healthy proxy 120; then
  log_error "Proxy failed to become healthy. Recent proxy logs:"
  compose logs --tail=200 proxy || true
  exit 1
fi

api_port="${E2E_PORT_API:-3000}"
frontend_port="${E2E_PORT_FRONTEND:-3001}"

log_info "E2E stack is up and healthy."
log_info "  API:      http://localhost:${api_port}"
log_info "  Frontend: http://localhost:${frontend_port}"
