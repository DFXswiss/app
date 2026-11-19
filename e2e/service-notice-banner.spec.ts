import { expect, Page, Route, test } from '@playwright/test';

/**
 * Visual regression: service notice banner.
 *
 * Every page shows the slim notice at the top of the content column; /sell and /swap show the
 * prominent notice there instead, above the form. On /buy the slim notice adds that buying works as
 * usual and the customer follows the details below.
 *
 * Routes:
 *   - /support (slim notice)
 *   - /sell  (prominent notice)
 *   - /swap  (prominent notice)
 *   - /buy   (slim notice with the buy sentence)
 *
 * Auth is a synthetic unsigned JWT (`alg: none`, role User). Bootstrap GETs are mocked via
 * page.route, so the suite does not need a live API. A green run does not prove production auth.
 * UI language is pinned with `lang=en`. Unmatched v1/v2 calls are fulfilled with 501.
 */

const SLIM_EN =
  'Due to a security incident affecting DFX deposit addresses, selling is temporarily unavailable. Customer data and customer funds are not affected. All customer data and customer funds are safe and will be processed as quickly as possible. Do not send funds to deposit addresses you received from DFX before 18 November 2026.';
const BUY_EN = 'Buying works as usual; just follow the details below.';
const PROMINENT_EN =
  'Due to a security incident affecting DFX deposit addresses, selling and swapping are temporarily unavailable. Customer data and customer funds are not affected. All customer data and customer funds are safe and will be processed as quickly as possible. Do not send funds to any deposit address you received from DFX before 18 November 2026 — these addresses must no longer be used.';
const HINT_EN = ' Questions: Open a support ticket';

const ADDRESS = '0x0000000000000000000000000000000000000001';

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    address: ADDRESS,
    blockchains: ['Ethereum'],
    role: 'User',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

async function installRoutes(page: Page): Promise<void> {
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
      return json(route, [
        {
          id: 1,
          name: 'CHF',
          buyable: true,
          sellable: true,
          cardBuyable: false,
          cardSellable: false,
          instantBuyable: false,
          instantSellable: false,
        },
      ]);
    }

    if (method === 'GET' && ['/v1/asset', '/v1/bankAccount', '/v1/country'].includes(path)) {
      return json(route, []);
    }

    // No CMS info banner, so the screenshots show only the service notice.
    if (method === 'GET' && path === '/v1/setting/infoBanner') {
      return json(route, null);
    }

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

    if (method === 'GET' && path === '/v2/user') {
      return json(route, {
        id: 1,
        activeAddress: { address: ADDRESS, wallet: 'DFX', explorerUrl: 'https://example.invalid' },
        addresses: [{ address: ADDRESS, wallet: 'DFX', explorerUrl: 'https://example.invalid' }],
        mail: 'service-notice@example.com',
        currency: { id: 1, name: 'CHF' },
        language: { id: 2, name: 'English', symbol: 'EN' },
        kyc: { level: 30, status: 'Completed', dataComplete: true },
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

test.describe('Service notice banner', () => {
  test.use({ timezoneId: 'Europe/Zurich' });

  const token = jwt();

  const cases = [
    // The slim notice is shot on the support landing page, which renders fully with these mocks.
    { path: '/support', variant: 'slim', text: `${SLIM_EN}${HINT_EN}`, file: 'service-notice-banner-01-support.png' },
    {
      path: '/sell',
      variant: 'prominent',
      text: `${PROMINENT_EN}${HINT_EN}`,
      file: 'service-notice-banner-02-sell.png',
    },
    {
      path: '/swap',
      variant: 'prominent',
      text: `${PROMINENT_EN}${HINT_EN}`,
      file: 'service-notice-banner-03-swap.png',
    },
    {
      path: '/buy',
      variant: 'slim',
      text: `${SLIM_EN} ${BUY_EN}${HINT_EN}`,
      file: 'service-notice-banner-04-buy.png',
    },
  ];

  for (const { path, variant, text, file } of cases) {
    test(`${path} shows the ${variant} notice at the top of the content`, async ({ page }) => {
      await installRoutes(page);

      await page.goto(`${path}?session=${encodeURIComponent(token)}&lang=en`);
      await expect(page.locator('.animate-spin')).toHaveCount(0, { timeout: 15_000 });

      const notice = page.getByTestId('service-notice-banner');
      await expect(notice).toHaveAttribute('data-variant', variant, { timeout: 15_000 });
      await expect(notice).toHaveText(text);

      await page.waitForTimeout(1000);
      await expect(page).toHaveScreenshot(file, { fullPage: true, maxDiffPixels: 1000 });
    });
  }
});
