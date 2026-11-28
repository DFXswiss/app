import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { DESK_CREDENTIAL_BYTES, deskBase64Url, installDeskAuthenticator } from './passkey-desk-authenticator';

// The desk runs against wallet-api (front-api /v1/wallet/*). On localhost walletApiBitcoinNetwork()
// answers regtest, so every Bitcoin address the device derives from DESK_PRF_BYTES starts with bcrt1q.
const BCRT1_ADDRESS = /^bcrt1q[023456789acdefghjklmnpqrstuvwxyz]{38}$/;
const WALLET_TOKEN = 'visual-wallet-token';

type HistoryWindow = {
  __dfxHandbookPasskeyBalance?: { chf: number; eur: number };
  __dfxHandbookPasskeyAssets?: { name: string; amount: string; chf: number; eur: number; network?: string }[];
  __dfxHandbookPasskeyReceiveError?: 'evm' | 'bitcoin' | 'spark';
  __dfxHandbookPasskeyHistory?: {
    items: {
      type: 'buy' | 'sell' | 'swap' | 'send' | 'receive' | 'pay';
      title: string;
      date: string;
      amount: string;
      direction: 'in' | 'out';
      fiatValue: string;
      pending?: boolean;
    }[];
    hasMore: boolean;
    loadMore: () => Promise<void>;
  };
};

// Bootstrap calls are mocked so the login screen renders without a live API. The tile shots stub
// WebAuthn before navigation, so each variant settles on one platform report. The desk shots use a
// fixed in-page authenticator and fulfil the wallet-api routes (config, passkey, Bitcoin account and
// fees). They do not prove a real signature, a real wallet-api answer or a broadcast.

const LANGUAGES = [
  { id: 1, name: 'Deutsch', symbol: 'DE', enable: true },
  { id: 2, name: 'English', symbol: 'EN', enable: true },
  { id: 3, name: 'Français', symbol: 'FR', enable: true },
  { id: 4, name: 'Italiano', symbol: 'IT', enable: true },
];

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
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
    // All account requests receive 401 so the login screen stays signed out.
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

// The launch configuration: Bitcoin on-chain only. The app renders what GET /v1/wallet/config enables.
const BITCOIN_ONLY = { families: { bitcoin: true, evm: false, spark: false } };

// wallet-api session answer of register/finish and authenticate/finish (wallet session, not a DFX token).
const DESK_SESSION = { token: WALLET_TOKEN, credentialId: deskBase64Url(DESK_CREDENTIAL_BYTES) };

const DESK_FEES = { blockchain: 'BitcoinRegtest', source: 'fallback', unit: 'sat/vB', rates: { fast: 3, normal: 2, slow: 1 } };

// POST /account echoes the asked addresses; the first one received 0.0015 BTC in one confirmed transaction.
function deskAccount(addresses: string[]): Record<string, unknown> {
  return {
    blockchain: 'BitcoinRegtest',
    tipHeight: 210,
    balance: { confirmed: 150000, unconfirmed: 0, total: 150000 },
    addresses: addresses.map((address, index) => ({
      address,
      confirmed: index === 0 ? 150000 : 0,
      unconfirmed: 0,
      total: index === 0 ? 150000 : 0,
      txCount: index === 0 ? 1 : 0,
      used: index === 0,
    })),
    utxos: [],
    history: [
      {
        txid: 'f'.repeat(64),
        confirmed: true,
        height: 205,
        time: 1764288000,
        confirmations: 6,
        netAmount: 150000,
        fee: 141,
        direction: 'incoming',
      },
    ],
    historyLimit: 50,
    historyComplete: true,
  };
}

function postedAddresses(raw: string | null): string[] {
  try {
    const body = JSON.parse(raw ?? '{}') as { addresses?: unknown };
    return Array.isArray(body.addresses) ? body.addresses.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

// Every wallet-api route the desk calls, matched by path suffix so the spec does not pin the
// passkey route prefix of the SDK. The answers follow the wallet-api HTTP contract.
async function installDeskRoutes(page: Page, options: { prepareError?: Record<string, unknown> } = {}): Promise<void> {
  await page.route('**/v1/wallet/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method === 'GET' && path.endsWith('/wallet/config')) return fulfillJson(route, BITCOIN_ONLY);
    if (method === 'POST' && path.endsWith('/register/begin')) return fulfillJson(route, DESK_CHALLENGE);
    if (method === 'POST' && path.endsWith('/register/finish')) return fulfillJson(route, DESK_SESSION);
    if (method === 'POST' && path.endsWith('/authenticate/begin')) return fulfillJson(route, DESK_CHALLENGE);
    if (method === 'POST' && path.endsWith('/authenticate/finish')) return fulfillJson(route, DESK_SESSION);
    if (method === 'POST' && path.endsWith('/revoke/begin')) return fulfillJson(route, DESK_CHALLENGE);
    if (method === 'POST' && path.endsWith('/revoke/finish')) return fulfillJson(route, {});
    if (method === 'GET' && path.endsWith('/credentials')) {
      return fulfillJson(route, [{ credentialId: DESK_SESSION.credentialId }]);
    }
    if (path.endsWith('/addresses')) return fulfillJson(route, method === 'GET' ? [] : {});
    if (method === 'POST' && path.endsWith('/diagnostics')) return fulfillJson(route, {});
    if (method === 'POST' && path.endsWith('/bitcoin/BitcoinRegtest/account')) {
      return fulfillJson(route, deskAccount(postedAddresses(request.postData())));
    }
    if (method === 'GET' && path.endsWith('/bitcoin/BitcoinRegtest/fees')) return fulfillJson(route, DESK_FEES);
    if (method === 'POST' && path.endsWith('/bitcoin/BitcoinRegtest/prepare') && options.prepareError) {
      return fulfillJson(route, options.prepareError, Number(options.prepareError.statusCode));
    }
    return fulfillJson(route, { statusCode: 404, code: 'NotFound', message: 'Not mocked' }, 404);
  });
}

// A 500 is not a 4xx, so the client retries begin and finish once. Both finish calls must stay 500.
// Login posts authenticate/begin before credentials.get. An empty body there is a generic error
// and never reaches the dismissed prompt that opens the account choice.
async function installRegisterErrorRoutes(page: Page): Promise<void> {
  await page.route('**/v1/wallet/**', async (route) => {
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

async function openDesk(
  page: Page,
  mode: 'unlocked' | 'locked',
  dismissFirstGet = false,
  options: { prepareError?: Record<string, unknown> } = {},
): Promise<void> {
  await installDeskAuthenticator(page, mode !== 'locked', dismissFirstGet);
  await installLoginRoutes(page);
  await installDeskRoutes(page, options);
  await page.goto('/login?feature=Passkey&lang=en');
  await expect(page.getByText('Login to DFX Services', { exact: true })).toBeVisible();
  await page.locator('img[src$="login-passkey.jpg"]').click();
  await waitForPlatform(page);
}

// Bitcoin only: one Regtest row with the device's receive address after discovery (index 1, since
// index 0 is used), and no EVM or Spark row.
async function expectBitcoinOnlyRows(page: Page): Promise<void> {
  const rows = page.locator('li [title]');
  await expect(rows).toHaveCount(1);
  expect(await rows.first().getAttribute('title')).toMatch(BCRT1_ADDRESS);
  await expect(page.getByText('Bitcoin Regtest').first()).toBeVisible();
  await expect(page.locator('li [title^="0x"]')).toHaveCount(0);
  await expect(page.locator('li [title^="spark1"]')).toHaveCount(0);
}

async function registerUnlockedDesk(page: Page, options: { prepareError?: Record<string, unknown> } = {}): Promise<void> {
  await openDesk(page, 'unlocked', true, options);
  const account = page.waitForResponse((response) => response.url().endsWith('/bitcoin/BitcoinRegtest/account'));
  await registerThroughGuidance(page);
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  await account;
  await expect(page.getByText('Received Bitcoin', { exact: true })).toBeVisible();
}

async function openSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings' }).click();
}

async function openRevoke(page: Page): Promise<void> {
  await openSettings(page);
  await page.getByRole('button', { name: 'Block passkey' }).click();
}

async function deskControls(page: Page): Promise<Locator[]> {
  return ['Settings', 'Buy', 'Sell', 'Swap', 'Send', 'Receive', 'Pay'].map((name) =>
    page.getByRole('button', { name, exact: true }),
  );
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

// wallet-api registers without an e-mail, so "Open a new account" starts the passkey ceremony directly.
async function registerThroughGuidance(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Do you already have an account?')).toBeVisible();
  await page.getByRole('button', { name: 'Open a new account' }).click();
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
    await shoot(page, 'passkey-desk-unlocked.png', await deskControls(page));
  });

  test('shows the Bitcoin Regtest receive address on the unlocked desk', async ({ page }) => {
    await registerUnlockedDesk(page);
    await page.getByRole('button', { name: 'Receive' }).click();
    const dialog = page.getByRole('dialog', { name: 'Receive' });
    // Bitcoin is the only enabled family, so its address shows without a choice.
    await expect(dialog.getByRole('button', { name: 'Bitcoin Regtest', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(dialog.getByRole('button', { name: 'EVM', exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Spark', exact: true })).toHaveCount(0);
    const address = page.getByTestId('passkey-receive-address');
    await expect(address).toHaveText(BCRT1_ADDRESS);
    await expect(page.getByRole('button', { name: 'Copy address' })).toBeVisible();
    const qr = page.locator('[data-testid=passkey-receive-qr]');
    await expect(qr).toBeVisible();
    await shoot(page, 'passkey-desk-receive-bitcoin.png', [
      ...(await deskControls(page)),
      page.getByRole('button', { name: 'Copy address' }),
      qr,
    ]);
  });

  test('shows the send form with the wallet-api fee choice', async ({ page }) => {
    await registerUnlockedDesk(page);
    await page.getByRole('button', { name: 'Send' }).click();
    const dialog = page.getByRole('dialog', { name: 'Send' });
    const destination = dialog.getByLabel('Destination');
    const amount = dialog.getByLabel('Amount (sats)');
    const paste = dialog.getByRole('button', { name: 'Paste' });
    const scan = dialog.getByRole('button', { name: 'Scan' });
    const normal = dialog.getByRole('button', { name: /Normal/ });
    const review = dialog.getByRole('button', { name: 'Review payment' });
    await expect(normal).toContainText('2 sat/vB');
    await expect(normal).toHaveAttribute('aria-pressed', 'true');
    await expect(review).toBeDisabled();
    await expect(dialog.getByText('Sending is not active yet.', { exact: true })).toHaveCount(0);
    await shoot(page, 'passkey-desk-send.png', [
      ...(await deskControls(page)),
      destination,
      amount,
      paste,
      scan,
      normal,
      review,
    ]);
  });

  test('shows the wallet-api error when the payment cannot be prepared', async ({ page }) => {
    await registerUnlockedDesk(page, {
      prepareError: { statusCode: 422, code: 'InsufficientFunds', message: 'Insufficient funds' },
    });
    await page.getByRole('button', { name: 'Send' }).click();
    const dialog = page.getByRole('dialog', { name: 'Send' });
    await dialog.getByLabel('Destination').fill('bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080');
    await dialog.getByLabel('Amount (sats)').fill('900000');
    await dialog.getByRole('button', { name: 'Review payment' }).click();
    const alert = dialog.getByRole('alert');
    await expect(alert).toContainText('Insufficient funds');
    await shoot(page, 'passkey-desk-send-error.png', [...(await deskControls(page)), alert]);
  });

  test('shows the paste failure on the send form', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { readText: () => Promise.reject(new Error('denied')) },
      });
    });
    await registerUnlockedDesk(page);

    await page.getByRole('button', { name: 'Send' }).click();
    const dialog = page.getByRole('dialog', { name: 'Send' });
    const destination = dialog.getByLabel('Destination');
    const paste = dialog.getByRole('button', { name: 'Paste' });
    const scan = dialog.getByRole('button', { name: 'Scan' });
    await paste.click();
    const sentence = dialog.getByText('Paste is not available in this browser.', { exact: true });

    await expect(sentence).toBeVisible();
    await shoot(page, 'passkey-desk-send-paste.png', [
      ...(await deskControls(page)),
      destination,
      paste,
      scan,
      sentence,
    ]);
  });

  test('shows the scan failure on the send form', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          ...navigator.mediaDevices,
          getUserMedia: () => Promise.reject(new Error('denied')),
        },
      });
    });
    await registerUnlockedDesk(page);

    await page.getByRole('button', { name: 'Send' }).click();
    const dialog = page.getByRole('dialog', { name: 'Send' });
    const destination = dialog.getByLabel('Destination');
    const paste = dialog.getByRole('button', { name: 'Paste' });
    const scan = dialog.getByRole('button', { name: 'Scan' });
    await scan.click();
    const sentence = dialog.getByText('QR scanning is not available in this browser.', { exact: true });

    await expect(sentence).toBeVisible();
    await shoot(page, 'passkey-desk-send-scan.png', [
      ...(await deskControls(page)),
      destination,
      paste,
      scan,
      sentence,
    ]);
  });

  test('shows the scan camera on the send form', async ({ page }) => {
    await page.addInitScript(() => {
      class BarcodeDetectorStub {
        detect() {
          return Promise.resolve([]);
        }
      }

      Object.defineProperty(globalThis, 'BarcodeDetector', { configurable: true, value: BarcodeDetectorStub });
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          ...navigator.mediaDevices,
          getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop() {} }] }),
        },
      });
    });
    await registerUnlockedDesk(page);

    await page.getByRole('button', { name: 'Send' }).click();
    const dialog = page.getByRole('dialog', { name: 'Send' });
    const destination = dialog.getByLabel('Destination');
    const paste = dialog.getByRole('button', { name: 'Paste' });
    const scan = dialog.getByRole('button', { name: 'Scan' });
    await scan.click();
    const video = dialog.locator('[data-testid="passkey-send-scan"]');

    await expect(video).toBeVisible();
    await expect(destination).toHaveValue('');
    await shoot(page, 'passkey-desk-send-camera.png', [...(await deskControls(page)), destination, paste, scan, video]);
  });

  test('returns to the form when starting another ceremony', async ({ page }) => {
    await registerUnlockedDesk(page);
    await openSettings(page);
    await page.getByRole('button', { name: 'Use another passkey' }).click();
    await expect(page.getByText('Log in with your device')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
    await expect(page.getByLabel('Email address')).toHaveCount(0);
    await expect(page).toHaveScreenshot('passkey-login-another.png', { fullPage: true });
  });

  test('shows the revoked sentence after revoking with the passkey', async ({ page }) => {
    await registerUnlockedDesk(page);
    await openRevoke(page);
    await page.getByLabel('I understand that this cannot be undone.').check();
    await page.getByRole('button', { name: 'Block', exact: true }).click();
    const sentence = page.getByText('The passkey wallet was revoked.', { exact: true });
    await expect(sentence).toBeVisible();
    await expect(page.getByText('Log in with your device')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-login-revoked.png', { fullPage: true });
  });

  test('shows the revocation error inside the dialog when wallet-api rejects it', async ({ page }) => {
    await registerUnlockedDesk(page);
    await page.route('**/v1/wallet/**/revoke/finish', (route) =>
      fulfillJson(route, { statusCode: 400, code: 'PasskeyInvalid', message: 'The passkey was not accepted.' }, 400),
    );
    await openRevoke(page);
    await page.getByLabel('I understand that this cannot be undone.').check();
    await page.getByRole('button', { name: 'Block', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Block passkey' });
    const alert = dialog.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toBeInViewport();
    const titleBar = dialog.getByRole('heading', { name: 'Block passkey' }).locator('..');
    await expect
      .poll(async () => {
        const alertBox = await alert.boundingBox();
        const titleBox = await titleBar.boundingBox();
        return alertBox && titleBox ? alertBox.y - (titleBox.y + titleBox.height) : -1;
      })
      .toBeGreaterThanOrEqual(0);
    await expect(page).toHaveScreenshot('passkey-desk-revoke-active.png', { fullPage: true });
  });

  test('shows and hides recovery words from the fixed authenticator output', async ({ page }) => {
    await registerUnlockedDesk(page);
    await openSettings(page);
    await page.getByRole('button', { name: /Export recovery phrase/ }).click();
    await expect(page.getByTestId('passkey-recovery-words')).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-desk-recovery.png', { fullPage: true });
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('passkey-recovery-words')).toHaveCount(0);
    await expect(page).toHaveScreenshot('passkey-desk-recovery-hidden.png', { fullPage: true });
  });

  test('shows the failed sign-in', async ({ page }) => {
    await openDesk(page, 'locked');
    await page.getByRole('button', { name: 'Log in' }).click();
    const sentence = page.getByText(
      'This passkey did not unlock the wallet. Please try again with the passkey of this wallet.',
      { exact: true },
    );
    const heading = page.getByText('Log in with your device');
    const login = page.getByRole('button', { name: 'Log in' });
    await expect(sentence).toBeVisible();
    await expect(heading).toBeVisible();
    await expect(login).toBeVisible();
    await expect(page.getByRole('button', { name: 'Settings' })).toHaveCount(0);
    await expect(page.getByLabel('Email address')).toHaveCount(0);
    await expect(page).toHaveScreenshot('passkey-login-failed.png', { fullPage: true });
  });

  test('reloads the wallet-api data', async ({ page }) => {
    await registerUnlockedDesk(page);
    await openSettings(page);
    await page.getByRole('button', { name: 'Reload data' }).click();
    await expect(page.getByText('Data reloaded.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Check addresses/ })).toHaveCount(0);
    await expect(page).toHaveScreenshot('passkey-desk-reload.png', { fullPage: true });
  });

  test('shows the passkeys of this wallet-api account', async ({ page }) => {
    await registerUnlockedDesk(page);
    await openSettings(page);
    await page.getByRole('button', { name: 'Check passkey status' }).click();
    await expect(page.getByText('Passkeys on this account: 1.', { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-desk-credential.png', { fullPage: true });
  });

  test('records a diagnostic', async ({ page }) => {
    await registerUnlockedDesk(page);
    await openSettings(page);
    await page.getByRole('button', { name: 'Record a diagnostic' }).click();
    await expect(page.getByText('Diagnostic recorded.', { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-desk-diagnostic.png', { fullPage: true });
  });

  test('shows the account choice after a dismissed login', async ({ page }) => {
    await openDesk(page, 'unlocked', true);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText('Do you already have an account?')).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-login-choice.png', { fullPage: true });
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
    await page.route('**/v1/wallet/**', async (route) => {
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

test.describe('Passkey wallet design', () => {
  async function openWallet(page: Page): Promise<void> {
    await openDesk(page, 'unlocked', true);
    await registerThroughGuidance(page);
    await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  }

  test('shows the wallet, expanded addresses and settings', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWallet(page);
    await expect(page).toHaveScreenshot('passkey-wallet-start.png');
    await page.getByRole('button', { name: 'Show wallet' }).first().click();
    await expect(page.getByText('Addresses', { exact: true })).toBeVisible();
    await expect(page.getByText('0.0015 BTC', { exact: true })).toBeVisible();
    await expectBitcoinOnlyRows(page);
    await expect(page).toHaveScreenshot('passkey-wallet-expanded.png');
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-wallet-settings.png');
  });

  test('shows the expanded wallet when the Bitcoin derivation fails', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      (window as unknown as HistoryWindow).__dfxHandbookPasskeyReceiveError = 'bitcoin';
    });
    await openWallet(page);
    await page.getByRole('button', { name: 'Show wallet' }).first().click();
    await expect(page.locator('li [title]')).toHaveCount(0);
    await expect(page.getByText('Something went wrong. Please try again.')).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-wallet-expanded-receive-error.png');
  });

  test('shows the danger zone of the settings', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWallet(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    const blockPasskey = dialog.getByRole('button', { name: 'Block passkey' });
    await blockPasskey.scrollIntoViewIfNeeded();
    await expect(blockPasskey).toBeInViewport();
    await expect(page).toHaveScreenshot('passkey-wallet-settings-danger.png');
  });

  test('shows the wallet with EUR selected', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWallet(page);
    const eur = page.getByRole('button', { name: 'EUR', exact: true });
    await eur.click();
    await expect(eur).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveScreenshot('passkey-wallet-start-eur.png');
  });

  test('shows an empty transaction history from test props', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      (window as unknown as HistoryWindow).__dfxHandbookPasskeyHistory = {
        items: [],
        hasMore: false,
        loadMore: async () => undefined,
      };
    });
    await openWallet(page);
    await expect(page.getByText('No transactions yet.', { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-wallet-history-empty.png', { fullPage: true });
  });

  test('shows populated transaction history before and after show more', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      (window as unknown as HistoryWindow).__dfxHandbookPasskeyHistory = {
        items: [
          {
            type: 'buy',
            direction: 'in',
            title: 'Bitcoin purchase',
            date: '6 Nov 2026',
            amount: '+0.01 BTC',
            fiatValue: 'CHF 500',
          },
          {
            type: 'receive',
            direction: 'in',
            title: 'Received Bitcoin',
            date: '5 Nov 2026',
            amount: '+0.001 BTC',
            fiatValue: 'CHF 50',
          },
          {
            type: 'send',
            direction: 'out',
            title: 'Sent Bitcoin',
            date: '4 Nov 2026',
            amount: '-0.001 BTC',
            fiatValue: 'CHF 50',
            pending: true,
          },
          {
            type: 'swap',
            direction: 'in',
            title: 'Swap',
            date: '3 Nov 2026',
            amount: '+0.01 ETH',
            fiatValue: 'CHF 30',
          },
          {
            type: 'sell',
            direction: 'out',
            title: 'Bitcoin sale',
            date: '2 Nov 2026',
            amount: '-0.002 BTC',
            fiatValue: 'CHF 100',
          },
          {
            type: 'pay',
            direction: 'out',
            title: 'Payment',
            date: '1 Nov 2026',
            amount: '-0.0001 BTC',
            fiatValue: 'CHF 5',
          },
        ],
        hasMore: false,
        loadMore: async () => undefined,
      };
    });
    await openWallet(page);
    await expect(page.getByText('Payout pending')).toBeVisible();
    const showMore = page.getByRole('button', { name: 'Show more' });
    await showMore.scrollIntoViewIfNeeded();
    await expect(showMore).toBeInViewport();
    await expect(page).toHaveScreenshot('passkey-wallet-history-populated.png', { fullPage: true });
    await showMore.click();
    await expect(page.getByText('Payment', { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-wallet-history-expanded.png', { fullPage: true });
  });

  test('shows the balance from test props', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      (window as unknown as HistoryWindow).__dfxHandbookPasskeyBalance = { chf: 12345.67, eur: 11890.2 };
    });
    await openWallet(page);
    // The history comes from the wallet-api account, so no placeholder remains.
    await expect(page.getByText('Received Bitcoin', { exact: true })).toBeVisible();
    await expect(page.getByText('Not available yet')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Total balance/ })).toContainText('12,345');
    await expect(page).toHaveScreenshot('passkey-wallet-balance.png');
  });

  test('shows the asset rows from test props', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      (window as unknown as HistoryWindow).__dfxHandbookPasskeyBalance = { chf: 12345.67, eur: 11890.2 };
      (window as unknown as HistoryWindow).__dfxHandbookPasskeyAssets = [
        { name: 'Bitcoin', amount: '0.15 BTC', chf: 9000, eur: 8670, network: 'Bitcoin' },
        { name: 'Ether', amount: '1.2 ETH', chf: 3345.67, eur: 3220.2, network: 'Ethereum' },
      ];
    });
    await openWallet(page);
    await page.getByRole('button', { name: 'Show wallet' }).first().click();
    await expect(page.getByText('0.15 BTC')).toBeVisible();
    await expect(page.getByText('1.2 ETH')).toBeVisible();
    await expectBitcoinOnlyRows(page);
    await expect(page).toHaveScreenshot('passkey-wallet-assets.png', { fullPage: true });
  });

  test('shows a failed history page from test props', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      (window as unknown as HistoryWindow).__dfxHandbookPasskeyHistory = {
        items: [
          {
            type: 'buy',
            direction: 'in',
            title: 'Bitcoin purchase',
            date: '6 Nov 2026',
            amount: '+0.01 BTC',
            fiatValue: 'CHF 500',
          },
          {
            type: 'receive',
            direction: 'in',
            title: 'Received Bitcoin',
            date: '5 Nov 2026',
            amount: '+0.001 BTC',
            fiatValue: 'CHF 50',
          },
        ],
        hasMore: true,
        loadMore: () => Promise.reject(new Error('offline')),
      };
    });
    await openWallet(page);
    await page.getByRole('button', { name: 'Show more' }).click();
    await expect(page.getByText('Could not load transactions.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-wallet-history-error.png', { fullPage: true });
  });

  test('shows a pending history page from test props', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      (window as unknown as HistoryWindow).__dfxHandbookPasskeyHistory = {
        items: [
          {
            type: 'buy',
            direction: 'in',
            title: 'Bitcoin purchase',
            date: '6 Nov 2026',
            amount: '+0.01 BTC',
            fiatValue: 'CHF 500',
          },
          {
            type: 'receive',
            direction: 'in',
            title: 'Received Bitcoin',
            date: '5 Nov 2026',
            amount: '+0.001 BTC',
            fiatValue: 'CHF 50',
          },
        ],
        hasMore: true,
        loadMore: () => new Promise<void>(() => undefined),
      };
    });
    await openWallet(page);
    await page.getByRole('button', { name: 'Show more' }).click();
    await expect(page.getByLabel('Loading more transactions')).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-wallet-history-loading.png', { fullPage: true });
  });

  test('shows recovery words and revocation confirmation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWallet(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: /Export recovery phrase/ }).click();
    await expect(page.getByTestId('passkey-recovery-words')).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-wallet-words.png');
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Block passkey' }).click();
    await expect(page.getByRole('dialog', { name: 'Block passkey' })).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-wallet-revoke.png');
  });
});

test('wallet shows the wallet-api error when the Bitcoin account cannot be loaded', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install();
  await page.clock.resume();
  await openDesk(page, 'unlocked', true);
  let releaseAccount = (): void => undefined;
  const accountGate = new Promise<void>((resolve) => {
    releaseAccount = resolve;
  });
  await page.route('**/v1/wallet/bitcoin/BitcoinRegtest/account', async (route) => {
    await accountGate;
    await fulfillJson(
      route,
      { statusCode: 502, code: 'OutboundRequestFailed', message: 'The Bitcoin node did not answer.' },
      502,
    );
  });
  await registerThroughGuidance(page);
  await page.getByRole('button', { name: 'Show wallet' }).first().click();
  await expectBitcoinOnlyRows(page);
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 10000);
  releaseAccount();
  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.getByText('Not available yet').first()).toBeVisible();
  await expect(page).toHaveScreenshot('passkey-wallet-bitcoin-offline.png');
});
