import { test, expect, Page, Route } from '@playwright/test';

/**
 * E2E Visual Regression Test: DFX Support issue detail
 *
 * Auth is a synthetic Admin JWT. Staff GETs and the issue endpoints are mocked, so
 * the suite does not need a live API. See docs/test-architecture.md.
 */

const CUSTOMER_AUTHOR = 'Customer';
const ISSUE_ID = 7001;
const ISSUE_UID = 'SI-7001-UID';

function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    role: 'Admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

const CLERKS = [
  { userDataId: 101, name: 'Rita Clerk' },
  { userDataId: 102, name: 'Tom Support' },
];

const ISSUE_DATA = {
  id: ISSUE_ID,
  created: '2024-01-01T09:00:00.000Z',
  uid: ISSUE_UID,
  type: 'TransactionIssue',
  department: 'Support',
  reason: 'FundsNotReceived',
  state: 'Pending',
  name: 'Alice Muster',
  clerk: 'Rita Clerk',
  clerkUserDataId: 101,
  account: {
    id: 8001,
    status: 'Active',
    verifiedName: 'Alice Muster',
    completeName: 'Alice Muster',
    accountType: 'Personal',
    kycLevel: '50',
    depositLimit: 100000,
    annualVolume: 25000,
    kycHash: 'a1b2c3d4e5',
    country: { name: 'Switzerland' },
    language: { name: 'English', symbol: 'EN' },
  },
};

const MESSAGES = [
  {
    id: 501,
    author: CUSTOMER_AUTHOR,
    message: 'Hello, I did not receive my funds for the last transaction.',
    created: '2024-01-01T09:05:00.000Z',
  },
  {
    id: 502,
    author: 'Rita Clerk',
    message: 'Hi Alice, thanks for reaching out.',
    created: '2024-01-01T10:30:00.000Z',
  },
];

const CLERKS_RE = /\/v1\/support\/issue\/clerks(?:\?|$)/;
const DATA_RE = /\/v1\/support\/issue\/(\d+)\/data(?:\?|$)/;
const THREAD_RE = /\/v1\/support\/issue\/SI-7001-UID(?:\?|$)/;

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installIssueRoutes(page: Page): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request();
    const url = request.url();
    const path = new URL(url).pathname;

    if (CLERKS_RE.test(url)) return json(route, CLERKS);
    if (DATA_RE.test(url)) return json(route, ISSUE_DATA);
    if (THREAD_RE.test(url) && request.method() === 'GET') return json(route, { messages: MESSAGES });

    if (
      request.method() === 'GET' &&
      ['/v1/language', '/v1/fiat', '/v1/asset', '/v1/bankAccount', '/v1/country'].includes(path)
    ) {
      return json(route, []);
    }
    if (request.method() === 'GET' && path === '/v1/setting/infoBanner') {
      return json(route, null);
    }
    if (request.method() === 'GET' && path === '/v1/support/issue/clerk') {
      return json(route, { clerkUserDataId: 1, clerk: 'Rita Clerk' });
    }

    await route.continue();
  });

  await page.route('**/v2/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path === '/v2/user') {
      return json(route, {
        id: 1,
        activeAddress: { address: '0x0000000000000000000000000000000000000001', wallet: 'DFX' },
        addresses: [],
        kyc: { level: 50, status: 'Completed' },
        language: { id: 1, name: 'English', symbol: 'EN' },
      });
    }
    await route.continue();
  });
}

test.describe('Support Dashboard - issue detail', () => {
  const token = jwt();

  test('issue screen shows detail panels, clerk select and message thread', async ({ page }) => {
    await installIssueRoutes(page);

    await page.goto(`/support/dashboard/issue/${ISSUE_ID}?session=${encodeURIComponent(token)}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    await expect(page.getByText('Issue Details')).toBeVisible();
    await expect(page.getByText(ISSUE_UID)).toBeVisible();
    await expect(page.locator('select').filter({ hasText: 'Rita Clerk' })).toHaveValue('101');

    await expect(page).toHaveScreenshot('support-dashboard-02-issue.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });
});
