import { expect, test, type Page, type Route } from '@playwright/test';

// Bootstrap calls are mocked so the login screen renders without a live API. The two placeholder
// screenshots stub WebAuthn before navigation, so each variant settles on one platform report.

const LANGUAGES = [
  { id: 1, name: 'Deutsch', symbol: 'DE', enable: true },
  { id: 2, name: 'English', symbol: 'EN', enable: true },
  { id: 3, name: 'Français', symbol: 'FR', enable: true },
  { id: 4, name: 'Italiano', symbol: 'IT', enable: true },
];

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installLoginRoutes(page: Page): Promise<void> {
  await page.route('https://geolocation-db.com/**', (route) => fulfillJson(route, { country_code: 'CH' }));

  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path === '/v1/language') return fulfillJson(route, LANGUAGES);
    if (request.method() === 'GET' && path === '/v1/fiat') {
      return fulfillJson(route, [{ id: 1, name: 'CHF', buyable: true, sellable: true }]);
    }
    if (request.method() === 'GET' && path === '/v1/setting/infoBanner') return fulfillJson(route, null);
    if (request.method() === 'GET' && ['/v1/country', '/v1/asset', '/v1/bankAccount'].includes(path)) {
      return fulfillJson(route, []);
    }
    return fulfillJson(route, []);
  });

  await page.route('**/v2/**', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Unauthorized' }),
    });
  });
}

async function stubPasskeyPlatform(page: Page, available: boolean): Promise<void> {
  await page.addInitScript((isAvailable) => {
    const flag = '__passkeyPlatformReady';
    if (!isAvailable) {
      try {
        Object.defineProperty(window, 'PublicKeyCredential', { configurable: true, value: undefined });
      } catch {
        const credentials = navigator.credentials;
        if (credentials) {
          Object.defineProperty(credentials, 'create', { configurable: true, value: undefined });
          Object.defineProperty(credentials, 'get', { configurable: true, value: undefined });
        }
      }
      Object.defineProperty(window, flag, { configurable: true, value: true });
      return;
    }

    class PublicKeyCredential {
      static getClientCapabilities(): Promise<Record<string, boolean>> {
        Object.defineProperty(window, flag, { configurable: true, value: true });
        return Promise.resolve({ 'extension:prf': true });
      }
    }
    try {
      Object.defineProperty(window, 'PublicKeyCredential', { configurable: true, value: PublicKeyCredential });
    } catch {
      const existing = window.PublicKeyCredential as { getClientCapabilities?: () => Promise<Record<string, boolean>> };
      if (existing) existing.getClientCapabilities = PublicKeyCredential.getClientCapabilities;
    }
    const create = () => Promise.resolve(null);
    const get = () => Promise.resolve(null);
    const credentials = navigator.credentials;
    if (credentials) {
      credentials.create = create as unknown as CredentialContainer['create'];
      credentials.get = get as unknown as CredentialContainer['get'];
    } else {
      Object.defineProperty(navigator, 'credentials', { configurable: true, value: { create, get } });
    }
  }, available);
}

async function openLogin(page: Page): Promise<void> {
  await installLoginRoutes(page);
  await page.goto('/login?feature=Passkey&lang=en');
  await expect(page.getByText('Login to DFX Services', { exact: true })).toBeVisible();
}

test.describe('Passkey login', () => {
  test('shows the passkey tile when the feature flag is set', async ({ page }) => {
    await openLogin(page);
    const passkeyTile = page.locator('img[src$="login-passkey.jpg"]');
    await expect(passkeyTile).toBeVisible();
    await expect.poll(async () => passkeyTile.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(page).toHaveScreenshot('passkey-login-tiles.png', { fullPage: true });
  });

  test('opens registration and login when this browser can use passkeys', async ({ page }) => {
    await stubPasskeyPlatform(page, true);
    await openLogin(page);
    await page.locator('img[src$="login-passkey.jpg"]').click();
    await page.waitForFunction(() => (window as unknown as { __passkeyPlatformReady?: boolean }).__passkeyPlatformReady === true);
    await expect(page.getByText('Passkey login arrives with the wallet beta')).toHaveCount(0);
    await expect(page.getByText('This browser has no passkey support')).toHaveCount(0);
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create passkey' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create passkey' })).toBeDisabled();
    await page.getByLabel('Email address').fill('user@example.com');
    await expect(page.getByRole('button', { name: 'Create passkey' })).toBeEnabled();
  });

  test('opens the passkey placeholder when this browser has no passkeys', async ({ page }) => {
    await stubPasskeyPlatform(page, false);
    await openLogin(page);
    await page.locator('img[src$="login-passkey.jpg"]').click();
    await expect(page.getByText('This browser has no passkey support')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Passkey' })).toBeDisabled();
    await expect(page).toHaveScreenshot('passkey-login-blocked.png', { fullPage: true });
  });
});
