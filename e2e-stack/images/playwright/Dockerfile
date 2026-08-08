FROM mcr.microsoft.com/playwright:v1.56.0-noble

WORKDIR /work

# The API builds KYC-step URLs server-side via Config.url() as http://localhost:<port> under
# Environment.LOC, assuming frontend and API share one machine. Inside this multi-container
# harness that assumption is false, so browser calls to localhost would hit this container
# itself. The socat forwarder below (started by entrypoint.sh) makes localhost:3000 reach the
# real API service. Remove this workaround if the API ever makes that base URL configurable.
RUN apt-get update \
  && apt-get install -y --no-install-recommends socat \
  && rm -rf /var/lib/apt/lists/*

COPY e2e-stack/images/playwright/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Build context is the repo root (see compose.tests.yml). Copy only what the harness needs.
COPY e2e-stack/package.json e2e-stack/package-lock.json ./
RUN npm ci

COPY e2e-stack/tsconfig.json e2e-stack/playwright.config.ts ./
COPY e2e-stack/specs ./specs
# Frontend source for the route-coverage gate (App.tsx) and human debugging (guard.hook.ts).
COPY src/App.tsx src/hooks/guard.hook.ts ./app-source/

ENTRYPOINT ["/entrypoint.sh"]
# No default args: a bare `docker compose run --rm tests` runs every project, the route-coverage
# gate included. The gate was excluded here while the suites were still being written and most
# routes were unclaimed; now that the claim set is complete, letting it run by default is the
# point of having it — a route added to the app without a test fails the run.
#
# Note for callers: any args you pass replace this line entirely (Docker CMD semantics), they do
# not merge with it.
