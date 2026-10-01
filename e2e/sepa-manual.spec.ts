import { expect, Locator, Page, Route, test } from '@playwright/test';

/**
 * Manual SEPA screen visuals use a synthetic Admin session and fail-closed API fixtures.
 * The successful upload is mocked for visual review only; a green run does not prove API
 * acceptance, persistence, or bank processing.
 */

const COUNTRY_CH = {
  id: 1,
  symbol: 'CH',
  name: 'Switzerland',
  foreignName: 'Schweiz',
  kycAllowed: true,
  kycOrganizationAllowed: true,
  nationalityAllowed: true,
  bankAllowed: true,
  cardAllowed: true,
  cryptoAllowed: true,
};

function syntheticAdminJwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    role: 'Admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

interface SyntheticApiLog {
  unexpectedRequests: string[];
  bankTxPosts: string[];
  clientErrorPosts: string[];
}

async function installSyntheticApi(page: Page): Promise<SyntheticApiLog> {
  const log: SyntheticApiLog = { unexpectedRequests: [], bankTxPosts: [], clientErrorPosts: [] };

  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;

    if (method === 'GET' && ['/v1/language', '/v1/fiat', '/v1/asset', '/v1/bankAccount'].includes(path)) {
      await fulfillJson(route, []);
      return;
    }
    if (method === 'GET' && path === '/v1/country') {
      await fulfillJson(route, [COUNTRY_CH]);
      return;
    }
    if (method === 'GET' && path === '/v1/setting/infoBanner') {
      await fulfillJson(route, null);
      return;
    }
    if (method === 'POST' && path === '/v1/log/clientError') {
      log.clientErrorPosts.push(request.postData() ?? '');
      await fulfillJson(route, null);
      return;
    }
    if (method === 'POST' && path === '/v1/bankTx') {
      log.bankTxPosts.push(Buffer.from(request.postDataBuffer() ?? []).toString('utf8'));
      await fulfillJson(route, { accepted: true });
      return;
    }

    log.unexpectedRequests.push(`${method} ${path}`);
    await fulfillJson(route, { error: `Unexpected synthetic API request: ${method} ${path}` }, 501);
  });

  await page.route('**/v2/**', async (route: Route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;

    if (method === 'GET' && path === '/v2/user') {
      await fulfillJson(route, {
        id: 1,
        accountId: 1,
        mail: 'synthetic-admin@example.test',
        activeAddress: { address: '0x0000000000000000000000000000000000000001', wallet: 'DFX' },
        addresses: [],
        kyc: { level: 50, status: 'Completed' },
        language: { id: 1, name: 'English', symbol: 'EN' },
      });
      return;
    }

    log.unexpectedRequests.push(`${method} ${path}`);
    await fulfillJson(route, { error: `Unexpected synthetic API request: ${method} ${path}` }, 501);
  });

  return log;
}

async function openManualForm(page: Page, viewport: { width: number; height: number }): Promise<SyntheticApiLog> {
  const apiLog = await installSyntheticApi(page);
  await page.setViewportSize(viewport);
  await page.goto(`/sepa/manual?session=${encodeURIComponent(syntheticAdminJwt())}&lang=en`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Manual bank transaction', { exact: true }).first()).toBeVisible();

  await page.locator('input[type="date"]').nth(0).fill('2026-03-10');
  await page.locator('input[type="date"]').nth(1).fill('2026-03-11');
  await page.locator('input[type="number"]').fill('42.50');
  await page.getByPlaceholder('DFX AG').fill('DFX AG');
  await page.getByPlaceholder('CH78 8080 8002 6086 1409 2').fill('CH9300762011623852957');
  await page.getByPlaceholder('Raiffeisenbank').fill('Raiffeisenbank');
  await page.getByPlaceholder('John Doe').fill('Visual SEPA Counterparty');
  await page.getByPlaceholder('DE89 3704 0044 0532 0130 00').fill('CH3908704016075473007');
  await page.getByPlaceholder('XXXX-XXXX-XXXX').fill('VISUAL-SEPA-2026-03');

  await expect(page.getByRole('button', { name: 'Upload' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Upload' })).toBeVisible();
  await expect(page.getByText('Uploaded', { exact: true })).toHaveCSS('opacity', '0');
  const countryInput = page.locator('input[name="country"]');
  await expect(countryInput).toBeVisible();
  await expect(countryInput).toHaveAttribute('placeholder', 'Select...');
  await expect.poll(() => apiLog.unexpectedRequests).toEqual([]);
  return apiLog;
}

async function takeScreenshot(page: Page, name: string): Promise<void> {
  await expect(page).toHaveScreenshot(name, {
    fullPage: true,
    animations: 'disabled',
    maxDiffPixels: 8000,
  });
}

async function expectWithinViewport(page: Page, locator: Locator): Promise<void> {
  const [box, viewport] = [await locator.boundingBox(), page.viewportSize()];
  if (!box || !viewport) throw new Error('Expected a visible element and configured viewport');
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

async function takeHandledErrorScreenshot(page: Page, name: string): Promise<void> {
  const message = page.getByText('Secure random UUID generation is unavailable.');
  const uploadButton = page.getByRole('button', { name: 'Upload' });
  await uploadButton.scrollIntoViewIfNeeded();
  await expect(message).toBeVisible();
  await expect(uploadButton).toBeVisible();
  await expectWithinViewport(page, message);
  await expectWithinViewport(page, uploadButton);
  await expect(page).toHaveScreenshot(name, { animations: 'disabled', maxDiffPixels: 8000 });
}

async function disableUuidKeepSecureEntropy(page: Page): Promise<void> {
  await page.evaluate(() => {
    const nativeGetRandomValues = window.crypto.getRandomValues.bind(window.crypto);
    Object.defineProperty(window.crypto, 'randomUUID', { configurable: true, value: undefined });
    Object.defineProperty(window, '__sepaRandomValuesCalls', { configurable: true, value: 0, writable: true });
    Object.defineProperty(window.crypto, 'getRandomValues', {
      configurable: true,
      value: (bytes: Uint8Array) => {
        const instrumentedWindow = window as Window & { __sepaRandomValuesCalls: number };
        instrumentedWindow.__sepaRandomValuesCalls += 1;
        return nativeGetRandomValues(bytes);
      },
    });
  });
}

type EntropyFailure = 'randomUUID-missing-getRandomValues-throws' | 'randomUUID-throws-getRandomValues-missing';

async function disableSecureEntropy(page: Page, failure: EntropyFailure): Promise<void> {
  await page.evaluate((mode) => {
    if (mode === 'randomUUID-missing-getRandomValues-throws') {
      Object.defineProperty(window.crypto, 'randomUUID', { configurable: true, value: undefined });
      Object.defineProperty(window.crypto, 'getRandomValues', {
        configurable: true,
        value: () => {
          throw new Error('synthetic secure entropy failure');
        },
      });
      return;
    }

    Object.defineProperty(window.crypto, 'randomUUID', {
      configurable: true,
      value: () => {
        throw new Error('synthetic randomUUID failure');
      },
    });
    Object.defineProperty(window.crypto, 'getRandomValues', { configurable: true, value: undefined });
  }, failure);
}

const mobile = { width: 390, height: 844 };
const desktop = { width: 1440, height: 1100 };

test.describe('Manual SEPA upload visuals', () => {
  let pageErrors: string[] = [];

  test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
  });

  test.afterEach(() => {
    expect(pageErrors).toEqual([]);
  });

  test('desktop valid form before upload', async ({ page }) => {
    await openManualForm(page, desktop);
    await takeScreenshot(page, 'sepa-manual-desktop-valid-form.png');
  });

  test('mobile valid form before upload', async ({ page }) => {
    await openManualForm(page, mobile);
    await takeScreenshot(page, 'sepa-manual-mobile-valid-form.png');
  });

  test('successful upload falls back to secure getRandomValues', async ({ page }) => {
    const apiLog = await openManualForm(page, desktop);
    await disableUuidKeepSecureEntropy(page);
    const entropyCapabilities = await page.evaluate(() => ({
      randomUUID: typeof window.crypto.randomUUID,
      getRandomValues: typeof window.crypto.getRandomValues,
    }));
    expect(entropyCapabilities).toEqual({ randomUUID: 'undefined', getRandomValues: 'function' });

    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(page.getByText('Uploaded', { exact: true })).toHaveCSS('opacity', '1');
    await expect.poll(() => apiLog.bankTxPosts.length).toBe(1);
    await expect.poll(() => apiLog.unexpectedRequests).toEqual([]);

    const xmlUpload = apiLog.bankTxPosts[0];
    const reference = xmlUpload.match(/<AcctSvcrRef>([^<]+)<\/AcctSvcrRef>/)?.[1];
    expect(reference).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(await page.evaluate(() => (window as Window & { __sepaRandomValuesCalls: number }).__sepaRandomValuesCalls)).toBeGreaterThan(0);
    const uploaded = page.getByText('Uploaded', { exact: true });
    const successHeader = uploaded.locator('xpath=..');
    await successHeader.scrollIntoViewIfNeeded();
    await expectWithinViewport(page, successHeader);
    await expect(successHeader).toHaveScreenshot('sepa-manual-desktop-uploaded.png', {
      animations: 'disabled',
      maxDiffPixels: 8000,
    });
  });

  test('shows a handled error when randomUUID is absent and getRandomValues throws', async ({ page }) => {
    const apiLog = await openManualForm(page, desktop);
    await disableSecureEntropy(page, 'randomUUID-missing-getRandomValues-throws');

    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(page.getByText('Secure random UUID generation is unavailable.')).toBeVisible();
    await expect(page.getByText('Uploaded', { exact: true })).toHaveCSS('opacity', '0');
    await expect.poll(() => apiLog.bankTxPosts).toEqual([]);
    await expect.poll(() => apiLog.unexpectedRequests).toEqual([]);
    await takeHandledErrorScreenshot(page, 'sepa-manual-desktop-uuid-error.png');
  });

  test('mobile shows the handled UUID generation error', async ({ page }) => {
    const apiLog = await openManualForm(page, mobile);
    await disableSecureEntropy(page, 'randomUUID-missing-getRandomValues-throws');

    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(page.getByText('Secure random UUID generation is unavailable.')).toBeVisible();
    await expect(page.getByText('Uploaded', { exact: true })).toHaveCSS('opacity', '0');
    await expect.poll(() => apiLog.bankTxPosts).toEqual([]);
    await expect.poll(() => apiLog.unexpectedRequests).toEqual([]);
    await takeHandledErrorScreenshot(page, 'sepa-manual-mobile-uuid-error.png');
  });

  test('shows a handled error when randomUUID throws and getRandomValues is absent', async ({ page }) => {
    const apiLog = await openManualForm(page, desktop);
    await disableSecureEntropy(page, 'randomUUID-throws-getRandomValues-missing');

    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(page.getByText('Secure random UUID generation is unavailable.')).toBeVisible();
    await expect(page.getByText('Uploaded', { exact: true })).toHaveCSS('opacity', '0');
    await expect.poll(() => apiLog.bankTxPosts).toEqual([]);
    await expect.poll(() => apiLog.unexpectedRequests).toEqual([]);
    await takeHandledErrorScreenshot(page, 'sepa-manual-desktop-randomUUID-throws-error.png');
  });
});
