import { expect, test, type Page, type Route } from '@playwright/test';
import { DESK_CREDENTIAL_BYTES, deskBase64Url, installDeskAuthenticator } from './passkey-desk-authenticator';

// Bootstrap calls are mocked so the login screen renders without a live API. The tile shots stub
// WebAuthn before navigation, so each variant settles on one platform report. The desk shots use a
// fixed in-page authenticator and fulfil the passkey routes. They do not prove a real signature.

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

const DESK_CHALLENGE = {
  challengeId: '11111111-1111-4111-8111-111111111111',
  challenge: deskBase64Url(Array.from({ length: 32 }, (_, index) => index + 1)),
  rpId: 'localhost',
  timeout: 600000,
};

const MISMATCH_ADDRESS = '0x0000000000000000000000000000000000000001';

const DESK_EVM = {
  address: '0x00000000000000000000000000000000000000aa',
  family: 'Evm',
  path: "m/44'/60'/0'/0/0",
  status: 'Active',
  blockchains: [],
};
const DESK_SPARK = {
  address: 'spark1desklogin',
  family: 'Spark',
  path: "m/8797555'/1'/0'",
  status: 'Active',
  blockchains: [],
};
const DESK_BITCOIN = {
  address: 'bc1qdesklogin',
  family: 'Bitcoin',
  path: "m/84'/0'/0'/0/0",
  status: 'Active',
  blockchains: [],
};

async function expectDeskRows(page: Page): Promise<void> {
  await expect(page.locator('li', { hasText: `${DESK_EVM.family} ${DESK_EVM.address}` })).toBeVisible();
  await expect(page.locator('li', { hasText: `${DESK_SPARK.family} ${DESK_SPARK.address}` })).toBeVisible();
  await expect(page.locator('li', { hasText: `${DESK_BITCOIN.family} ${DESK_BITCOIN.address}` })).toBeVisible();
}

function deskWallet(seedCheckAddress: string, addresses: Record<string, unknown>[] = []): Record<string, unknown> {
  return {
    id: 7,
    credentialId: deskBase64Url(DESK_CREDENTIAL_BYTES),
    status: 'Active',
    created: '2026-01-01T00:00:00.000Z',
    derivationVersion: 'V1',
    seedCheckAddress,
    backupEligible: true,
    backedUp: false,
    backupRequired: false,
    addresses,
  };
}

function deskAuth(seedCheckAddress: string, addresses: Record<string, unknown>[] = []): Record<string, unknown> {
  return { accessToken: 'visual-passkey-token', wallet: deskWallet(seedCheckAddress, addresses) };
}

async function installDeskRoutes(page: Page, seedCheckAddress: string): Promise<void> {
  await page.route('**/v1/passkey/wallets**', async (route) => {
    return fulfillJson(route, [deskWallet(seedCheckAddress, [DESK_EVM, DESK_SPARK, DESK_BITCOIN])]);
  });
  await page.route('**/v1/auth/passkey/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (method === 'POST' && path.endsWith('/register/begin')) return fulfillJson(route, DESK_CHALLENGE);
    if (method === 'POST' && path.endsWith('/register/finish')) {
      return fulfillJson(route, deskAuth('', [DESK_EVM, DESK_SPARK]));
    }
    if (method === 'POST' && path.endsWith('/link')) {
      return fulfillJson(route, { accessToken: 'visual-passkey-token', address: DESK_BITCOIN });
    }
    if (method === 'POST' && path.endsWith('/authenticate/begin')) return fulfillJson(route, DESK_CHALLENGE);
    if (method === 'POST' && path.endsWith('/authenticate/finish')) {
      return fulfillJson(route, deskAuth(seedCheckAddress));
    }
    return fulfillJson(route, []);
  });
}

async function openDesk(page: Page, mode: 'unlocked' | 'locked' | 'mismatch'): Promise<void> {
  await installDeskAuthenticator(page, mode !== 'locked');
  await installLoginRoutes(page);
  await installDeskRoutes(page, mode === 'mismatch' ? MISMATCH_ADDRESS : '');
  await page.goto('/login?feature=Passkey&lang=en');
  await expect(page.getByText('Login to DFX Services', { exact: true })).toBeVisible();
  await page.locator('img[src$="login-passkey.jpg"]').click();
  await page.waitForFunction(
    () => (window as unknown as { __passkeyPlatformReady?: boolean }).__passkeyPlatformReady === true,
  );
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
    await page.waitForFunction(
      () => (window as unknown as { __passkeyPlatformReady?: boolean }).__passkeyPlatformReady === true,
    );
    await expect(page.getByText('Passkey login arrives with the wallet beta')).toHaveCount(0);
    await expect(page.getByText('This browser has no passkey support')).toHaveCount(0);
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create passkey' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create passkey' })).toBeDisabled();
    await page.getByLabel('Email address').fill('user@example.com');
    await expect(page.getByRole('button', { name: 'Create passkey' })).toBeEnabled();
    await expect(page).toHaveScreenshot('passkey-login-available.png', { fullPage: true });
  });

  test('opens the passkey placeholder when this browser has no passkeys', async ({ page }) => {
    await stubPasskeyPlatform(page, false);
    await openLogin(page);
    await page.locator('img[src$="login-passkey.jpg"]').click();
    await expect(page.getByText('This browser has no passkey support')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Passkey' })).toBeDisabled();
    await expect(page).toHaveScreenshot('passkey-login-blocked.png', { fullPage: true });
  });

  test('shows the unlocked desk after registration', async ({ page }) => {
    await openDesk(page, 'unlocked');
    await page.getByLabel('Email address').fill('user@example.com');
    await page.getByRole('button', { name: 'Create passkey' }).click();
    await expect(page.getByText('The wallet is unlocked.', { exact: true })).toBeVisible();
    await expect(page.getByText('Passkey wallet', { exact: true })).toBeVisible();
    await expect(page.getByText('Linked Bitcoin bc1qdesklogin.')).toBeVisible();
    await expectDeskRows(page);
    await expect(page).toHaveScreenshot('passkey-desk-unlocked.png', { fullPage: true });
  });

  test('shows recovery words from the fixed authenticator output', async ({ page }) => {
    await openDesk(page, 'unlocked');
    await page.getByLabel('Email address').fill('user@example.com');
    await page.getByRole('button', { name: 'Create passkey' }).click();
    await expect(page.getByText('The wallet is unlocked.', { exact: true })).toBeVisible();
    await expect(page.getByText('Linked Bitcoin bc1qdesklogin.')).toBeVisible();
    await expectDeskRows(page);
    await expect(page.getByRole('button', { name: 'Show recovery words' })).toBeEnabled();
    await page.getByRole('button', { name: 'Show recovery words' }).click();
    await expect(page.getByTestId('passkey-recovery-words')).toBeVisible();
    await page.getByText('Passkey wallet', { exact: true }).evaluate((heading) => {
      let node: HTMLElement | null = heading.parentElement;
      while (node) {
        if (node.scrollHeight > node.clientHeight + 1) node.scrollTop = 0;
        node = node.parentElement;
      }
      window.scrollTo(0, 0);
    });
    await expect(page.getByTestId('passkey-recovery-words')).toBeVisible();
    await expectDeskRows(page);
    await expect(page).toHaveScreenshot('passkey-desk-recovery.png', { fullPage: true });
  });

  test('shows a locked desk when login returns no PRF output', async ({ page }) => {
    await openDesk(page, 'locked');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText('This passkey did not unlock the wallet', { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-desk-locked.png', { fullPage: true });
  });

  test('shows a seed mismatch when the server address differs', async ({ page }) => {
    await openDesk(page, 'mismatch');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText('This passkey does not match the wallet', { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-desk-mismatch.png', { fullPage: true });
  });
});
