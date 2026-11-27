import { expect, Page, Route, test } from '@playwright/test';

const OTP = 'synthetic-merge-otp';
const KYC_HASH = 'SYNTHETIC_MASTER_KYC_HASH';

const CHF_FIAT = {
  id: 1,
  name: 'CHF',
  buyable: true,
  sellable: true,
  cardBuyable: false,
  cardSellable: false,
  instantBuyable: false,
  instantSellable: false,
};

// No session: the page loads only what the app loads for every visitor, and no user, KYC or bank accounts.
const GET_RESPONSES: Record<string, unknown> = {
  '/v1/language': [
    { id: 1, name: 'Deutsch', symbol: 'DE', foreignName: 'Deutsch', enable: true },
    { id: 2, name: 'English', symbol: 'EN', foreignName: 'English', enable: true },
  ],
  '/v1/fiat': [CHF_FIAT],
  '/v1/asset': [],
  '/v1/country': [],
  '/v1/setting/infoBanner': null,
};

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installRoutes(page: Page): Promise<void> {
  await page.route(/\/v[12]\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    // Confirmed from a mail app without a session: the API answers with the merged account but issues no access token.
    if (method === 'GET' && path === '/v1/auth/mail/confirm' && url.searchParams.get('code') === OTP) {
      return json(route, { kycHash: KYC_HASH });
    }

    if (method === 'GET' && path in GET_RESPONSES) return json(route, GET_RESPONSES[path]);

    if (method === 'POST' && path === '/v1/log/clientError') return json(route, {}, 201);

    await json(route, { error: `Unexpected ${method} ${path}` }, 501);
  });
}

test.describe('Account Merge - UI Flow', () => {
  test('shows the added wallet address and the My account button after a confirmation without a session', async ({
    page,
  }) => {
    await installRoutes(page);

    await page.goto(`/account-merge?otp=${OTP}&lang=en`);

    await expect(page.getByText('Wallet address added', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'My account', exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('account-merge-confirmed.png', {
      fullPage: true,
      maxDiffPixels: 1000,
    });
  });
});
