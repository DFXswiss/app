import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  snapshotDir: './e2e/screenshots/baseline',
  snapshotPathTemplate: '{snapshotDir}/{testFileName}-{arg}-{projectName}-{platform}{ext}',
  outputDir: './e2e/test-results',
  // Keep test results after test run
  preserveOutput: 'always',
  // Disable parallel execution to prevent API rate limiting
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Use single worker to prevent rate limiting
  workers: 1,
  // Use list reporter for real-time progress, html for detailed results
  // HTML report is saved to playwright-report/ and persists across runs
  reporter: process.env.CI ? 'html' : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  // Global timeout for tests
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:3001',
    // Always capture traces, screenshots and videos
    trace: 'on',
    screenshot: 'on',
    video: 'on',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm start',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    // Pin API base URL so QR matrix (and any code reading REACT_APP_API_URL) is baseline-stable.
    // Same default as scripts/e2e-test.sh; override with E2E_API_URL.
    env: {
      ...process.env,
      REACT_APP_API_URL: process.env.E2E_API_URL ?? 'https://dev.api.dfx.swiss',
    },
  },
});
