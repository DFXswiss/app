import { test, expect, Page, Route } from '@playwright/test';

/**
 * E2E Visual Regression Tests: RealUnit quote list + detail variants
 *
 * Routes:
 *   - /realunit/quotes        (pending quote list)
 *   - /realunit/quotes/:id    (quote detail: active actions, deactivate overlay, deactivated)
 *
 * Auth is a synthetic Admin/Support JWT. Staff GETs and the quotes admin endpoints are mocked, so
 * the suite does not need a live API. A green run does not prove production auth or that the API
 * returns these quote fields.
 *
 * Feature data is MOCKED with synthetic fixtures via page.route(...), so the baselines are deterministic AND contain
 * NO real production data.
 *
 * Intercepted endpoints (base `/v1/` is prepended by useApi):
 *   - GET  realunit/admin/quotes[?limit=&offset=]     (list — detail screen also loads this and finds by id)
 *   - PUT  realunit/admin/quotes/:id/deactivate       (intercepted so a stray click cannot hit the real api)
 *   - PUT  realunit/admin/quotes/:id/confirm-payment  (same)
 *
 * Synthetic fixtures: fake ids (8000+), fixed ISO dates, fake addresses — no production data.
 */

// ---------------------------------------------------------------------------
// Synthetic fixtures (mirror RealUnitQuote from the admin quotes list/detail screens).
// ---------------------------------------------------------------------------

interface RealUnitQuote {
  id: number;
  uid: string;
  type: string;
  status: string;
  amount: number;
  estimatedAmount: number;
  created: string;
  userAddress?: string;
  userId?: number;
  userName?: string;
  deactivatedAt?: string;
}

const ACTIVE_BUY: RealUnitQuote = {
  id: 8001,
  uid: 'RQ8001FAKE',
  type: 'Buy',
  status: 'WaitingForPayment',
  amount: 10000,
  estimatedAmount: 9.87,
  created: '2026-02-01T12:00:00.000Z',
  userAddress: '0xabc0000000000000000000000000000000008001',
  userId: 8001,
  userName: 'Active Buyer',
};

const DEACTIVATED_BUY: RealUnitQuote = {
  id: 8002,
  uid: 'RQ8002FAKE',
  type: 'Buy',
  status: 'WaitingForPayment',
  amount: 2500,
  estimatedAmount: 2.46,
  created: '2026-02-01T12:00:00.000Z',
  deactivatedAt: '2026-02-02T12:00:00.000Z',
  userAddress: '0xdef0000000000000000000000000000000008002',
  userId: 8002,
  userName: 'Deactivated Buyer',
};

// Stable order for the GET list mock (detail screens also consume this list and find by id).
const QUOTES: RealUnitQuote[] = [ACTIVE_BUY, DEACTIVATED_BUY];

// ---------------------------------------------------------------------------
// Routing: intercept ONLY RealUnit quotes admin endpoints; pass everything else through.
// Match more-specific PUT paths first, then the GET list (path only; ignore query).
// ---------------------------------------------------------------------------

const DEACTIVATE_RE = /\/v1\/realunit\/admin\/quotes\/\d+\/deactivate(?:\?|$)/;
const CONFIRM_PAYMENT_RE = /\/v1\/realunit\/admin\/quotes\/\d+\/confirm-payment(?:\?|$)/;
const LIST_RE = /\/v1\/realunit\/admin\/quotes(?:\?|$)/;

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

function jwt(role: 'Admin' | 'Support'): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    role,
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

/** Quotes mocks plus staff GETs so a synthetic JWT does not 401-clear the session. */
async function installQuotesRoutesWithStaffMocks(page: Page): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request();
    const url = request.url();
    const path = new URL(url).pathname;

    if (DEACTIVATE_RE.test(url)) return json(route, {});
    if (CONFIRM_PAYMENT_RE.test(url)) return json(route, {});
    if (LIST_RE.test(url)) return json(route, QUOTES);

    if (
      request.method() === 'GET' &&
      ['/v1/language', '/v1/fiat', '/v1/asset', '/v1/bankAccount', '/v1/country'].includes(path)
    ) {
      return json(route, []);
    }

    if (request.method() === 'GET' && path === '/v1/setting/infoBanner') {
      return json(route, null);
    }

    await route.continue();
  });

  await page.route('**/v2/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (request.method() === 'GET' && path === '/v2/user') {
      return json(route, {
        id: 1,
        activeAddress: {
          address: '0x0000000000000000000000000000000000000001',
          wallet: 'DFX',
        },
        addresses: [],
        kyc: { level: 50, status: 'Completed' },
        language: { id: 1, name: 'English', symbol: 'EN' },
      });
    }

    await route.continue();
  });
}

test.describe('RealUnit Quotes - Visual Regression Tests', () => {
  const token = jwt('Admin');

  test('list shows only pending WaitingForPayment Buy rows', async ({ page }) => {
    await installQuotesRoutesWithStaffMocks(page);

    // lang=en: selectors and baselines are English; without it user.language decides the UI locale.
    await page.goto(`/realunit/quotes?session=${encodeURIComponent(token)}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await expect(page.getByRole('heading', { name: 'Pending Transactions' })).toBeVisible();
    await expect(page.getByText('Active Buyer')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Address' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'User' })).toHaveCount(0);
    await expect(page.getByText('Deactivated Buyer')).toHaveCount(0);

    await expect(page).toHaveScreenshot('realunit-quotes-01-list.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('active WaitingForPayment Buy detail shows Confirm Payment and Deactivate', async ({ page }) => {
    await installQuotesRoutesWithStaffMocks(page);

    await page.goto(`/realunit/quotes/${ACTIVE_BUY.id}?session=${encodeURIComponent(token)}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await expect(page.getByRole('button', { name: 'Confirm Payment Received' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Deactivate Quote' })).toBeVisible();

    await expect(page).toHaveScreenshot('realunit-quotes-02-detail-active-buy.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('Deactivate Quote opens the confirmation overlay', async ({ page }) => {
    await installQuotesRoutesWithStaffMocks(page);

    await page.goto(`/realunit/quotes/${ACTIVE_BUY.id}?session=${encodeURIComponent(token)}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: 'Deactivate Quote' }).click();
    await expect(page.getByText('Are you sure you want to deactivate this quote?')).toBeVisible();
    await page.waitForTimeout(500);

    // keep the overlay open — do not click Confirm
    await expect(page).toHaveScreenshot('realunit-quotes-03-detail-deactivate-overlay.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('deactivated quote detail shows Deactivated At and no action buttons', async ({ page }) => {
    await installQuotesRoutesWithStaffMocks(page);

    await page.goto(`/realunit/quotes/${DEACTIVATED_BUY.id}?session=${encodeURIComponent(token)}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await expect(page.getByText('Deactivated At')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Deactivate Quote' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Confirm Payment Received' })).toHaveCount(0);

    await expect(page).toHaveScreenshot('realunit-quotes-04-detail-deactivated.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('active WaitingForPayment Buy as Support shows Deactivate and not Confirm Payment', async ({ page }) => {
    await installQuotesRoutesWithStaffMocks(page);
    await page.goto(`/realunit/quotes/${ACTIVE_BUY.id}?session=${encodeURIComponent(jwt('Support'))}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await expect(page.getByRole('button', { name: 'Deactivate Quote' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm Payment Received' })).toHaveCount(0);
    await expect(page).toHaveScreenshot('realunit-quotes-05-detail-support-active-buy.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });
});
