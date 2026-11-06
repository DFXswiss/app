import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Visual baselines for the merchant page on /pl?merchant=<route>.
 * Each picture is the whole page.
 * The page reads its content from GET /v1/paymentLink/merchant and the wallet list from
 * GET /v1/paymentLink/walletApp, which these specs answer themselves, and creates no payment.
 * The wallets and their icons are synthetic, so the pictures do not depend on the live list.
 * These specs are a local review aid and do not run in CI.
 * A green run does not prove that the API returns this merchant info or this wallet list,
 * or that it answers an unknown route with this 404.
 */

const ROUTE = 'shop-route';

const MERCHANT_INFO = {
  displayName: 'Bäckerei Muster',
  mode: 'Multiple',
  recipient: {
    name: 'Bäckerei Muster AG',
    address: { street: 'Bahnhofstrasse', houseNumber: '1', zip: '8001', city: 'Zürich', country: 'CH' },
    phone: '+41 44 000 00 00',
    mail: 'info@example.com',
    website: 'example.com',
  },
  transferAmounts: [
    { method: 'Lightning', assets: [{ asset: 'BTC' }] },
    { method: 'Ethereum', assets: [{ asset: 'ZCHF' }, { asset: 'USDT' }] },
    { method: 'Polygon', assets: [{ asset: 'ZCHF' }] },
  ],
};

function walletIcon(color: string, letter: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><rect width="60" height="60" fill="${color}"/><text x="30" y="40" font-family="sans-serif" font-size="28" font-weight="bold" fill="#fff" text-anchor="middle">${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Recommended, compatible and semi-compatible wallets. The multichain wallet supports only ZCHF,
// so its view lists fewer payment methods than the merchant offers.
const WALLETS = [
  {
    id: 1,
    name: 'Lightning Wallet',
    iconUrl: walletIcon('#f7931a', 'L'),
    websiteUrl: 'https://lightning-wallet.example.com',
    supportedMethods: ['Lightning'],
    recommended: true,
    active: true,
  },
  {
    id: 2,
    name: 'Multichain Wallet',
    iconUrl: walletIcon('#072440', 'M'),
    websiteUrl: 'https://multichain-wallet.example.com',
    supportedMethods: ['Ethereum', 'Polygon'],
    supportedAssets: [{ name: 'ZCHF', uniqueName: 'Ethereum/ZCHF' }],
    recommended: true,
    active: true,
  },
  {
    id: 3,
    name: 'Pocket Wallet',
    iconUrl: walletIcon('#3a8a5c', 'P'),
    supportedMethods: ['Lightning'],
    active: true,
  },
  {
    id: 4,
    name: 'Exchange App',
    iconUrl: walletIcon('#8a3a7a', 'E'),
    supportedMethods: ['Ethereum'],
    semiCompatible: true,
    active: true,
  },
];

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function stubAppApi(page: Page): Promise<void> {
  await page.route('**/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/v1/setting/infoBanner') return fulfillJson(route, 200, null);
    if (path === '/v1/language') {
      return fulfillJson(route, 200, [
        { id: 1, name: 'Deutsch', symbol: 'DE' },
        { id: 2, name: 'English', symbol: 'EN' },
      ]);
    }
    return fulfillJson(route, 200, []);
  });
  await page.route('**/v2/**', (route) => fulfillJson(route, 200, {}));
}

// Records every payment-link request, so a test can show that the page creates no payment.
async function stubMerchant(page: Page, status: number, body: unknown): Promise<string[]> {
  const requested: string[] = [];
  await page.route('**/paymentLink/**', (route) => {
    const url = new URL(route.request().url());
    requested.push(`${route.request().method()} ${url.pathname}`);
    if (url.pathname.endsWith('/paymentLink/merchant') && url.searchParams.get('route') === ROUTE) {
      return fulfillJson(route, status, body);
    }
    if (url.pathname.endsWith('/paymentLink/walletApp')) return fulfillJson(route, 200, WALLETS);
    return fulfillJson(route, 200, []);
  });
  return requested;
}

async function iconsLoaded(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll('img[src^="data:image/svg+xml"]')).every(
          (img) => (img as HTMLImageElement).complete && getComputedStyle(img).opacity === '1',
        ),
      ),
    )
    .toBe(true);
}

async function shoot(page: Page, name: string): Promise<void> {
  await iconsLoaded(page);
  const height = await page.evaluate(async () => {
    const root = document.getElementById('app-root');
    const scroller = root?.querySelector('.overflow-auto');
    if (scroller instanceof HTMLElement) scroller.scrollTop = 0;
    await document.fonts.ready;
    const column = root?.querySelector('.max-w-screen-md');
    const last = column?.lastElementChild;
    if (!(column instanceof HTMLElement) || !(last instanceof HTMLElement)) return 900;
    const pad = Number.parseFloat(getComputedStyle(column).paddingBottom) || 0;
    return Math.ceil(last.getBoundingClientRect().bottom + pad);
  });
  await page.setViewportSize({ width: 1280, height });
  await expect(page).toHaveScreenshot(name, { animations: 'disabled', fullPage: true });
}

test.describe('Merchant page', () => {
  test('visual regression - merchant info with recipient and payment methods', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });
    await stubAppApi(page);
    const requested = await stubMerchant(page, 200, MERCHANT_INFO);

    await page.goto(`/pl?merchant=${ROUTE}&showAssets&lang=en`);

    await expect(page.getByText('Bäckerei Muster', { exact: true })).toBeVisible();
    await expect(page.getByText('Bäckerei Muster AG', { exact: true })).toBeVisible();
    await expect(page.getByText('Ethereum, Polygon', { exact: true })).toBeVisible();
    await expect(page.getByText('USDT', { exact: true })).toBeVisible();
    await expect(page.getByText('RECOMMENDED APPS', { exact: true })).toBeVisible();
    await expect(page.getByText('Multichain Wallet', { exact: true })).toBeVisible();
    await expect(page.getByText('COMPATIBLE APPS', { exact: true })).toBeVisible();
    await expect(page.getByText('SEMI COMPATIBLE APPS', { exact: true })).toBeVisible();
    expect(requested.filter((request) => request.includes('/paymentLink/payment'))).toEqual([]);
    expect(requested).toContain('GET /v1/paymentLink/merchant');
    await shoot(page, 'merchant-page-info.png');
  });

  test('visual regression - selected wallet with its payment methods', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });
    await stubAppApi(page);
    const requested = await stubMerchant(page, 200, MERCHANT_INFO);
    await page.goto(`/pl?merchant=${ROUTE}&lang=en`);
    await expect(page.getByText('Multichain Wallet', { exact: true })).toBeVisible();

    await page.getByText('Multichain Wallet', { exact: true }).click();

    // the wallet view replaces the grid; the payment details above it stay collapsed
    await expect(page.getByText('Supported cryptocurrencies and blockchains', { exact: true })).toBeVisible();
    await expect(page.getByText('RECOMMENDED APPS', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Ethereum, Polygon', { exact: true })).toBeVisible();
    await expect(page.getByText('BTC', { exact: true })).toHaveCount(0);
    await expect(page.getByText('USDT', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open website' })).toBeVisible();
    expect(requested.filter((request) => request.includes('/paymentLink/payment'))).toEqual([]);
    await shoot(page, 'merchant-page-wallet.png');
  });

  test('visual regression - merchant info call fails', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await stubAppApi(page);
    const requested = await stubMerchant(page, 404, {
      statusCode: 404,
      message: 'Payment route not found',
      error: 'Not Found',
    });

    await page.goto(`/pl?merchant=${ROUTE}&lang=en`);

    await expect(page.getByText('Payment route not found', { exact: true })).toBeVisible();
    await expect(page.getByText('Payment details', { exact: true })).toHaveCount(0);
    expect(requested.filter((request) => request.includes('/paymentLink/payment'))).toEqual([]);
    await shoot(page, 'merchant-page-error.png');
  });
});
