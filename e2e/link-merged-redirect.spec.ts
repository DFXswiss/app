import { expect, Page, Route, test } from '@playwright/test';

const SLAVE_KYC_CODE = 'SLAVE_KYC_HASH_XYZ';
const MASTER_KYC_CODE = 'MASTER_KYC_HASH_ABC';
const AUTH_TOKEN_KEY = 'dfx.authenticationToken';

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

async function installSyntheticApi(page: Page): Promise<{ unexpectedRequests: string[] }> {
  const unexpectedRequests: string[] = [];
  // Same path: first call (link screen) returns 401 merged; later call (/kyc after redirect) returns success.
  let kycInfoCallCount = 0;

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
      kycInfoCallCount += 1;
      if (kycInfoCallCount === 1) {
        await fulfillJson(
          route,
          { statusCode: 401, error: 'Unauthorized', message: 'User is merged', switchToCode: MASTER_KYC_CODE },
          401,
        );
      } else {
        await fulfillJson(route, { kycLevel: 0, kycStatus: 'NotStarted', currentStep: undefined });
      }
      return;
    }

    unexpectedRequests.push(`${method} ${path}`);
    await fulfillJson(route, { error: 'Unexpected test request' }, 501);
  });

  return { unexpectedRequests };
}

test.describe('Link screen merged-account redirect', () => {
  test('redirects to the master KYC code instead of showing the raw merged-account error', async ({ page }) => {
    const { unexpectedRequests } = await installSyntheticApi(page);
    const token = jwt();

    await page.addInitScript(
      ({ key, value }) => window.localStorage.setItem(key, value),
      { key: AUTH_TOKEN_KEY, value: token },
    );

    await page.goto('/link');

    await expect(page.getByText('User is merged')).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/kyc\\?code=${MASTER_KYC_CODE}`));

    expect(unexpectedRequests).toEqual([]);
  });
});
