import { expect, Page, Route, test } from '@playwright/test';

const USER_DATA_ID = 322190;

const complianceFixture = {
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
    language: { name: 'German', symbol: 'DE' },
    nationality: { name: 'Switzerland', symbol: 'CH' },
  },
  kycFiles: [],
  kycSteps: [],
  kycLogs: [],
  transactions: [
    {
      id: 326324,
      uid: 'synthetic-buy-crypto-130504',
      buyCryptoId: 130504,
      type: 'Buy',
      sourceType: 'BuyCrypto',
      inputAmount: 300000,
      inputAsset: 'EUR',
      outputAsset: 'BTC',
      amountInChf: 280000,
      amlCheck: 'Pass',
      amlReason: 'NA',
      isCompleted: false,
      buyCryptoIsComplete: false,
      buyCryptoStatus: 'MissingLiquidity',
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
    account: 1,
    user: 1,
    role: 'Admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installSyntheticApi(
  page: Page,
  fixtureSource: typeof complianceFixture = complianceFixture,
): Promise<{ unexpectedRequests: string[]; mutations: { method: string; path: string; body: unknown }[] }> {
  const unexpectedRequests: string[] = [];
  const mutations: { method: string; path: string; body: unknown }[] = [];
  const currentFixture = structuredClone(fixtureSource);

  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (request.method() === 'GET' && path === `/v1/support/${USER_DATA_ID}`) {
      await fulfillJson(route, currentFixture);
      return;
    }

    if (request.method() === 'GET' && path === '/v1/support/issue/clerk') {
      await fulfillJson(route, { clerk: 'Test Operator' });
      return;
    }

    if (request.method() === 'GET' && /^\/v1\/support\/\d+$/.test(path)) {
      await fulfillJson(route, { userData: { verifiedName: 'Test Operator' } });
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

    if (request.method() === 'PUT' && path === `/v1/userData/${USER_DATA_ID}/kycStatus/check`) {
      const body = request.postDataJSON() as unknown;
      mutations.push({ method: request.method(), path, body });
      currentFixture.userData.kycStatus = 'Check';
      await fulfillJson(route, null);
      return;
    }

    if (request.method() === 'PUT' && path === '/v1/buyCrypto/130504/amlCheck/reviewReset') {
      const body = request.postDataJSON() as unknown;
      mutations.push({ method: request.method(), path, body });
      currentFixture.transactions = [];
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
        id: 1,
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

  return { unexpectedRequests, mutations };
}

test.describe('Compliance review KYC and AML actions', () => {
  test('shows the KYC Check transition and BuyCrypto AML reset', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });
    const { unexpectedRequests, mutations } = await installSyntheticApi(page);

    await page.goto(`/compliance/user/${USER_DATA_ID}/kyc?session=${jwt()}&tab=amlPending`);

    await expect(page.getByText('KYC Management')).toBeVisible();
    // KYC Check remains an independent staff action; it must not gate the BuyCrypto reset.
    await expect(page.getByRole('button', { name: 'Auf Check setzen' })).toBeVisible();
    await expect(page.getByText('BuyCrypto 130504')).toBeVisible();
    await expect(page.getByText('Transaction 326324 · AML Pass · NA · Status MissingLiquidity')).toBeVisible();
    await expect(page.getByRole('button', { name: 'AML-Check zurücksetzen' })).toBeEnabled();
    await expect(page.getByText(/KYC-Status auf Check/)).toHaveCount(0);

    await expect(page).toHaveScreenshot('compliance-review-kyc-status-and-aml-reset.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('AML-Check für BuyCrypto 130504 wirklich zurücksetzen?');
      await dialog.accept();
    });
    await page.getByRole('button', { name: 'AML-Check zurücksetzen' }).click();
    await expect(page.getByText('BuyCrypto 130504')).toHaveCount(0);
    await expect(page.getByText('Keine pendenten AML-Prüfungen vorhanden.')).toBeVisible();

    expect(mutations).toEqual([
      {
        method: 'PUT',
        path: '/v1/buyCrypto/130504/amlCheck/reviewReset',
        body: { expectedAmlCheck: 'Pass', expectedAmlReason: 'NA' },
      },
    ]);
    expect(unexpectedRequests).toEqual([]);
  });

  test('shows the pending ManualCheck Fail and Reset decision variants', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });

    const pendingFixture = structuredClone(complianceFixture);
    pendingFixture.transactions = [
      {
        id: 326324,
        uid: 'synthetic-buy-crypto-130504',
        buyCryptoId: 130504,
        type: 'Buy',
        sourceType: 'BuyCrypto',
        inputAmount: 300000,
        inputAsset: 'EUR',
        outputAsset: 'BTC',
        amountInChf: 280000,
        amlCheck: 'Pending',
        amlReason: 'ManualCheck',
        isCompleted: false,
        buyCryptoIsComplete: false,
        buyCryptoStatus: 'MissingLiquidity',
        buyCryptoHasBatch: false,
        buyCryptoHasChargeback: false,
        buyCryptoReviewResetBlocked: false,
        created: '2026-07-31T08:30:00.000Z',
      },
    ];

    const { unexpectedRequests } = await installSyntheticApi(page, pendingFixture);

    await page.goto(`/compliance/user/${USER_DATA_ID}/kyc?session=${jwt()}&tab=amlPending`);

    await expect(page.getByText('AmlCheck', { exact: true })).toBeVisible();

    await page.locator('select').first().selectOption('Fail');

    await expect(page.getByText('AmlReason', { exact: true })).toBeVisible();
    await expect(page.getByText('priceDefinitionAllowedDate setzen')).toHaveCount(0);
    await expect(page.getByText(/Reset entfernt AmlCheck, AmlReason und priceDefinitionAllowedDate/)).toHaveCount(0);

    await page.getByText('AmlCheck', { exact: true }).scrollIntoViewIfNeeded();

    await expect(page).toHaveScreenshot('compliance-review-aml-pending-fail.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });

    await page.locator('select').first().selectOption('Reset');

    await expect(page.getByText(/Reset entfernt AmlCheck, AmlReason und priceDefinitionAllowedDate/)).toBeVisible();
    await expect(page.getByText('priceDefinitionAllowedDate setzen')).toHaveCount(0);
    await expect(page.getByText('AmlReason', { exact: true })).toHaveCount(0);

    await page.getByText(/Reset entfernt AmlCheck, AmlReason und priceDefinitionAllowedDate/).scrollIntoViewIfNeeded();

    await expect(page).toHaveScreenshot('compliance-review-aml-pending-reset-hint.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });

    expect(unexpectedRequests).toEqual([]);
  });
});
