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
# Default args when the caller passes none (`docker compose run --rm tests`): skip the
# route-coverage gate. Any args the caller does pass (e.g. `--grep @coverage-gate`)
# replace this default entirely (Docker CMD semantics), not merge with it — see the
# comment in playwright.config.ts for why this lives here and not in a config grepInvert.
CMD ["--grep-invert=@coverage-gate"]
