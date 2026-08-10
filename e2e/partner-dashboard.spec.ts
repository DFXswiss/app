import { expect, Page, Route, test } from '@playwright/test';

/**
 * E2E Visual Regression Tests: Partner Dashboard (`/partner/dashboard`)
 *
 * Auth is a synthetic JWT with role `NonCustodialWalletPartner` (client-side guard only;
 * jwtDecode without signature check). All API traffic is mocked so baselines stay
 * deterministic and do not depend on DEV API role grants.
 *
 * Fixed clock: 2026-06-30T12:00:00.000Z — period controls and chart axis labels derive
 * ranges from `new Date()`, so a moving wall clock would invalidate baselines.
 *
 * Four product states:
 *   - dashboard-light  — filled metrics, light theme (default)
 *   - dashboard-dark   — same data, dark theme via localStorage pre-seed
 *   - dashboard-error  — statistic endpoint HTTP 500 → ErrorState
 *   - dashboard-empty  — zero totals + empty timeline buckets → EmptyState
 */

const FIXED_NOW = '2026-06-30T12:00:00.000Z';
/** 30-day window ending at FIXED_NOW (matches App.periodRange(30) under the frozen clock). */
const PERIOD = {
  from: '2026-06-01T00:00:00.000Z',
  to: FIXED_NOW,
} as const;

const PARTNER_THEME_STORAGE_KEY = 'partner-dashboard-theme';

const LANGUAGES = [
  { id: 1, name: 'English', symbol: 'EN', foreignName: 'English', enable: true },
  { id: 2, name: 'German', symbol: 'DE', foreignName: 'Deutsch', enable: true },
  { id: 3, name: 'French', symbol: 'FR', foreignName: 'Français', enable: true },
  { id: 4, name: 'Italian', symbol: 'IT', foreignName: 'Italiano', enable: true },
];

const LANGUAGE_EN = LANGUAGES[0];

const FIAT_CHF = {
  id: 1,
  name: 'Swiss Franc',
  buyable: true,
  sellable: true,
  cardBuyable: false,
  cardSellable: false,
  instantBuyable: false,
  instantSellable: false,
};

/** Constant filled statistic body — values fixed; not derived from Date.now(). */
const FILLED_STATISTIC = {
  period: { from: PERIOD.from, to: PERIOD.to },
  currency: 'CHF' as const,
  totals: {
    volume: { buy: 214850.4, sell: 22310.75, swap: 8640.2, total: 245801.35 },
    transactions: { buy: 1842, sell: 312, swap: 96, total: 2250 },
    averageTransactionVolume: 109.25,
    activeUsers: 1286,
    newUsers: 214,
  },
  allTime: {
    volume: { buy: 11858002.52, sell: 855027.41, total: 12713029.93 },
    registeredUsers: 126547,
    tradingUsers: 24360,
  },
  breakdown: {
    assets: [
      { name: 'BTC', blockchain: 'Bitcoin', direction: 'Buy', volume: 98420.5, transactions: 620 },
      { name: 'ETH', blockchain: 'Ethereum', direction: 'Buy', volume: 54210.3, transactions: 410 },
      { name: 'USDT', blockchain: 'Ethereum', direction: 'Buy', volume: 28100.0, transactions: 280 },
      { name: 'XMR', blockchain: 'Monero', direction: 'Buy', volume: 18450.6, transactions: 190 },
      { name: 'BTC', blockchain: 'Bitcoin', direction: 'Sell', volume: 12800.4, transactions: 145 },
      { name: 'LTC', blockchain: 'Litecoin', direction: 'Buy', volume: 8920.0, transactions: 95 },
    ],
    fiatCurrencies: [
      { name: 'CHF', volume: 142000.0, transactions: 1120 },
      { name: 'EUR', volume: 78500.5, transactions: 780 },
      { name: 'USD', volume: 0, transactions: 0 },
    ],
    blockchains: [
      { name: 'Bitcoin', volume: 111220.9, transactions: 765 },
      { name: 'Ethereum', volume: 87520.65, transactions: 778 },
      { name: 'Monero', volume: 18450.6, transactions: 190 },
      { name: 'Litecoin', volume: 8920.0, transactions: 95 },
    ],
    paymentMethods: [
      { name: 'Bank', volume: 156400.0, transactions: 1380 },
      { name: 'Card', volume: 0, transactions: 0 },
      { name: 'OnChain', volume: 37301.0, transactions: 350 },
    ],
  },
  referral: {
    volume: 42180.5,
    creditEarned: 1265.4,
    creditPaid: 980.0,
    creditOpen: 285.4,
    currency: 'EUR' as const,
  },
  meta: { generatedAt: '2026-07-01T08:00:00.000Z' },
};

/**
 * Fixed 10-bucket day series spanning the frozen period (deterministic axis labels).
 * Edge buckets marked partial per API contract; one real-zero mid bucket retained.
 */
const FILLED_TIMELINE = {
  period: { from: PERIOD.from, to: PERIOD.to },
  currency: 'CHF' as const,
  granularity: 'Day' as const,
  buckets: [
    { date: '2026-06-01T00:00:00.000Z', volume: { buy: 6200, sell: 710, swap: 240 }, transactions: { buy: 56, sell: 10, swap: 3 }, partial: true },
    { date: '2026-06-04T00:00:00.000Z', volume: { buy: 7100, sell: 820, swap: 310 }, transactions: { buy: 65, sell: 12, swap: 3 }, partial: false },
    { date: '2026-06-07T00:00:00.000Z', volume: { buy: 5800, sell: 640, swap: 180 }, transactions: { buy: 53, sell: 9, swap: 2 }, partial: false },
    { date: '2026-06-10T00:00:00.000Z', volume: { buy: 8400, sell: 910, swap: 420 }, transactions: { buy: 76, sell: 13, swap: 5 }, partial: false },
    { date: '2026-06-13T00:00:00.000Z', volume: { buy: 0, sell: 0, swap: 0 }, transactions: { buy: 0, sell: 0, swap: 0 }, partial: false },
    { date: '2026-06-16T00:00:00.000Z', volume: { buy: 9200, sell: 1050, swap: 380 }, transactions: { buy: 84, sell: 15, swap: 4 }, partial: false },
    { date: '2026-06-19T00:00:00.000Z', volume: { buy: 7800, sell: 880, swap: 290 }, transactions: { buy: 71, sell: 13, swap: 3 }, partial: false },
    { date: '2026-06-22T00:00:00.000Z', volume: { buy: 6500, sell: 720, swap: 210 }, transactions: { buy: 59, sell: 10, swap: 2 }, partial: false },
    { date: '2026-06-25T00:00:00.000Z', volume: { buy: 10100, sell: 1120, swap: 450 }, transactions: { buy: 92, sell: 16, swap: 5 }, partial: false },
    { date: '2026-06-30T00:00:00.000Z', volume: { buy: 8700, sell: 940, swap: 330 }, transactions: { buy: 79, sell: 13, swap: 4 }, partial: true },
  ],
  meta: { generatedAt: '2026-07-01T08:00:00.000Z' },
};

/** Zero-activity period: KPIs at 0, empty timeline → EmptyState in charts and bar lists. */
const EMPTY_STATISTIC = {
  period: { from: PERIOD.from, to: PERIOD.to },
  currency: 'CHF' as const,
  totals: {
    volume: { buy: 0, sell: 0, swap: 0, total: 0 },
    transactions: { buy: 0, sell: 0, swap: 0, total: 0 },
    averageTransactionVolume: null,
    activeUsers: 0,
    newUsers: 0,
  },
  allTime: {
    volume: { buy: 0, sell: 0, total: 0 },
    registeredUsers: 0,
    tradingUsers: 0,
  },
  breakdown: {
    assets: [],
    fiatCurrencies: [],
    blockchains: [],
    paymentMethods: [],
  },
  referral: {
    volume: 0,
    creditEarned: 0,
    creditPaid: 0,
    creditOpen: 0,
    currency: 'EUR' as const,
  },
  meta: { generatedAt: '2026-07-01T08:00:00.000Z' },
};

const EMPTY_TIMELINE = {
  period: { from: PERIOD.from, to: PERIOD.to },
  currency: 'CHF' as const,
  granularity: 'Day' as const,
  buckets: [] as typeof FILLED_TIMELINE.buckets,
  meta: { generatedAt: '2026-07-01T08:00:00.000Z' },
};

const USER_V2 = {
  accountId: 1,
  accountType: 'Personal',
  mail: 'partner@example.com',
  language: LANGUAGE_EN,
  currency: FIAT_CHF,
  tradingLimit: { limit: 0, period: 'Year' },
  kyc: { hash: 'synthetic-hash', level: 50, dataComplete: true, preferredPhoneTimes: [] },
  volumes: { buy: 0, sell: 0, swap: 0 },
  addresses: [],
  disabledAddresses: [],
  activeAddress: {
    wallet: 'Mail',
    address: 'partner@example.com',
    blockchains: [],
    volumes: { buy: 0, sell: 0, swap: 0 },
    isCustody: false,
  },
  paymentLink: { active: false },
  apiKeyCT: '',
  apiFilterCT: [],
};

type PartnerMockMode = 'filled' | 'empty' | 'error';

function partnerJwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  // Fixed far-future exp so isExpired() stays false under the frozen clock.
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    role: 'NonCustodialWalletPartner',
    exp: 4102444800, // 2100-01-01T00:00:00.000Z
  })}.synthetic`;
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/**
 * Intercept every API call. A synthetic JWT is rejected by DEV with 401, and any 401
 * clears the session — so nothing may fall through to the real API.
 */
async function installPartnerApi(page: Page, mode: PartnerMockMode): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      await fulfillJson(route, {});
      return;
    }

    const path = new URL(request.url()).pathname;

    if (path === '/v1/statistic/partner/timeline') {
      if (mode === 'error') {
        await fulfillJson(route, { statusCode: 500, message: 'Internal server error' }, 500);
        return;
      }
      await fulfillJson(route, mode === 'empty' ? EMPTY_TIMELINE : FILLED_TIMELINE);
      return;
    }

    if (path === '/v1/statistic/partner') {
      if (mode === 'error') {
        await fulfillJson(route, { statusCode: 500, message: 'Internal server error' }, 500);
        return;
      }
      await fulfillJson(route, mode === 'empty' ? EMPTY_STATISTIC : FILLED_STATISTIC);
      return;
    }

    if (path === '/v1/language') {
      await fulfillJson(route, LANGUAGES);
      return;
    }

    if (path === '/v1/fiat') {
      await fulfillJson(route, [FIAT_CHF]);
      return;
    }

    if (path === '/v1/country' || path === '/v1/asset' || path === '/v1/bankAccount') {
      await fulfillJson(route, []);
      return;
    }

    if (path === '/v1/setting/infoBanner') {
      await fulfillJson(route, null);
      return;
    }

    // Harmless default for any other bootstrap GET the shell may fire.
    await fulfillJson(route, []);
  });

  await page.route('**/v2/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (request.method() === 'GET' && path === '/v2/user') {
      await fulfillJson(route, USER_V2);
      return;
    }

    await fulfillJson(route, {});
  });
}

async function freezeTime(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
}

async function seedTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // ignore
      }
    },
    { key: PARTNER_THEME_STORAGE_KEY, value: theme },
  );
}

function dashboardUrl(token: string): string {
  // Force English so KPI/chart copy stays stable regardless of browser locale.
  return `/partner/dashboard?session=${token}&lang=en`;
}

/**
 * Wait until ApexCharts has painted series paths and the SVG markup stops changing.
 * Chart animations are disabled in product code, but layout still settles asynchronously.
 * Stability is sampled on consecutive animation frames (paint end-signal), not a fixed sleep.
 */
async function waitChartsSettled(page: Page): Promise<void> {
  await expect(page.locator('.apexcharts-canvas').first()).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.apexcharts-series path, .apexcharts-area-series path').first()).toBeVisible({
    timeout: 15000,
  });

  await page.locator('.apexcharts-svg').first().evaluate(async (el) => {
    let prev = '';
    for (let i = 0; i < 60; i++) {
      const current = el.innerHTML;
      if (current.length > 200 && current === prev) return;
      prev = current;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  });
}

/**
 * Layout scrolls inside `.overflow-auto` under `#app-root`. A fixed tall viewport +
 * fullPage stitches sticky/fixed chrome twice on short pages (error/empty showed the
 * header a second time near y≈1880). Grow the viewport to the measured content height
 * and capture a single viewport frame instead — no stitch, no duplicate header, no
 * trailing empty band.
 *
 * Product CSS forces fill-height (html/body/#root 100%, `.partner-dashboard` min-height
 * 100vh) so short states paint a large empty theme surface. That is real product chrome,
 * but a handbook baseline must not end in empty canvas — so for the shot only we collapse
 * those min-heights via an injected stylesheet (not a src/** change), measure, resize the
 * viewport to content, and leave the override in place for the screenshot.
 */
async function fitViewportToContent(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      html, body, body > div, #app-root {
        height: auto !important;
        min-height: 0 !important;
        overflow: visible !important;
      }
      #app-root .overflow-auto,
      #app-root .flex-grow {
        height: auto !important;
        min-height: 0 !important;
        flex-grow: 0 !important;
        overflow: visible !important;
      }
      .partner-dashboard {
        min-height: 0 !important;
        height: auto !important;
        flex: 0 0 auto !important;
      }
    `,
  });

  // Let the injected rules reflow before measuring.
  await page.locator('[data-testid="partner-dashboard-root"]').evaluate((el) => el.getBoundingClientRect().height);

  const height = await page.evaluate(() => {
    const root = document.getElementById('app-root');
    if (!root) {
      return Math.ceil(document.documentElement.scrollHeight);
    }
    return Math.ceil(
      Math.max(root.scrollHeight, root.getBoundingClientRect().height, document.body.scrollHeight),
    );
  });

  // +1 avoids sub-pixel scrollbar; clamp keeps empty shells tight and filled ones complete.
  const next = Math.min(Math.max(height + 1, 200), 4000);
  await page.setViewportSize({ width: 1280, height: next });
  // Force a layout pass against the new viewport before the shot.
  await page.locator('#app-root').evaluate((el) => el.getBoundingClientRect().height);
}

const screenshotOpts = {
  // Viewport is already fitted to content — fullPage would re-stitch and can reintroduce
  // duplicate sticky chrome on short pages.
  fullPage: false,
  // Charts/anti-aliasing only — content changes must still fail the assertion.
  // Stricter than the repo-common 10000; deterministic mocks keep both compare runs under this.
  maxDiffPixels: 1500,
  timeout: 15000,
  animations: 'disabled' as const,
};

test.describe('Partner Dashboard - Visual Regression', () => {
  // Start at the repo-default desktop size; each test grows the viewport to fit content
  // before the shot (see fitViewportToContent).
  test.use({
    viewport: { width: 1280, height: 720 },
    reducedMotion: 'reduce',
  });

  const token = partnerJwt();

  test('dashboard-light — filled data, light theme', async ({ page }) => {
    await freezeTime(page);
    await seedTheme(page, 'light');
    await installPartnerApi(page, 'filled');

    await page.goto(dashboardUrl(token));
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId('partner-dashboard-root')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('partner-dashboard-root')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByTestId('kpi-grid')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('kpi-volume')).toBeVisible();
    await expect(page.getByTestId('volume-time-chart')).toBeVisible();
    await waitChartsSettled(page);

    // Axis labels come from the frozen period (1 Jun … 30 Jun 2026).
    await expect(page.locator('.apexcharts-xaxis-texts-g').getByText(/1\s*Jun|Jun\s*1/).first()).toBeVisible();

    await fitViewportToContent(page);
    await expect(page).toHaveScreenshot('dashboard-light.png', screenshotOpts);
  });

  test('dashboard-dark — filled data, dark theme', async ({ page }) => {
    await freezeTime(page);
    await seedTheme(page, 'dark');
    await installPartnerApi(page, 'filled');

    await page.goto(dashboardUrl(token));
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId('partner-dashboard-root')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('partner-dashboard-root')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByTestId('kpi-grid')).toBeVisible({ timeout: 30000 });
    await waitChartsSettled(page);

    await fitViewportToContent(page);
    await expect(page).toHaveScreenshot('dashboard-dark.png', screenshotOpts);
  });

  test('dashboard-error — statistic endpoint 500', async ({ page }) => {
    await freezeTime(page);
    await seedTheme(page, 'light');
    await installPartnerApi(page, 'error');

    await page.goto(dashboardUrl(token));
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId('partner-dashboard-root')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('dashboard-error')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('kpi-grid')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();

    await fitViewportToContent(page);
    await expect(page).toHaveScreenshot('dashboard-error.png', screenshotOpts);
  });

  test('dashboard-empty — zero metrics, empty timeline', async ({ page }) => {
    await freezeTime(page);
    await seedTheme(page, 'light');
    await installPartnerApi(page, 'empty');

    await page.goto(dashboardUrl(token));
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId('partner-dashboard-root')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('kpi-grid')).toBeVisible({ timeout: 30000 });
    // Charts + bar lists all render EmptyState (data-testid="dashboard-empty").
    await expect(page.getByTestId('dashboard-empty').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('No volume data for the selected period.')).toBeVisible();
    await expect(page.getByText('No transaction data for the selected period.')).toBeVisible();
    await expect(page.locator('.apexcharts-canvas')).toHaveCount(0);

    await fitViewportToContent(page);
    await expect(page).toHaveScreenshot('dashboard-empty.png', screenshotOpts);
  });
});
