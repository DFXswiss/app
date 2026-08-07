FROM mcr.microsoft.com/playwright:v1.56.0-noble

WORKDIR /work

# Build context is the repo root (see compose.tests.yml). Copy only what the harness needs.
COPY e2e-stack/package.json e2e-stack/package-lock.json ./
RUN npm ci

COPY e2e-stack/tsconfig.json e2e-stack/playwright.config.ts ./
COPY e2e-stack/specs ./specs
# Frontend source for the route-coverage gate (App.tsx) and human debugging (guard.hook.ts).
COPY src/App.tsx src/hooks/guard.hook.ts ./app-source/

ENTRYPOINT ["npx", "playwright", "test"]
# No default args: a bare `docker compose run --rm tests` runs every project, the route-coverage
# gate included. The gate was excluded here while the suites were still being written and most
# routes were unclaimed; now that the claim set is complete, letting it run by default is the
# point of having it — a route added to the app without a test fails the run.
#
# Note for callers: any args you pass replace this line entirely (Docker CMD semantics), they do
# not merge with it.
