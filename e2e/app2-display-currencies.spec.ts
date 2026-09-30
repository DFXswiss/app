import { expect, Locator, Page, Route, test } from '@playwright/test';

/**
 * App2 display-currency picker visual states. All API routes are intercepted and unmatched
 * requests fail closed. The fiat fixture mirrors the 24 local currency names and display ids,
 * including USD/GBP/JPY with trading flags disabled. These screenshots prove rendered layout
 * for that fixture and injected load states, not the real currency API or persistence.
 */

const FIAT_NAMES = [
  'CHF', 'EUR', 'USD', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'HKD', 'SGD', 'DKK', 'NOK',
  'SEK', 'ISK', 'CZK', 'ZAR', 'AED', 'HUF', 'MXN', 'ILS', 'PLN', 'RON', 'RUB', 'TRY',
] as const;

const FIATS = FIAT_NAMES.map((name, index) => {
  const id = index + 1;
  const bankMax = id === 1 ? 1_000_000_000 : id === 2 ? 1_076_354_961.09 : id === 3 ? 1_268_961_823.7 : id === 17 ? 4_659_722_651.36 : 0;
  return {
    id,
    name,
    buyable: id === 1 || id === 2 || id === 17,
    sellable: id === 1 || id === 2,
    cardBuyable: false,
    cardSellable: false,
    instantBuyable: false,
    instantSellable: id === 2,
    limits: {
      Bank: { minVolume: id === 1 ? 1 : 0, maxVolume: bankMax },
      Instant: { minVolume: 0, maxVolume: id === 2 ? 1_076_354_961.09 : 0 },
      Card: { minVolume: 0, maxVolume: 0 },
    },
    allowedIbanCountries: [],
  };
}).reverse();

type FiatResponse = 'list' | 'loading' | 'error' | 'empty';

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const SYNTHETIC_ADDRESS = '0x0000000000000000000000000000000000000001';

function syntheticUserToken(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    address: SYNTHETIC_ADDRESS,
    role: 'User',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

function userResponse(): Record<string, unknown> {
  return {
    id: 1,
    accountId: 1,
    accountType: 'Personal',
    mail: 'currency.fixture@example.invalid',
    language: { id: 2, name: 'English', symbol: 'EN' },
    currency: { id: 1, name: 'CHF' },
    tradingLimit: { limit: 100_000, period: 'Month' },
    kyc: { hash: 'currency-visual', level: 20, dataComplete: false, preferredPhoneTimes: [] },
    volumes: { buy: { total: 0, annual: 0 }, sell: { total: 0, annual: 0 }, swap: { total: 0, annual: 0 } },
    paymentLink: { active: false },
    apiKeyCT: '',
    apiFilterCT: [],
    activeAddress: {
      address: SYNTHETIC_ADDRESS,
      wallet: 'DFX',
      explorerUrl: 'https://example.invalid',
      blockchains: [],
      volumes: { buy: { total: 0, annual: 0 }, sell: { total: 0, annual: 0 }, swap: { total: 0, annual: 0 } },
      isCustody: false,
    },
    addresses: [{
      address: SYNTHETIC_ADDRESS,
      wallet: 'DFX',
      explorerUrl: 'https://example.invalid',
      blockchains: [],
      volumes: { buy: { total: 0, annual: 0 }, sell: { total: 0, annual: 0 }, swap: { total: 0, annual: 0 } },
      isCustody: false,
    }],
    disabledAddresses: [],
  };
}

function profileResponse(): Record<string, unknown> {
  return { accountType: 'Personal', firstName: 'Currency', lastName: 'Fixture' };
}

async function installRoutes(page: Page, responseMode: FiatResponse) {
  const unexpectedRequests: string[] = [];
  let fiatRequests = 0;
  let markFirstFiatRequest!: () => void;
  const firstFiatRequest = new Promise<void>((resolve) => { markFirstFiatRequest = resolve; });
  let releaseLoading!: () => void;
  const loadingResponse = new Promise<void>((resolve) => { releaseLoading = resolve; });
  let armedCurrencyResponse: FiatResponse | undefined;
  let sheetFiatRequests = 0;

  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'GET' && path === '/v1/fiat') {
      fiatRequests += 1;
      if (fiatRequests === 1) markFirstFiatRequest();
      const sheetResponse = armedCurrencyResponse;
      if (sheetResponse) {
        armedCurrencyResponse = undefined;
        sheetFiatRequests += 1;
      }
      if (sheetResponse === 'loading') await loadingResponse;
      if (sheetResponse === 'error') {
        return json(route, { statusCode: 503, message: 'injected fiat lookup error' }, 503);
      }
      return json(route, sheetResponse === 'empty' ? [] : FIATS);
    }

    if (method === 'GET' && path === '/v1/language') {
      return json(route, [{ id: 2, name: 'English', symbol: 'EN' }]);
    }
    if (method === 'GET' && ['/v1/asset', '/v1/bankAccount', '/v1/country'].includes(path)) {
      return json(route, []);
    }
    if (method === 'GET' && path === '/v1/setting/infoBanner') return json(route, null);

    unexpectedRequests.push(`${method} ${path}`);
    return json(route, { error: 'Unexpected currency visual request' }, 501);
  });

  await page.route('**/v2/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method === 'GET' && path === '/v2/user') return json(route, userResponse());
    if (method === 'GET' && path === '/v2/user/profile') return json(route, profileResponse());
    if (method === 'GET' && path === '/v2/user/ref') {
      return json(route, { commission: 0, volume: 0, credit: 0, paidCredit: 0, userCount: 0, activeUserCount: 0 });
    }

    unexpectedRequests.push(`${method} ${path}`);
    return json(route, { error: 'Unexpected currency visual request' }, 501);
  });

  return {
    firstFiatRequest,
    releaseLoading,
    armCurrencyRequest: (mode: FiatResponse = responseMode) => { armedCurrencyResponse = mode; },
    getFiatRequestCount: () => sheetFiatRequests,
    unexpectedRequests,
  };
}

async function openAccountScreen(page: Page): Promise<void> {
  const token = syntheticUserToken();
  await page.addInitScript(() => window.localStorage.setItem('dfx_lang', 'en'));
  const response = await page.goto(`/app2/?session=${encodeURIComponent(token)}#/account`);
  expect(response?.ok(), 'the App2 account screen should load').toBe(true);
  await expect(page.getByRole('heading', { name: 'Currency Fixture', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Display currency\b/ })).toContainText('CHF');
}

async function openCurrencyPicker(page: Page, armCurrencyRequest: () => void): Promise<void> {
  armCurrencyRequest();
  await page.getByRole('button', { name: /^Display currency\b/ }).click();
  await expect(page.getByRole('dialog', { name: 'Choose currency', exact: true })).toBeVisible();
}

async function captureAtBothWidths(
  page: Page,
  dialog: Locator,
  state: 'list' | 'loading' | 'error' | 'empty',
  pageErrors: string[],
  unexpectedRequests: string[],
): Promise<void> {
  for (const viewport of [
    { name: 'desktop', width: 1280, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    if (state === 'list') {
      await dialog.getByRole('button', { name: 'USD', exact: true }).scrollIntoViewIfNeeded();
    }
    await expect(dialog).toHaveScreenshot(`app2-display-currencies-${state}-${viewport.name}.png`, {
      maxDiffPixels: 15,
    });
  }
  expect(pageErrors, 'visual states must not produce uncaught page errors').toEqual([]);
  expect(unexpectedRequests, 'all API requests must be covered by this isolated fixture').toEqual([]);
}

test.describe('App2 display currency visual states', () => {
  test('shows every API currency, including non-trading currencies', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const routes = await installRoutes(page, 'list');
    await openAccountScreen(page);
    await openCurrencyPicker(page, routes.armCurrencyRequest);
    const dialog = page.getByRole('dialog', { name: 'Choose currency', exact: true });
    await expect(dialog.locator('[role="button"]')).toHaveCount(24);
    await expect(dialog.getByRole('button', { name: 'USD', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'GBP', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /JPY$/ })).toBeVisible();
    await captureAtBothWidths(page, dialog, 'list', pageErrors, routes.unexpectedRequests);
  });

  test('shows loading until the fiat lookup resolves', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const routes = await installRoutes(page, 'loading');
    await openAccountScreen(page);
    await openCurrencyPicker(page, routes.armCurrencyRequest);
    const dialog = page.getByRole('dialog', { name: 'Choose currency', exact: true });
    await expect(dialog.getByRole('status')).toHaveText('Loading…');
    await routes.firstFiatRequest;
    await captureAtBothWidths(page, dialog, 'loading', pageErrors, routes.unexpectedRequests);

    routes.releaseLoading();
    await expect(dialog.getByRole('button', { name: 'USD', exact: true })).toBeVisible();
    expect(routes.getFiatRequestCount()).toBe(1);
  });

  test('shows a retryable fiat lookup failure', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const routes = await installRoutes(page, 'error');
    await openAccountScreen(page);
    await openCurrencyPicker(page, routes.armCurrencyRequest);
    const dialog = page.getByRole('dialog', { name: 'Choose currency', exact: true });
    await expect(dialog.getByRole('alert')).toContainText("Couldn't load — check your connection.");
    await expect(dialog.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
    await captureAtBothWidths(page, dialog, 'error', pageErrors, routes.unexpectedRequests);

    routes.armCurrencyRequest('list');
    await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'USD', exact: true })).toBeVisible();
    expect(routes.getFiatRequestCount()).toBe(2);
  });

  test('shows the empty result message when no currencies are returned', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const routes = await installRoutes(page, 'empty');
    await openAccountScreen(page);
    await openCurrencyPicker(page, routes.armCurrencyRequest);
    const dialog = page.getByRole('dialog', { name: 'Choose currency', exact: true });
    await expect(dialog.getByRole('status')).toHaveText('No currencies are available right now.');
    await captureAtBothWidths(page, dialog, 'empty', pageErrors, routes.unexpectedRequests);
    expect(routes.getFiatRequestCount()).toBe(1);
  });
});
