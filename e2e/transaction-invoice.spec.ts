import { expect, Page, Route, test } from '@playwright/test';

/**
 * E2E Visual Regression: Waiting-for-payment transaction invoice
 *
 * Shows an expanded CHF buy that is waiting for payment. Auth is fully mocked
 * (client-side JWT decode, no backend call), and all `/v1/**` and `/v2/**` calls
 * are intercepted via page.route(...). The real invoice path is covered by the
 * full-stack transaction test.
 */

const WAITING_FOR_PAYMENT_BUY = {
  id: null,
  uid: 'wfp-invoice-uid-1',
  type: 'Buy',
  state: 'WaitingForPayment',
  reason: null,
  inputAmount: 250,
  inputAsset: 'CHF',
  inputAssetId: 9001,
  inputChainId: null,
  inputBlockchain: null,
  inputEvmChainId: null,
  inputPaymentMethod: 'Bank',
  outputAmount: null,
  outputAsset: 'BTC',
  outputAssetId: 9002,
  outputChainId: null,
  outputBlockchain: 'Bitcoin',
  outputEvmChainId: null,
  outputPaymentMethod: 'Crypto',
  priceSteps: null,
  feeAmount: null,
  feeAsset: null,
  fees: null,
  inputTxId: null,
  inputTxUrl: null,
  depositAddress: null,
  outputTxId: null,
  outputTxUrl: null,
  outputDate: null,
  chargebackAmount: null,
  chargebackTarget: null,
  chargebackTxId: null,
  chargebackTxUrl: null,
  chargebackDate: null,
  date: '2026-01-15T10:00:00.000Z',
  externalTransactionId: null,
  networkStartTx: null,
  sourceAccount: null,
  targetAccount: 'bc1q-synthetic-wfp-invoice-target',
};

function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    role: 'User',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function installSyntheticApi(page: Page): Promise<{ unexpectedRequests: string[] }> {
  const unexpectedRequests: string[] = [];

  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

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

    if (request.method() === 'GET' && path === '/v1/transaction/detail') {
      await fulfillJson(route, [WAITING_FOR_PAYMENT_BUY]);
      return;
    }

    if (request.method() === 'GET' && path === '/v1/transaction/unassigned') {
      await fulfillJson(route, []);
      return;
    }

    unexpectedRequests.push(`${request.method()} ${path}`);
    await route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unexpected test request' }),
    });
  });

  await page.route('**/v2/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (request.method() === 'GET' && path === '/v2/user') {
      await fulfillJson(route, {
        id: 1,
        activeAddress: {
          address: '0x0000000000000000000000000000000000000001',
          wallet: 'DFX',
        },
        addresses: [],
        kyc: { level: 50, status: 'Completed' },
        language: { id: 1, name: 'German', symbol: 'DE' },
      });
      return;
    }

    unexpectedRequests.push(`${request.method()} ${path}`);
    await route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unexpected test request' }),
    });
  });

  return { unexpectedRequests };
}

test.describe('Waiting-for-payment transaction invoice', () => {
  test.use({ timezoneId: 'Europe/Zurich' });

  test('expanded CHF buy shows Open invoice without Open receipt', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const { unexpectedRequests } = await installSyntheticApi(page);

    await page.goto(`/tx?session=${jwt()}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Your Transactions')).toBeVisible();
    const stateLabel = page.getByText('Waiting for payment', { exact: true });
    await expect(stateLabel).toBeVisible();
    await stateLabel.click();

    await expect(page.getByRole('button', { name: 'Open invoice' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open receipt' })).not.toBeVisible();

    await expect(page).toHaveScreenshot('tx-invoice-01-waiting-for-payment-expanded.png', {
      fullPage: true,
    });

    expect(unexpectedRequests).toEqual([]);
  });
});
