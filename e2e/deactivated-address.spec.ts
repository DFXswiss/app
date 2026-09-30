import { expect, Page, Route, test } from '@playwright/test';

/**
 * E2E Visual Regression Tests: Deactivated Address
 *
 * Routes:
 *   - /settings (central deactivation notice and the delete-address dialog)
 *
 * Auth uses synthetic unsigned JWTs (`alg: none`, role User). All feature data is synthetic, and
 * unmatched v1/v2 calls return 501, so the suite does not need a live API. A green run proves the
 * mocked UI flow and screenshots only; it does not prove live authentication or API behavior.
 *
 * Intercepted endpoints:
 *   - GET  /v1/language, /v1/fiat, /v1/asset, /v1/bankAccount, /v1/country, /v1/setting/infoBanner
 *   - POST /v1/log/clientError
 *   - GET  /v2/user
 *   - POST /v2/user/addresses/0x0000000000000000000000000000000000000001/reactivate
 *   - PUT/PATCH /v1/user, /v2/user
 *
 * Synthetic fixtures: fake ids, addresses, and tokens only.
 */

const ADDRESS = '0x0000000000000000000000000000000000000001';

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function jwt(suffix = 'synthetic'): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    role: 'User',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.${suffix}`;
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

interface RouteOptions {
  initiallyDeleted?: boolean;
  failReactivation?: boolean;
}

async function installRoutes(
  page: Page,
  { initiallyDeleted = true, failReactivation = false }: RouteOptions = {},
): Promise<void> {
  let reactivated = false;

  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'POST' && path === '/v1/log/clientError') {
      return json(route, null);
    }

    if ((method === 'PUT' || method === 'PATCH') && (path === '/v1/user' || path.startsWith('/v1/user/'))) {
      return json(route, {});
    }

    if (method === 'GET' && path === '/v1/language') {
      return json(route, [
        { id: 1, name: 'Deutsch', symbol: 'DE', foreignName: 'Deutsch', enable: true },
        { id: 2, name: 'English', symbol: 'EN', foreignName: 'English', enable: true },
      ]);
    }

    if (method === 'GET' && path === '/v1/fiat') {
      return json(route, [CHF_FIAT]);
    }

    if (method === 'GET' && ['/v1/asset', '/v1/bankAccount', '/v1/country'].includes(path)) {
      return json(route, []);
    }

    if (method === 'GET' && path === '/v1/setting/infoBanner') {
      return json(route, null);
    }

    await json(route, { error: 'Unexpected test request' }, 501);
  });

  await page.route('**/v2/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if ((method === 'PUT' || method === 'PATCH') && (path === '/v2/user' || path.startsWith('/v2/user/'))) {
      return json(route, {});
    }

    if (method === 'POST' && path === `/v2/user/addresses/${ADDRESS}/reactivate`) {
      if (failReactivation) {
        return json(route, { statusCode: 400, message: 'Address cannot be reactivated', error: 'Bad Request' }, 400);
      }

      reactivated = true;
      return json(route, { accessToken: jwt('reactivated') }, 201);
    }

    if (method === 'GET' && path === '/v2/user') {
      const deletionState = initiallyDeleted ? { isDeleted: !reactivated } : {};
      return json(route, {
        id: 1,
        activeAddress: {
          address: ADDRESS,
          label: 'Primary address',
          wallet: 'Browser wallet',
          explorerUrl: 'https://example.invalid',
          ...deletionState,
        },
        addresses: [
          {
            address: ADDRESS,
            label: 'Primary address',
            wallet: 'Browser wallet',
            explorerUrl: 'https://example.invalid',
            ...deletionState,
          },
        ],
        mail: 'address.reactivation@example.com',
        currency: { id: 1, name: 'CHF' },
        language: { id: 2, name: 'English', symbol: 'EN' },
        kyc: { level: 20, status: 'InProgress', phoneCallStatus: 'Completed' },
        disabledAddresses: [],
      });
    }

    await json(route, { error: 'Unexpected test request' }, 501);
  });
}

test.describe('Deactivated Address - Visual Regression Tests', () => {
  const token = jwt();

  test('shows the English deactivated-address notice instead of Settings', async ({ page }) => {
    await installRoutes(page);

    await page.goto(`/settings?session=${encodeURIComponent(token)}&lang=en`);
    await expect(page.getByText('This address is deactivated in DFX.')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);

    await expect(page.getByRole('button', { name: 'Reactivate address' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Danger Zone' })).toHaveCount(0);
    await expect(page).toHaveScreenshot('deactivated-address-01-notice.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('shows the German deactivated-address notice', async ({ page }) => {
    await installRoutes(page);

    await page.goto(`/settings?session=${encodeURIComponent(token)}&lang=de`);
    await expect(page.getByText('Diese Adresse ist bei DFX deaktiviert.')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);

    await expect(page.getByRole('button', { name: 'Adresse reaktivieren' })).toBeVisible();
    await expect(page).toHaveScreenshot('deactivated-address-02-notice-de.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('shows an API error and allows another reactivation attempt', async ({ page }) => {
    await installRoutes(page, { failReactivation: true });

    await page.goto(`/settings?session=${encodeURIComponent(token)}&lang=en`);
    const button = page.getByRole('button', { name: 'Reactivate address' });
    await expect(button).toBeVisible({ timeout: 15_000 });
    await button.click();

    await expect(page.getByText('Address cannot be reactivated')).toBeVisible();
    await expect(button).toBeEnabled();
    await expect(page).toHaveScreenshot('deactivated-address-03-error.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('renders Settings after successful reactivation without navigation', async ({ page }) => {
    await installRoutes(page);

    await page.goto(`/settings?session=${encodeURIComponent(token)}&lang=en`);
    const button = page.getByRole('button', { name: 'Reactivate address' });
    await expect(button).toBeVisible({ timeout: 15_000 });
    await button.click();

    await expect(page.getByRole('button', { name: 'Danger Zone' })).toBeVisible();
    await expect(page.getByText('This address is deactivated in DFX.')).toHaveCount(0);
  });

  test('explains reactivation in the delete-address dialog', async ({ page }) => {
    await installRoutes(page, { initiallyDeleted: false });

    await page.goto(`/settings?session=${encodeURIComponent(token)}&lang=en`);

    const address = page.getByText(ADDRESS, { exact: true });
    await expect(address).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);
    const addressRow = address.locator('xpath=../..');
    await addressRow.getByRole('button').click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.getByText('You can reactivate it by signing in with it again.')).toBeVisible();
    await expect(page).toHaveScreenshot('deactivated-address-04-delete-dialog.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });
});
