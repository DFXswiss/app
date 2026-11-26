import { expect, Page, Route, test } from '@playwright/test';

const OTP = 'synthetic-merge-otp';
const KYC_HASH = 'SYNTHETIC_MASTER_KYC_HASH';
const ADDRESS = '0x1111111111111111111111111111111111111111';

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
  mail: 'account-merge@example.com',
  currency: CHF_FIAT,
  language: { id: 2, name: 'English', symbol: 'EN' },
  kyc: { hash: KYC_HASH, level: 50, status: 'Completed' },
  tradingLimit: { limit: 1000, period: 'Month' },
  disabledAddresses: [],
};

// Same KycInfo shape as e2e/helpers/merged-redirect-fixtures.ts (kycLevel, tradingLimit, language,
// kycSteps, kycClients all required), with the level and limit of the merged, verified USER above.
const KYC_INFO = {
  kycLevel: 50,
  tradingLimit: { limit: 1000, period: 'Month' },
  language: { id: 2, name: 'English', symbol: 'EN', foreignName: 'English', enable: true },
  kycSteps: [],
  kycClients: [],
};

const GET_RESPONSES: Record<string, unknown> = {
  '/v1/language': [
    { id: 1, name: 'Deutsch', symbol: 'DE', foreignName: 'Deutsch', enable: true },
    { id: 2, name: 'English', symbol: 'EN', foreignName: 'English', enable: true },
  ],
  '/v1/fiat': [CHF_FIAT],
  '/v1/asset': [],
  '/v1/bankAccount': [],
  '/v1/country': [],
  '/v1/setting/infoBanner': null,
  '/v2/user': USER,
  '/v2/kyc': KYC_INFO,
};

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installRoutes(page: Page): Promise<void> {
  await page.route(/\/v[12]\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    // The merge confirmation answers at once with the merged account, not with a job ticket.
    if (method === 'GET' && path === '/v1/auth/mail/confirm' && url.searchParams.get('code') === OTP) {
      return json(route, { kycHash: KYC_HASH, accessToken: jwt() });
    }

    if (method === 'GET' && path in GET_RESPONSES) return json(route, GET_RESPONSES[path]);

    if (method === 'POST' && path === '/v1/log/clientError') return json(route, {}, 201);

    await json(route, { error: `Unexpected ${method} ${path}` }, 501);
  });
}

test.describe('Account Merge - UI Flow', () => {
  test('shows the added wallet address and the My account button', async ({ page }) => {
    await installRoutes(page);

    await page.goto(`/account-merge?otp=${OTP}&lang=en`);

    await expect(page.getByText('Wallet address added', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'My account', exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('account-merge-confirmed.png', {
      fullPage: true,
      maxDiffPixels: 1000,
    });
  });
});
