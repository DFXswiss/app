import { expect, Page, Route, test } from '@playwright/test';

/**
 * Visual variants of known API rejections: the unsupported-characters field error on the KYC
 * personal data form, the translated hint when the API still rejects the characters, and the
 * blocked-bank hint on the guest refund form.
 */

const KYC_CODE = 'SYNTHETIC_KYC_CODE';
const ACTION_SECRET = 'ab'.repeat(32);
const UID = 'T186C06388387A6FD';

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

const COUNTRY_DE = { ...COUNTRY_CH, id: 2, symbol: 'DE', name: 'Germany', foreignName: 'Deutschland' };

const KYC_INFO = {
  kycLevel: 0,
  tradingLimit: { limit: 1000, period: 'Year' },
  language: { id: 1, name: 'English', symbol: 'EN', foreignName: 'English', enable: true },
  kycClients: [],
  kycSteps: [{ name: 'PersonalData', status: 'InProgress', sequenceNumber: 0, isCurrent: true }],
};

const CHARSET_REJECTION =
  'address.street must only contain characters permitted in Swiss payment systems,address.city must only contain characters permitted in Swiss payment systems';

const FAILED_BUY = {
  id: 42,
  uid: UID,
  date: '2026-01-15T00:00:00.000Z',
  type: 'Buy',
  state: 'Failed',
  inputAsset: 'EUR',
  inputAmount: 250,
  inputPaymentMethod: 'Bank',
  outputAsset: 'BTC',
  outputAmount: 0.004,
};

const REFUND = {
  refundTarget: undefined,
  inputAmount: 250,
  inputAsset: { name: 'EUR' },
  refundAsset: { name: 'EUR' },
  refundAmount: 245,
  fee: { dfx: 3, bank: 1, network: 1 },
  bankDetails: undefined,
};

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installSyntheticApi(page: Page, rejection: { personalData?: string; refund?: string }): Promise<void> {
  // The KYC form prefills the country from the IP geolocation and resets the address when it arrives.
  await page.route('https://geolocation-db.com/**', (route) =>
    fulfillJson(route, { IPv4: '192.0.2.1', country_code: 'CH', country_name: 'Switzerland' }),
  );

  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === 'GET' && ['/v1/language', '/v1/fiat', '/v1/asset', '/v1/bankAccount'].includes(path)) {
      await fulfillJson(route, []);
      return;
    }
    if (method === 'GET' && path === '/v1/country') {
      await fulfillJson(route, [COUNTRY_CH, COUNTRY_DE]);
      return;
    }
    if (method === 'GET' && path === '/v1/setting/infoBanner') {
      await fulfillJson(route, null);
      return;
    }
    if (method === 'POST' && path === '/v1/log/clientError') {
      await fulfillJson(route, null);
      return;
    }
    if (method === 'GET' && path === '/v1/transaction/single' && url.searchParams.get('uid') === UID) {
      await fulfillJson(route, FAILED_BUY);
      return;
    }
    if (path === `/v1/transaction/uid/${UID}/${ACTION_SECRET}/refund`) {
      if (method === 'GET') await fulfillJson(route, REFUND);
      else await fulfillJson(route, { statusCode: 400, message: rejection.refund, error: 'Bad Request' }, 400);
      return;
    }

    await fulfillJson(route, { error: `Unexpected ${method} ${path}` }, 501);
  });

  await page.route('**/v2/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === 'GET' && path === '/v2/kyc') {
      await fulfillJson(route, KYC_INFO);
      return;
    }
    if (method === 'GET' && path === '/v2/kyc/PersonalData') {
      await fulfillJson(route, {
        ...KYC_INFO,
        currentStep: {
          name: 'PersonalData',
          status: 'InProgress',
          sequenceNumber: 0,
          isCurrent: true,
          session: { url: `${url.origin}/v2/kyc/data/personal/1`, type: 'API' },
        },
      });
      return;
    }
    if (method === 'PUT' && path === '/v2/kyc/data/personal/1') {
      await fulfillJson(route, { statusCode: 400, message: rejection.personalData, error: 'Bad Request' }, 400);
      return;
    }

    await fulfillJson(route, { error: `Unexpected ${method} ${path}` }, 501);
  });
}

async function openPersonalData(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/kyc?code=${KYC_CODE}&step=PersonalData`);
  await page.getByText('Select...').first().click();
  await page.getByText('Personal', { exact: true }).click();
  await expect(page.getByPlaceholder('John')).toBeVisible();
  // Selecting the account type resets the address once the country list has settled.
  await page.waitForLoadState('networkidle');
}

test.describe('Known API rejections', () => {
  test('KYC field error for unsupported characters', async ({ page }) => {
    await installSyntheticApi(page, {});
    await openPersonalData(page);

    await page.getByPlaceholder('John').fill('Łukasz');
    await page.getByPlaceholder('Doe').click();

    await expect(
      page.getByText('Contains unsupported characters. Use simple letters, e.g. l instead of ł.'),
    ).toBeVisible();
    await expect(page).toHaveScreenshot('known-rejections-01-kyc-field-error.png', { fullPage: true });
  });

  test('KYC hint when the API rejects the characters', async ({ page }) => {
    await installSyntheticApi(page, { personalData: CHARSET_REJECTION });
    await openPersonalData(page);

    await page.getByPlaceholder('John').fill('Anna');
    await page.getByPlaceholder('Doe').fill('Muster');
    await page.getByPlaceholder('Street').fill('Bahnhofstrasse');
    await page.getByPlaceholder('12345', { exact: true }).fill('8001');
    await page.getByPlaceholder('Berlin').fill('Zürich');
    await page.getByPlaceholder('+49 12345678').fill('+41791234567');
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByText(/Your name or address contains characters/)).toBeVisible();
    await expect(page.getByText(/Something went wrong/)).toHaveCount(0);
    await expect(page).toHaveScreenshot('known-rejections-02-kyc-api-rejection.png', { fullPage: true });
  });

  test('refund hint for a blocked bank keeps the form', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installSyntheticApi(page, { refund: 'iban BIC not allowed' });
    await page.goto(`/tx/${UID}/${ACTION_SECRET}/refund`);
    await expect(page.getByText('Transaction amount', { exact: true })).toBeVisible();

    await page.getByPlaceholder('XX XXXX XXXX XXXX XXXX X').fill('DE89370400440532013000');
    await page.getByPlaceholder('John Doe').fill('Anna Muster');
    await page.getByPlaceholder('Street').fill('Bahnhofstrasse');
    await page.getByPlaceholder('12345', { exact: true }).fill('8001');
    await page.getByPlaceholder('City').fill('Zürich');
    await page.getByPlaceholder('Select...').click();
    await page.getByText('Switzerland', { exact: true }).click();
    await page.getByRole('button', { name: 'Confirm refund' }).click();

    await expect(
      page.getByText('This bank is not supported by DFX. Please use an account at a different bank.'),
    ).toBeVisible();
    await expect(page.getByPlaceholder('XX XXXX XXXX XXXX XXXX X')).toBeVisible();
    await expect(page).toHaveScreenshot('known-rejections-03-refund-blocked-bank.png', { fullPage: true });
  });
});
