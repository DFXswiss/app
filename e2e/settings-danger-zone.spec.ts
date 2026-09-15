import { test, expect, Page, Route } from '@playwright/test';

/**
 * E2E Visual Regression Tests: Settings Danger Zone
 *
 * Route:
 *   - /settings  (Danger Zone disclosure; Delete account is hidden until expanded)
 *
 * Auth is a synthetic unsigned JWT (`alg: none`, role User). Bootstrap GETs and user PUT/PATCH
 * are mocked via page.route(...), so the suite does not need a live API. A green run does not
 * prove production auth or that the API returns these kyc fields.
 *
 * Feature data is MOCKED with synthetic fixtures, so the baselines are deterministic AND contain
 * NO real production data. GET /v2/user includes `disabledAddresses: []` because SettingsScreen
 * filters that field without null-safe chaining. `kyc.phoneCallStatus` is `'Completed'` so the
 * Verification Call block is hidden. Unmatched v1/v2 API calls are fulfilled with 501 (not
 * continued) so the suite does not need a live API. UI language is pinned with `lang=en`.
 *
 * Intercepted endpoints:
 *   - GET  /v1/language, /v1/fiat, /v1/asset, /v1/bankAccount, /v1/country, /v1/setting/infoBanner
 *   - GET  /v2/user
 *   - PUT/PATCH /v1/user, /v2/user
 *
 * Synthetic fixtures: fake ids/addresses only — no production data.
 */

const LEGAL_NOTICE =
  'Deleting your account ends our business relationship. Under Swiss law we are required to retain all data for 10 years and then permanently delete it.';

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

type KycOverride = Record<string, unknown>;

/** Settings bootstrap mocks plus GET /v2/user with phoneCallStatus Completed so Verification Call is hidden. */
async function installSettingsRoutes(page: Page, kycOverride: KycOverride = {}): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if ((method === 'PUT' || method === 'PATCH') && (path === '/v1/user' || path.startsWith('/v1/user/'))) {
      return json(route, {});
    }

    if (method === 'GET' && path === '/v1/language') {
      return json(route, [
        { id: 1, name: 'Deutsch', symbol: 'DE' },
        { id: 2, name: 'English', symbol: 'EN' },
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

    await route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unexpected test request' }),
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
        mail: 'settings.danger@example.com',
        currency: { id: 1, name: 'CHF' },
        language: { id: 2, name: 'English', symbol: 'EN' },
        kyc: { level: 20, status: 'InProgress', phoneCallStatus: 'Completed', ...kycOverride },
        disabledAddresses: [],
      });
    }

    await route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unexpected test request' }),
    });
  });
}

test.describe('Settings Danger Zone - Visual Regression Tests', () => {
  const token = jwt();

  test('collapsed Danger Zone hides Delete account and the legal notice', async ({ page }) => {
    await installSettingsRoutes(page);

    await page.goto(`/settings?session=${encodeURIComponent(token)}&lang=en`);
    await expect(page.getByRole('button', { name: 'Danger Zone' })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);

    await expect(page.getByRole('button', { name: 'Danger Zone' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete account' })).toHaveCount(0);
    await expect(page.getByText(LEGAL_NOTICE)).toHaveCount(0);

    await expect(page).toHaveScreenshot('settings-danger-zone-01-collapsed.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('expanded Danger Zone shows the legal notice and Delete account', async ({ page }) => {
    await installSettingsRoutes(page);

    await page.goto(`/settings?session=${encodeURIComponent(token)}&lang=en`);
    await expect(page.getByRole('button', { name: 'Danger Zone' })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: 'Danger Zone' }).click();

    await expect(page.getByText(LEGAL_NOTICE)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete account' })).toBeVisible();

    await expect(page).toHaveScreenshot('settings-danger-zone-02-expanded.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('Delete account overlay shows the legal notice with Cancel and Delete', async ({ page }) => {
    await installSettingsRoutes(page);

    await page.goto(`/settings?session=${encodeURIComponent(token)}&lang=en`);
    await expect(page.getByRole('button', { name: 'Danger Zone' })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: 'Danger Zone' }).click();
    await expect(page.getByRole('button', { name: 'Delete account' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete account' }).click();

    await expect(page.getByText(LEGAL_NOTICE)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();

    await expect(page).toHaveScreenshot('settings-danger-zone-03-overlay.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });
});
