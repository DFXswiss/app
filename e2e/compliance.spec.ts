import { test, expect, APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createTestCredentials } from './test-wallet';

/**
 * E2E Visual Regression Tests: Compliance Pages
 *
 * Tests all compliance subpages:
 * 1. /compliance - Main search page
 * 2. /compliance/user/:id - User details page
 * 3. /compliance/bank-tx/:id/return - Bank transaction return page
 *
 * NOTE: These tests use the ADMIN_SEED from the API .env file.
 * The admin user has ADMIN role which includes COMPLIANCE permissions.
 * Run `npm run setup` in the API directory first to create the admin user.
 */

// Test data - uses "max" search which returns Max Mueller (ID 1005)
const TEST_USER_DATA_ID = '1005';
const TEST_SEARCH_QUERY = 'max';
// Requires a local BuyCrypto on this transaction uid, owned by TEST_USER_DATA_ID, with status
// Stopped, amlCheck Pass and not completed — that combination is what renders the resume button
// (see canResume in transactions-tab.tsx). The standard test data has no stopped transaction, so
// seed one before regenerating these baselines.
const TEST_STOPPED_TX_UID = 'T2AC46F80RESUME01';

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

test.describe('Compliance Pages - Visual Regression Tests', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAdminAuth(request);
  });

  test.describe('Compliance Search Page (/compliance)', () => {
    test('renders search page correctly', async ({ page }) => {
      await page.goto(`/compliance?session=${token}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Verify page loaded
      await expect(page.getByText('Database search')).toBeVisible();

      await expect(page).toHaveScreenshot('compliance-01-search-page.png', {
        fullPage: true,
        maxDiffPixels: 5000,
      });
    });

    test('shows search results', async ({ page }) => {
      await page.goto(`/compliance?session=${token}&search=${TEST_SEARCH_QUERY}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Wait for search results or "No entries found" message
      await page.waitForSelector('text=Matching Entries, text=No entries found', {
        timeout: 10000,
      }).catch(() => {
        // One of these should appear
      });

      await expect(page).toHaveScreenshot('compliance-02-search-results.png', {
        fullPage: true,
        maxDiffPixels: 5000,
      });
    });
  });

  test.describe('Compliance User Details Page (/compliance/user/:id)', () => {
    test('renders user details page correctly', async ({ page }) => {
      await page.goto(`/compliance/user/${TEST_USER_DATA_ID}?session=${token}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Wait for data to load - either user data table or error
      await page.waitForSelector('text=User Data, text=Error', {
        timeout: 15000,
      }).catch(() => {
        // One of these should appear
      });

      await expect(page).toHaveScreenshot('compliance-user-01-overview.png', {
        fullPage: true,
        maxDiffPixels: 5000,
      });
    });

    test('shows account access toggles for a customer still onboarding', async ({ page }) => {
      await page.route(`**/v1/support/${TEST_USER_DATA_ID}`, async (route) => {
        const response = await route.fetch();
        const data = await response.json();
        const users =
          Array.isArray(data.users) && data.users.length > 0
            ? data.users.map((user: Record<string, unknown>, index: number) =>
                index === 0 ? { ...user, role: 'VIP' } : user,
              )
            : [
                {
                  id: 1,
                  address: '0x0000000000000000000000000000000000000001',
                  role: 'VIP',
                  status: 'Active',
                  created: '2026-01-01T00:00:00.000Z',
                },
              ];

        await route.fulfill({
          response,
          json: {
            ...data,
            userData: {
              ...data.userData,
              kycLevel: 10,
              provisionalApprovalDate: '2026-10-29T10:00:00.000Z',
            },
            users,
          },
        });
      });

      await page.goto(`/compliance/user/${TEST_USER_DATA_ID}?session=${token}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      await expect(page.getByText('Provisional approval: on')).toBeVisible();
      await expect(page.getByText('VIP: on')).toBeVisible();

      await expect(page).toHaveScreenshot('compliance-user-11-account-access-toggles.png', {
        fullPage: true,
        maxDiffPixels: 5000,
      });
    });

    test('shows account access toggles in the off state', async ({ page }) => {
      await page.route(`**/v1/support/${TEST_USER_DATA_ID}`, async (route) => {
        const response = await route.fetch();
        const data = await response.json();
        const users =
          Array.isArray(data.users) && data.users.length > 0
            ? data.users.map((user: Record<string, unknown>) => ({ ...user, role: 'User' }))
            : [
                {
                  id: 1,
                  address: '0x0000000000000000000000000000000000000001',
                  role: 'User',
                  status: 'Active',
                  created: '2026-01-01T00:00:00.000Z',
                },
              ];

        await route.fulfill({
          response,
          json: {
            ...data,
            userData: {
              ...data.userData,
              kycLevel: 10,
              provisionalApprovalDate: undefined,
            },
            users,
          },
        });
      });

      await page.goto(`/compliance/user/${TEST_USER_DATA_ID}?session=${token}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      await expect(page.getByText('Provisional approval: off')).toBeVisible();
      await expect(page.getByText('VIP: off')).toBeVisible();

      await expect(page).toHaveScreenshot('compliance-user-12-account-access-toggles-off.png', {
        fullPage: true,
        maxDiffPixels: 5000,
      });
    });

    test('shows KYC file preview (selfie.jpg)', async ({ page }) => {
      await page.goto(`/compliance/user/${TEST_USER_DATA_ID}?session=${token}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Click on selfie.jpg in the KYC Files table
      await page.getByText('selfie.jpg').click();
      await page.waitForTimeout(1000);

      // Wait for image preview to load
      await expect(page.locator('img[alt="selfie.jpg"]')).toBeVisible({ timeout: 10000 });

      await expect(page).toHaveScreenshot('compliance-user-02-kyc-file-preview.png', {
        fullPage: true,
        maxDiffPixels: 5000,
      });
    });

    test('shows Transactions tab', async ({ page }) => {
      await page.goto(`/compliance/user/${TEST_USER_DATA_ID}?session=${token}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Click Transactions tab and scroll to it
      const transactionsTab = page.getByRole('button', { name: /Transactions \(/i });
      await transactionsTab.click();
      await transactionsTab.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('compliance-user-03-transactions-tab.png', {
        fullPage: true,
        maxDiffPixels: 5000,
      });
    });

    test('shows resume action for a stopped transaction', async ({ page }) => {
      await page.goto(`/compliance/user/${TEST_USER_DATA_ID}?session=${token}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const transactionsTab = page.getByRole('button', { name: /Transactions \(/i });
      await transactionsTab.click();
      await transactionsTab.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      // Expand the stopped transaction via its UID cell
      await page.getByText(TEST_STOPPED_TX_UID, { exact: true }).click();

      const resumeButton = page.getByRole('button', { name: 'Resume', exact: true });
      await expect(resumeButton).toBeVisible({ timeout: 10000 });
      await resumeButton.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('compliance-user-09-stopped-tx-resume-action.png', {
        fullPage: true,
        maxDiffPixels: 5000,
      });

      await resumeButton.click();
      await expect(page.getByText('Transaktion fortsetzen')).toBeVisible();
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('compliance-user-10-resume-confirm-dialog.png', {
        fullPage: true,
        maxDiffPixels: 5000,
      });

      // Close without confirming — visual test must not mutate server state
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByText('Transaktion fortsetzen')).not.toBeVisible();
    });

    test('shows Users tab', async ({ page }) => {
      await page.goto(`/compliance/user/${TEST_USER_DATA_ID}?session=${token}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Click Users tab
      await page.getByRole('button', { name: /Users \(/i }).click();
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('compliance-user-04-users-tab.png', {
        fullPage: true,
        maxDiffPixels: 5000,
      });
    });

    test('shows KYC Steps tab', async ({ page }) => {
      await page.goto(`/compliance/user/${TEST_USER_DATA_ID}?session=${token}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Click KYC Steps tab
      await page.getByRole('button', { name: /KYC Steps \(/i }).click();
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('compliance-user-05-kyc-steps-tab.png', {
        fullPage: true,
        maxDiffPixels: 5000,
      });
    });

    test('shows Bank Data tab', async ({ page }) => {
      await page.goto(`/compliance/user/${TEST_USER_DATA_ID}?session=${token}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Click Bank Data tab
      await page.getByRole('button', { name: /Bank Data \(/i }).click();
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('compliance-user-06-bank-data-tab.png', {
        fullPage: true,
        maxDiffPixels: 5000,
      });
    });

    test('shows Buy Routes tab', async ({ page }) => {
      await page.goto(`/compliance/user/${TEST_USER_DATA_ID}?session=${token}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Click Buy Routes tab
      await page.getByRole('button', { name: /Buy Routes \(/i }).click();
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('compliance-user-07-buy-routes-tab.png', {
        fullPage: true,
        maxDiffPixels: 5000,
      });
    });

    test('shows Sell Routes tab', async ({ page }) => {
      await page.goto(`/compliance/user/${TEST_USER_DATA_ID}?session=${token}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Click Sell Routes tab
      await page.getByRole('button', { name: /Sell Routes \(/i }).click();
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('compliance-user-08-sell-routes-tab.png', {
        fullPage: true,
        maxDiffPixels: 5000,
      });
    });
  });

  // NOTE: Bank TX Return tests are skipped - no test transaction data available
  // To add these tests later, create test data and uncomment:
  // test.describe('Compliance Bank TX Return Page (/compliance/bank-tx/:id/return)', () => { ... });

  test.describe('Compliance KYC Stats Page (/compliance/kyc-stats)', () => {
    test('renders KYC stats table correctly', async ({ page }) => {
      await page.goto(`/compliance/kyc-stats?session=${token}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Verify page loaded with table
      await expect(page.getByText('As of 31.12.:')).toBeVisible();
      await expect(page.getByText('2021')).toBeVisible();
      await expect(page.getByText('2025')).toBeVisible();

      // Verify row labels
      await expect(page.getByText('KYC files managed on 01.01.xxxx')).toBeVisible();
      await expect(page.getByText('KYC files managed on 31.12.20xx')).toBeVisible();

      await expect(page).toHaveScreenshot('compliance-kyc-stats-01-table.png', {
        fullPage: true,
        maxDiffPixels: 5000,
      });
    });

    test('displays correct data values', async ({ page }) => {
      await page.goto(`/compliance/kyc-stats?session=${token}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Verify all year columns are present
      const years = ['2021', '2022', '2023', '2024', '2025', '2026'];
      for (const year of years) {
        await expect(page.getByText(year)).toBeVisible();
      }

      // Verify all row labels
      const rowLabels = [
        'KYC files managed on 01.01.xxxx',
        'Internal: Reopened KYC files',
        'Internal: New KYC files',
        'KYC files added between 01.01.20xx and 31.12.20xx',
        '*KYC files managed during the year',
        'KYC files closed between 01.01.20xx and 31.12.20xx',
        'KYC files managed on 31.12.20xx',
      ];
      for (const label of rowLabels) {
        await expect(page.getByText(label)).toBeVisible();
      }

      // Verify specific data values using regex to handle different apostrophe characters
      const table = page.locator('table');

      // 2021 values
      await expect(table.getByText('250').first()).toBeVisible();

      // 2022 values (use regex to match apostrophe variants)
      await expect(table.getByText(/1.947/).first()).toBeVisible();
      await expect(table.getByText(/2.192/).first()).toBeVisible();
      await expect(table.getByText(/2.197/).first()).toBeVisible();

      // 2023 values
      await expect(table.getByText('509').first()).toBeVisible();
      await expect(table.getByText(/2.701/).first()).toBeVisible();
      await expect(table.getByText(/2.127/).first()).toBeVisible();
      await expect(table.getByText('574').first()).toBeVisible();

      // 2024 values
      await expect(table.getByText('87').first()).toBeVisible();
      await expect(table.getByText('611').first()).toBeVisible();
      await expect(table.getByText('698').first()).toBeVisible();
      await expect(table.getByText(/1.272/).first()).toBeVisible();
      await expect(table.getByText('253').first()).toBeVisible();
      await expect(table.getByText(/1.019/).first()).toBeVisible();

      // 2025 values
      await expect(table.getByText(/2.006/).first()).toBeVisible();
      await expect(table.getByText(/3.025/).first()).toBeVisible();
    });
  });
});
