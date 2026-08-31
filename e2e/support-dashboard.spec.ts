import { test, expect, APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createTestCredentials } from './test-wallet';

/**
 * E2E Visual Regression Test: Support Dashboard (staff screen)
 *
 * Renders /support/dashboard/all, which lists support issues with role-scoped
 * department filter and column. That screen moved from /support/dashboard to
 * /support/dashboard/all in #1130, where the bare path became the overview -
 * this spec kept pointing at the old path and therefore stopped covering the
 * screen it describes. Uses the ADMIN_SEED from the API .env file
 * (admin sees every department), mirroring compliance.spec.ts.
 * Run `npm run setup` in the API directory first to create the admin user.
 */

const API_URL = process.env.REACT_APP_API_URL! + '/v1';

/**
 * Read ADMIN_SEED from the API .env file
 */
function getAdminSeed(): string {
  const apiEnvPath = path.join(__dirname, '../../api/.env');
  if (!fs.existsSync(apiEnvPath)) {
    throw new Error(`API .env file not found at ${apiEnvPath}. Run 'npm run setup' in the API directory first.`);
  }
  const content = fs.readFileSync(apiEnvPath, 'utf8');
  const match = content.match(/^ADMIN_SEED=(.*)$/m);
  if (!match || !match[1]) {
    throw new Error('ADMIN_SEED not found in API .env file. Run "npm run setup" in the API directory first.');
  }
  return match[1];
}

/**
 * Authenticate with admin credentials
 */
async function getAdminAuth(request: APIRequestContext): Promise<string> {
  const adminSeed = getAdminSeed();
  const credentials = await createTestCredentials(adminSeed);

  const response = await request.post(`${API_URL}/auth`, {
    data: credentials,
  });

  if (!response.ok()) {
    const body = await response.text().catch(() => 'unknown');
    throw new Error(`Admin auth failed: ${response.status()} - ${body}`);
  }

  const data = await response.json();
  return data.accessToken;
}

test.describe('Support Dashboard - Visual Regression Tests', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAdminAuth(request);
  });

  test('renders the dashboard with department filter and column', async ({ page }) => {
    await page.goto(`/support/dashboard/all?session=${token}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Verify the dashboard loaded
    await expect(page.getByText('Open Issues')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Limit Requests \(/ })).toBeVisible();

    await expect(page).toHaveScreenshot('support-dashboard-01-overview.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('renders the Limit Requests tab', async ({ page }) => {
    await page.goto(`/support/dashboard/all?session=${token}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /^Limit Requests \(/ })).toBeVisible();
    await page.getByRole('button', { name: /^Limit Requests \(/ }).click();
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('support-dashboard-02-limit-requests.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });
});
