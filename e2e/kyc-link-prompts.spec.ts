import { test, expect, Page } from '@playwright/test';

// Utils.isJwt rejects "="
function handbookJwt(): string {
  const enc = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ account: 1, role: 'User' })}.aa`;
}

const volumes = {
  buy: { total: 0, annual: 0 },
  sell: { total: 0, annual: 0 },
  swap: { total: 0, annual: 0 },
};

const address = {
  wallet: 'DFX',
  address: '0x1111111111111111111111111111111111111111',
  blockchains: ['Ethereum'],
  volumes,
  isCustody: false,
};

// Answers the API of the signed-in handbook user (KYC code "handbook"); no KYC request is expected.
async function routeSyntheticApi(page: Page): Promise<void> {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1' || url.port !== '9') {
      await route.continue();
      return;
    }

    const { pathname } = url;
    const method = route.request().method();
    const fulfill = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (method === 'GET' && (pathname.endsWith('/v1/user') || pathname.endsWith('/v2/user'))) {
      await fulfill({
        accountId: 1,
        accountType: 'Personal',
        language: { id: 1, name: 'English', symbol: 'EN', foreignName: 'English', enable: true },
        currency: {
          id: 1,
          name: 'CHF',
          buyable: true,
          sellable: true,
          cardBuyable: false,
          cardSellable: false,
          instantBuyable: false,
          instantSellable: false,
        },
        tradingLimit: { limit: 0, period: 'Year' },
        kyc: { hash: 'handbook', level: 0, dataComplete: false, preferredPhoneTimes: [] },
        volumes,
        addresses: [address],
        disabledAddresses: [],
        activeAddress: address,
        paymentLink: { active: false },
        apiKeyCT: '',
        apiFilterCT: [],
      });
      return;
    }

    if (method === 'GET' && pathname.endsWith('/v1/language')) {
      await fulfill([
        { id: 1, name: 'EN', symbol: 'EN', foreignName: 'EN', enable: true },
        { id: 2, name: 'DE', symbol: 'DE', foreignName: 'DE', enable: true },
        { id: 3, name: 'FR', symbol: 'FR', foreignName: 'FR', enable: true },
        { id: 4, name: 'IT', symbol: 'IT', foreignName: 'IT', enable: true },
      ]);
      return;
    }

    if (method === 'GET' && pathname.endsWith('/v1/setting/infoBanner')) {
      await fulfill(null);
      return;
    }

    if (method === 'GET') {
      await fulfill([]);
      return;
    }

    await fulfill({});
  });
}

test('KYC link of another account asks which account to use', async ({ page }) => {
  await routeSyntheticApi(page);

  await page.goto(`/kyc?session=${handbookJwt()}&lang=en&code=other-account`);

  await expect(page.locator('body')).toContainText(
    'This link belongs to a different account than the one you are signed in with. If you open the link, the data you enter is saved to that account.',
    { timeout: 20000 },
  );
  await expect(page.getByRole('button', { name: 'Continue with my account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open link' })).toBeVisible();

  await expect(page).toHaveScreenshot('kyc-link-other-account.png', { fullPage: true, animations: 'disabled' });
});

test('KYC step link asks before starting the step', async ({ page }) => {
  await routeSyntheticApi(page);

  await page.goto(`/kyc?session=${handbookJwt()}&lang=en&step=PersonalData`);

  await expect(page.locator('body')).toContainText('Do you want to start the step "Personal data"?', {
    timeout: 20000,
  });
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();

  await expect(page).toHaveScreenshot('kyc-link-step-confirmation.png', { fullPage: true, animations: 'disabled' });
});
