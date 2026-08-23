import { test, expect, Page, Route } from '@playwright/test';

/**
 * Visual regression: RealUnit dashboard home (`/realunit`) pending-quotes table
 * and monitoring charts (buy volume, holders over time, registration).
 *
 * Auth is a synthetic Admin JWT. Holders, token info, price history, quotes,
 * transactions and admin stats are mocked. A green run does not prove the live
 * API returns these fields.
 */

function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    role: 'Admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

const QUOTE = {
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

const DEACTIVATED = {
  ...QUOTE,
  id: 8002,
  uid: 'RQ8002FAKE',
  amount: 2500,
  deactivatedAt: '2026-02-02T12:00:00.000Z',
  userId: 8002,
  userName: 'Deactivated Buyer',
};

async function installDashboardRoutes(page: Page): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request();
    const url = request.url();
    const path = new URL(url).pathname;

    if (/\/v1\/realunit\/admin\/quotes\/\d+\/(?:deactivate|confirm-payment)(?:\?|$)/.test(url)) {
      return json(route, {});
    }
    if (/\/v1\/realunit\/admin\/quotes(?:\?|$)/.test(url)) {
      return json(route, [QUOTE, DEACTIVATED]);
    }
    if (/\/v1\/realunit\/admin\/transactions(?:\?|$)/.test(url)) {
      return json(route, [
        {
          id: 9001,
          uid: 'RT9001FAKE',
          type: 'BuyCrypto',
          amountInChf: 500,
          assets: 'REALU',
          created: '2026-02-01T12:00:00.000Z',
          userAddress: '0xabc0000000000000000000000000000000008001',
        },
      ]);
    }
    if (path === '/v1/realunit/holders') {
      return json(route, {
        holders: [{ address: '0xabc0000000000000000000000000000000008001', balance: '100', percentage: 1.5 }],
        pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: '', endCursor: '' },
        totalCount: 1,
      });
    }
    if (path === '/v1/realunit/tokenInfo') {
      return json(route, {
        totalShares: { total: '1000', timestamp: '2026-02-01T12:00:00.000Z', txHash: '0x1' },
        totalSupply: { value: '2000', timestamp: '2026-02-01T12:00:00.000Z' },
      });
    }
    if (path === '/v1/realunit/price/history') {
      return json(route, [{ timestamp: '2026-02-01T12:00:00.000Z', chf: 10, eur: 10, usd: 11 }]);
    }
    if (path === '/v1/realunit/price') {
      return json(route, { timestamp: '2026-02-01T12:00:00.000Z', chf: 10, eur: 10, usd: 11 });
    }
    if (path === '/v1/realunit/admin/stats/buy-volume') {
      return json(route, [
        { timestamp: '2026-02-01T00:00:00.000Z', chf: 1000, shares: 700, priceChf: 1.4 },
        { timestamp: '2026-02-02T00:00:00.000Z', chf: 2500, shares: 1800, priceChf: 1.41 },
      ]);
    }
    if (path === '/v1/realunit/admin/stats/holders') {
      return json(route, [
        { timestamp: '2026-02-01T00:00:00.000Z', holders: 10 },
        { timestamp: '2026-02-02T00:00:00.000Z', holders: 12 },
      ]);
    }
    if (path === '/v1/realunit/admin/stats/registration') {
      return json(route, {
        snapshot: {
          completed: 194,
          manualReview: 23,
          confirmed: 111,
          usersActive: 61,
          usersNa: 402,
          usersBlocked: 0,
          usersDeleted: 2,
        },
        series: [
          { timestamp: '2026-02-01T00:00:00.000Z', registered: 3, confirmed: 1 },
          { timestamp: '2026-02-02T00:00:00.000Z', registered: 5, confirmed: 2 },
        ],
      });
    }

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

test.describe('RealUnit dashboard - Visual Regression Tests', () => {
  test('home pending table shows address and name and hides deactivated quotes', async ({ page }) => {
    await installDashboardRoutes(page);
    await page.goto(`/realunit?session=${encodeURIComponent(jwt())}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await expect(page.getByRole('heading', { name: 'Pending Transactions' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Buy Volume' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Holders over time' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Registration' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Active Buyer' }).first()).toBeVisible();
    await expect(page.getByText('Deactivated Buyer')).toHaveCount(0);
    await expect(page.locator('.apexcharts-canvas').first()).toBeVisible();

    const screenshotOpts = { maxDiffPixels: 5000 };
    const section = (heading: string) => page.getByRole('heading', { name: heading }).locator('xpath=..');

    const pendingSection = section('Pending Transactions');
    await pendingSection.scrollIntoViewIfNeeded();
    await expect(pendingSection.getByRole('columnheader', { name: 'Address' })).toBeVisible();
    await expect(pendingSection.getByRole('columnheader', { name: 'User' })).toHaveCount(0);
    await expect(pendingSection).toHaveScreenshot('realunit-dashboard-01-pending.png', screenshotOpts);

    const buyVolume = section('Buy Volume');
    await buyVolume.scrollIntoViewIfNeeded();
    await expect(buyVolume).toHaveScreenshot('realunit-dashboard-02-buy-volume-chf.png', screenshotOpts);
    await buyVolume.getByRole('button', { name: 'Shares' }).click();
    await expect(buyVolume.locator('.apexcharts-canvas')).toBeVisible();
    await expect(buyVolume).toHaveScreenshot('realunit-dashboard-03-buy-volume-shares.png', screenshotOpts);

    const holders = section('Holders over time');
    await holders.scrollIntoViewIfNeeded();
    await expect(holders).toHaveScreenshot('realunit-dashboard-04-holders.png', screenshotOpts);

    const registration = section('Registration');
    await registration.scrollIntoViewIfNeeded();
    await expect(registration.getByText('Registered')).toBeVisible();
    await expect(registration).toHaveScreenshot('realunit-dashboard-05-registration.png', screenshotOpts);
  });
});
