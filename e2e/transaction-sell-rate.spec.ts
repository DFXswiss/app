import { expect, Page, Route, test } from '@playwright/test';

/**
 * Visual regression for an expanded completed sale. The session, user and startup
 * endpoints and transaction response are synthetic; the full-stack test uses the real API.
 */
const COMPLETED_SELL = {
  id: null,
  uid: 'T-synthetic-sell-rate',
  type: 'Sell',
  state: 'Completed',
  reason: null,
  inputAmount: 0.03,
  inputAsset: 'DSC',
  inputAssetId: 9001,
  inputChainId: null,
  inputBlockchain: null,
  inputEvmChainId: null,
  inputPaymentMethod: 'Crypto',
  outputAmount: 1.44,
  outputAsset: 'EUR',
  outputAssetId: 9002,
  outputChainId: null,
  outputBlockchain: null,
  outputEvmChainId: null,
  outputPaymentMethod: 'Bank',
  rate: 0.020801,
  exchangeRate: 0.020124,
  priceSteps: [
    { source: 'Denario', from: 'DSC', to: 'USD', price: 0.017966, timestamp: '2026-10-22T13:29:00.687Z' },
    { source: 'CoinGecko', from: 'USDT', to: 'EUR', price: 1.1201, timestamp: '2026-10-22T13:25:03.871Z' },
  ],
  feeAmount: null,
  feeAsset: null,
  fees: {
    total: 0.00097582,
    dfx: 0.000597,
    rate: 0.0199,
    platform: 0.0003,
    network: 0.000078823,
    bankFixed: 0,
    bankVariable: 0,
  },
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
  targetAccount: null,
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

    if (
      request.method() === 'GET' &&
      path === '/v1/transaction/single' &&
      url.searchParams.get('uid') === COMPLETED_SELL.uid
    ) {
      await fulfillJson(route, COMPLETED_SELL);
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

test.describe('Completed sell exchange rate', () => {
  test.use({ timezoneId: 'Europe/Zurich' });

  test('shows the expanded sell rate', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const { unexpectedRequests } = await installSyntheticApi(page);
    await page.goto(`/tx/T-synthetic-sell-rate?session=${jwt()}`);
    await page.waitForLoadState('networkidle');
    await page.getByText('48.075 EUR/DSC', { exact: true }).click();
    await expect(page.getByText('Base rate', { exact: true })).toBeVisible();
    await expect(page.getByText('49.692 EUR/DSC', { exact: true })).toBeVisible();
    await expect(page.getByText(/DSC to USD at 55\.661 USD\/DSC/)).toBeVisible();
    await expect(page).toHaveScreenshot('tx-sell-rate-01-expanded.png', { fullPage: true });
    expect(unexpectedRequests).toEqual([]);
  });
});
