import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { DESK_CREDENTIAL_BYTES, deskBase64Url, installDeskAuthenticator } from './passkey-desk-authenticator';

// A value jwt-decode cannot read is removed on boot. The expiry is in the future. The signature is not checked.
// blockchains is an array so the login screen can read session.blockchains without throwing.
const ACCOUNT_TOKEN =
  'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJleHAiOjQxMDI0NDQ4MDAsImJsb2NrY2hhaW5zIjpbXX0.x';

const VISUAL_USER = {
  mail: 'user@example.com',
  language: { id: 2, name: 'English', symbol: 'EN' },
  kyc: { hash: '' },
  addresses: [],
};

// Bootstrap calls are mocked so the login screen renders without a live API. The tile shots stub
// WebAuthn before navigation, so each variant settles on one platform report. The desk shots use a
// fixed in-page authenticator and fulfil the passkey routes. They do not prove a real signature.

const LANGUAGES = [
  { id: 1, name: 'Deutsch', symbol: 'DE', enable: true },
  { id: 2, name: 'English', symbol: 'EN', enable: true },
  { id: 3, name: 'Français', symbol: 'FR', enable: true },
  { id: 4, name: 'Italiano', symbol: 'IT', enable: true },
];

const DIFFER_BITCOIN = {
  address: 'bc1qdeskdiffers',
  family: 'Bitcoin',
  path: "m/84'/0'/0'/0/0",
  status: 'Active',
  blockchains: [],
};

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function fulfillNotOk(route: Route): Promise<void> {
  await route.fulfill({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({ message: 'Link body is invalid.' }),
  });
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
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const authorization = request.headers()['authorization'] ?? '';
    // A 401 for this token clears it. The login screen stays up, and later getAuthToken() is empty.
    if (authorization.includes(ACCOUNT_TOKEN)) {
      if (request.method() === 'GET' && path === '/v2/user') return fulfillJson(route, VISUAL_USER);
      return fulfillJson(route, []);
    }
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
      credentials.create = create as unknown as CredentialsContainer['create'];
      credentials.get = get as unknown as CredentialsContainer['get'];
    } else {
      Object.defineProperty(navigator, 'credentials', { configurable: true, value: { create, get } });
    }
  }, available);
}

async function holdPasskeyPlatform(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class PublicKeyCredential {
      static getClientCapabilities(): Promise<Record<string, boolean>> {
        return new Promise<Record<string, boolean>>(() => undefined);
      }
    }
    try {
      Object.defineProperty(window, 'PublicKeyCredential', { configurable: true, value: PublicKeyCredential });
    } catch {
      const existing = window.PublicKeyCredential as {
        getClientCapabilities?: () => Promise<Record<string, boolean>>;
      };
      if (existing) existing.getClientCapabilities = PublicKeyCredential.getClientCapabilities;
    }
    const create = () => new Promise<null>(() => undefined);
    const get = () => new Promise<null>(() => undefined);
    const credentials = navigator.credentials;
    if (credentials) {
      credentials.create = create as unknown as CredentialsContainer['create'];
      credentials.get = get as unknown as CredentialsContainer['get'];
    } else {
      Object.defineProperty(navigator, 'credentials', { configurable: true, value: { create, get } });
    }
  });
}

async function openLogin(page: Page): Promise<void> {
  await installLoginRoutes(page);
  await page.goto('/login?feature=Passkey&lang=en');
  await expect(page.getByText('Login to DFX Services', { exact: true })).toBeVisible();
}

async function waitForPlatform(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __passkeyPlatformReady?: boolean }).__passkeyPlatformReady === true,
  );
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

function postedLinkAddress(raw: string | null): { address: string; family: string; path: string } | undefined {
  if (raw === null) return undefined;
  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
  if (body === null || typeof body !== 'object') return undefined;
  if (!('address' in body) || !('family' in body) || !('path' in body)) return undefined;
  const { address, family, path } = body;
  if (typeof address !== 'string' || typeof family !== 'string' || typeof path !== 'string') return undefined;
  return { address, family, path };
}

async function installDeskRoutes(page: Page, seedCheckAddress: string): Promise<void> {
  const linkedAddresses: Record<string, unknown>[] = [];

  function listedWallet(): Record<string, unknown> {
    return deskWallet('', [DESK_EVM, DESK_SPARK, ...linkedAddresses, DIFFER_BITCOIN]);
  }

  await page.route('**/v1/passkey/wallets**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method === 'GET' && path === '/v1/passkey/wallets') return fulfillJson(route, [listedWallet()]);
    if (method === 'PUT' && path.endsWith('/backupSeen')) return fulfillJson(route, listedWallet());
    if (method === 'PUT' && path.endsWith('/revoke')) return fulfillJson(route, listedWallet());
    return fulfillJson(route, []);
  });

  await page.route('**/v1/auth/passkey/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method === 'POST' && path.endsWith('/register/begin')) return fulfillJson(route, DESK_CHALLENGE);
    if (method === 'POST' && path.endsWith('/register/finish')) {
      return fulfillJson(route, deskAuth('', [DESK_EVM, DESK_SPARK]));
    }
    if (method === 'POST' && path.endsWith('/authenticate/begin')) return fulfillJson(route, DESK_CHALLENGE);
    if (method === 'POST' && path.endsWith('/authenticate/finish')) {
      return fulfillJson(route, deskAuth(seedCheckAddress));
    }
    if (method === 'POST' && path.endsWith('/link')) {
      const posted = postedLinkAddress(request.postData());
      if (posted === undefined) return fulfillNotOk(route);
      const address = { ...posted, status: 'Active', blockchains: [] };
      const key = `${posted.family}:${posted.path}:${posted.address}`;
      const alreadyLinked = linkedAddresses.some(
        (item) => `${String(item.family)}:${String(item.path)}:${String(item.address)}` === key,
      );
      if (!alreadyLinked) linkedAddresses.push(address);
      return fulfillJson(route, { accessToken: 'visual-passkey-token', address });
    }
    if (method === 'GET' && path.endsWith('/credentialStatus')) {
      return fulfillJson(route, [{ credentialId: deskBase64Url(DESK_CREDENTIAL_BYTES), status: 'Active' }]);
    }
    if (method === 'POST' && path.endsWith('/revoke/begin')) return fulfillJson(route, DESK_CHALLENGE);
    if (method === 'POST' && path.endsWith('/revoke/finish')) return fulfillJson(route, listedWallet());
    if (method === 'POST' && path.endsWith('/claim/begin')) return fulfillJson(route, DESK_CHALLENGE);
    if (method === 'POST' && path.endsWith('/claim/finish')) {
      return fulfillJson(route, deskAuth('', [DESK_EVM, DESK_SPARK]));
    }
    return fulfillJson(route, []);
  });

  // Diagnostics is passkey/diagnostics, so the wallets glob and the auth passkey glob miss it.
  await page.route('**/v1/passkey/diagnostics', async (route) => {
    if (route.request().method() === 'POST') return fulfillJson(route, {});
    return fulfillJson(route, []);
  });
}

// A 500 is not a 4xx, so the client retries begin and finish once. Both finish calls must stay 500.
// Login posts authenticate/begin before credentials.get. An empty body there is a generic error
// and never reaches the dismissed prompt that opens the account choice.
async function installRegisterErrorRoutes(page: Page): Promise<void> {
  await page.route('**/v1/auth/passkey/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (method === 'POST' && path.endsWith('/authenticate/begin')) return fulfillJson(route, DESK_CHALLENGE);
    if (method === 'POST' && path.endsWith('/register/begin')) return fulfillJson(route, DESK_CHALLENGE);
    if (method === 'POST' && path.endsWith('/register/finish')) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'The passkey could not be created.' }),
      });
      return;
    }
    return fulfillJson(route, []);
  });
}

async function plantAccountToken(page: Page): Promise<void> {
  await page.addInitScript((token) => {
    window.localStorage.setItem('dfx.authenticationToken', token);
  }, ACCOUNT_TOKEN);
}

async function openDesk(page: Page, mode: 'unlocked' | 'locked' | 'mismatch', dismissFirstGet = false): Promise<void> {
  await installDeskAuthenticator(page, mode !== 'locked', dismissFirstGet);
  await installLoginRoutes(page);
  await installDeskRoutes(page, mode === 'mismatch' ? MISMATCH_ADDRESS : '');
  await page.goto('/login?feature=Passkey&lang=en');
  await expect(page.getByText('Login to DFX Services', { exact: true })).toBeVisible();
  await page.locator('img[src$="login-passkey.jpg"]').click();
  await waitForPlatform(page);
}

async function waitForLinkedBitcoin(page: Page): Promise<string> {
  const note = page.getByText(/^Linked Bitcoin bc1q/);
  await expect(note).toBeVisible();
  const text = await note.innerText();
  const match = /^Linked Bitcoin (bc1q\S+)\.$/.exec(text);
  if (match === null || match[1] === undefined) {
    throw new Error(`linked Bitcoin note was not a complete sentence: ${text}`);
  }
  const address = match[1];
  await expect(page.locator('li', { hasText: `${DESK_EVM.family} ${DESK_EVM.address}` })).toBeVisible();
  await expect(page.locator('li', { hasText: `${DESK_SPARK.family} ${DESK_SPARK.address}` })).toBeVisible();
  await expect(page.locator('li', { hasText: address })).toBeVisible();
  return address;
}

async function registerUnlockedDesk(page: Page): Promise<string> {
  await openDesk(page, 'unlocked', true);
  await registerThroughGuidance(page);
  await expect(page.getByText('The wallet is unlocked.', { exact: true })).toBeVisible();
  await expect(page.getByText('Passkey wallet', { exact: true })).toBeVisible();
  return waitForLinkedBitcoin(page);
}

async function setTabSession(page: Page, state: 'compromised' | 'open-elsewhere'): Promise<void> {
  const session = {
    state,
    accessToken: 'visual-passkey-token',
    wallet: deskWallet('', []),
  };
  await page.evaluate((next) => {
    const hook = (window as unknown as { __dfxSetOpenPasskey?: (value: typeof next) => void }).__dfxSetOpenPasskey;
    if (hook === undefined) throw new Error('handbook session hook is missing');
    hook(next);
  }, session);
}

async function deskControls(page: Page): Promise<Locator[]> {
  const show = page.getByRole('button', { name: 'Show recovery words' });
  const hide = page.getByRole('button', { name: 'Hide recovery words' });
  const showCount = await show.count();
  const hideCount = await hide.count();
  if (showCount + hideCount !== 1) {
    throw new Error(`expected exactly one recovery-words button, found show=${showCount} hide=${hideCount}`);
  }
  const recoveryToggle = hideCount === 1 ? hide : show;
  return [
    page.getByRole('button', { name: 'Open the app' }),
    page.getByRole('button', { name: 'Unlock wallet' }),
    page.getByRole('button', { name: 'Link Bitcoin' }),
    page.getByRole('button', { name: 'Link EVM account' }),
    page.getByRole('button', { name: 'Refresh wallets' }),
    page.getByRole('button', { name: 'Mark backup seen' }),
    page.getByRole('button', { name: 'Check server addresses' }),
    page.getByRole('button', { name: 'Credential status' }),
    page.getByRole('button', { name: 'Record a diagnostic' }),
    recoveryToggle,
    page.getByRole('button', { name: 'Revoke with passkey as lost' }),
    page.getByRole('button', { name: 'Revoke with passkey as compromised' }),
    page.getByRole('button', { name: 'Revoke this wallet by id as lost' }),
    page.getByRole('button', { name: 'Revoke this wallet by id as compromised' }),
    page.getByRole('button', { name: 'Start another ceremony' }),
    page.getByRole('button', { name: 'Close' }),
    page.getByLabel('EVM account index'),
  ];
}

// The login layout clips inside overflow-auto. Expanding those nodes and growing the viewport is
// what makes each control fully visible instead of a 1280×720 crop.
async function shoot(page: Page, name: string, controls: Locator[]): Promise<void> {
  await page.evaluate(() => {
    const expanded: HTMLElement[] = [];
    const collect = (): HTMLElement[] =>
      Array.from(document.querySelectorAll('*')).filter(
        (node): node is HTMLElement => node instanceof HTMLElement && node.scrollHeight > node.clientHeight,
      );
    const expand = (nodes: HTMLElement[]): void => {
      for (const node of nodes) {
        node.style.overflow = 'visible';
        node.style.height = 'auto';
        node.style.maxHeight = 'none';
        expanded.push(node);
      }
    };
    expand(collect());
    expand(collect());
    window.scrollTo(0, 0);
    for (const node of expanded) node.scrollTop = 0;
  });
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  if (scrollHeight > 5000) throw new Error(`document scroll height ${scrollHeight} exceeds 5000`);
  await page.setViewportSize({ width: 1280, height: Math.max(720, scrollHeight) });
  await page.evaluate(() => window.scrollTo(0, 0));
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error(`viewport is missing before ${name}`);
  for (let index = 0; index < controls.length; index += 1) {
    const control = controls[index];
    if (control === undefined) throw new Error(`required control is missing (${name} #${index})`);
    const box = await control.boundingBox();
    if (box === null) throw new Error(`required control bounding box is null (${name} #${index})`);
    if (box.y < 0 || box.y + box.height > viewport.height) {
      throw new Error(
        `required control is outside the viewport (${name} #${index}): ` +
          `y=${box.y} height=${box.height} viewport=${viewport.height}`,
      );
    }
  }
  await expect(page).toHaveScreenshot(name, { fullPage: true });
}

async function registerThroughGuidance(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Do you already have an account?')).toBeVisible();
  await page.getByRole('button', { name: 'Open a new account' }).click();
  await page.getByLabel('Email address').fill('user@example.com');
  await page.getByRole('button', { name: 'Continue' }).click();
}

test.describe('Passkey login', () => {
  test('shows the passkey tile when the feature flag is set', async ({ page }) => {
    await openLogin(page);
    const passkeyTile = page.locator('img[src$="login-passkey.jpg"]');
    await expect(passkeyTile).toBeVisible();
    await expect.poll(async () => passkeyTile.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await shoot(page, 'passkey-login-tiles.png', [passkeyTile]);
  });

  test('opens registration and login when this browser can use passkeys', async ({ page }) => {
    await stubPasskeyPlatform(page, true);
    await openLogin(page);
    await page.locator('img[src$="login-passkey.jpg"]').click();
    await waitForPlatform(page);
    await expect(page.getByText('This browser has no passkey support')).toHaveCount(0);
    await expect(page.getByText('Log in with your device')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
    await expect(page.getByLabel('Email address')).toHaveCount(0);
    await expect(page).toHaveScreenshot('passkey-login-available.png', { fullPage: true });
  });

  test('opens the passkey placeholder when this browser has no passkeys', async ({ page }) => {
    await stubPasskeyPlatform(page, false);
    await openLogin(page);
    await page.locator('img[src$="login-passkey.jpg"]').click();
    await expect(page.getByText('This browser has no passkey support')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Passkey' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-login-blocked.png', { fullPage: true });
  });

  test('shows the preparing card while the platform check is open', async ({ page }) => {
    await holdPasskeyPlatform(page);
    await openLogin(page);
    await page.locator('img[src$="login-passkey.jpg"]').click();
    await expect(page.getByText('Preparing your login…', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in' })).toHaveCount(0);
    await expect(page.getByLabel('Email address')).toHaveCount(0);
    await expect(page).toHaveScreenshot('passkey-login-preparing.png', { fullPage: true });
  });

  test('asks for a mail login before adding a passkey to this account', async ({ page }) => {
    await openDesk(page, 'unlocked', true);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText('Do you already have an account?')).toBeVisible();
    await page.getByRole('button', { name: 'Add passkey to this account' }).click();
    const sentence = page.getByText('Sign in with mail first. The passkey is added to that account.', { exact: true });
    await expect(sentence).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in with existing account' })).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-login-no-account.png', { fullPage: true });
  });

  test('shows the register error on the form', async ({ page }) => {
    await installDeskAuthenticator(page, true, true);
    await installLoginRoutes(page);
    await installRegisterErrorRoutes(page);
    await page.goto('/login?feature=Passkey&lang=en');
    await expect(page.getByText('Login to DFX Services', { exact: true })).toBeVisible();
    await page.locator('img[src$="login-passkey.jpg"]').click();
    await waitForPlatform(page);
    await registerThroughGuidance(page);
    const sentence = page.getByText('Something went wrong. Please try again.', { exact: true });
    await expect(sentence).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.getByLabel('Email address')).toHaveCount(0);
    await expect(page).toHaveScreenshot('passkey-login-error.png', { fullPage: true });
  });

  test('shows the sentence when the passkey cannot hold a wallet', async ({ page }) => {
    await installDeskAuthenticator(page, false, true);
    await installLoginRoutes(page);
    await installRegisterErrorRoutes(page);
    await page.goto('/login?feature=Passkey&lang=en');
    await expect(page.getByText('Login to DFX Services', { exact: true })).toBeVisible();
    await page.locator('img[src$="login-passkey.jpg"]').click();
    await waitForPlatform(page);
    await registerThroughGuidance(page);
    const sentence = page.getByText('This passkey cannot hold a wallet on this device.', { exact: true });
    await expect(sentence).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close' })).toHaveCount(0);
    await expect(page.getByText('Something went wrong. Please try again.', { exact: true })).toHaveCount(0);
    await expect(page).toHaveScreenshot('passkey-login-prf.png', { fullPage: true });
  });

  test('shows the unlocked desk after registration', async ({ page }) => {
    await registerUnlockedDesk(page);
    await shoot(page, 'passkey-desk-unlocked.png', [
      ...(await deskControls(page)),
      page.getByText(/^Linked Bitcoin bc1q/),
    ]);
  });

  test('shows the unlocked desk after claiming a passkey', async ({ page }) => {
    await plantAccountToken(page);
    await openDesk(page, 'unlocked', true);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText('Do you already have an account?')).toBeVisible();
    await page.getByRole('button', { name: 'Add passkey to this account' }).click();
    await expect(page.getByText('The wallet is unlocked.', { exact: true })).toBeVisible();
    await waitForLinkedBitcoin(page);
    await shoot(page, 'passkey-login-claimed.png', [
      ...(await deskControls(page)),
      page.getByText(/^Linked Bitcoin bc1q/),
    ]);
  });

  test('returns to the form when starting another ceremony', async ({ page }) => {
    await registerUnlockedDesk(page);
    await page.getByRole('button', { name: 'Start another ceremony' }).click();
    await expect(page.getByText('Log in with your device')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
    await expect(page.getByLabel('Email address')).toHaveCount(0);
    await expect(page).toHaveScreenshot('passkey-login-another.png', { fullPage: true });
  });

  test('shows the revoked sentence after revoking with the passkey', async ({ page }) => {
    await registerUnlockedDesk(page);
    await page.getByRole('button', { name: 'Revoke with passkey as lost' }).click();
    const sentence = page.getByText('The passkey wallet was revoked.', { exact: true });
    await expect(sentence).toBeVisible();
    await expect(page.getByText('Log in with your device')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-login-revoked.png', { fullPage: true });
  });

  test('shows recovery words from the fixed authenticator output', async ({ page }) => {
    await registerUnlockedDesk(page);
    await expect(page.getByRole('button', { name: 'Show recovery words' })).toBeEnabled();
    await page.getByRole('button', { name: 'Show recovery words' }).click();
    const words = page.getByTestId('passkey-recovery-words');
    await expect(words).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hide recovery words' })).toBeVisible();
    await shoot(page, 'passkey-desk-recovery.png', [...(await deskControls(page)), words]);
  });

  test('hides the recovery words and keeps the note', async ({ page }) => {
    await registerUnlockedDesk(page);
    await page.getByRole('button', { name: 'Show recovery words' }).click();
    await expect(page.getByTestId('passkey-recovery-words')).toBeVisible();
    await page.getByRole('button', { name: 'Hide recovery words' }).click();
    await expect(page.getByTestId('passkey-recovery-words')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Show recovery words' })).toBeVisible();
    const note = page.getByText('Recovery words stay on this page until you hide them.', { exact: true });
    await expect(note).toBeVisible();
    await shoot(page, 'passkey-desk-recovery-hidden.png', [...(await deskControls(page)), note]);
  });

  test('shows a locked desk when login returns no PRF output', async ({ page }) => {
    await openDesk(page, 'locked');
    await page.getByRole('button', { name: 'Log in' }).click();
    const sentence = page.getByText('This passkey did not unlock the wallet', { exact: true });
    await expect(sentence).toBeVisible();
    await expect(page.getByRole('button', { name: 'Link Bitcoin' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Link EVM account' })).toBeDisabled();
    await shoot(page, 'passkey-desk-locked.png', [...(await deskControls(page)), sentence]);
  });

  test('shows a seed mismatch when the server address differs', async ({ page }) => {
    await openDesk(page, 'mismatch');
    await page.getByRole('button', { name: 'Log in' }).click();
    const sentence = page.getByText('This passkey does not match the wallet', { exact: true });
    await expect(sentence).toBeVisible();
    await shoot(page, 'passkey-desk-mismatch.png', [...(await deskControls(page)), sentence]);
  });

  test('shows the compromised sentence from the tab session', async ({ page }) => {
    await registerUnlockedDesk(page);
    await setTabSession(page, 'compromised');
    const sentence = page.getByText('This passkey was revoked as compromised', { exact: true });
    await expect(sentence).toBeVisible();
    await shoot(page, 'passkey-desk-compromised.png', [...(await deskControls(page)), sentence]);
  });

  test('shows the other-tab sentence from the tab session', async ({ page }) => {
    await registerUnlockedDesk(page);
    await setTabSession(page, 'open-elsewhere');
    const sentence = page.getByText('This wallet is open in another tab', { exact: true });
    await expect(sentence).toBeVisible();
    await shoot(page, 'passkey-desk-open-elsewhere.png', [...(await deskControls(page)), sentence]);
  });

  test('marks the backup as seen', async ({ page }) => {
    await registerUnlockedDesk(page);
    await page.getByRole('button', { name: 'Mark backup seen' }).click();
    const note = page.getByText('Backup marked as seen.', { exact: true });
    await expect(note).toBeVisible();
    await shoot(page, 'passkey-desk-backup-seen.png', [...(await deskControls(page)), note]);
  });

  test('lists wallets on this account', async ({ page }) => {
    await registerUnlockedDesk(page);
    await page.getByRole('button', { name: 'Refresh wallets' }).click();
    const note = page.getByText('Wallets on this account: 1.', { exact: true });
    await expect(note).toBeVisible();
    await shoot(page, 'passkey-desk-wallets.png', [...(await deskControls(page)), note]);
  });

  test('checks server addresses after the auto-link', async ({ page }) => {
    const bitcoinAddress = await registerUnlockedDesk(page);
    await page.getByRole('button', { name: 'Check server addresses' }).click();
    const note = page.getByText('Checked 4 addresses.', { exact: true });
    await expect(note).toBeVisible();
    await expect(page.locator('li', { hasText: bitcoinAddress })).toContainText('matches');
    await expect(page.locator('li', { hasText: 'bc1qdeskdiffers' })).toContainText('differs');
    await shoot(page, 'passkey-desk-addresses.png', [...(await deskControls(page)), note]);
  });

  test('shows credential status', async ({ page }) => {
    await registerUnlockedDesk(page);
    await page.getByRole('button', { name: 'Credential status' }).click();
    const note = page.getByText(': Active');
    await expect(note).toBeVisible();
    await shoot(page, 'passkey-desk-credential.png', [...(await deskControls(page)), note]);
  });

  test('records a diagnostic', async ({ page }) => {
    await registerUnlockedDesk(page);
    await page.getByRole('button', { name: 'Record a diagnostic' }).click();
    const note = page.getByText('Diagnostic recorded.', { exact: true });
    await expect(note).toBeVisible();
    await shoot(page, 'passkey-desk-diagnostic.png', [...(await deskControls(page)), note]);
  });

  test('links an EVM account at the default index', async ({ page }) => {
    await registerUnlockedDesk(page);
    await expect(page.getByLabel('EVM account index')).toHaveValue('1');
    await page.getByRole('button', { name: 'Link EVM account' }).click();
    const note = page.getByText(/^Linked Evm 0x/);
    await expect(note).toBeVisible();
    await shoot(page, 'passkey-desk-link-evm.png', [...(await deskControls(page)), note]);
  });

  test('needs a fresh login to revoke this wallet by id', async ({ page }) => {
    await registerUnlockedDesk(page);
    await page.getByRole('button', { name: 'Revoke this wallet by id as lost' }).click();
    const note = page.getByText('Revoke by id needs a fresh mail or wallet login.', { exact: true });
    await expect(note).toBeVisible();
    await shoot(page, 'passkey-desk-revoke-login.png', [...(await deskControls(page)), note]);
  });

  test('keeps the desk when revoke by id stays Active', async ({ page }) => {
    await plantAccountToken(page);
    await registerUnlockedDesk(page);
    // Opening the desk sets a wallet address. The session hook then clears the account token
    // because that address is not in the token. getAuthToken reads the store once the ref is empty.
    await page.evaluate((token) => {
      window.localStorage.setItem('dfx.authenticationToken', token);
    }, ACCOUNT_TOKEN);
    await page.getByRole('button', { name: 'Revoke this wallet by id as lost' }).click();
    const note = page.getByText('Wallet status is Active.', { exact: true });
    await expect(note).toBeVisible();
    await expect(page.getByText('Passkey wallet', { exact: true })).toBeVisible();
    await shoot(page, 'passkey-desk-revoke-kept.png', [...(await deskControls(page)), note]);
  });

  test('disables Link EVM account when the index is above 99', async ({ page }) => {
    await registerUnlockedDesk(page);
    await expect(page.getByRole('button', { name: 'Record a diagnostic' })).toBeEnabled();
    await page.getByLabel('EVM account index').fill('100');
    await expect(page.getByRole('button', { name: 'Link EVM account' })).toBeDisabled();
    await shoot(page, 'passkey-desk-evm-index.png', await deskControls(page));
  });

  test('shows the account choice after a dismissed login', async ({ page }) => {
    await openDesk(page, 'unlocked', true);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText('Do you already have an account?')).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-login-choice.png', { fullPage: true });
  });

  test('shows the email form for a new account', async ({ page }) => {
    await openDesk(page, 'unlocked', true);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText('Do you already have an account?')).toBeVisible();
    await page.getByRole('button', { name: 'Open a new account' }).click();
    await expect(page.getByText('Your email')).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-login-email.png', { fullPage: true });
  });

  test('shows the unknown passkey card when authenticate finish is unknown', async ({ page }) => {
    await stubPasskeyPlatform(page, true);
    await page.addInitScript(() => {
      const get = () =>
        Promise.resolve({
          id: 'cred',
          rawId: new Uint8Array(8).buffer,
          type: 'public-key',
          response: {
            clientDataJSON: new Uint8Array([1]).buffer,
            authenticatorData: new Uint8Array(37).buffer,
            signature: new Uint8Array([1]).buffer,
            userHandle: new Uint8Array([1]).buffer,
          },
          getClientExtensionResults: () => ({}),
        });
      const credentials = navigator.credentials;
      if (credentials) credentials.get = get as unknown as CredentialsContainer['get'];
    });
    await installLoginRoutes(page);
    await page.route('**/v1/auth/passkey/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      if (method === 'POST' && path.endsWith('/authenticate/begin')) return fulfillJson(route, DESK_CHALLENGE);
      if (method === 'POST' && path.endsWith('/authenticate/finish')) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ statusCode: 400, message: 'Unknown credential', code: 'UnknownCredential' }),
        });
      }
      return fulfillJson(route, []);
    });
    await page.goto('/login?feature=Passkey&lang=en');
    await expect(page.getByText('Login to DFX Services', { exact: true })).toBeVisible();
    await page.locator('img[src$="login-passkey.jpg"]').click();
    await page.waitForFunction(
      () => (window as unknown as { __passkeyPlatformReady?: boolean }).__passkeyPlatformReady === true,
    );
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText('This passkey is not an account')).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-login-unknown.png', { fullPage: true });
  });

  test('shows the in-app browser card when the user agent contains Telegram', async ({ page }) => {
    await stubPasskeyPlatform(page, true);
    await page.addInitScript(() => {
      const ua = `${navigator.userAgent} Telegram`;
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua });
    });
    await openLogin(page);
    await page.locator('img[src$="login-passkey.jpg"]').click();
    await expect(page.getByText('Open this page in your browser')).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-login-inapp.png', { fullPage: true });
  });

  test('shows the iPhone in-app card', async ({ page }) => {
    await stubPasskeyPlatform(page, true);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        value:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 Telegram',
      });
    });
    await openLogin(page);
    await page.locator('img[src$="login-passkey.jpg"]').click();
    await expect(page.getByText('Open this page in your browser', { exact: true })).toBeVisible();
    await expect(
      page.getByText("On iPhone, you'll find the compass or Safari icon at the top right.", { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-login-inapp-ios.png', { fullPage: true });
  });

  test('shows the operating system hint when the OS is too old', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        value:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      });
      const flag = '__passkeyPlatformReady';
      class PublicKeyCredential {
        static getClientCapabilities(): Promise<Record<string, boolean>> {
          Object.defineProperty(window, flag, { configurable: true, value: true });
          return Promise.resolve({ 'extension:prf': true });
        }
      }
      try {
        Object.defineProperty(window, 'PublicKeyCredential', { configurable: true, value: PublicKeyCredential });
      } catch {
        const existing = window.PublicKeyCredential as {
          getClientCapabilities?: () => Promise<Record<string, boolean>>;
        };
        if (existing) existing.getClientCapabilities = PublicKeyCredential.getClientCapabilities;
      }
      const create = () => Promise.resolve(null);
      const get = () => Promise.resolve(null);
      const credentials = navigator.credentials;
      if (credentials) {
        credentials.create = create as unknown as CredentialsContainer['create'];
        credentials.get = get as unknown as CredentialsContainer['get'];
      } else {
        Object.defineProperty(navigator, 'credentials', { configurable: true, value: { create, get } });
      }
    });
    await openLogin(page);
    await page.locator('img[src$="login-passkey.jpg"]').click();
    await expect(page.getByText('This operating system (16.0) cannot sign in with a passkey.')).toBeVisible();
    await expect(page.getByText('Open this page in your browser')).toHaveCount(0);
    await expect(page).toHaveScreenshot('passkey-login-os.png', { fullPage: true });
  });
});
