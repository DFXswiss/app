import { test, expect, APIRequestContext, Page, Route } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createTestCredentials } from './test-wallet';

/**
 * E2E Visual Regression: Compliance bank-tx return / refund approval page
 *
 * Route: /compliance/bank-tx/:transactionId/return
 *
 * Auth is real; GET support/transaction/:id/refund is mocked with synthetic data so
 * baselines stay deterministic and free of production PII.
 *
 * Name-mismatch nav-state is covered by unit tests (history.state is awkward across page.goto).
 */

const API_URL = process.env.REACT_APP_API_URL! + '/v1';
const REFUND_RE = /\/v1\/support\/transaction\/\d+\/refund(?:\?|$)/;

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

const REFUND_FIXTURE = {
  expiryDate: '2020-01-02T01:00:00.000Z',
  fee: { dfx: 3, network: 0, bank: 2 },
  refundAmount: 95,
  refundAsset: { id: 1, name: 'EUR' },
  inputAmount: 100,
  inputAsset: { id: 1, name: 'EUR' },
  refundTarget: 'DE89370400440532013000',
  bankDetails: {
    name: 'Erika Muster',
    address: 'Main Street',
    houseNumber: '1',
    zip: '10115',
    city: 'Berlin',
    country: 'DE',
    iban: 'DE89370400440532013000',
  },
};

async function installRefundRoute(
  page: Page,
  options: { body?: unknown; status?: number; errorMessage?: string } = {},
): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const url = route.request().url();
    if (REFUND_RE.test(url) && route.request().method() === 'GET') {
      if (options.errorMessage) {
        await route.fulfill({
          status: options.status ?? 400,
          contentType: 'application/json',
          body: JSON.stringify({ message: options.errorMessage }),
        });
        return;
      }
      await route.fulfill({
        status: options.status ?? 200,
        contentType: 'application/json',
        body: JSON.stringify(options.body ?? REFUND_FIXTURE),
      });
      return;
    }
    await route.continue();
  });
}

test.describe('Compliance bank-tx return - Visual Regression Tests', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAdminAuth(request);
  });

  test('1. pending user refund form with prefilled creditor and approval banner', async ({ page }) => {
    await installRefundRoute(page);

    await page.goto(`/compliance/bank-tx/9002/return?session=${token}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('pending-refund-banner')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Waiting for manual approval')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm refund', exact: true })).toBeVisible();

    await expect(page).toHaveScreenshot('bank-tx-return-01-pending-prefill.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('2. already charged back error is plain language', async ({ page }) => {
    await installRefundRoute(page, { errorMessage: 'Transaction already charged back', status: 400 });

    await page.goto(`/compliance/bank-tx/9002/return?session=${token}`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText('This refund has already been approved or paid out and cannot be submitted again.'),
    ).toBeVisible({ timeout: 15000 });

    await expect(page).toHaveScreenshot('bank-tx-return-02-already-done.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });
});
