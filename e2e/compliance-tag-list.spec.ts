import { expect, Page, Route, test } from '@playwright/test';

/**
 * E2E Visual Regression Tests: Compliance Tag list page
 *
 * Route: /compliance?tag=…
 *
 * Auth and data are fully synthetic: a JWT with role Compliance is built in the test, and every
 * `/v1` and `/v2` request is answered by the test. No backend is needed. Unexpected requests are
 * collected and asserted empty, so baselines stay reproducible and no request leaves the browser
 * to an API.
 *
 * Synthetic fixtures (fake ids 9100+, fake names, example.com mails):
 *   - Personal KYC level 50, kycStatus Completed
 *   - Organization KYC level 20
 *   - kycStatus Check (red row)
 *   - row without mail
 * Empty-state test returns userDatas [].
 * Not-found test returns HTTP 404 {"statusCode":404,"message":"Tag not found"}.
 */

const STAFF_ACCOUNT = 9001;

// ---------------------------------------------------------------------------
// Synthetic fixtures (mirror ComplianceSearchResult / UserSearchResult)
// ---------------------------------------------------------------------------

type TagUserFixture = {
  id: number;
  kycStatus: string;
  kycLevel?: number;
  accountType?: string;
  mail?: string;
  name?: string;
};

type TagListFixture = {
  type: 'Tag';
  userDatas: TagUserFixture[];
  bankTx: unknown[];
};

const LOADED_FIXTURE: TagListFixture = {
  type: 'Tag',
  userDatas: [
    {
      id: 9101,
      kycStatus: 'Completed',
      kycLevel: 50,
      accountType: 'Personal',
      mail: 'ada@example.com',
      name: 'Ada Example',
    },
    {
      id: 9102,
      kycStatus: 'Completed',
      kycLevel: 20,
      accountType: 'Organization',
      mail: 'bea-org@example.com',
      name: 'Bea Company',
    },
    {
      id: 9103,
      kycStatus: 'Check',
      kycLevel: 30,
      accountType: 'Personal',
      mail: 'cara@example.com',
      name: 'Cara Check',
    },
    {
      id: 9104,
      kycStatus: 'Completed',
      kycLevel: 50,
      accountType: 'Personal',
      name: 'Dana Nomail',
    },
  ],
  bankTx: [],
};

const EMPTY_FIXTURE: TagListFixture = {
  type: 'Tag',
  userDatas: [],
  bankTx: [],
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

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installSyntheticApi(
  page: Page,
  tagResponse: { status: number; body: unknown },
): Promise<{ unexpectedRequests: string[]; seenGets: string[] }> {
  const unexpectedRequests: string[] = [];
  const seenGets: string[] = [];

  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET') seenGets.push(path);

    if (request.method() === 'GET' && path === '/v1/support/tag/example') {
      await fulfillJson(route, tagResponse.body, tagResponse.status);
      return;
    }

    if (
      request.method() === 'GET' &&
      ['/v1/support/pending-reviews', '/v1/support/pending-transactions', '/v1/support/call-queues'].includes(path)
    ) {
      await fulfillJson(route, []);
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
        language: { id: 1, name: 'English', symbol: 'EN' },
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

async function gotoList(page: Page): Promise<void> {
  await page.goto(`/compliance?tag=example&session=${jwt()}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
}

test.describe('Compliance Tag list - Visual Regression Tests', () => {
  test.use({ timezoneId: 'Europe/Zurich' });

  test('1. loaded list shows tagged customers including a red Check row', async ({ page }) => {
    const { unexpectedRequests, seenGets } = await installSyntheticApi(page, {
      status: 200,
      body: LOADED_FIXTURE,
    });

    await gotoList(page);

    await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
    await expect(page.getByText('Ada Example')).toBeVisible();
    await expect(page.getByText('Bea Company')).toBeVisible();
    await expect(page.getByText('Cara Check')).toBeVisible();
    await expect(page.getByText('Dana Nomail')).toBeVisible();

    await expect(page).toHaveScreenshot('compliance-tag-list-01-loaded.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });

    expect(seenGets).toContain('/v1/support/tag/example');
    expect(unexpectedRequests).toEqual([]);
  });

  test('2. empty state', async ({ page }) => {
    const { unexpectedRequests, seenGets } = await installSyntheticApi(page, {
      status: 200,
      body: EMPTY_FIXTURE,
    });

    await gotoList(page);

    await expect(page.getByText('No entries found')).toBeVisible();

    await expect(page).toHaveScreenshot('compliance-tag-list-02-empty.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });

    expect(seenGets).toContain('/v1/support/tag/example');
    expect(unexpectedRequests).toEqual([]);
  });

  test('3. unknown tag', async ({ page }) => {
    const { unexpectedRequests, seenGets } = await installSyntheticApi(page, {
      status: 404,
      body: { statusCode: 404, message: 'Tag not found' },
    });

    await gotoList(page);

    await expect(page.getByText('Tag not found')).toBeVisible();

    await expect(page).toHaveScreenshot('compliance-tag-list-03-not-found.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });

    expect(seenGets).toContain('/v1/support/tag/example');
    expect(unexpectedRequests).toEqual([]);
  });
});
