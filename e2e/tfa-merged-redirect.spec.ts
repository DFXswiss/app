import { expect, Page, test } from '@playwright/test';
import { fulfillJson, kycInfoFixture } from './helpers/merged-redirect-fixtures';

const SLAVE_KYC_CODE = 'SLAVE_KYC_HASH_XYZ';
const MASTER_KYC_CODE = 'MASTER_KYC_HASH_ABC';

const mergedErrorBody = {
  statusCode: 401,
  error: 'Unauthorized',
  message: 'User is merged',
  switchToCode: MASTER_KYC_CODE,
};

function assertRedirectedToMasterKyc(page: Page): void {
  const url = new URL(page.url());
  expect(url.pathname).toBe('/kyc');
  expect(url.searchParams.get('code')).toBe(MASTER_KYC_CODE);
  // The page was entered with a kyc-redirect param (see the goto below); this asserts it did
  // not ride along into the post-redirect URL, which is what merged-account.hook.ts's
  // clearParams fix exists to prevent.
  expect(url.searchParams.has('kyc-redirect')).toBe(false);
}

async function installSyntheticApi(page: Page): Promise<{ unexpectedRequests: string[]; pageErrors: string[] }> {
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
  test('shows the KYC info screen after the merged-account redirect', async ({ page }) => {
    const { unexpectedRequests, pageErrors } = await installSyntheticApi(page);

    // The kyc-redirect param exercises the open-redirect fix in merged-account.hook.ts: this
    // must not survive into the /kyc destination URL (see assertRedirectedToMasterKyc).
    await page.goto(`/2fa?code=${SLAVE_KYC_CODE}&kyc-redirect=${encodeURIComponent('https://evil.example')}`);

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
});
