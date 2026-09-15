import { expect, Page, Route, test } from '@playwright/test';

const SLAVE_KYC_CODE = 'SLAVE_KYC_HASH_XYZ';
const MASTER_KYC_CODE = 'MASTER_KYC_HASH_ABC';

const mergedErrorBody = {
  statusCode: 401,
  error: 'Unauthorized',
  message: 'User is merged',
  switchToCode: MASTER_KYC_CODE,
};

// Matches the @dfx.swiss/core KycInfo shape (kycLevel, tradingLimit, language, kycSteps,
// kycClients all required) so the /kyc screen the redirect lands on can render without an
// undefined-field crash — a prior version of this fixture omitted these and passed the test
// while silently crashing the destination screen.
const kycInfoFixture = {
  kycLevel: 0,
  tradingLimit: { limit: 500000, period: 'Day' },
  language: { id: 1, name: 'English', symbol: 'EN', foreignName: 'English', enable: true },
  kycSteps: [],
  kycClients: [],
};

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function assertRedirectedToMasterKyc(page: Page): void {
  const url = new URL(page.url());
  expect(url.pathname).toBe('/kyc');
  expect(url.searchParams.get('code')).toBe(MASTER_KYC_CODE);
}

async function installSyntheticApi(
  page: Page,
  options: { setup2faSucceeds?: boolean } = {},
): Promise<{ unexpectedRequests: string[]; pageErrors: string[] }> {
  const unexpectedRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (
      method === 'GET' &&
      ['/v1/language', '/v1/fiat', '/v1/asset', '/v1/bankAccount', '/v1/country'].includes(path)
    ) {
      await fulfillJson(route, []);
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

    unexpectedRequests.push(`${method} ${path}`);
    await fulfillJson(route, { error: 'Unexpected test request' }, 501);
  });

  await page.route('**/v2/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'POST' && path === '/v2/kyc/2fa') {
      if (options.setup2faSucceeds) {
        await fulfillJson(route, { type: 'Mail', secret: '', uri: '' });
      } else {
        await fulfillJson(route, mergedErrorBody, 401);
      }
      return;
    }

    if (method === 'POST' && path === '/v2/kyc/2fa/verify') {
      await fulfillJson(route, mergedErrorBody, 401);
      return;
    }

    if (method === 'GET' && path === '/v2/kyc') {
      await fulfillJson(route, kycInfoFixture);
      return;
    }

    unexpectedRequests.push(`${method} ${path}`);
    await fulfillJson(route, { error: 'Unexpected test request' }, 501);
  });

  return { unexpectedRequests, pageErrors };
}

test.describe('2FA screen merged-account redirect - Visual Regression Tests', () => {
  test('redirects to the master KYC code instead of showing the raw merged-account error on setup', async ({
    page,
  }) => {
    const { unexpectedRequests, pageErrors } = await installSyntheticApi(page);

    await page.goto(`/2fa?code=${SLAVE_KYC_CODE}`);

    await expect(page.getByText('User is merged')).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/kyc\\?code=${MASTER_KYC_CODE}$`));
    assertRedirectedToMasterKyc(page);

    // Independently generated from this spec, but expected to be pixel-identical to
    // link-merged-redirect's baseline: both land on the same /kyc?code=MASTER_KYC_CODE URL
    // with the same kycInfoFixture, and the destination screen doesn't read anything specific
    // to which flow triggered the redirect.
    await expect(page).toHaveScreenshot('tfa-merged-redirect-01-kyc-destination.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });

    expect(unexpectedRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('redirects to the master KYC code instead of showing the raw merged-account error on verify', async ({
    page,
  }) => {
    const { unexpectedRequests, pageErrors } = await installSyntheticApi(page, { setup2faSucceeds: true });

    await page.goto(`/2fa?code=${SLAVE_KYC_CODE}`);
    await page.getByPlaceholder('Email code').fill('123456');
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByText('User is merged')).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/kyc\\?code=${MASTER_KYC_CODE}$`));
    assertRedirectedToMasterKyc(page);

    expect(unexpectedRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
