import { expect, Page, Route, test as base } from '@playwright/test';
import { app2ScreenshotOpts } from './helpers/app2-screenshot';

/**
 * Review-fix visual states: unsigned synthetic JWT and fully intercepted v1/v2 APIs.
 * Unlisted requests fail closed. These pictures prove fixture layout and focus, not
 * authentication, persistence, real quotes, payment settlement, merge jobs or Sumsub.
 * Run in both chromium and chromium-mobile; the orchestrator generates the PNGs.
 */
const NOW = new Date('2026-10-01T10:00:00.000Z');
const ADDRESS = '0x0000000000000000000000000000000000000001';
const MAIL = 'review.fixture@example.invalid';
const volumes = { buy: { total: 0, annual: 0 }, sell: { total: 0, annual: 0 }, swap: { total: 0, annual: 0 } };
const wallet = {
  address: ADDRESS,
  label: 'Review wallet',
  wallet: 'DFX',
  explorerUrl: 'https://example.invalid',
  blockchains: ['Ethereum'],
  volumes,
  isCustody: false,
};
const fiats = ['CHF', 'EUR'].map((name, index) => ({
  id: index + 1,
  name,
  buyable: true,
  sellable: true,
  limits: { Bank: { minVolume: 10, maxVolume: 100000 } },
  allowedIbanCountries: [],
}));
const sellRoutes = fiats.map((currency, index) => ({
  id: index + 10,
  active: true,
  currency,
  iban: 'CH9300762011623852957',
  deposit: { address: `review-lightning-${index}`, blockchains: ['Lightning'] },
}));
const step = {
  name: 'BeneficialOwner',
  status: 'InProgress',
  sequenceNumber: 1,
  isCurrent: true,
  session: { url: 'http://localhost:3000/v2/kyc/data/beneficial/1', type: 'API' },
};

type Scenario =
  | 'ocp'
  | 'account'
  | 'merge-timeout'
  | 'merge-failed'
  | 'kyc'
  | 'transactions'
  | 'minimum'
  | 'quote-error';
type ApiFixture = { scenario: Scenario; requests: string[] };

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function token(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    address: ADDRESS,
    role: 'User',
    exp: Math.floor(NOW.getTime() / 1000) + 3600,
  })}.synthetic`;
}

const test = base.extend<{ api: ApiFixture }>({
  api: async ({ page }, use) => {
    const api: ApiFixture = { scenario: 'account', requests: [] };
    const unexpected: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.setFixedTime(NOW);
    await page.addInitScript(() => localStorage.setItem('dfx_lang', 'en'));
    const respond = async (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());
      const key = `${request.method()} ${url.pathname}`;
      api.requests.push(key);
      switch (key) {
        case 'GET /v1/language':
          return json(route, [{ id: 2, name: 'English', symbol: 'EN' }]);
        case 'GET /v1/fiat':
          return json(route, fiats);
        case 'GET /v1/asset':
          return json(route, [
            {
              id: 1,
              name: 'ETH',
              description: 'Ethereum',
              blockchain: 'Ethereum',
              type: 'Coin',
              buyable: true,
              sellable: true,
            },
          ]);
        case 'GET /v1/bankAccount':
          return json(route, []);
        case 'GET /v1/country':
          return json(route, [{ id: 1, name: 'Switzerland', symbol: 'CH', enable: true, kycEnable: true }]);
        case 'GET /v1/setting/infoBanner':
          return json(route, null);
        case 'GET /v2/user':
          return json(route, {
            id: 1,
            accountId: 1,
            accountType: api.scenario === 'kyc' ? 'Organization' : 'Personal',
            mail: MAIL,
            language: { id: 2, name: 'English', symbol: 'EN' },
            currency: fiats[0],
            tradingLimit: { limit: 100000, period: 'Month' },
            kyc: { hash: 'review-visual', level: 20, dataComplete: false, preferredPhoneTimes: [] },
            volumes,
            paymentLink: { active: api.scenario === 'ocp' },
            apiKeyCT: '',
            apiFilterCT: [],
            activeAddress: wallet,
            addresses: [wallet],
            disabledAddresses: [],
          });
        case 'GET /v2/user/profile':
          return json(route, { accountType: 'Personal', firstName: 'Review', lastName: 'Fixture' });
        case 'GET /v2/user/ref':
          return json(route, { commission: 0, volume: 0, credit: 0, paidCredit: 0, userCount: 0, activeUserCount: 0 });
      }

      if (api.scenario === 'ocp') {
        switch (key) {
          case 'GET /v1/paymentLink/config':
            return json(route, {
              accessKey: 'review-merchant',
              standards: ['OpenCryptoPay'],
              minCompletionStatus: 'TxMempool',
              paymentTimeout: 60,
              displayQr: true,
              cancellable: true,
            });
          case 'GET /v1/route':
            return json(route, { buy: [], sell: sellRoutes, swap: [] });
          case 'GET /v1/paymentLink':
            return json(route, [{ id: 'review-till', routeId: 10, status: 'Active', label: 'Front counter' }]);
          case 'GET /v1/paymentLink/history':
            return json(route, [
              {
                id: 'review-till',
                payments: [
                  {
                    id: 1,
                    amount: 12.5,
                    currency: 'CHF',
                    status: 'Completed',
                    note: 'Coffee',
                    date: NOW.toISOString(),
                  },
                  { id: 2, amount: 7.5, currency: 'CHF', status: 'Completed', note: 'Cake', date: NOW.toISOString() },
                  { id: 3, amount: 30, currency: 'EUR', status: 'Completed', note: 'Lunch', date: NOW.toISOString() },
                  {
                    id: 4,
                    amount: 90,
                    currency: 'CHF',
                    status: 'Pending',
                    note: 'Open order',
                    date: NOW.toISOString(),
                  },
                ],
              },
            ]);
          case 'POST /v1/paymentLink/payment':
            return json(route, { statusCode: 400, message: 'This till cannot accept this amount.' }, 400);
        }
      }

      if (api.scenario.startsWith('merge-')) {
        const job = { uid: 'review-merge', status: 'Pending', expectedSeconds: 5 };
        if (key === 'GET /v1/auth/mail/confirm' && url.searchParams.get('code') === 'review-otp') {
          return json(route, job, 202);
        }
        if (key === 'GET /v1/job/review-merge') {
          return json(
            route,
            api.scenario === 'merge-failed'
              ? { ...job, status: 'Failed', error: 'The destination account is unavailable.' }
              : { ...job, status: 'Processing' },
          );
        }
      }

      if (api.scenario === 'kyc') {
        if (key === 'GET /v2/kyc') return json(route, { kycLevel: 20, kycSteps: [step] });
        if (key === 'PUT /v2/kyc' && url.searchParams.get('autoStep') === 'true') {
          return json(route, { currentStep: step, kycSteps: [step] });
        }
      }

      if (api.scenario === 'transactions') {
        if (key === 'GET /v1/transaction/unassigned') {
          return json(route, [
            { id: 1, uid: 'review-unassigned', inputAmount: 100, inputAsset: 'CHF', date: NOW.toISOString() },
          ]);
        }
        if (key === 'GET /v1/transaction/detail') {
          return json(route, [
            {
              id: 2,
              uid: 'review-referral',
              type: 'Referral',
              state: 'Completed',
              outputAmount: 0.001,
              outputAsset: 'ETH',
              date: NOW.toISOString(),
            },
          ]);
        }
      }

      if (key === 'PUT /v1/buy/quote') {
        if (api.scenario === 'minimum' || api.scenario === 'quote-error') {
          expect(request.postDataJSON()).toMatchObject({
            targetAmount: api.scenario === 'minimum' ? 0.000001 : 0.01,
          });
          expect(request.postDataJSON().amount).toBeUndefined();
        }
        if (api.scenario === 'quote-error') return json(route, { statusCode: 503, message: 'Quote unavailable' }, 503);
        if (api.scenario === 'minimum') {
          return json(route, {
            amount: 0.000001,
            estimatedAmount: 0.01,
            isValid: false,
            error: 'AmountTooLow',
            errorCodes: ['AmountTooLow'],
            minVolume: 10,
            maxVolume: 100000,
            fees: { total: 0, rate: 0, fixed: 0, network: 0, dfx: 0, bank: 0 },
          });
        }
      }

      unexpected.push(key);
      return json(route, { statusCode: 501, message: `Unexpected review fixture request: ${key}` }, 501);
    };
    await page.route('**/v1/**', respond);
    await page.route('**/v2/**', respond);
    await use(api);
    expect(unexpected, 'every API request must be allowlisted').toEqual([]);
    expect(errors, 'visual states must not throw browser errors').toEqual([]);
  },
});

test.use({ timezoneId: 'Europe/Zurich' });

async function open(page: Page, hash: string, query: Record<string, string> = {}, authenticated = true): Promise<void> {
  const params = new URLSearchParams({ ...(authenticated ? { session: token() } : {}), ...query });
  const response = await page.goto(`/app2/?${params}${hash}`);
  expect(response?.ok(), 'App2 must be served').toBe(true);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
}

test('OCP history separates completed CHF and EUR totals', async ({ page, api }) => {
  api.scenario = 'ocp';
  await open(page, '#/ocp?sub=history');
  const totals = page.getByText('Completed this month', { exact: true }).locator('..');
  await expect(totals).toContainText('20 CHF');
  await expect(totals).toContainText('30 EUR');
  await expect(totals).not.toContainText('110 CHF');
  await expect(page).toHaveScreenshot('app2-fix-ocp-history.png', app2ScreenshotOpts);
});

test('OCP links offer both active Lightning routes', async ({ page, api }) => {
  api.scenario = 'ocp';
  await open(page, '#/ocp?sub=links');
  const picker = page.locator('#linkRoute');
  await expect(picker.locator('option')).toHaveText(['Route 10 · CHF', 'Route 11 · EUR']);
  await picker.selectOption('11');
  await expect(picker).toHaveValue('11');
  await picker.blur();
  await expect(picker).not.toBeFocused();
  await expect(page.getByRole('button', { name: 'Create payment link', exact: true })).toBeEnabled();
  await expect(page).toHaveScreenshot('app2-fix-ocp-routes.png', {
    ...app2ScreenshotOpts,
    animations: 'disabled',
  });
});

test('OCP settings reject zero timeout inline', async ({ page, api }) => {
  api.scenario = 'ocp';
  await open(page, '#/ocp?sub=config');
  await page.locator('input[inputmode="numeric"]').fill('0');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Enter a positive whole number of seconds.', { exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot('app2-fix-ocp-timeout.png', app2ScreenshotOpts);
  expect(api.requests).not.toContain('PUT /v1/paymentLink/config');
});

test('OCP POS unlocks after a definitive 400 rejection', async ({ page, api }) => {
  api.scenario = 'ocp';
  await open(page, '#/ocp?sub=pos');
  await expect(page.getByTestId('ocp-pos-register')).toContainText('Front counter');
  await page.getByPlaceholder('0.00').fill('5');
  await page.getByRole('button', { name: /^charge/i }).click();
  await expect(page.getByText(/This till cannot accept this amount\./)).toBeVisible();
  await expect(page.getByPlaceholder('0.00')).toBeEnabled();
  await expect(page.getByRole('button', { name: /^charge/i })).toBeEnabled();
  await expect(page.getByTestId('ocp-pos-ambiguous-charge')).toHaveCount(0);
  await expect(page).toHaveScreenshot('app2-fix-ocp-rejected.png', app2ScreenshotOpts);
});

test('email sheet explains an unchanged address', async ({ page, api }) => {
  api.scenario = 'account';
  await open(page, '#/account');
  await page.getByRole('button', { name: /^Email address\b/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Email address', exact: true });
  await expect(sheet.getByPlaceholder('you@email.com')).toHaveValue(MAIL);
  await sheet.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(sheet.getByText('This is already your email address.', { exact: true })).toBeVisible();
  await expect(sheet).toHaveScreenshot('app2-fix-email-unchanged.png', app2ScreenshotOpts);
});

test('address rename disables saving an empty label', async ({ page, api }) => {
  api.scenario = 'account';
  await open(page, '#/account');
  await page.getByRole('button', { name: /^Wallet addresses\b/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Wallet addresses', exact: true });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Rename', exact: true }).click();
  const label = sheet.getByRole('textbox');
  await expect(label).toBeVisible();
  await label.fill('');
  await expect(label).toHaveValue('');
  await label.blur();
  await expect(label).not.toBeFocused();
  await expect(sheet.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect(sheet).toHaveScreenshot('app2-fix-address-empty.png', {
    ...app2ScreenshotOpts,
    animations: 'disabled',
  });
});

test('merge return reports an exceeded job budget', async ({ page, api }) => {
  api.scenario = 'merge-timeout';
  await page.clock.install({ time: NOW });
  await open(page, '#/account-merge?otp=review-otp', {}, false);
  await expect.poll(() => api.requests).toContain('GET /v1/auth/mail/confirm');
  await page.clock.runFor(2000);
  await expect.poll(() => api.requests).toContain('GET /v1/job/review-merge');
  await page.clock.runFor(5000);
  await expect(page.getByText(/account merge is taking longer than expected/)).toBeVisible();
  await expect(page).toHaveScreenshot('app2-fix-merge-timeout.png', app2ScreenshotOpts);
});

test('merge return displays the failed job error', async ({ page, api }) => {
  api.scenario = 'merge-failed';
  await open(page, '#/account-merge?otp=review-otp', {}, false);
  await expect(page.getByText('The destination account is unavailable.', { exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot('app2-fix-merge-failed.png', app2ScreenshotOpts);
});

test('beneficial step requests a director when the holder is not involved', async ({ page, api }) => {
  api.scenario = 'kyc';
  await open(page, '#/kyc?auto-start=true');
  const form = page.locator('form');
  await form.locator('select').nth(0).selectOption('false');
  const involvement = form.getByRole('combobox').nth(1);
  await involvement.selectOption('false');
  await involvement.blur();
  await expect(involvement).not.toBeFocused();
  await expect(form.getByRole('textbox', { name: 'Managing director First name', exact: true })).toBeVisible();
  await expect(form.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await expect(page).toHaveScreenshot('app2-fix-kyc-director.png', {
    ...app2ScreenshotOpts,
    animations: 'disabled',
  });
});

test('beneficial step blocks an owner without an address', async ({ page, api }) => {
  api.scenario = 'kyc';
  await open(page, '#/kyc?auto-start=true');
  const form = page.locator('form');
  await form.locator('select').nth(0).selectOption('true');
  const firstName = form.getByPlaceholder('First name', { exact: true });
  const lastName = form.getByPlaceholder('Last name', { exact: true });
  await expect(firstName).toBeVisible();
  await firstName.fill('Ada');
  await expect(lastName).toBeVisible();
  await lastName.fill('Owner');
  await lastName.blur();
  await expect(lastName).not.toBeFocused();
  await expect(form.getByPlaceholder('Street', { exact: true })).toHaveValue('');
  await expect(form.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await expect(page).toHaveScreenshot('app2-fix-kyc-owner-address.png', {
    ...app2ScreenshotOpts,
    animations: 'disabled',
  });
});

test('transactions name one unmatched payment and a referral reward', async ({ page, api }) => {
  api.scenario = 'transactions';
  await open(page, '#/tx');
  const unmatchedPayment = page.getByRole('button', { name: /^1 unmatched payment\b/ });
  await expect(unmatchedPayment).toBeVisible();
  await expect(unmatchedPayment.getByText('Tap to assign it to a purchase', { exact: true })).toBeVisible();
  await expect(page.getByText('Referral reward', { exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot('app2-fix-transactions.png', app2ScreenshotOpts);
});

test('target amount shows AmountTooLow in the pay panel', async ({ page, api }) => {
  api.scenario = 'minimum';
  await open(page, '#/', { 'amount-out': '0.000001', 'asset-out': 'ETH', 'asset-in': 'CHF' });
  const payPanel = page.getByRole('textbox', { name: 'Amount you pay', exact: true }).locator('../..');
  await expect(payPanel.getByText(/^Min\b/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Amount you receive', exact: true })).toHaveValue('0.000001');
  await expect(page.getByTestId('trade-cta')).toBeDisabled();
  await expect(page).toHaveScreenshot('app2-fix-target-minimum.png', app2ScreenshotOpts);
});

test('target amount shows retry for a quote failure', async ({ page, api }) => {
  api.scenario = 'quote-error';
  await open(page, '#/', { 'amount-out': '0.01', 'asset-out': 'ETH', 'asset-in': 'CHF' });
  const payPanel = page.getByRole('textbox', { name: 'Amount you pay', exact: true }).locator('../..');
  await expect(payPanel.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await expect(page.getByTestId('trade-cta')).toBeDisabled();
  await expect(page).toHaveScreenshot('app2-fix-target-retry.png', app2ScreenshotOpts);
  const quoteCount = () => api.requests.filter((request) => request === 'PUT /v1/buy/quote').length;
  const beforeRetry = quoteCount();
  await payPanel.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(quoteCount).toBeGreaterThan(beforeRetry);
});

test('keyboard language menu focuses the active language', async ({ page, api }) => {
  api.scenario = 'account';
  await open(page, '#/account', {}, false);
  const trigger = page.getByRole('button', { name: 'Change language', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const active = page.getByRole('menuitem', { name: 'English', exact: true });
  await expect(active).toHaveAttribute('aria-current', 'true');
  await expect(active).toBeFocused();
  await expect(page).toHaveScreenshot('app2-fix-language-focus.png', app2ScreenshotOpts);
});
