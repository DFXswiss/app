import { expect, Page, Route, test } from '@playwright/test';

/**
 * Visual regression for an expanded completed sale. The session, user and startup
 * endpoints and transaction response are synthetic; the full-stack test uses the real API.
 */
const COMPLETED_SELL = {
  id: 12345,
  uid: 'T-synthetic-sell-rate',
  type: 'Sell',
  state: 'Completed',
  reason: null,
  inputAmount: 0.03,
  inputAsset: 'DSC',
  inputAssetId: 9001,
  inputChainId: '0x5d4e735784293a0a8d37761ad93c13a0dd35c7e7',
  inputBlockchain: 'Polygon',
  inputEvmChainId: 137,
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
  feeAmount: 0.00097582,
  feeAsset: 'DSC',
  fees: {
    total: 0.00097582,
    dfx: 0.00089702,
    rate: 0.0199,
    platform: 0.0003,
    network: 0.000078823,
    bankFixed: 0,
    bankVariable: 0,
  },
  inputTxId: '0x1111111111111111111111111111111111111111111111111111111111111111',
  inputTxUrl: 'https://polygonscan.com/tx/0x1111111111111111111111111111111111111111111111111111111111111111',
  depositAddress: '0x2222222222222222222222222222222222222222',
  outputTxId: 'SYNTHETIC-REF-0001',
  outputTxUrl: null,
  outputDate: '2026-10-22T13:33:34.716Z',
  chargebackAmount: null,
  chargebackAsset: 'DSC',
  chargebackAssetId: 9001,
  chargebackTarget: null,
  chargebackTxId: null,
  chargebackTxUrl: null,
  chargebackDate: null,
  date: '2026-10-22T13:20:00.000Z',
  externalTransactionId: null,
  networkStartTx: null,
  sourceAccount: null,
  targetAccount: 'CH3600000000000000000',
};

// Completed sale with a 1% fee, the shape mapFees returns once percentFee is set.
// inputAmount 61734, inputReferenceAmount 61734, total fee 61734 * 0.01 = 617.34,
// inputReferenceAmountMinusFee = 61734 - 617.34 = 61116.66.
// Base price 6173.4 DEPS/EUR → outputAmount = 61116.66 / 6173.4 = 9.9.
// exchangeRate = (61734 / 61734) * (61116.66 / 9.9) = 6173.4.
// rate = roundReadable(61734 / 9.9, ASSET) = 6235.8 (five significant digits).
// formatSignificantAmount(1/6235.8) = 0.00016036; formatSignificantAmount(1/6173.4) = 0.00016199.
// referencePrice is 1, so dfx and total stay 617.34. displayFee(617.34) = 0.10 EUR (617.34 DEPS).
const DEPS_COMPLETED_SELL = {
  ...COMPLETED_SELL,
  uid: 'T-synthetic-sell-deps',
  inputAmount: 61734,
  inputAsset: 'DEPS',
  inputAssetId: 354,
  inputChainId: '0x103747924e74708139a9400e4ab4bea79fffa380',
  inputBlockchain: 'Ethereum',
  inputEvmChainId: 1,
  outputAmount: 9.9,
  outputAsset: 'EUR',
  rate: 6235.8,
  exchangeRate: 6173.4,
  priceSteps: [{ source: 'Synthetic', from: 'DEPS', to: 'EUR', price: 6173.4, timestamp: '2026-10-22T13:29:00.687Z' }],
  feeAmount: 617.34,
  feeAsset: 'DEPS',
  fees: {
    total: 617.34,
    dfx: 617.34,
    rate: 0.01,
    platform: 0,
    network: 0,
    bankFixed: 0,
    bankVariable: 0,
  },
  inputTxUrl: 'https://etherscan.io/tx/0x1111111111111111111111111111111111111111111111111111111111111111',
  outputTxId: null,
  chargebackAsset: 'DEPS',
  chargebackAssetId: 354,
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

async function installSyntheticApi(
  page: Page,
  sell: typeof COMPLETED_SELL | typeof DEPS_COMPLETED_SELL = COMPLETED_SELL,
): Promise<{ unexpectedRequests: string[] }> {
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

    if (request.method() === 'GET' && path === '/v1/transaction/single' && url.searchParams.get('uid') === sell.uid) {
      await fulfillJson(route, sell);
      return;
    }

    if (request.method() === 'GET' && path === '/v1/transaction/detail') {
      await fulfillJson(route, [sell]);
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

  test('shows the expanded sell in the transaction list', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1250 });
    const { unexpectedRequests } = await installSyntheticApi(page);
    await page.goto(`/tx?session=${jwt()}`);
    const sellRow = page.getByText('Completed', { exact: true });
    await expect(sellRow).toBeVisible();
    await sellRow.click();
    await page.getByText('48.075 EUR/DSC', { exact: true }).click();
    await expect(page.getByText('0.05 EUR (0.00097582 DSC)', { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('tx-sell-rate-02-list-expanded.png', { fullPage: true });
    expect(unexpectedRequests).toEqual([]);
  });

  test('shows the expanded sell rate', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const { unexpectedRequests } = await installSyntheticApi(page);
    await page.goto(`/tx/T-synthetic-sell-rate?session=${jwt()}`);
    const rate = page.getByText('48.075 EUR/DSC', { exact: true });
    await expect(rate).toBeVisible();
    await rate.click();
    await expect(page.getByText('Base rate', { exact: true })).toBeVisible();
    await expect(page.getByText('49.692 EUR/DSC', { exact: true })).toBeVisible();
    await expect(page.getByText('0.05 EUR (0.00097582 DSC)', { exact: true })).toBeVisible();
    await expect(page.getByText(/DSC to USD at 55\.661 USD\/DSC/)).toBeVisible();
    await expect(page).toHaveScreenshot('tx-sell-rate-01-expanded.png', { fullPage: true });
    expect(unexpectedRequests).toEqual([]);
  });

  test('shows the expanded sell rate below 1 eur per asset', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const { unexpectedRequests } = await installSyntheticApi(page, DEPS_COMPLETED_SELL);
    await page.goto(`/tx/T-synthetic-sell-deps?session=${jwt()}`);
    const rate = page.getByText('0.00016036 EUR/DEPS', { exact: true });
    await expect(rate).toHaveCount(1);
    await rate.click();
    await expect(page.getByText('Base rate', { exact: true })).toBeVisible();
    await expect(page.getByText('0.00016036 EUR/DEPS', { exact: true })).toHaveCount(1);
    await expect(page.getByText('0.00016199 EUR/DEPS', { exact: true })).toHaveCount(1);
    await expect(
      page.getByText('DEPS to EUR at 0.00016199 EUR/DEPS (Synthetic, 2026-10-22T13:29:00.687Z)', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('61734 DEPS (Ethereum)', { exact: true })).toBeVisible();
    await expect(page.getByText('9.9 EUR', { exact: true })).toBeVisible();
    await expect(page.getByText('0.10 EUR (617.34 DEPS)', { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('tx-sell-rate-03-below-one-expanded.png', { fullPage: true });
    expect(unexpectedRequests).toEqual([]);
  });

  test('shows the expanded sell below 1 eur per asset in the transaction list', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1250 });
    const { unexpectedRequests } = await installSyntheticApi(page, DEPS_COMPLETED_SELL);
    await page.goto(`/tx?session=${jwt()}`);
    const sellRow = page.getByText('Completed', { exact: true });
    await expect(sellRow).toBeVisible();
    await sellRow.click();
    const rate = page.getByText('0.00016036 EUR/DEPS', { exact: true });
    await expect(rate).toHaveCount(1);
    await rate.click();
    await expect(page.getByText('Base rate', { exact: true })).toBeVisible();
    await expect(page.getByText('0.00016036 EUR/DEPS', { exact: true })).toHaveCount(1);
    await expect(page.getByText('0.00016199 EUR/DEPS', { exact: true })).toHaveCount(1);
    await expect(
      page.getByText('DEPS to EUR at 0.00016199 EUR/DEPS (Synthetic, 2026-10-22T13:29:00.687Z)', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('61734 DEPS (Ethereum)', { exact: true })).toBeVisible();
    await expect(page.getByText('9.9 EUR', { exact: true })).toBeVisible();
    await expect(page.getByText('0.10 EUR (617.34 DEPS)', { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('tx-sell-rate-04-list-below-one-expanded.png', { fullPage: true });
    expect(unexpectedRequests).toEqual([]);
  });
});
