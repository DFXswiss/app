import { expect, Page, Route, test } from '@playwright/test';

/**
 * Visual variants of the public mail action-secret TX flow:
 * status with secret (assign/refund buttons), status without secret,
 * guest assign form, guest refund form.
 */

const ACTION_SECRET = 'ab'.repeat(32);
const UID = 'T186C06388387A6FD';

const UNASSIGNED = {
  id: 42,
  uid: UID,
  date: '2026-01-15T00:00:00.000Z',
  type: 'Buy',
  state: 'Unassigned',
  inputAsset: 'EUR',
  inputAmount: 250,
  inputPaymentMethod: 'Bank',
  outputAsset: 'BTC',
  outputAmount: 0.004,
  reason: undefined,
  chargebackAmount: undefined,
};

const SINGLE_TARGET = {
  id: 501,
  address: 'bc1q-synthetic-target-address',
  bankUsage: 'REF-SYN-0501',
  asset: { name: 'BTC', blockchain: 'Bitcoin' },
};

const REFUND = {
  expiryDate: undefined,
  refundTarget: undefined,
  inputAmount: 250,
  inputAsset: { name: 'EUR' },
  refundAsset: { name: 'EUR' },
  refundAmount: 245,
  fee: { dfx: 3, bank: 1, network: 1 },
  bankDetails: undefined,
};

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function installGuestApi(page: Page): Promise<void> {
  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (
      request.method() === 'GET' &&
      ['/v1/language', '/v1/fiat', '/v1/asset', '/v1/bankAccount', '/v1/country'].includes(path)
    ) {
      await fulfillJson(route, []);
      return;
    }
    if (request.method() === 'GET' && path === '/v1/setting/infoBanner') {
      await fulfillJson(route, null);
      return;
    }
    if (request.method() === 'GET' && path === '/v1/transaction/single' && url.searchParams.get('uid') === UID) {
      await fulfillJson(route, UNASSIGNED);
      return;
    }
    if (request.method() === 'GET' && path === `/v1/transaction/uid/${UID}/${ACTION_SECRET}/targets`) {
      await fulfillJson(route, [SINGLE_TARGET]);
      return;
    }
    if (request.method() === 'GET' && path === `/v1/transaction/uid/${UID}/${ACTION_SECRET}/refund`) {
      await fulfillJson(route, REFUND);
      return;
    }

    await route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ error: `Unexpected ${request.method()} ${path}` }),
    });
  });

  await page.route('**/v2/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'GET' && path === '/v2/user') {
      await fulfillJson(route, {
        id: 1,
        activeAddress: { address: '0x0000000000000000000000000000000000000001', wallet: 'DFX' },
        addresses: [],
        kyc: { level: 50, status: 'Completed' },
        language: { id: 1, name: 'German', symbol: 'DE' },
      });
      return;
    }
    await route.fulfill({ status: 501, contentType: 'application/json', body: '{}' });
  });
}

test.describe('Guest mail action-secret TX', () => {
  test.use({ timezoneId: 'Europe/Zurich' });

  test('status with secret shows assign and refund', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installGuestApi(page);
    await page.goto(`/tx/${UID}/${ACTION_SECRET}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: 'Assign transaction' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request refund' })).toBeVisible();
    await expect(page).toHaveScreenshot('guest-tx-01-status-with-secret.png', { fullPage: true });
  });

  test('status without secret hides assign and refund', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installGuestApi(page);
    await page.goto(`/tx/${UID}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: 'Assign transaction' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Request refund' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create support ticket' })).toBeVisible();
    await expect(page).toHaveScreenshot('guest-tx-02-status-without-secret.png', { fullPage: true });
  });

  test('guest assign form', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installGuestApi(page);
    await page.goto(`/tx/${UID}/${ACTION_SECRET}/assign`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Remittance info')).toBeVisible();
    await expect(page).toHaveScreenshot('guest-tx-03-assign.png', { fullPage: true });
  });

  test('guest refund form', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installGuestApi(page);
    await page.goto(`/tx/${UID}/${ACTION_SECRET}/refund`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Transaction amount', { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('guest-tx-04-refund.png', { fullPage: true });
  });
});
