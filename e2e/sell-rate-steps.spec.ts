import { expect, Page, Route, test } from '@playwright/test';

/** Synthetic session and API responses for the expanded sell quote. */
const TEST_IBAN = 'CH3600000000000000000';

const ADDRESS = '0x1111111111111111111111111111111111111111';

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    address: ADDRESS,
    role: 'User',
    blockchains: ['Polygon'],
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

const CHF_FIAT = {
  id: 1,
  name: 'CHF',
  buyable: true,
  sellable: true,
  cardBuyable: false,
  cardSellable: false,
  instantBuyable: false,
  instantSellable: false,
};

const EUR_FIAT = {
  id: 2,
  name: 'EUR',
  buyable: true,
  sellable: true,
  cardBuyable: false,
  cardSellable: false,
  instantBuyable: false,
  instantSellable: false,
};

const DSC_ASSET = {
  id: 1,
  name: 'DSC',
  chainId: '0x5d4e735784293a0a8d37761ad93c13a0dd35c7e7',
  explorerUrl: 'https://polygonscan.com/token/0x5d4e735784293a0a8d37761ad93c13a0dd35c7e7',
  uniqueName: 'Polygon/DSC',
  description: 'Denario Silver Coin',
  type: 'Token',
  category: 'Public',
  dexName: 'DSC',
  feeTier: 'Tier2',
  comingSoon: false,
  buyable: true,
  sellable: true,
  cardBuyable: false,
  cardSellable: false,
  instantBuyable: false,
  instantSellable: false,
  blockchain: 'Polygon',
  decimals: 8,
  sortOrder: 0,
  limits: { minVolume: 0.01, maxVolume: 100 },
};

// Quote fees follow the API: total = dfx + platform + bank + network, and dfx does not include platform.
// DSC dfx is total − platform − network, rounded to five significant digits (0.000596997 → 0.000597).
const SELL_FEES = {
  rate: 0.0199,
  fixed: 0,
  min: 0,
  dfx: 0.000597,
  bank: 0,
  network: 0.000078823,
  total: 0.00097582,
  platform: 0.0003,
};

const SYNTHETIC_SELL = {
  id: 1,
  uid: 'synthetic-sell-1',
  routeId: 1,
  timestamp: '2026-11-11T10:00:00.000Z',
  depositAddress: '0x2222222222222222222222222222222222222222',
  blockchain: 'Polygon',
  fees: SELL_FEES,
  minVolume: 0.01,
  maxVolume: 100,
  amount: 0.03,
  asset: DSC_ASSET,
  // EUR at the 49.692 base rate, FIAT_FEE: dfx 0.03, platform 0.02, network 0, total 0.05.
  feesTarget: { ...SELL_FEES, dfx: 0.03, network: 0, total: 0.05, platform: 0.02 },
  minVolumeTarget: 10,
  maxVolumeTarget: 250000,
  exchangeRate: 0.020124,
  priceSteps: [
    { source: 'Denario', from: 'DSC', to: 'USD', price: 0.017966, timestamp: '2026-10-22T13:29:00.687Z' },
    { source: 'CoinGecko', from: 'USDT', to: 'EUR', price: 1.1201, timestamp: '2026-10-22T13:25:03.871Z' },
  ],
  rate: 0.020801,
  exactPrice: true,
  estimatedAmount: 1.44,
  currency: EUR_FIAT,
  beneficiary: { name: 'Synthetic Customer', iban: TEST_IBAN },
  isValid: true,
};

const DEPS_ASSET = {
  ...DSC_ASSET,
  id: 354,
  name: 'DEPS',
  uniqueName: 'Polygon/DEPS',
  description: 'Synthetic DEPS',
  dexName: 'DEPS',
  decimals: 18,
  limits: { minVolume: 1, maxVolume: 1000000 },
};

// 6173.4 DEPS at 6173.4 DEPS/EUR is 1 EUR before fees.
// Asset fees use five significant digits: dfx = 6173.4 * 0.0199 = 122.85, platform = 6173.4 * 0.01 = 61.734,
// network 0, total = 184.58. Fiat fees divide by 6173.4 and ceil to cents: dfx 0.02, platform 0.01, total 0.03.
// Output is round((6173.4 - 184.58) / 6173.4, 2) = 0.97.
// The quote rate is input per output after fees: 6173.4 / 0.97 = 6364.329896907217.
// Inverting that shows 0.00015713 EUR/DEPS. The base rate and the price step stay 6173.4, shown as 0.00016199.
const DEPS_SELL = {
  ...SYNTHETIC_SELL,
  uid: 'synthetic-sell-deps',
  fees: {
    rate: 0.0199,
    fixed: 0,
    min: 0,
    dfx: 122.85,
    bank: 0,
    network: 0,
    total: 184.58,
    platform: 61.734,
  },
  minVolume: 1,
  maxVolume: 1000000,
  amount: 6173.4,
  asset: DEPS_ASSET,
  feesTarget: {
    rate: 0.0199,
    fixed: 0,
    min: 0,
    dfx: 0.02,
    bank: 0,
    network: 0,
    total: 0.03,
    platform: 0.01,
  },
  minVolumeTarget: 0.01,
  maxVolumeTarget: 250000,
  exchangeRate: 6173.4,
  priceSteps: [{ source: 'Synthetic', from: 'DEPS', to: 'EUR', price: 6173.4, timestamp: '2026-10-22T13:29:00.687Z' }],
  rate: 6173.4 / 0.97,
  estimatedAmount: 0.97,
};

async function installSellRoutes(
  page: Page,
  addressCheckResult: 'LikelyReturn' | 'Ok',
  sell: typeof SYNTHETIC_SELL = SYNTHETIC_SELL,
  assets: Array<typeof DSC_ASSET> = [DSC_ASSET],
): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'GET' && path === '/v1/language') {
      return json(route, [
        { id: 1, name: 'Deutsch', symbol: 'DE' },
        { id: 2, name: 'English', symbol: 'EN' },
      ]);
    }

    if (method === 'GET' && path === '/v1/fiat') {
      return json(route, [CHF_FIAT, EUR_FIAT]);
    }

    if (method === 'GET' && path === '/v1/asset') {
      return json(route, assets);
    }

    if (method === 'GET' && path === '/v1/bankAccount') {
      return json(route, [
        {
          id: 1,
          iban: TEST_IBAN,
          preferredCurrency: EUR_FIAT,
          label: 'Main',
          default: true,
          active: true,
        },
      ]);
    }

    if (method === 'GET' && path === '/v1/country') {
      return json(route, []);
    }

    if (method === 'GET' && path === '/v1/setting/infoBanner') {
      return json(route, null);
    }

    if (method === 'GET' && path === '/v1/sell/address-check') {
      return json(route, { result: addressCheckResult });
    }

    if (method === 'PUT' && ['/v1/sell/quote', '/v1/sell/paymentInfos'].includes(path)) {
      return json(route, sell);
    }

    await json(route, { error: `Unexpected ${method} ${path}` }, 501);
  });

  await page.route('**/v2/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'GET' && path === '/v2/user') {
      const address = {
        address: ADDRESS,
        wallet: 'DFX',
        explorerUrl: 'https://example.invalid',
        blockchains: ['Polygon'],
        isCustody: false,
      };
      return json(route, {
        id: 1,
        activeAddress: address,
        addresses: [address],
        mail: 'sell-address-check@example.com',
        currency: EUR_FIAT,
        language: { id: 2, name: 'English', symbol: 'EN' },
        kyc: { level: 30, status: 'Completed' },
        disabledAddresses: [],
      });
    }

    await json(route, { error: `Unexpected ${method} ${path}` }, 501);
  });
}

test('expanded sell rate shows fiat price steps and fees', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installSellRoutes(page, 'Ok');
  await page.goto(`/sell?session=${encodeURIComponent(jwt())}&lang=en&asset-in=DSC&asset-out=EUR&amount-in=0.03`);
  const rate = page.getByText(/EUR\/DSC/).first();
  await expect(rate).toBeVisible();
  await expect(page.getByText('48.07 EUR/DSC', { exact: true }).first()).toBeVisible();
  await rate.click();
  await expect(page.getByText('Base rate', { exact: true })).toBeVisible();
  await expect(page.getByText('49.69 EUR/DSC', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/DSC to USD at 55\.66 USD\/DSC on Denario/)).toBeVisible();
  await expect(page.getByText(/USDT to EUR at 0\.89278 EUR\/USDT on CoinGecko/)).toBeVisible();
  await expect(page).toHaveScreenshot('sell-rate-steps-01-expanded.png', { fullPage: true });
});

test('sell under 1 eur shows the quote rate apart from the base rate and the price step', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installSellRoutes(page, 'Ok', DEPS_SELL, [DEPS_ASSET]);
  await page.goto(`/sell?session=${encodeURIComponent(jwt())}&lang=en&asset-in=DEPS&asset-out=EUR&amount-in=6173.4`);
  await expect(page.locator('div.flex-1', { hasText: '0.00015713 EUR/DEPS' })).toHaveText('0.00015713 EUR/DEPS');
  await page.locator('div.flex-1', { hasText: '0.00015713 EUR/DEPS' }).click();
  await expect(page.getByText('Base rate', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Base rate', { exact: true }).locator('..').locator('> div').nth(1).locator('> div').first(),
  ).toHaveText('0.00016199 EUR/DEPS');
  await expect(page.getByText(/DEPS to EUR at 0\.00016199 EUR\/DEPS on Synthetic/)).toBeVisible();
  await expect(page).toHaveScreenshot('sell-rate-steps-02-below-one-expanded.png', { fullPage: true });
});
