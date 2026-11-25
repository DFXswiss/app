import { expect, Page, Route, test } from '@playwright/test';
import { BlockchainType, getCachedAuth } from './helpers/auth-cache';

const IBAN = 'CH9300762011623852957';
const ADDRESS = '0x1111111111111111111111111111111111111111';

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

const ETH_ASSET = {
  id: 111,
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

const FEES = {
  rate: 0.0099,
  fixed: 0,
  min: 0,
  dfx: 0.25,
  bank: 0,
  network: 0,
  total: 0.25,
  platform: 0,
};

const USER_ADDRESS = {
  address: ADDRESS,
  wallet: 'DFX',
  explorerUrl: 'https://example.invalid',
  blockchains: ['Ethereum'],
  isCustody: false,
};

const USER = {
  id: 1,
  accountId: 1,
  activeAddress: USER_ADDRESS,
  addresses: [USER_ADDRESS],
  mail: 'sell-info@example.com',
  currency: CHF_FIAT,
  language: { id: 2, name: 'English', symbol: 'EN' },
  kyc: { level: 30, status: 'Completed' },
  tradingLimit: { limit: 1000, period: 'Month' },
  disabledAddresses: [],
};

const GET_RESPONSES: Record<string, unknown> = {
  '/v1/language': [
    { id: 1, name: 'Deutsch', symbol: 'DE', foreignName: 'Deutsch', enable: true },
    { id: 2, name: 'English', symbol: 'EN', foreignName: 'English', enable: true },
  ],
  '/v1/fiat': [CHF_FIAT],
  '/v1/asset': [ETH_ASSET],
  '/v1/bankAccount': [{ id: 1, iban: IBAN, preferredCurrency: CHF_FIAT, label: 'Main', default: true, active: true }],
  '/v1/country': [],
  '/v1/setting/infoBanner': null,
  '/v2/user': USER,
};

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installRoutes(page: Page, error: 'AmountTooLow' | 'KycRequired'): Promise<void> {
  await page.route(/\/v[12]\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'GET' && path in GET_RESPONSES) return json(route, GET_RESPONSES[path]);

    if (method === 'PUT' && path === '/v1/sell/paymentInfos') {
      return json(route, {
        id: 1,
        uid: 'synthetic-sell-info',
        routeId: 1,
        timestamp: '2026-11-11T10:00:00.000Z',
        blockchain: 'Ethereum',
        fees: FEES,
        feesTarget: FEES,
        minVolume: 0.05,
        maxVolume: 100,
        minVolumeTarget: 125,
        maxVolumeTarget: 250000,
        amount: 0.01,
        asset: ETH_ASSET,
        estimatedAmount: 24.5,
        currency: CHF_FIAT,
        beneficiary: { name: 'Synthetic Customer', iban: IBAN },
        exchangeRate: 0.000407,
        rate: 0.000404,
        priceSteps: [],
        exactPrice: true,
        isValid: false,
        error,
      });
    }

    if (method === 'POST' && path === '/v1/log/clientError') return json(route, {}, 201);

    await json(route, { error: `Unexpected ${method} ${path}` }, 501);
  });
}

test.describe('Sell Info - UI Flow', () => {
  async function getToken(
    request: Parameters<Parameters<typeof test>[1]>[0]['request'],
    walletType: BlockchainType = 'evm',
  ): Promise<string> {
    const auth = await getCachedAuth(request, walletType);
    return auth.token;
  }

  test('shows the minimum amount and a Close button', async ({ page, request }) => {
    const token = await getToken(request);
    await installRoutes(page, 'AmountTooLow');

    await page.goto(
      `/sell/info?session=${token}&blockchain=Ethereum&asset-in=ETH&asset-out=CHF&amount-in=0.01&bank-account=${IBAN}&lang=en`,
    );

    await expect(page.getByText(/Entered amount is below minimum deposit of [\d.,\s]+ ETH/)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('sell-info-amount-too-low.png', {
      fullPage: true,
      maxDiffPixels: 1000,
    });
  });

  test('shows the KYC hint', async ({ page, request }) => {
    const token = await getToken(request);
    await installRoutes(page, 'KycRequired');

    await page.goto(
      `/sell/info?session=${token}&blockchain=Ethereum&asset-in=ETH&asset-out=CHF&amount-in=0.01&bank-account=${IBAN}&lang=en`,
    );

    await expect(
      page.getByText(
        'This transaction is only possible with a verified account. Please complete our KYC (Know-Your-Customer) process.',
      ),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Complete KYC', exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('sell-info-kyc-required.png', {
      fullPage: true,
      maxDiffPixels: 1000,
    });
  });
});
