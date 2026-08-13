import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Visual regression: the payment-routes QR setting label.
 *
 * "Display QR code" was renamed to "Always show QR code" so the merchant-facing
 * dropdown matches the force-switch meaning of `displayQr`. This spec opens the
 * authenticated routes screen on mocked APIs, expands the default configuration
 * row, and snapshots the new label.
 *
 * All /v1 and /v2 APIs are mocked. Session is a synthetic JWT so the address
 * guard lets the screen mount without a live backend.
 */

function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    role: 'User',
    address: '0x0000000000000000000000000000000000000001',
    blockchains: ['Ethereum'],
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  })}.synthetic`;
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
    },
    body: JSON.stringify(body),
  });
}

const BUY_ROUTES = {
  buy: [
    {
      id: 1,
      active: true,
      asset: { name: 'BTC', blockchain: 'Bitcoin' },
      bankUsage: 'DFX BUY 1',
      volume: 0,
      annualVolume: 0,
    },
  ],
  sell: [] as unknown[],
  swap: [] as unknown[],
};

const PAYMENT_LINKS = [
  {
    id: 'pl-handbook-routes',
    routeId: 1,
    status: 'Active',
    label: 'Handbook Shop Link',
    externalId: 'ext-handbook-routes',
    url: 'https://pay.example/pl',
    lnurl: 'lnurl1handbookroutes',
    config: { displayQr: false },
  },
];

async function installRoutesMocks(page: Page): Promise<void> {
  await page.route(/dev\.api\.dfx\.swiss\/v[12]\//, async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
      });
      return;
    }

    if (request.method() === 'GET' && path === '/v2/user') {
      await fulfillJson(route, {
        id: 1,
        accountId: 'acc-handbook-routes',
        paymentLink: { active: true, url: 'https://pay.example' },
        activeAddress: {
          address: '0x0000000000000000000000000000000000000001',
          blockchains: ['Ethereum'],
        },
        addresses: [],
        kyc: { level: 30, status: 'Completed' },
        language: { id: 1, name: 'English', symbol: 'EN' },
      });
      return;
    }

    if (request.method() === 'GET' && /\/v1\/route\/?$/.test(path)) {
      await fulfillJson(route, BUY_ROUTES);
      return;
    }

    if (request.method() === 'GET' && path.includes('/paymentLink/config')) {
      await fulfillJson(route, {
        standards: ['OpenCryptoPay'],
        minCompletionStatus: 'TxReceived',
        displayQr: false,
        fee: 0,
        paymentTimeout: 60,
        cancellable: true,
      });
      return;
    }

    if (path.includes('/paymentLink/pos')) {
      await fulfillJson(route, { url: 'https://pos.example/handbook' });
      return;
    }

    if (request.method() === 'GET' && path.includes('/paymentLink')) {
      await fulfillJson(route, PAYMENT_LINKS);
      return;
    }

    if (path.includes('/setting/infoBanner')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: 'null',
      });
      return;
    }

    await fulfillJson(route, []);
  });
}

const screenshotOpts = {
  animations: 'disabled' as const,
  maxDiffPixels: 200,
};

test.describe('Payment routes — Always show QR code label', () => {
  test.use({
    viewport: { width: 1280, height: 900 },
    isMobile: false,
    hasTouch: false,
  });

  test('default configuration shows Always show QR code', async ({ page }) => {
    await installRoutesMocks(page);
    await page.goto(`/routes?session=${jwt()}&lang=en`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Payment Links', { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Handbook Shop Link', { exact: true })).toBeVisible();
    await expect(page.getByText('Default configuration', { exact: true })).toBeVisible();

    await page.getByText('Default configuration', { exact: true }).locator('xpath=following-sibling::div').click();

    await expect(page.getByText('Always show QR code', { exact: true })).toBeVisible();
    await expect(page.getByText('Display QR code', { exact: true })).toHaveCount(0);

    await expect(page).toHaveScreenshot('payment-routes-qr-label.png', screenshotOpts);
  });
});
