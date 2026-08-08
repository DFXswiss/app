import { defineConfig, devices } from '@playwright/test';

/**
 * Full-stack E2E harness config. The Docker stack (compose.yml) is already running;
 * Playwright must not start servers itself (no webServer).
 *
 * The route-coverage gate (route-coverage.spec.ts, tagged "@coverage-gate") runs by default
 * together with the rest of the suite: a bare `docker compose run --rm tests` runs every
 * project, gate included — images/playwright/Dockerfile has no default CMD args anymore. The
 * gate WAS excluded by default early on, while the functional suites were still being written
 * and most routes were unclaimed, via the Dockerfile's then-default CMD
 * (`["--grep-invert=@coverage-gate"]`). That default is gone now that the claim set is
 * complete: letting the gate run by default is the point of having it — a route added to the
 * app without a matching test now fails the run, instead of some unrelated assertion.
 * IMPORTANT (kept from when the exclusion existed, still true if it is ever reintroduced): it
 * was never done via a config-level `grepInvert` here, because Playwright ANDs config-level
 * grep/grepInvert with any CLI --grep/--grep-invert — a CLI --grep can never override a
 * config-level grepInvert, it only narrows it further (verified empirically: with a
 * config-level `grepInvert: /@coverage-gate/`, `playwright test --grep @coverage-gate` still
 * finds zero tests). To run ONLY the gate on demand:
 *   docker compose -p dfx-e2e-stack -f e2e-stack/compose.yml -f e2e-stack/compose.tests.yml \
 *     run --rm tests --grep @coverage-gate
 * The gate also lives in its own `coverage-gate` project (see below) so it never runs twice.
 */
export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  // All specs share ONE database and ONE API instance (see e2e-stack/compose.yml) — there is no
  // per-test or per-file isolation. Running tests in parallel would let concurrent tests stomp on
  // each other's rows/wallets/state, so this harness runs everything serially. If you are tempted
  // to raise `workers` "for speed", you are giving up that isolation guarantee; do not do it
  // without first giving every spec file its own database/schema or equivalent isolation.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: './playwright-report' }]],
  use: {
    baseURL: process.env.E2E_FRONTEND_URL ?? 'http://frontend',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      // route-coverage.spec.ts belongs to its own project below, not to chromium, so the
      // default run (which selects every project) does not attempt it twice.
      testIgnore: /route-coverage\.spec\.ts/,
    },
    {
      name: 'coverage-gate',
      // Pure static-analysis test (reads App.tsx, no browser/DB needed) — no `dependencies`.
      testMatch: /route-coverage\.spec\.ts/,
    },
  ],
});
