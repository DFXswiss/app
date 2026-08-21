import { expect, Page, Route, test } from '@playwright/test';

const USER_DATA_ID = 2001;
const STAFF_ACCOUNT = 9001;
const QUEUE = 'ManualCheckPhone';
const SIGNATURE = 'Jane Clerk';

const userFixture = {
  userData: {
    id: USER_DATA_ID,
    created: '2026-07-31T08:00:00.000Z',
    status: 'Active',
    riskStatus: 'Normal',
    kycStatus: 'Completed',
    kycLevel: 50,
    accountType: 'Personal',
    firstname: 'Test',
    surname: 'Customer',
    verifiedName: 'Test Customer',
    mail: 'test.customer@example.com',
    phone: '+41791234567',
    language: { name: 'German', symbol: 'DE' },
    nationality: { name: 'Switzerland', symbol: 'CH' },
    country: { name: 'Switzerland', symbol: 'CH' },
    phoneCallStatus: 'Pending',
    phoneCallCheckDate: '2026-07-31T09:00:00.000Z',
  },
  kycFiles: [],
  kycSteps: [],
  kycLogs: [],
  transactions: [
    {
      id: 101,
      uid: 'synthetic-buy-crypto-42',
      buyCryptoId: 42,
      type: 'Buy',
      sourceType: 'BuyCrypto',
      inputAmount: 500,
      inputAsset: 'EUR',
      outputAsset: 'BTC',
      amountInChf: 480,
      amlCheck: 'Pass',
      amlReason: 'NA',
      isCompleted: false,
      buyCryptoIsComplete: false,
      buyCryptoStatus: 'AMLPending',
      buyCryptoHasBatch: false,
      buyCryptoHasChargeback: false,
      buyCryptoReviewResetBlocked: false,
      created: '2026-07-31T08:30:00.000Z',
    },
  ],
  bankTxs: [],
  cryptoInputs: [],
  ipLogs: [],
  supportIssues: [],
  users: [
    {
      id: 1,
      address: '0x0000000000000000000000000000000000000001',
      role: 'User',
      status: 'Active',
      walletName: 'Synthetic wallet',
      created: '2026-07-31T08:00:00.000Z',
    },
  ],
  bankDatas: [],
  buyRoutes: [],
  sellRoutes: [],
  swapRoutes: [],
  virtualIbans: [],
  refRewards: [],
  notifications: [],
  notes: [],
  permissions: {
    viewKycFiles: true,
    viewKycLogs: true,
    viewIpLogs: true,
    viewSupportIssues: true,
    canRequestLimit: true,
    canPerformTransactionActions: true,
    viewRecommendation: true,
  },
};

function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: STAFF_ACCOUNT,
    user: STAFF_ACCOUNT,
    role: 'Compliance',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installSyntheticApi(page: Page): Promise<{ unexpectedRequests: string[]; seenGets: string[] }> {
  const unexpectedRequests: string[] = [];
  const seenGets: string[] = [];

  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET') seenGets.push(path);

    if (request.method() === 'GET' && path === `/v1/support/${USER_DATA_ID}`) {
      await fulfillJson(route, userFixture);
      return;
    }

    if (request.method() === 'GET' && path === '/v1/support/issue/clerk') {
      await fulfillJson(route, { clerk: SIGNATURE });
      return;
    }

    if (request.method() === 'GET' && path === `/v1/support/${STAFF_ACCOUNT}`) {
      await fulfillJson(route, { userData: { verifiedName: 'Fallback Name' } });
      return;
    }

    if (
      request.method() === 'GET' &&
      ['/v1/language', '/v1/fiat', '/v1/asset', '/v1/bankAccount', '/v1/country'].includes(path)
    ) {
      await fulfillJson(route, []);
      return;
    }

    if (request.method() === 'GET' && path === '/v1/setting/infoBanner') {
      await fulfillJson(route, null);
      return;
    }

    unexpectedRequests.push(`${request.method()} ${path}`);
    await route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unexpected test request' }),
    });
  });

  await page.route('**/v2/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (request.method() === 'GET' && path === '/v2/user') {
      await fulfillJson(route, {
        id: STAFF_ACCOUNT,
        activeAddress: { address: '0x0000000000000000000000000000000000000001' },
        addresses: [],
        kyc: { level: 50, status: 'Completed' },
        language: { id: 1, name: 'German', symbol: 'DE' },
      });
      return;
    }

    unexpectedRequests.push(`${request.method()} ${path}`);
    await route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unexpected test request' }),
    });
  });

  return { unexpectedRequests, seenGets };
}

test.describe('Call-queue outcome form signature', () => {
  // Fixture timestamps are UTC; the screen formats them in the browser locale without an
  // explicit timeZone, so pin Zurich like the other fullPage compliance screenshots.
  test.use({ timezoneId: 'Europe/Zurich' });

  test('shows the logged-in staff verified name and no clerk select', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1400 });
    const { unexpectedRequests, seenGets } = await installSyntheticApi(page);

    await page.goto(`/compliance/call-queues/${QUEUE}/${USER_DATA_ID}?session=${jwt()}&txId=101`);

    await expect(page.getByText('Signature', { exact: true })).toBeVisible();
    const signatureBlock = page.locator('label', { hasText: 'Signature' }).locator('..');
    await expect(signatureBlock.getByRole('combobox')).toHaveCount(0);
    await expect(signatureBlock.getByText(SIGNATURE)).toBeVisible();
    await expect(
      page.getByRole('combobox').filter({ has: page.locator('option', { hasText: SIGNATURE }) }),
    ).toHaveCount(0);

    const form = signatureBlock.locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    await form.scrollIntoViewIfNeeded();
    await expect(form).toHaveScreenshot('compliance-call-queue-outcome-signature.png', {
      maxDiffPixels: 5000,
    });

    expect(seenGets).toContain('/v1/support/issue/clerk');
    expect(seenGets).not.toContain(`/v1/support/${STAFF_ACCOUNT}`);
    expect(unexpectedRequests.filter((r) => r.includes('clerk'))).toEqual([]);
    expect(unexpectedRequests).toEqual([]);
  });
});
