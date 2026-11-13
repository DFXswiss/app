import { expect, Page, Route, test } from '@playwright/test';

/**
 * Visual regression: the sell page's red address-check banner for a connected Ethereum wallet.
 *
 * Variants:
 *   - LikelyReturn: the warning banner above the sell form
 *   - Ok: the sell form without the banner
 *
 * Route:
 *   - /sell
 *
 * Auth is a synthetic unsigned JWT (`alg: none`, role User, Ethereum wallet address). The sell
 * bootstrap GETs and `GET /v1/sell/address-check` are mocked via page.route, so the suite does not
 * need a live API. A green run does not prove production auth or that the API answers LikelyReturn
 * for a real address.
 *
 * Feature data is MOCKED with synthetic fixtures so the baselines are deterministic and contain no
 * production data. UI language is pinned with `lang=en`. Unmatched v1/v2 calls are fulfilled with 501
 * (not continued). `PUT /v1/sell/quote` and `PUT /v1/sell/paymentInfos` answer with one synthetic,
 * deterministic quote so the sell form renders its normal exchange rate and payment information.
 *
 * Intercepted endpoints:
 *   - GET /v1/language, /v1/fiat, /v1/asset, /v1/bankAccount, /v1/country
 *   - GET /v1/setting/infoBanner  (no banner)
 *   - GET /v1/sell/address-check  (LikelyReturn or Ok)
 *   - PUT /v1/sell/paymentInfos  (synthetic quote, any query string)
 *   - PUT /v1/sell/quote         (synthetic quote)
 *   - GET /v2/user
 */

const ADDRESS = '0x1111111111111111111111111111111111111111';
const BANNER =
  'Warning: According to our blockchain analysis, cryptocurrencies sent from this wallet address will most likely not be processed but returned to you.';

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
    blockchains: ['Ethereum'],
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

const ETH_ASSET = {
  id: 1,
  name: 'ETH',
  uniqueName: 'Ethereum/ETH',
  description: 'Ethereum',
  type: 'Coin',
  category: 'Public',
  dexName: 'ETH',
  feeTier: 'Tier0',
  comingSoon: false,
  buyable: true,
  sellable: true,
  cardBuyable: false,
  cardSellable: false,
  instantBuyable: false,
  instantSellable: false,
  blockchain: 'Ethereum',
  decimals: 18,
  sortOrder: 0,
};

const SELL_FEES = {
  rate: 0.0099,
  fixed: 0,
  min: 0,
  dfx: 5,
  bank: 0,
  network: 0.5,
  total: 5.5,
  platform: 0,
};

const SYNTHETIC_SELL = {
  id: 1,
  uid: 'synthetic-sell-1',
  routeId: 1,
  timestamp: '2026-11-11T10:00:00.000Z',
  depositAddress: '0x2222222222222222222222222222222222222222',
  blockchain: 'Ethereum',
  fees: SELL_FEES,
  minVolume: 0.01,
  maxVolume: 100,
  amount: 0.1,
  asset: ETH_ASSET,
  feesTarget: SELL_FEES,
  minVolumeTarget: 10,
  maxVolumeTarget: 250000,
  exchangeRate: 0.000407,
  priceSteps: [],
  rate: 0.000404,
  exactPrice: true,
  estimatedAmount: 245.5,
  currency: CHF_FIAT,
  beneficiary: { name: 'Synthetic Customer', iban: 'CH9300762011623852957' },
  isValid: true,
};

async function installSellRoutes(page: Page, addressCheckResult: 'LikelyReturn' | 'Ok'): Promise<void> {
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
      return json(route, [ETH_ASSET]);
    }

    if (method === 'GET' && path === '/v1/bankAccount') {
      return json(route, [
        {
          id: 1,
          iban: 'CH9300762011623852957',
          preferredCurrency: CHF_FIAT,
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
      return json(route, SYNTHETIC_SELL);
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
        blockchains: ['Ethereum'],
        isCustody: false,
      };
      return json(route, {
        id: 1,
        activeAddress: address,
        addresses: [address],
        mail: 'sell-address-check@example.com',
        currency: CHF_FIAT,
        language: { id: 2, name: 'English', symbol: 'EN' },
        kyc: { level: 30, status: 'Completed' },
        disabledAddresses: [],
      });
    }

    await json(route, { error: `Unexpected ${method} ${path}` }, 501);
  });
}

test.describe('Sell address check', () => {
  test.use({ timezoneId: 'Europe/Zurich' });

  const token = jwt();

  test('sell address check banner shown', async ({ page }) => {
    await installSellRoutes(page, 'LikelyReturn');

    await page.goto(`/sell?session=${encodeURIComponent(token)}&lang=en`);
    await expect(page.getByText(BANNER, { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('sell-address-check-01-likely-return.png', {
      fullPage: true,
      maxDiffPixels: 1000,
    });
  });

  test('sell address check without banner', async ({ page }) => {
    await installSellRoutes(page, 'Ok');

    const addressCheckResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && new URL(response.url()).pathname === '/v1/sell/address-check',
      { timeout: 15_000 },
    );

    await page.goto(`/sell?session=${encodeURIComponent(token)}&lang=en`);
    await expect(page.getByText('You spend', { exact: true })).toBeVisible({ timeout: 15_000 });

    const response = await addressCheckResponse;
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ result: 'Ok' });
    await expect(page.getByText(BANNER, { exact: true })).toHaveCount(0);

    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('sell-address-check-02-ok.png', {
      fullPage: true,
      maxDiffPixels: 1000,
    });
  });
});
