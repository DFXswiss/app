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
    {
      // App 2.0 full-bleed layout under 460px (`src/app2/styles.css`). Desktop
      // Chrome plus a viewport below that breakpoint; testMatch keeps this
      // project off every spec that is not app2, so the other baselines stay
      // named `*-chromium-darwin.png`.
      name: 'chromium-mobile',
      testMatch: ['**/app2-preview.spec.ts', '**/app2-session.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],

  webServer: {
    command: 'npm start',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
