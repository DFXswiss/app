import { test, expect, Page, Route } from '@playwright/test';

/**
 * Visual regression for every RealUnit workspace function and scenario:
 * overview (populated, empty lists, overflow More), treasury (buy limit empty /
 * set / invalid / load error, prize wallet, missing wallet, wallet error,
 * payouts, empty payouts, balance alerts, alert form), insights (charts, share
 * mode, 1M timeframe, each chart error), holders (list, empty, next page),
 * received transactions (list, empty, error, detail, missing), and the holder
 * account (CHF, REALU, missing).
 *
 * Auth is a synthetic Admin JWT. RealUnit reads are mocked. A green run does
 * not prove the live API returns these fields.
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

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function fail(route: Route, message: string, status = 500): Promise<void> {
  await json(route, { statusCode: status, message }, status);
}

const ADDRESS = '0xabc0000000000000000000000000000000008001';

const QUOTE = {
  id: 8001,
  uid: 'RQ8001FAKE',
  type: 'Buy',
  status: 'WaitingForPayment',
  amount: 10000,
  estimatedAmount: 9.87,
  created: '2026-02-01T12:00:00.000Z',
  userAddress: ADDRESS,
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

const TX = {
  id: 9001,
  uid: 'RT9001FAKE',
  type: 'BuyCrypto',
  amountInChf: 500,
  assets: 'REALU',
  created: '2026-02-01T12:00:00.000Z',
  userAddress: ADDRESS,
};

const PAYOUT = {
  id: 9002,
  created: '2026-02-01T12:00:00.000Z',
  kind: 'Invite',
  legalBasis: 'ReferralPremium',
  status: 'Complete',
  amount: 10,
  chfValue: 12.5,
  txHash: '0xabc0000000000000000000000000000000009002',
  customerId: 8001,
  customerWallet: ADDRESS,
  referrerAccountId: 8003,
  referrerWallet: '0xabc0000000000000000000000000000000008003',
  guestAccountId: 8004,
  guestWallet: '0xabc0000000000000000000000000000000008004',
  code: 'AB-CD',
  qualifyingBuy: { id: 9003, created: '2026-01-15T10:00:00.000Z', amount: 50 },
};

const ALERT = { id: 7, asset: 'ETH', threshold: 0.2, mail: 'ops@example.com' };

const TOKEN = {
  totalShares: { total: '1000', timestamp: '2026-02-01T12:00:00.000Z', txHash: '0x1' },
  totalSupply: { value: '2000', timestamp: '2026-02-01T12:00:00.000Z' },
};

const PRICE = [{ timestamp: '2026-02-01T12:00:00.000Z', chf: 10, eur: 10, usd: 11 }];

const VOLUME = [
  { timestamp: '2026-02-01T00:00:00.000Z', chf: 1000, shares: 700, priceChf: 1.4 },
  { timestamp: '2026-02-02T00:00:00.000Z', chf: 2500, shares: 1800, priceChf: 1.41 },
];

const HOLDER_SERIES = [
  { timestamp: '2026-02-01T00:00:00.000Z', holders: 10 },
  { timestamp: '2026-02-02T00:00:00.000Z', holders: 12 },
];

const REGISTRATION = {
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
};

const ACCOUNT = {
  address: ADDRESS,
  addressType: 1,
  balance: '100',
  lastUpdated: '2026-02-01T12:00:00.000Z',
  historicalBalances: [
    { balance: '80', timestamp: '2026-01-01T00:00:00.000Z', valueChf: 800 },
    { balance: '100', timestamp: '2026-02-01T00:00:00.000Z', valueChf: 1000 },
  ],
};

const HISTORY = {
  address: ADDRESS,
  addressType: 1,
  totalCount: 1,
  pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: '', endCursor: '' },
  history: [
    {
      timestamp: '2026-02-01T12:00:00.000Z',
      eventType: 'Transfer',
      txHash: '0xabc0000000000000000000000000000000009002',
      transfer: {
        from: '0xabc0000000000000000000000000000000008003',
        to: ADDRESS,
        value: '10',
      },
    },
  ],
};

type ListMode = 'one' | 'empty' | 'many';
type World = {
  quotes: 'mixed' | 'empty' | 'many';
  transactions: ListMode | 'error';
  holders: ListMode | 'paged';
  buyLimit: 'empty' | 'set' | 'error';
  wallet: 'ok' | 'missing' | 'error';
  alerts: 'empty' | 'one' | 'error';
  payouts: 'one' | 'empty';
  priceHistory: 'ok' | 'error';
  buyVolume: 'ok' | 'error';
  holderCount: 'ok' | 'error';
  registration: 'ok' | 'error';
  account: 'ok' | 'missing';
};

const defaults: World = {
  quotes: 'mixed',
  transactions: 'one',
  holders: 'one',
  buyLimit: 'empty',
  wallet: 'ok',
  alerts: 'empty',
  payouts: 'one',
  priceHistory: 'ok',
  buyVolume: 'ok',
  holderCount: 'ok',
  registration: 'ok',
  account: 'ok',
};

const world: World = { ...defaults };
let holderCalls = 0;

function resetWorld(): void {
  Object.assign(world, defaults);
  holderCalls = 0;
}

function holder(address: string, balance: string, percentage: number) {
  return { address, balance, percentage };
}

function holdersBody(page: 1 | 2) {
  const pageInfo = {
    hasNextPage: world.holders === 'paged' && page === 1,
    hasPreviousPage: page === 2,
    startCursor: page === 1 ? 'c1' : 'c2',
    endCursor: page === 1 ? 'c1' : 'c2',
  };
  if (world.holders === 'empty') {
    return { holders: [], pageInfo: { ...pageInfo, hasNextPage: false, hasPreviousPage: false }, totalCount: 0 };
  }
  if (world.holders === 'many') {
    return {
      holders: [1, 2, 3, 4].map((n) => holder(`0xabc000000000000000000000000000000000800${n}`, String(n * 10), n)),
      pageInfo: { ...pageInfo, hasNextPage: false, hasPreviousPage: false },
      totalCount: 4,
    };
  }
  if (world.holders === 'paged' && page === 2) {
    return {
      holders: [holder('0xabc0000000000000000000000000000000008019', '19', 4)],
      pageInfo,
      totalCount: 8,
    };
  }
  return {
    holders: [holder(ADDRESS, '100', 1.5)],
    pageInfo,
    totalCount: world.holders === 'paged' ? 8 : 1,
  };
}

function quotesBody() {
  if (world.quotes === 'empty') return [];
  if (world.quotes === 'many') {
    return [1, 2, 3, 4].map((n) => ({
      ...QUOTE,
      id: 8100 + n,
      uid: `RQ810${n}`,
      amount: n * 1000,
      userId: n,
      userName: `Buyer ${n}`,
    }));
  }
  return [QUOTE, DEACTIVATED];
}

function transactionsBody() {
  if (world.transactions === 'empty') return [];
  if (world.transactions === 'many') {
    return [1, 2, 3, 4].map((n) => ({ ...TX, id: 9100 + n, uid: `RT910${n}`, amountInChf: n * 100 }));
  }
  return [TX];
}

async function installDashboardRoutes(page: Page): Promise<void> {
  holderCalls = 0;
  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request();
    const url = request.url();
    const path = new URL(url).pathname;

    if (/\/v1\/realunit\/admin\/quotes\/\d+\/(?:deactivate|confirm-payment)(?:\?|$)/.test(url)) {
      return json(route, {});
    }
    if (/\/v1\/realunit\/admin\/quotes(?:\?|$)/.test(url)) return json(route, quotesBody());
    if (/\/v1\/realunit\/admin\/transactions(?:\?|$)/.test(url)) {
      if (world.transactions === 'error') return fail(route, 'transactions down');
      return json(route, transactionsBody());
    }
    if (path === '/v1/realunit/holders') {
      holderCalls += 1;
      const pageNo = world.holders === 'paged' && holderCalls > 1 ? 2 : 1;
      return json(route, holdersBody(pageNo));
    }
    if (path === '/v1/realunit/tokenInfo') return json(route, TOKEN);
    if (path === '/v1/realunit/price/history') {
      if (world.priceHistory === 'error') return fail(route, 'price history down');
      return json(route, PRICE);
    }
    if (path === '/v1/realunit/price') return json(route, PRICE[0]);
    if (path === '/v1/realunit/admin/stats/buy-volume') {
      if (world.buyVolume === 'error') return fail(route, 'buy volume down');
      return json(route, VOLUME);
    }
    if (path === '/v1/realunit/admin/stats/holders') {
      if (world.holderCount === 'error') return fail(route, 'holder count down');
      return json(route, HOLDER_SERIES);
    }
    if (path === '/v1/realunit/admin/stats/registration') {
      if (world.registration === 'error') return fail(route, 'registration down');
      return json(route, REGISTRATION);
    }
    if (path === '/v1/realunit/admin/buy-limit') {
      if (world.buyLimit === 'error' && request.method() === 'GET') return fail(route, 'Failed to load buy limit.');
      return json(route, { maxTokensPerTx: world.buyLimit === 'set' ? 20000 : null });
    }
    if (path.includes('/prize-wallet/alerts')) {
      if (world.alerts === 'error' && request.method() === 'GET') return fail(route, 'alerts down');
      if (request.method() === 'GET') return json(route, world.alerts === 'one' ? [ALERT] : []);
      return json(route, ALERT);
    }
    if (path === '/v1/realunit/referral/admin/prize-wallet') {
      if (world.wallet === 'missing') return fail(route, 'Prize wallet is not configured', 404);
      if (world.wallet === 'error') return fail(route, 'Prize wallet unavailable');
      return json(route, { address: ADDRESS, eth: 0.5, realu: 80 });
    }
    if (path === '/v1/realunit/referral/admin/payouts') {
      return json(route, world.payouts === 'one' ? [PAYOUT] : []);
    }
    if (/\/v1\/realunit\/account\/[^/]+\/history$/.test(path)) {
      if (world.account === 'missing') return fail(route, 'Not found', 404);
      return json(route, HISTORY);
    }
    if (/\/v1\/realunit\/account\/[^/]+$/.test(path)) {
      if (world.account === 'missing') return fail(route, 'Not found', 404);
      return json(route, ACCOUNT);
    }

    if (
      request.method() === 'GET' &&
      ['/v1/language', '/v1/fiat', '/v1/asset', '/v1/bankAccount', '/v1/country'].includes(path)
    ) {
      return json(route, []);
    }
    if (request.method() === 'GET' && path === '/v1/setting/infoBanner') return json(route, null);
    await route.continue();
  });

  await page.route('**/v2/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path === '/v2/user') {
      return json(route, {
        id: 1,
        activeAddress: { address: '0x0000000000000000000000000000000000000001', wallet: 'DFX' },
        addresses: [],
        kyc: { level: 50, status: 'Completed' },
        language: { id: 1, name: 'English', symbol: 'EN' },
      });
    }
    await route.continue();
  });
}

const shot = { maxDiffPixels: 8000, animations: 'disabled' as const };
const query = () => `?session=${encodeURIComponent(jwt())}&lang=en`;

async function open(page: Page, path: string): Promise<void> {
  await installDashboardRoutes(page);
  await page.goto(path + query());
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

function section(page: Page, heading: string) {
  return page.getByRole('heading', { name: heading }).locator('xpath=..');
}

test.describe('RealUnit workspace - Visual Regression Tests', () => {
  test.describe.configure({ timeout: 180_000 });
  test.beforeEach(() => resetWorld());

  test('populated overview, treasury and insights', async ({ page }) => {
    await open(page, '/realunit');
    await expect(page.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: 'Pending Transactions' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Active Buyer' }).first()).toBeVisible();
    await expect(page.getByText('Deactivated Buyer')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Bonus and Referral' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Buy Volume' })).toHaveCount(0);
    const pending = section(page, 'Pending Transactions');
    await expect(pending.getByRole('columnheader', { name: 'Address' })).toBeVisible();
    await expect(pending.getByRole('columnheader', { name: 'User' })).toHaveCount(0);
    await expect(pending).toHaveScreenshot('realunit-dashboard-01-pending.png', shot);
    await expect(page).toHaveScreenshot('realunit-dashboard-09-overview.png', { ...shot, fullPage: true });

    await page.goto('/realunit/treasury' + query());
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    const buyLimit = section(page, 'Max tokens per buy');
    await expect(buyLimit).toHaveScreenshot('realunit-dashboard-08-buy-limit.png', shot);
    const bonus = section(page, 'Bonus and Referral');
    await expect(bonus.getByText(/ETH:/)).toBeVisible();
    await expect(bonus.getByText(/REALU:/)).toBeVisible();
    await expect(bonus.locator('svg').first()).toBeVisible();
    await expect(bonus).toHaveScreenshot('realunit-dashboard-06-bonus-referral.png', shot);
    await expect(page.getByTestId('payouts-panel')).toHaveScreenshot('realunit-dashboard-07-prize-payouts.png', shot);
    await expect(page).toHaveScreenshot('realunit-dashboard-12-treasury.png', { ...shot, fullPage: true });

    await page.goto('/realunit/insights' + query());
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    await expect(page).toHaveScreenshot('realunit-dashboard-20-insights.png', { ...shot, fullPage: true });
    const buyVolume = section(page, 'Buy Volume');
    await expect(buyVolume).toHaveScreenshot('realunit-dashboard-02-buy-volume-chf.png', shot);
    await buyVolume.getByRole('button', { name: 'Shares' }).click();
    await expect(buyVolume.locator('.apexcharts-canvas')).toBeVisible();
    await expect(buyVolume).toHaveScreenshot('realunit-dashboard-03-buy-volume-shares.png', shot);
    await expect(section(page, 'Holders over time')).toHaveScreenshot('realunit-dashboard-04-holders.png', shot);
    const registration = section(page, 'Registration');
    await expect(registration.getByText('Registered')).toBeVisible();
    await expect(registration).toHaveScreenshot('realunit-dashboard-05-registration.png', shot);
    await section(page, 'Price History').getByRole('button', { name: '1M' }).click();
    await expect(section(page, 'Price History')).toHaveScreenshot('realunit-dashboard-36-price-1m.png', shot);
  });

  test('overview empty lists and overflow More links', async ({ page }) => {
    world.quotes = 'empty';
    world.transactions = 'empty';
    await open(page, '/realunit');
    await expect(page.getByText('No pending transactions found')).toBeVisible();
    await expect(page.getByText('No received transactions found')).toBeVisible();
    await expect(page).toHaveScreenshot('realunit-dashboard-10-overview-empty.png', { ...shot, fullPage: true });

    resetWorld();
    world.quotes = 'many';
    world.transactions = 'many';
    world.holders = 'many';
    await open(page, '/realunit');
    await expect(page.getByRole('button', { name: 'More' })).toHaveCount(3);
    await expect(page).toHaveScreenshot('realunit-dashboard-11-overview-more.png', { ...shot, fullPage: true });
  });

  test('treasury buy limit, wallet and payout scenarios', async ({ page }) => {
    world.buyLimit = 'set';
    await open(page, '/realunit/treasury');
    await expect(section(page, 'Max tokens per buy').locator('input')).toHaveValue('20000');
    await expect(section(page, 'Max tokens per buy')).toHaveScreenshot('realunit-dashboard-13-buy-limit-set.png', shot);

    world.buyLimit = 'empty';
    await open(page, '/realunit/treasury');
    const limit = section(page, 'Max tokens per buy');
    await limit.locator('input').fill('0');
    await expect(limit.getByRole('button', { name: 'Save' })).toBeDisabled();
    await expect(limit).toHaveScreenshot('realunit-dashboard-37-buy-limit-invalid.png', shot);

    world.buyLimit = 'error';
    await open(page, '/realunit/treasury');
    await expect(page.getByText('Failed to load buy limit.')).toBeVisible();
    await expect(section(page, 'Max tokens per buy')).toHaveScreenshot('realunit-dashboard-14-buy-limit-error.png', shot);

    resetWorld();
    world.wallet = 'missing';
    await open(page, '/realunit/treasury');
    await expect(page.getByText('Prize wallet is not configured')).toBeVisible();
    await expect(section(page, 'Bonus and Referral')).toHaveScreenshot('realunit-dashboard-15-wallet-missing.png', shot);

    world.wallet = 'error';
    await open(page, '/realunit/treasury');
    await expect(page.getByText('Prize wallet unavailable')).toBeVisible();
    await expect(section(page, 'Bonus and Referral')).toHaveScreenshot('realunit-dashboard-16-wallet-error.png', shot);

    resetWorld();
    world.payouts = 'empty';
    await open(page, '/realunit/treasury');
    await expect(page.getByText('No prize payouts found')).toBeVisible();
    await expect(page.getByTestId('payouts-panel')).toHaveScreenshot('realunit-dashboard-17-payouts-empty.png', shot);

    world.payouts = 'one';
    world.alerts = 'one';
    await open(page, '/realunit/treasury');
    await expect(page.getByText('ops@example.com')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
    await expect(section(page, 'Bonus and Referral')).toHaveScreenshot('realunit-dashboard-18-alerts.png', shot);
    await page.getByRole('button', { name: 'Notify on low balance' }).click();
    await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
    await expect(section(page, 'Bonus and Referral')).toHaveScreenshot('realunit-dashboard-19-alert-form.png', shot);
  });

  test('insights error states', async ({ page }) => {
    world.priceHistory = 'error';
    await open(page, '/realunit/insights');
    await expect(page.getByText('Failed to load price history.')).toBeVisible();
    await expect(section(page, 'Price History')).toHaveScreenshot('realunit-dashboard-21-price-history-error.png', shot);

    resetWorld();
    world.buyVolume = 'error';
    await open(page, '/realunit/insights');
    await expect(page.getByText('Failed to load buy volume.')).toBeVisible();
    await expect(section(page, 'Buy Volume')).toHaveScreenshot('realunit-dashboard-22-buy-volume-error.png', shot);

    resetWorld();
    world.holderCount = 'error';
    await open(page, '/realunit/insights');
    await expect(page.getByText('Failed to load holder count.')).toBeVisible();
    await expect(section(page, 'Holders over time')).toHaveScreenshot('realunit-dashboard-23-holders-chart-error.png', shot);

    resetWorld();
    world.registration = 'error';
    await open(page, '/realunit/insights');
    await expect(page.getByText('Failed to load registration stats.')).toBeVisible();
    await expect(section(page, 'Registration')).toHaveScreenshot('realunit-dashboard-24-registration-error.png', shot);
  });

  test('holders list, empty list and next page', async ({ page }) => {
    await open(page, '/realunit/holders');
    await expect(page.getByRole('heading', { name: /All Holders/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
    await expect(page).toHaveScreenshot('realunit-dashboard-25-holders-list.png', { ...shot, fullPage: true });

    world.holders = 'empty';
    await open(page, '/realunit/holders');
    await expect(page.getByRole('heading', { name: 'All Holders (0)' })).toBeVisible();
    await expect(page).toHaveScreenshot('realunit-dashboard-26-holders-empty.png', { ...shot, fullPage: true });

    world.holders = 'paged';
    await open(page, '/realunit/holders');
    await expect(page.getByRole('heading', { name: 'All Holders (8)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled();
    await expect(page).toHaveScreenshot('realunit-dashboard-27-holders-next-enabled.png', { ...shot, fullPage: true });
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('19', { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('realunit-dashboard-38-holders-page-two.png', { ...shot, fullPage: true });
  });

  test('received transactions, detail, empty, error and missing', async ({ page }) => {
    await open(page, '/realunit/transactions');
    await expect(page.getByRole('cell', { name: 'Buy' })).toBeVisible();
    await expect(page).toHaveScreenshot('realunit-dashboard-28-transactions.png', { ...shot, fullPage: true });

    await open(page, '/realunit/transactions/9001');
    await expect(page.getByRole('heading', { name: 'Transaction Detail' })).toBeVisible();
    await expect(page).toHaveScreenshot('realunit-dashboard-31-transaction-detail.png', { ...shot, fullPage: true });

    world.transactions = 'empty';
    await open(page, '/realunit/transactions');
    await expect(page.getByText('No received transactions found')).toBeVisible();
    await expect(page).toHaveScreenshot('realunit-dashboard-29-transactions-empty.png', { ...shot, fullPage: true });

    world.transactions = 'error';
    await open(page, '/realunit/transactions');
    await expect(page.getByText('Failed to load received transactions.')).toBeVisible();
    await expect(page).toHaveScreenshot('realunit-dashboard-30-transactions-error.png', { ...shot, fullPage: true });

    world.transactions = 'one';
    await open(page, '/realunit/transactions/1');
    await expect(page.getByText('Transaction not found')).toBeVisible();
    await expect(page).toHaveScreenshot('realunit-dashboard-32-transaction-missing.png', { ...shot, fullPage: true });
  });

  test('holder account in CHF, REALU and missing', async ({ page }) => {
    await open(page, `/realunit/user/${encodeURIComponent(ADDRESS)}`);
    await expect(page.getByRole('heading', { name: 'Account Details' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Transaction History/ })).toBeVisible();
    await expect(page).toHaveScreenshot('realunit-dashboard-33-account-chf.png', { ...shot, fullPage: true });
    await page.getByRole('button', { name: 'REALU' }).click();
    await expect(page).toHaveScreenshot('realunit-dashboard-34-account-realu.png', { ...shot, fullPage: true });

    world.account = 'missing';
    await open(page, `/realunit/user/${encodeURIComponent(ADDRESS)}`);
    await expect(page.getByText('No data available')).toBeVisible();
    await expect(page).toHaveScreenshot('realunit-dashboard-35-account-missing.png', { ...shot, fullPage: true });
  });
});
