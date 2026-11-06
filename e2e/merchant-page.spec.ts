import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Visual baselines for the merchant page on /pl?merchant=<route>.
 * Each picture is the whole page.
 * The page reads its content from GET /v1/paymentLink/merchant, which these specs answer
 * themselves, and creates no payment.
 * These specs are a local review aid and do not run in CI.
 * A green run does not prove that the API returns this merchant info for a route,
 * or that it answers an unknown route with this 404.
 */

const ROUTE = 'shop-route';

const MERCHANT_INFO = {
  displayName: 'Bäckerei Muster',
  mode: 'Multiple',
  recipient: {
    name: 'Bäckerei Muster AG',
    address: { street: 'Bahnhofstrasse', houseNumber: '1', zip: '8001', city: 'Zürich', country: 'CH' },
    phone: '+41 44 000 00 00',
    mail: 'info@example.com',
    website: 'example.com',
  },
  transferAmounts: [
    { method: 'Lightning', assets: [{ asset: 'BTC' }] },
    { method: 'Ethereum', assets: [{ asset: 'ZCHF' }, { asset: 'USDT' }] },
    { method: 'Polygon', assets: [{ asset: 'ZCHF' }] },
  ],
};

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function stubAppApi(page: Page): Promise<void> {
  await page.route('**/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/v1/setting/infoBanner') return fulfillJson(route, 200, null);
    if (path === '/v1/language') {
      return fulfillJson(route, 200, [
        { id: 1, name: 'Deutsch', symbol: 'DE' },
        { id: 2, name: 'English', symbol: 'EN' },
      ]);
    }
    return fulfillJson(route, 200, []);
  });
  await page.route('**/v2/**', (route) => fulfillJson(route, 200, {}));
}

// Records every payment-link request, so a test can show that the page creates no payment.
async function stubMerchant(page: Page, status: number, body: unknown): Promise<string[]> {
  const requested: string[] = [];
  await page.route('**/paymentLink/**', (route) => {
    const url = new URL(route.request().url());
    requested.push(`${route.request().method()} ${url.pathname}`);
    if (url.pathname.endsWith('/paymentLink/merchant') && url.searchParams.get('route') === ROUTE) {
      return fulfillJson(route, status, body);
    }
    return fulfillJson(route, 200, []);
  });
  return requested;
}

async function shoot(page: Page, name: string): Promise<void> {
  const height = await page.evaluate(async () => {
    const root = document.getElementById('app-root');
    const scroller = root?.querySelector('.overflow-auto');
    if (scroller instanceof HTMLElement) scroller.scrollTop = 0;
    await document.fonts.ready;
    const column = root?.querySelector('.max-w-screen-md');
    const last = column?.lastElementChild;
    if (!(column instanceof HTMLElement) || !(last instanceof HTMLElement)) return 900;
    const pad = Number.parseFloat(getComputedStyle(column).paddingBottom) || 0;
    return Math.ceil(last.getBoundingClientRect().bottom + pad);
  });
  await page.setViewportSize({ width: 1280, height });
  await expect(page).toHaveScreenshot(name, { animations: 'disabled', fullPage: true });
}

test.describe('Merchant page', () => {
  test('visual regression - merchant info with recipient and payment methods', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });
    await stubAppApi(page);
    const requested = await stubMerchant(page, 200, MERCHANT_INFO);

    await page.goto(`/pl?merchant=${ROUTE}&showAssets&lang=en`);

    await expect(page.getByText('Bäckerei Muster', { exact: true })).toBeVisible();
    await expect(page.getByText('Bäckerei Muster AG', { exact: true })).toBeVisible();
    await expect(page.getByText('Ethereum, Polygon', { exact: true })).toBeVisible();
    await expect(page.getByText('USDT', { exact: true })).toBeVisible();
    expect(requested.filter((request) => request.includes('/paymentLink/payment'))).toEqual([]);
    expect(requested).toContain('GET /v1/paymentLink/merchant');
    await shoot(page, 'merchant-page-info.png');
  });

  test('visual regression - merchant info call fails', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await stubAppApi(page);
    const requested = await stubMerchant(page, 404, {
      statusCode: 404,
      message: 'Payment route not found',
      error: 'Not Found',
    });

    await page.goto(`/pl?merchant=${ROUTE}&lang=en`);

    await expect(page.getByText('Payment route not found', { exact: true })).toBeVisible();
    await expect(page.getByText('Payment details', { exact: true })).toHaveCount(0);
    expect(requested.filter((request) => request.includes('/paymentLink/payment'))).toEqual([]);
    await shoot(page, 'merchant-page-error.png');
  });
});
