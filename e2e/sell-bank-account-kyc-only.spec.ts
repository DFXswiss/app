import { test, expect, Page, Route } from '@playwright/test';

/**
 * E2E Visual Regression Tests: sell and sell-info KYC-only bank-account hint.
 *
 * Routes:
 *   - /sell?bank-account=…       (auto-create from the link)
 *   - /sell/info?bank-account=…  (auto-create from the link)
 *
 * Auth is a synthetic unsigned JWT with an address, so the address guard stays on the
 * screen. Bootstrap GETs and POST /v1/bankAccount are mocked. A green run does not prove
 * that the API emits this rejection. It proves the screen renders it.
 */

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    role: 'User',
    address: '0x0000000000000000000000000000000000000001',
    blockchains: ['Ethereum'],
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

const ADDRESS = '0x0000000000000000000000000000000000000001';
const EXAMPLE_IBAN = 'DE89370400440532013000';

const CHF = {
  id: 1,
  name: 'CHF',
  buyable: true,
  sellable: true,
  cardBuyable: false,
  cardSellable: false,
  instantBuyable: false,
  instantSellable: false,
};

const ETH = {
  id: 2,
  name: 'ETH',
  uniqueName: 'Ethereum/ETH',
  description: 'Ethereum',
  blockchain: 'Ethereum',
  category: 'Public',
  buyable: true,
  sellable: true,
  comingSoon: false,
};

const KYC_REJECTION = 'You cannot add an IBAN to a KYC only account';
const MULTI_REJECTION = 'Multi-account IBAN cannot be added';

const HINT = {
  de: 'Ein Bankkonto kann erst hinzugefügt werden, wenn eine Wallet mit diesem Konto verknüpft ist.',
  en: 'A bank account can only be added once a wallet is linked to this account.',
} as const;

const MULTI = {
  de: 'Dies ist eine Multi-Account-IBAN und kann nicht als persönliches Konto hinzugefügt werden.',
  en: 'This is a multi-account IBAN and cannot be added as a personal account.',
} as const;

const CONNECT = {
  de: 'Verbinde Deine Wallet',
  en: 'Connect your wallet',
} as const;

async function installRoutes(page: Page, rejectionMessage: string): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'POST' && path === '/v1/bankAccount') {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 400,
          message: rejectionMessage,
          error: 'Bad Request',
        }),
      });
    }

    if ((method === 'PUT' || method === 'PATCH') && (path === '/v1/user' || path.startsWith('/v1/user/'))) {
      return json(route, {});
    }

    if (method === 'GET' && path === '/v1/language') {
      return json(route, [
        { id: 1, name: 'Deutsch', foreignName: 'German', symbol: 'DE', enable: true },
        { id: 2, name: 'English', foreignName: 'Englisch', symbol: 'EN', enable: true },
      ]);
    }

    if (method === 'GET' && path === '/v1/fiat') return json(route, [CHF]);

    if (method === 'GET' && path === '/v1/asset') return json(route, [ETH]);

    if (method === 'GET' && path === '/v1/country') {
      return json(route, [
        {
          id: 1,
          symbol: 'DE',
          name: 'Germany',
          foreignName: 'Deutschland',
          enable: true,
          kycAllowed: true,
          kycOrganizationAllowed: true,
          nationalityAllowed: true,
          ibanAllowed: true,
        },
      ]);
    }

    if (method === 'GET' && path === '/v1/bankAccount') return json(route, []);

    if (method === 'GET' && path === '/v1/setting/infoBanner') return json(route, null);

    if (method === 'GET' && (path === '/v1/blockchain' || path === '/v1/price')) return json(route, []);

    await route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ error: `Unexpected ${method} ${path}` }),
    });
  });

  await page.route('**/v2/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if ((method === 'PUT' || method === 'PATCH') && (path === '/v2/user' || path.startsWith('/v2/user/'))) {
      return json(route, {});
    }

    if (method === 'GET' && path === '/v2/user') {
      return json(route, {
        id: 1,
        accountId: 1,
        mail: 'sell.kyconly@example.com',
        currency: CHF,
        language: { id: 2, name: 'English', symbol: 'EN' },
        kyc: { level: 50, status: 'Completed' },
        address: ADDRESS,
        addresses: [{ address: ADDRESS, blockchains: ['Ethereum'] }],
        disabledAddresses: [],
      });
    }

    await route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ error: `Unexpected ${method} ${path}` }),
    });
  });
}

function sellUrl(lang: 'de' | 'en'): string {
  const token = jwt();
  const params = new URLSearchParams({
    session: token,
    lang,
    blockchain: 'Ethereum',
    'asset-in': 'ETH',
    'asset-out': 'CHF',
    'amount-in': '0.1',
    'bank-account': EXAMPLE_IBAN,
  });
  return `/sell?${params.toString()}`;
}

function sellInfoUrl(lang: 'de' | 'en'): string {
  const token = jwt();
  const params = new URLSearchParams({
    session: token,
    lang,
    blockchain: 'Ethereum',
    'asset-in': 'ETH',
    'asset-out': 'CHF',
    'amount-in': '0.1',
    'bank-account': EXAMPLE_IBAN,
  });
  return `/sell/info?${params.toString()}`;
}

test.describe('Sell bank account KycOnly - Visual Regression Tests', () => {
  test('German hint on sell after a KYC-only IBAN rejection', async ({ page }) => {
    await installRoutes(page, KYC_REJECTION);
    await page.goto(sellUrl('de'));

    await expect(page.getByText(HINT.de)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('sell-kyc-only-de.png', { fullPage: true, maxDiffPixels: 5000 });

    await page.getByRole('link', { name: CONNECT.de }).click();
    await expect(page).toHaveURL(/\/connect/);
  });

  test('English hint on sell after a KYC-only IBAN rejection', async ({ page }) => {
    await installRoutes(page, KYC_REJECTION);
    await page.goto(sellUrl('en'));

    await expect(page.getByText(HINT.en)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Something went wrong/)).toHaveCount(0);
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('sell-kyc-only-en.png', { fullPage: true, maxDiffPixels: 5000 });

    await page.getByRole('link', { name: CONNECT.en }).click();
    await expect(page).toHaveURL(/\/connect/);
  });

  test('German hint on sell confirmation after a KYC-only IBAN rejection', async ({ page }) => {
    await installRoutes(page, KYC_REJECTION);
    await page.goto(sellInfoUrl('de'));

    await expect(page.getByText(HINT.de)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('sell-info-kyc-only-de.png', { fullPage: true, maxDiffPixels: 5000 });

    await page.getByRole('link', { name: CONNECT.de }).click();
    await expect(page).toHaveURL(/\/connect/);
  });

  test('German multi-account hint on sell', async ({ page }) => {
    await installRoutes(page, MULTI_REJECTION);
    await page.goto(sellUrl('de'));

    await expect(page.getByText(MULTI.de)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot('sell-multi-account-de.png', { fullPage: true, maxDiffPixels: 5000 });
  });

  test('German multi-account hint on sell confirmation', async ({ page }) => {
    await installRoutes(page, MULTI_REJECTION);
    await page.goto(sellInfoUrl('de'));

    await expect(page.getByText(MULTI.de)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot('sell-info-multi-account-de.png', { fullPage: true, maxDiffPixels: 5000 });
  });
});
