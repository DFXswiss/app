import { expect, Page, Route, test } from '@playwright/test';

/**
 * Visual regression for the Kundengelder year extract (/dashboard/financial/kundengelder):
 * the T-account for one sample bank, an empty bank with no movements, Checkout, the
 * booked-diff table, and one opened statement line.
 *
 * Auth is a synthetic Admin JWT. Shell reads and the extract are mocked, the same way as
 * the Log Validity spec. Figures and account numbers are fictional. A green run does not
 * prove production auth or that the API returns this extract.
 *
 * The clock is pinned so the year list does not grow when the calendar year changes.
 */

const SAMPLE_IBAN = 'CH9300762011623852957';
const QUIET_IBAN = 'CH2100000000000000002';

function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    role: 'Admin',
    exp: 2000000000,
  })}.synthetic`;
}

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

const EXTRACT = {
  year: 2026,
  eurRate: 0.95,
  accounts: [
    {
      key: SAMPLE_IBAN,
      name: 'Sample Bank CHF',
      iban: SAMPLE_IBAN,
      currency: 'CHF',
      lines: [],
    },
    {
      key: 'CheckoutLtdCHF',
      name: 'Checkout CHF',
      currency: 'CHF',
      lines: [],
    },
  ],
  diffs: [
    { key: `${SAMPLE_IBAN}|BuyCrypto after Fee|CHF`, live: 200, booked: 200, delta: 0 },
    { key: 'CheckoutLtdCHF|Checkout', live: 40, booked: 40, delta: 0 },
  ],
  sheets: [
    {
      key: `${SAMPLE_IBAN}|CHF`,
      accountNo: '90001',
      name: 'Sample Bank CHF',
      iban: SAMPLE_IBAN,
      currency: 'CHF',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      soll: [],
      haben: [],
      rows: [
        { sollLabel: 'Anfangsbestand', sollAmount: 1000 },
        {
          sollLabel: 'BuyCrypto after Fee',
          sollAmount: 200,
          sollLineKey: 'buy-after-fee',
        },
        { habenLabel: 'SellFiat', habenAmount: 50, habenLineKey: 'sell-fiat' },
        { sollLabel: 'Saldo', sollAmount: 1150 },
      ],
      sollSum: 1200,
      habenSum: 1200,
      control: 0,
      closingBalance: 1150,
      openingBalance: 1000,
      nextOpeningBalance: 1150,
      openingCheck: 'verified',
    },
    {
      key: 'CheckoutLtdCHF',
      name: 'Checkout CHF',
      currency: 'CHF',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      soll: [],
      haben: [],
      rows: [{ sollLabel: 'Checkout', sollAmount: 40, sollLineKey: 'checkout' }],
      sollSum: 40,
      habenSum: 40,
      control: 0,
      closingBalance: 40,
      openingCheck: 'unchecked',
    },
  ],
};

const BANKS = [
  { name: 'Quiet Bank', iban: QUIET_IBAN, currency: 'EUR' },
  { name: 'Sample Bank', iban: SAMPLE_IBAN, currency: 'CHF' },
];

const LINES = {
  year: 2026,
  accountKey: SAMPLE_IBAN,
  line: 'buy-after-fee',
  rows: [
    {
      id: 9001,
      bookingDate: '2026-03-02',
      type: 'BuyCrypto',
      currency: 'CHF',
      amount: 200.2,
      afterFee: 200,
      instructionId: 'SAMPLE-1',
    },
  ],
};

async function installRoutes(page: Page): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (
      request.method() === 'GET' &&
      ['/v1/language', '/v1/fiat', '/v1/asset', '/v1/bankAccount', '/v1/country'].includes(path)
    ) {
      return json(route, []);
    }
    if (request.method() === 'GET' && path === '/v1/setting/infoBanner') return json(route, null);
    if (request.method() === 'GET' && path === '/v1/bank') return json(route, BANKS);
    if (request.method() === 'GET' && path.startsWith('/v1/dashboard/financial/kundengelder/lines')) {
      return json(route, LINES);
    }
    if (request.method() === 'GET' && path.startsWith('/v1/dashboard/financial/kundengelder')) {
      return json(route, EXTRACT);
    }
    return json(route, {});
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
        language: { id: 1, name: 'Deutsch', symbol: 'DE' },
      });
    }
    return json(route, {});
  });
}

const shot = { fullPage: true, maxDiffPixels: 1000, animations: 'disabled' as const };

test.describe('Kundengelder year extract', () => {
  test.use({ timezoneId: 'Europe/Zurich', locale: 'de-CH' });

  test('visual regression - kundengelder extract', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1500 });
    await page.clock.install({ time: new Date('2026-10-02T12:00:00Z') });
    await page.clock.resume();
    await installRoutes(page);
    await page.goto(`/dashboard/financial/kundengelder?session=${encodeURIComponent(jwt())}&lang=de`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Kundengelder' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sample Bank CHF' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Checkout CHF' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Quiet Bank EUR' })).toHaveCount(0);
    await expect(page.getByRole('option', { name: 'Alle' })).toHaveCount(0);
    await expect(page.getByRole('option', { name: 'Quiet Bank EUR · CH2100000000000000002' })).toHaveCount(1);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('dashboard-financial-kundengelder.png', shot);

    await page.getByRole('cell', { name: 'BuyCrypto after Fee' }).first().click();
    await expect(page.getByText('SAMPLE-1')).toBeVisible();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('dashboard-financial-kundengelder-line.png', shot);
  });
});
