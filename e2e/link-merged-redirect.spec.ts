import { expect, Page, Route, test } from '@playwright/test';

const SLAVE_KYC_CODE = 'SLAVE_KYC_HASH_XYZ';
const MASTER_KYC_CODE = 'MASTER_KYC_HASH_ABC';
const AUTH_TOKEN_KEY = 'dfx.authenticationToken';

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

function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    role: 'User',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function assertRedirectedToMasterKycAndLoggedOut(page: Page): Promise<void> {
  const url = new URL(page.url());
  expect(url.pathname).toBe('/kyc');
  expect(url.searchParams.get('code')).toBe(MASTER_KYC_CODE);
  // logout() runs independently of the navigate() call, so the token clears asynchronously —
  // poll instead of snapshotting once right after the URL settles.
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), AUTH_TOKEN_KEY)).toBeNull();
}

async function installSyntheticApi(page: Page): Promise<{ unexpectedRequests: string[]; pageErrors: string[] }> {
  const unexpectedRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  // The initial getKycInfo call and the /kyc screen's post-redirect getKycInfo call hit the
  // same GET /v2/kyc path; only the first one is the merged-account error, every other call
  // gets the successful fixture.
  let getKycInfoCallCount = 0;

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

    if (method === 'GET' && path === '/v2/user') {
      await fulfillJson(route, {
        id: 1,
        activeAddress: { address: '0x0000000000000000000000000000000000000001' },
        addresses: [],
        language: { id: 1, name: 'English', symbol: 'EN' },
        // The post-redirect /kyc screen reads user.tradingLimit unconditionally
        // (useKycHelper's limitToString) whenever `user` is still truthy — omitting it
        // crashed that screen's render even though this test's own assertions didn't notice.
        tradingLimit: { limit: 500000, period: 'Day' },
        kyc: {
          hash: SLAVE_KYC_CODE,
          level: 0,
          status: 'NotStarted',
          dataComplete: false,
          preferredPhoneTimes: [],
        },
        disabledAddresses: [],
      });
      return;
    }

    if (method === 'GET' && path === '/v2/kyc') {
      getKycInfoCallCount += 1;
      if (getKycInfoCallCount === 1) {
        await fulfillJson(route, mergedErrorBody, 401);
      } else {
        await fulfillJson(route, kycInfoFixture);
      }
      return;
    }

    unexpectedRequests.push(`${method} ${path}`);
    await fulfillJson(route, { error: 'Unexpected test request' }, 501);
  });

  return { unexpectedRequests, pageErrors };
}

test.describe('Link screen merged-account redirect - Visual Regression Tests', () => {
  test('shows the KYC info screen after the merged-account redirect', async ({ page }) => {
    const { unexpectedRequests, pageErrors } = await installSyntheticApi(page);
    const token = jwt();

    await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), {
      key: AUTH_TOKEN_KEY,
      value: token,
    });

    await page.goto('/link');

    await expect(page.getByText('User is merged')).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/kyc\\?code=${MASTER_KYC_CODE}$`));
    await assertRedirectedToMasterKycAndLoggedOut(page);

    await expect(page).toHaveScreenshot('link-merged-redirect-01-kyc-destination.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });

    expect(unexpectedRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
