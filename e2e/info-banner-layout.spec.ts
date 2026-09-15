import { expect, Page, Route, test } from '@playwright/test';

/**
 * Visual regression: CMS info banner sits inside the app content column, below the
 * navigation header — not as a full-bleed strip above the chrome.
 *
 * Routes:
 *   - /support          (support landing)
 *   - /support/tickets  (ticket list; the screen the operator compared)
 *
 * Auth is a synthetic unsigned JWT (`alg: none`, role User). Bootstrap GETs are mocked
 * via page.route, so the suite does not need a live API. A green run does not prove
 * production auth or that the API returns this banner copy.
 *
 * Feature data is MOCKED with synthetic fixtures so the baselines are deterministic and
 * contain no production data. UI language is pinned with `lang=en`. Unmatched v1/v2
 * calls are fulfilled with 501 (not continued).
 *
 * Intercepted endpoints:
 *   - GET /v1/language, /v1/fiat, /v1/asset, /v1/bankAccount, /v1/country
 *   - GET /v1/setting/infoBanner  (synthetic multilingual maintenance copy)
 *   - GET /v1/support/issue       (one open ticket so /support/tickets does not redirect)
 *   - GET /v2/user
 */

const BANNER_EN =
  'Bank Frick is undergoing maintenance: from Fri 11 Sep 22:00 until Sat 12 Sep 15:00 (expected), online banking, API and instant payments are unavailable. Bank transfers may be delayed during this window.';

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    role: 'User',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

const TICKET = {
  uid: 'SI-TEST-0001',
  type: 'TransactionIssue',
  reason: 'FundsNotReceived',
  state: 'Pending',
  created: '2026-09-11T10:00:00.000Z',
};

async function installSupportRoutes(page: Page): Promise<void> {
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

    if (method === 'GET' && path === '/v1/setting/infoBanner') {
      return json(route, {
        de: BANNER_EN,
        en: BANNER_EN,
        fr: BANNER_EN,
        it: BANNER_EN,
      });
    }

    if (method === 'GET' && path === '/v1/support/issue') {
      return json(route, [TICKET]);
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
        activeAddress: {
          address: '0x0000000000000000000000000000000000000001',
          wallet: 'DFX',
          explorerUrl: 'https://example.invalid',
        },
        addresses: [
          {
            address: '0x0000000000000000000000000000000000000001',
            wallet: 'DFX',
            explorerUrl: 'https://example.invalid',
          },
        ],
        mail: 'info-banner@example.com',
        currency: { id: 1, name: 'CHF' },
        language: { id: 2, name: 'English', symbol: 'EN' },
        kyc: { level: 20, status: 'Completed' },
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

test.describe('Info banner layout', () => {
  test.use({ timezoneId: 'Europe/Zurich' });

  const token = jwt();

  test('support landing shows the banner below the header', async ({ page }) => {
    await installSupportRoutes(page);

    await page.goto(`/support?session=${encodeURIComponent(token)}&lang=en`);
    await expect(page.getByText('FAQ', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('info-banner')).toHaveText(BANNER_EN);
    await expect(page.getByRole('button', { name: 'View tickets' })).toBeVisible();

    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('info-banner-layout-01-support.png', {
      fullPage: true,
      maxDiffPixels: 1000,
    });
  });

  test('support tickets shows the banner inside the content column', async ({ page }) => {
    await installSupportRoutes(page);

    await page.goto(`/support/tickets?session=${encodeURIComponent(token)}&lang=en`);
    await expect(page.getByText('Support tickets')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('info-banner')).toHaveText(BANNER_EN);
    await expect(page.getByText('Transaction issue')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create ticket' })).toBeVisible();

    const banner = page.getByTestId('info-banner');
    const nav = page.getByText('Support tickets');
    const box = await banner.boundingBox();
    const navBox = await nav.boundingBox();
    if (!box || !navBox) {
      throw new Error('Expected banner and navigation bounding boxes');
    }
    expect(box.y).toBeGreaterThan(navBox.y);

    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('info-banner-layout-02-tickets.png', {
      fullPage: true,
      maxDiffPixels: 1000,
    });
  });
});
