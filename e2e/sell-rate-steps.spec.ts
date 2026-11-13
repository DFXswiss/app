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

const DSC_ASSET = {
  id: 1,
  name: 'DSC',
  uniqueName: 'Ethereum/DSC',
  description: 'Ethereum',
  type: 'Coin',
  category: 'Public',
  dexName: 'DSC',
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
  rate: 0.0199,
  fixed: 0,
  min: 0,
  dfx: 0.00089702,
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
  blockchain: 'Ethereum',
  fees: SELL_FEES,
  minVolume: 0.01,
  maxVolume: 100,
  amount: 0.03,
  asset: DSC_ASSET,
  feesTarget: { ...SELL_FEES, dfx: 0.05, network: 0, total: 0.05, platform: 0.02 },
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
      return json(route, [DSC_ASSET]);
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
  await rate.click();
  await expect(page.getByText('Base rate', { exact: true })).toBeVisible();
  await expect(page.getByText(/DSC to USD at 55\.661 USD\/DSC on Denario/)).toBeVisible();
  await expect(page).toHaveScreenshot('sell-rate-steps-01-expanded.png', { fullPage: true });
});
