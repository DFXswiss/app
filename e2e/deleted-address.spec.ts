import { expect, Page, Route, test } from '@playwright/test';

/**
 * Visual regression: a session whose signed-in wallet address was deleted sees the
 * deleted-address notice instead of the app, and can activate the address again.
 *
 * Variants:
 *   - the notice with the "Activate address" button
 *   - the notice after a failed activation, showing the API error
 *
 * Auth is a synthetic unsigned JWT (`alg: none`, role User). Bootstrap GETs are mocked
 * via page.route, so the suite does not need a live API. A green run does not prove
 * production auth or the API's reactivation rules.
 *
 * User data is MOCKED with a synthetic fixture so the baselines are deterministic and
 * contain no production data. UI language is pinned with `lang=en`. Unmatched v1/v2
 * calls are fulfilled with 501 (not continued).
 *
 * Intercepted endpoints:
 *   - GET /v1/language, /v1/fiat, /v1/asset, /v1/bankAccount, /v1/country
 *   - GET /v1/setting/infoBanner  (no banner)
 *   - GET /v2/user                (active address with status Deleted)
 *   - PUT /v2/user/reactivate     (rejected in the failure variant)
 */

const ADDRESS = '0x0000000000000000000000000000000000000001';
const REACTIVATION_ERROR = 'Account is deactivated or blocked';

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
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

async function installDeletedAddressRoutes(page: Page): Promise<void> {
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
      return json(route, {});
    }

    await json(route, { error: `Unexpected ${method} ${path}` }, 501);
  });

  await page.route('**/v2/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'GET' && path === '/v2/user') {
      const address = { address: ADDRESS, wallet: 'DFX', explorerUrl: 'https://example.invalid', status: 'Deleted' };
      return json(route, {
        id: 1,
        activeAddress: address,
        addresses: [address],
        mail: 'deleted-address@example.com',
        currency: { id: 1, name: 'CHF' },
        language: { id: 2, name: 'English', symbol: 'EN' },
        kyc: { level: 20, status: 'Completed' },
        disabledAddresses: [],
      });
    }

    if (method === 'PUT' && path === '/v2/user/reactivate') {
      return json(route, { statusCode: 400, message: REACTIVATION_ERROR }, 400);
    }

    await json(route, { error: `Unexpected ${method} ${path}` }, 501);
  });
}

test.describe('Deleted address notice', () => {
  test.use({ timezoneId: 'Europe/Zurich' });

  const token = jwt();

  test('shows the notice with the activate button', async ({ page }) => {
    await installDeletedAddressRoutes(page);

    await page.goto(`/?session=${encodeURIComponent(token)}&lang=en`);
    await expect(page.getByText('This address was deleted. You can activate it again.')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: 'Activate address' })).toBeVisible();

    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('deleted-address-01-notice.png', { fullPage: true, maxDiffPixels: 1000 });
  });

  test('shows the API error when the activation fails', async ({ page }) => {
    await installDeletedAddressRoutes(page);

    await page.goto(`/?session=${encodeURIComponent(token)}&lang=en`);
    await page.getByRole('button', { name: 'Activate address' }).click({ timeout: 15_000 });
    await expect(page.getByText(REACTIVATION_ERROR)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activate address' })).toBeVisible();

    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('deleted-address-02-activation-failed.png', {
      fullPage: true,
      maxDiffPixels: 1000,
    });
  });
});
