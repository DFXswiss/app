import { expect, Page, Route, test } from '@playwright/test';
import { captureExpandedPage } from './helpers/full-page-png';

/**
 * Visual regression for the Kundengelder year extract (/dashboard/financial/kundengelder):
 * the T-account for one sample bank, an empty bank with no movements, Checkout, the
 * booked-diff table, and the bookings subpage for one statement line.
 *
 * Auth is a synthetic Admin JWT. Shell reads and the extract are mocked, the same way as
 * the Log Validity spec. Figures and account numbers are fictional. The buy-crypto
 * bookings page has one row per completed 2024 voucher. A green run does not prove production auth
 * or that the API returns this extract.
 *
 * The clock is pinned so the year list does not grow when the calendar year changes.
 */

/** Completed buy-crypto vouchers in 2024. Amounts below are not those vouchers. */
const BUY_CRYPTO_BELEGE_2024 = 4023;
const AFTER_FEE_EACH = 1;
const BUY_CRYPTO_AFTER_FEE = BUY_CRYPTO_BELEGE_2024 * AFTER_FEE_EACH;
const OPENING = 1000;
const BUY_CRYPTO_FEE = 2;
const BANK_FEE = 4.5;
const SOLL_SUM = OPENING + BUY_CRYPTO_AFTER_FEE + BUY_CRYPTO_FEE;
const SALDO = SOLL_SUM - BANK_FEE;

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
    {
      key: `${SAMPLE_IBAN}|BuyCrypto after Fee|CHF`,
      live: BUY_CRYPTO_AFTER_FEE,
      booked: BUY_CRYPTO_AFTER_FEE,
      delta: 0,
    },
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
        { sollLabel: 'Anfangsbestand', sollAmount: OPENING },
        { sollLabel: 'Zahlungseingänge', habenLabel: 'Zahlungsausgänge', section: true },
        { sollLabel: 'BuyCrypto after Fee', sollAmount: BUY_CRYPTO_AFTER_FEE, sollLineKey: 'buy-after-fee' },
        { sollLabel: 'BuyCrypto Fee', sollAmount: BUY_CRYPTO_FEE },
        { sollLabel: 'FiatFiat after Fee', sollAmount: 0, habenLabel: 'BuyFiat after Fee', habenAmount: 0 },
        { sollLabel: 'FiatFiat Fee', sollAmount: 0, habenLabel: 'FiatFiat', habenAmount: 0 },
        { sollLabel: 'BuyCryptoReturn', sollAmount: 0 },
        { habenLabel: 'BuyCryptoReturn-Chargeback', habenAmount: 0 },
        { sollLabel: 'BankTxReturn', sollAmount: 0 },
        { habenLabel: 'BankTxReturn-Chargeback', habenAmount: 0 },
        { sollLabel: 'BankTxRepeat', sollAmount: 0 },
        { habenLabel: 'BankTxRepeat-Chargeback', habenAmount: 0 },
        { sollLabel: 'Kraken', sollAmount: 0, habenLabel: 'Kraken', habenAmount: 0 },
        { sollLabel: 'Internal von Checkout', sollAmount: 0 },
        { sollLabel: 'Internal', sollAmount: 0, habenLabel: 'Internal', habenAmount: 0 },
        { sollLabel: 'Internal von LI00000000000000TEST', sollAmount: 0 },
        { sollLabel: 'Internal von LU000000000000000000', sollAmount: 0 },
        {
          sollLabel: 'Internal von CH2100000000000000002',
          sollAmount: 0,
          habenLabel: 'Internal an CH2100000000000000002',
          habenAmount: 0,
        },
        {
          sollLabel: 'Internal von CH0000000000000000003',
          sollAmount: 0,
          habenLabel: 'Internal an CH0000000000000000003',
          habenAmount: 0,
        },
        {
          sollLabel: 'Internal von CH0000000000000000004',
          sollAmount: 0,
          habenLabel: 'Internal an CH0000000000000000004',
          habenAmount: 0,
        },
        { sollLabel: 'Unknown', sollAmount: 0, habenLabel: 'Unknown', habenAmount: 0 },
        { habenLabel: '% Gebühren Bank', habenAmount: 0 },
        { habenLabel: 'Gebühr Checkout', habenAmount: 0 },
        { sollLabel: 'Storno Gebühren Bank', sollAmount: 0, habenLabel: 'BankAccountFee', habenAmount: BANK_FEE },
        { habenLabel: 'Kommission Gebühren', habenAmount: 0 },
        { habenLabel: 'Saldo', habenAmount: SALDO },
      ],
      sollSum: SOLL_SUM,
      habenSum: SOLL_SUM,
      control: 0,
      closingBalance: SALDO,
      openingBalance: OPENING,
      nextOpeningBalance: SALDO,
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
  rows: Array.from({ length: BUY_CRYPTO_BELEGE_2024 }, (_, index) => {
    const n = index + 1;
    const month = ((index % 12) + 1).toString().padStart(2, '0');
    const day = ((index % 28) + 1).toString().padStart(2, '0');
    return {
      id: 10000 + n,
      bookingDate: `2026-${month}-${day}`,
      type: 'BuyCrypto',
      currency: 'CHF',
      amount: 1.25,
      afterFee: AFTER_FEE_EACH,
      instructionId: `SAMPLE-${n.toString().padStart(4, '0')}`,
    };
  }),
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
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 1520 });
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

    await page.setViewportSize({ width: 1440, height: 1680 });
    await page.getByRole('cell', { name: 'BuyCrypto after Fee' }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/financial\/kundengelder\/lines\?/);
    await expect(page.getByRole('heading', { name: 'Buchungen · BuyCrypto after Fee' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sample Bank CHF' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Abweichung zur Buchhaltung' })).toHaveCount(0);
    const bookings = page.locator('table', { has: page.getByRole('columnheader', { name: 'Instruktion' }) });
    await expect(bookings.locator('tbody tr')).toHaveCount(BUY_CRYPTO_BELEGE_2024);
    await expect(page.getByText('SAMPLE-0001', { exact: true })).toBeVisible();
    await page.waitForTimeout(500);

    await expect(await captureExpandedPage(page)).toMatchSnapshot('dashboard-financial-kundengelder-line.png', {
      maxDiffPixels: 1000,
    });
  });
});
