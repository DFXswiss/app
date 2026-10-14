import { expect, Page, Route, test } from '@playwright/test';

/**
 * Visual variants of address-switch / custody failures on /connect:
 * (1) a rejected automatic switch is sent exactly once, the translated rejection sentence is shown
 * above the address selection (without the API's text or the generic ErrorHint), one `KnownRejection`
 * POST is observed on the intercepted client-error route (including when the same rejection is shown
 * again after re-selection, because the reporter drops an identical report within 60 s), and selecting
 * the address again sends exactly one new attempt;
 * (2) a generic (non-rejection) switch failure keeps the generic hint above the address selection;
 * (3) a custody sign-up failure without a message shows the generic hint with «Unknown error»
 * instead of an endless spinner.
 *
 * Auth is a synthetic unsigned JWT WITHOUT `address` (a mail-login session); all `/v1/**` and
 * `/v2/**` calls are intercepted via page.route(...).
 */

const ADDRESS = {
  wallet: 'MetaMask',
  address: '0x1111111111111111111111111111111111111111',
  blockchains: ['Ethereum'],
  isCustody: false,
  refCode: 'SYN-0001',
};

const USER = {
  accountId: 1,
  mail: 'synthetic@example.com',
  language: { id: 1, name: 'English', symbol: 'EN', foreignName: 'English', enable: true },
  currency: { id: 1, name: 'CHF', buyable: true, sellable: true },
  kyc: { hash: 'synthetic-kyc-hash', level: 0, dataComplete: false },
  volumes: { buy: { total: 0, annual: 0 }, sell: { total: 0, annual: 0 }, swap: { total: 0, annual: 0 } },
  addresses: [ADDRESS],
  activeAddress: undefined,
  paymentMethods: [],
};

const REJECTION_TEXT = 'This address could not be selected. Please use another address or contact our support.';

const DEFAULT_SWITCH_ERROR = {
  status: 403,
  body: { statusCode: 403, message: 'Forbidden resource', error: 'Forbidden' },
};

function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    role: 'User',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const knownRejectionReports = (reports: unknown[]) =>
  reports.filter((report) => (report as { type?: string })?.type === 'KnownRejection');

async function installSyntheticApi(
  page: Page,
  options: {
    user?: typeof USER;
    switchError?: { status: number; body: object };
    custodyError?: { status: number; body: object };
  } = {},
): Promise<{ unexpectedRequests: string[]; changeCalls: number; custodyCalls: number; reports: unknown[] }> {
  const { user = USER, switchError = DEFAULT_SWITCH_ERROR, custodyError } = options;
  const unexpectedRequests: string[] = [];
  const state = { changeCalls: 0, custodyCalls: 0, unexpectedRequests, reports: [] as unknown[] };

  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'GET' && path === '/v1/language') {
      await fulfillJson(route, [{ id: 1, name: 'English', symbol: 'EN', foreignName: 'English', enable: true }]);
      return;
    }

    if (method === 'GET' && path === '/v1/fiat') {
      await fulfillJson(route, [{ id: 1, name: 'CHF', buyable: true, sellable: true }]);
      return;
    }

    if (method === 'GET' && ['/v1/asset', '/v1/bankAccount', '/v1/country'].includes(path)) {
      await fulfillJson(route, []);
      return;
    }

    if (method === 'GET' && path === '/v1/setting/infoBanner') {
      await fulfillJson(route, null);
      return;
    }

    if (method === 'POST' && path === '/v1/log/clientError') {
      state.reports.push(request.postDataJSON());
      await fulfillJson(route, null);
      return;
    }

    if (method === 'POST' && path === '/v1/user/change') {
      state.changeCalls++;
      await fulfillJson(route, switchError.body, switchError.status);
      return;
    }

    if (method === 'POST' && path === '/v1/custody' && custodyError) {
      state.custodyCalls++;
      await fulfillJson(route, custodyError.body, custodyError.status);
      return;
    }

    unexpectedRequests.push(`${method} ${path}`);
    await route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unexpected test request' }),
    });
  });

  await page.route('**/v2/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'GET' && path === '/v2/user') {
      await fulfillJson(route, user);
      return;
    }

    unexpectedRequests.push(`${method} ${path}`);
    await route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unexpected test request' }),
    });
  });

  return state;
}

test.describe('Connect address switch', () => {
  test('rejected automatic switch is sent once and shown above the address selection', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const api = await installSyntheticApi(page);

    await page.goto(`/connect?session=${encodeURIComponent(jwt())}&lang=en`);

    await expect(page.getByText('Please select an address or add a new one to continue.')).toBeVisible();
    await expect(page.getByText(REJECTION_TEXT)).toBeVisible();
    await expect(page.getByText(/Something went wrong/)).toHaveCount(0);
    await expect(page.getByText('Forbidden resource')).toHaveCount(0);

    // A looping screen would keep calling during the wait.
    await page.waitForTimeout(2000);
    expect(api.changeCalls).toBe(1);
    expect(knownRejectionReports(api.reports)).toHaveLength(1);
    expect(knownRejectionReports(api.reports)[0]).toEqual(
      expect.objectContaining({ type: 'KnownRejection', message: 'Forbidden resource' }),
    );
    expect(api.unexpectedRequests).toEqual([]);

    await expect(page).toHaveScreenshot('connect-address-switch-01-rejected.png', { fullPage: true });

    // The cleared selection stays usable: choosing the address again starts exactly one new attempt.
    await page.getByText('Select...').click();
    await page.getByText(ADDRESS.address.slice(0, 6)).first().click();
    await expect.poll(() => api.changeCalls).toBe(2);
    await page.waitForTimeout(2000);
    expect(api.changeCalls).toBe(2);
    await expect(page.getByText(REJECTION_TEXT)).toBeVisible();
    // The client-error reporter drops an identical report within 60 s, so the repeated rejection is logged once.
    expect(knownRejectionReports(api.reports)).toHaveLength(1);
    expect(knownRejectionReports(api.reports)[0]).toEqual(
      expect.objectContaining({ type: 'KnownRejection', message: 'Forbidden resource' }),
    );
  });

  test('generic switch failure keeps the generic hint above the address selection', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const api = await installSyntheticApi(page, {
      switchError: { status: 500, body: { statusCode: 500, message: 'Internal server error' } },
    });

    await page.goto(`/connect?session=${encodeURIComponent(jwt())}&lang=en`);

    await expect(page.getByText('Please select an address or add a new one to continue.')).toBeVisible();
    await expect(page.getByText(/Something went wrong/)).toBeVisible();
    await expect(page.getByText('Internal server error')).toBeVisible();
    await expect(page.getByText(REJECTION_TEXT)).toHaveCount(0);

    // A looping screen would keep calling during the wait.
    await page.waitForTimeout(2000);
    expect(api.changeCalls).toBe(1);
    expect(knownRejectionReports(api.reports)).toHaveLength(0);
    expect(api.unexpectedRequests).toEqual([]);

    await expect(page).toHaveScreenshot('connect-address-switch-02-generic-error.png', { fullPage: true });
  });

  test('custody sign-up failure without a message shows the generic hint', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const api = await installSyntheticApi(page, {
      user: { ...USER, addresses: [] },
      custodyError: { status: 500, body: { statusCode: 500, message: '' } },
    });

    await page.goto(`/connect?session=${encodeURIComponent(jwt())}&lang=en&asset-out=ZCHF`);

    await expect(page.getByText(/Something went wrong/)).toBeVisible();
    await expect(page.getByText('Unknown error')).toBeVisible();

    // A looping screen would keep calling during the wait.
    await page.waitForTimeout(2000);
    expect(api.custodyCalls).toBe(1);
    expect(api.unexpectedRequests).toEqual([]);

    await expect(page).toHaveScreenshot('connect-address-switch-03-custody-error.png', { fullPage: true });
  });
});
