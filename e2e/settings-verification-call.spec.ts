import { test, expect, Page, Route } from '@playwright/test';

/**
 * E2E Visual Regression Tests: Settings verification-call consent
 *
 * Route:
 *   - /settings?a=call  (Settings section Verifizierungsanruf)
 *
 * Auth is a synthetic unsigned JWT (`alg: none`, role User). Bootstrap GETs and user PUT/PATCH
 * are mocked via page.route(...), so the suite does not need a live API. A green run does not
 * prove production auth or that the API returns these kyc fields.
 *
 * Feature data is MOCKED with synthetic fixtures, so the baselines are deterministic AND contain
 * NO real production data. GET /v2/user includes `disabledAddresses: []` because SettingsScreen
 * filters that field without null-safe chaining. Unmatched v1/v2 API calls are fulfilled with
 * 501 (not continued) so the suite does not need a live API. UI language is pinned with
 * `lang=en` (same pattern as realunit-quotes) so the consent copy is stable.
 *
 * Intercepted endpoints:
 *   - GET  /v1/language, /v1/fiat, /v1/asset, /v1/bankAccount, /v1/country, /v1/setting/infoBanner
 *   - GET  /v2/user   (five synthetic kyc payloads)
 *   - PUT/PATCH /v1/user, /v2/user  (empty body so updateCallSettings cannot hit a real API)
 *
 * Synthetic fixtures: fake ids/addresses only — no production data.
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

/** Settings bootstrap mocks plus GET /v2/user with a kyc override so each consent state is reproducible. */
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
        mail: 'settings.call@example.com',
        currency: { id: 1, name: 'CHF' },
        language: { id: 2, name: 'English', symbol: 'EN' },
        kyc: { level: 20, status: 'InProgress', ...kycOverride },
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

test.describe('Settings Verification Call - Visual Regression Tests', () => {
  const token = jwt();

  test('unset consent shows placeholder Auswählen', async ({ page }) => {
    await installSettingsRoutes(page);

    await page.goto(`/settings?session=${encodeURIComponent(token)}&lang=en&a=call`);
    await expect(page.getByRole('heading', { name: 'Verification Call' })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);

    await expect(page.getByText('Verification may require a phone call. Should we call you?')).toBeVisible();
    await expect(
      page.locator('form').filter({ hasText: 'Phone verification' }).getByRole('button', { name: 'Select...' }),
    ).toBeVisible();

    await expect(page).toHaveScreenshot('settings-verification-call-01-unset.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('yes consent shows preferred call time', async ({ page }) => {
    await installSettingsRoutes(page, {
      phoneCallStatus: 'UserRevokeDecision',
      phoneCallAccepted: true,
      preferredPhoneTimes: ['H9To10'],
    });

    await page.goto(`/settings?session=${encodeURIComponent(token)}&lang=en&a=call`);
    await expect(page.getByRole('heading', { name: 'Verification Call' })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);

    await expect(page.getByText('Verification may require a phone call. Should we call you?')).toBeVisible();
    await expect(page.getByText('Yes, call me')).toBeVisible();
    await expect(page.getByText('Preferred call time')).toBeVisible();
    await expect(page.getByText('09:00 - 10:00')).toBeVisible();

    await expect(page).toHaveScreenshot('settings-verification-call-02-yes.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('no consent hides preferred call time', async ({ page }) => {
    await installSettingsRoutes(page, {
      phoneCallStatus: 'UserRejected',
      phoneCallAccepted: false,
    });

    await page.goto(`/settings?session=${encodeURIComponent(token)}&lang=en&a=call`);
    await expect(page.getByRole('heading', { name: 'Verification Call' })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);

    await expect(page.getByText('Verification may require a phone call. Should we call you?')).toBeVisible();
    await expect(page.getByText("No, don't call me")).toBeVisible();
    await expect(page.getByText('Preferred call time')).toHaveCount(0);

    await expect(page).toHaveScreenshot('settings-verification-call-03-no.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('completed call shows completion notice', async ({ page }) => {
    await installSettingsRoutes(page, { phoneCallStatus: 'Completed' });

    await page.goto(`/settings?session=${encodeURIComponent(token)}&lang=en&a=call`);
    await expect(page.getByRole('heading', { name: 'Verification Call' })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);

    await expect(
      page.getByText('Your verification call has already been completed. There is nothing left to do.'),
    ).toBeVisible();
    await expect(page.getByText('Verification may require a phone call. Should we call you?')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Request a new call' })).toHaveCount(0);

    await expect(page).toHaveScreenshot('settings-verification-call-04-completed.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('failed call shows retry notice and button', async ({ page }) => {
    await installSettingsRoutes(page, { phoneCallStatus: 'Failed' });

    await page.goto(`/settings?session=${encodeURIComponent(token)}&lang=en&a=call`);
    await expect(page.getByRole('heading', { name: 'Verification Call' })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);

    await expect(
      page.getByText('We were unable to reach you by phone. You can request a new call here.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request a new call' })).toBeVisible();
    await expect(page.getByText('Verification may require a phone call. Should we call you?')).toHaveCount(0);

    await expect(page).toHaveScreenshot('settings-verification-call-05-failed.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });
});
