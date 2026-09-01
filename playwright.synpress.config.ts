/**
 * Playwright Configuration for MetaMask E2E Tests
 *
 * This config uses custom fixtures that:
 * 1. Launch Chrome 126 (last version with Manifest V2 support)
 * 2. Manually load MetaMask 11.9.1 extension
 * 3. Use Synpress's MetaMask class for wallet interactions
 *
 * Run with: npx playwright test --config=playwright.synpress.config.ts
 *
 * Prerequisites:
 * 1. npm run synpress:setup (installs Chrome 126 + downloads MetaMask)
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/synpress',
  // Run custom spec files that use our custom fixtures
  testMatch: [
    'eip5792-custom.spec.ts',
    'sepolia-usdt-sell.spec.ts',
    'sepolia-full-metamask.spec.ts',
    'sepolia-real-tx.spec.ts',
    'sell-complete.spec.ts',
    'sepolia-sell-e2e.spec.ts', // New complete E2E test
    'pr1330-manual-qa.spec.ts', // PR #1330 metamask/web3 viem-port manual-QA evidence
  ],
  snapshotDir: './e2e/screenshots',
  snapshotPathTemplate: '{snapshotDir}/{testFileName}-{arg}-{projectName}-{platform}{ext}',
  outputDir: './e2e/synpress-results',

  // Tests must run sequentially (shared wallet state)
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,

  reporter: process.env.CI ? 'html' : [['list'], ['html', { open: 'never', outputFolder: 'synpress-report' }]],

  // Longer timeout for wallet interactions
  timeout: 120000,

  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on',
    screenshot: 'on',
    video: 'on',
    // Must be headed mode for extension loading
    headless: false,
  },

  // No projects needed - our custom fixtures handle browser launch
  projects: [
    {
      name: 'chromium-metamask',
      use: {
        // Custom fixtures override the browser launch
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
