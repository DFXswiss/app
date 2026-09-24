import { test, expect, Page, Route } from '@playwright/test';

/**
 * E2E Visual Regression Tests: RealUnit staff Support dashboards
 *
 * Routes:
 *   - /realunit/support              (issue list, grouped by open/paged state)
 *   - /realunit/support/issue/:id    (issue detail + message thread)
 *
 * Auth is a synthetic Admin JWT. Feature data and staff bootstrap GETs are mocked, so the suite
 * does not need a live API. A green run does not prove production auth.
 *
 * Feature data is MOCKED with synthetic fixtures via page.route(...), so the baselines are deterministic AND contain
 * NO real production data.
 *
 * Intercepted endpoints (base `/v1/` is prepended by useApi):
 *   - GET realunit/support/list?...     (issue list; the list screen calls it with states=Created,Pending for Open)
 *   - GET realunit/support/counts       (paged-tab totals: OnHold/Canceled/Completed)
 *   - GET realunit/support/activity?... (new-message poller, 30s interval)
 *   - GET realunit/support/clerks       (clerk dropdown, issue screen)
 *   - GET realunit/support/:id/data      (issue detail)
 *   - GET realunit/support/:id/messages  (scoped, membership-enforced message thread by numeric issue id)
 *
 * Synthetic fixtures: fake ids (7000+), fixed ISO dates, fake names — no production data.
 */

function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    role: 'Admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

// Author marker the backend stamps on customer messages (mirrors CustomerAuthor in src/util/support-stats.ts).
const CUSTOMER_AUTHOR = 'Customer';

// Numeric id of the issue whose detail page is screenshotted.
const ISSUE_ID = 7001;

// ---------------------------------------------------------------------------
// Synthetic fixtures (mirror SupportIssueListItem / SupportIssueInternalData / SupportMessageInfo from
// src/hooks/support-dashboard.hook.ts). State/type/reason values mirror the api SupportIssueInternalState /
// SupportIssueType / SupportIssueReason string enums.
// ---------------------------------------------------------------------------

interface SupportIssueListItem {
  id: number;
  uid: string;
  type: string;
  reason: string;
  state: string;
  name: string;
  clerk?: string;
  department?: string;
  created: string;
  updated?: string;
  messageCount: number;
  lastMessageDate?: string;
  lastMessageAuthor?: string;
}

interface SupportIssueInternalAccountData {
  id: number;
  status: string;
  verifiedName?: string;
  completeName?: string;
  accountType?: string;
  kycLevel: string;
  depositLimit?: number;
  annualVolume: number;
  kycHash: string;
  country?: { name: string };
  language?: { name?: string; symbol?: string };
}

interface SupportIssueInternalData {
  id: number;
  created: string;
  uid: string;
  type: string;
  department?: string;
  reason: string;
  state: string;
  name: string;
  clerk?: string;
  account: SupportIssueInternalAccountData;
}

interface SupportMessageInfo {
  id: number;
  author: string;
  message?: string;
  fileName?: string;
  created: string;
}

// Open issues (states Created/Pending) returned by realunit/support/list for the default Open tab. Spread across
// the two groups the screen renders: "Awaiting reply" (customer wrote last) and "Answered" (we or the bot wrote last).
const OPEN_ISSUES: SupportIssueListItem[] = [
  // Awaiting reply (customer waiting) — sorted by lastMessageDate desc by the screen
  {
    id: 7001,
    uid: 'RU-7001-UID',
    type: 'TransactionIssue',
    reason: 'FundsNotReceived',
    state: 'Pending',
    name: 'Alice Muster',
    clerk: 'Rita Clerk',
    department: 'Support',
    created: '2024-01-01T09:00:00.000Z',
    updated: '2024-01-03T12:00:00.000Z',
    messageCount: 3,
    lastMessageDate: '2024-01-03T12:00:00.000Z',
    lastMessageAuthor: CUSTOMER_AUTHOR,
  },
  {
    id: 7002,
    uid: 'RU-7002-UID',
    type: 'KycIssue',
    reason: 'DataRequest',
    state: 'Created',
    name: 'Bob Beispiel',
    department: 'Compliance',
    created: '2024-01-02T08:30:00.000Z',
    messageCount: 1,
    lastMessageDate: '2024-01-02T08:30:00.000Z',
    lastMessageAuthor: CUSTOMER_AUTHOR,
  },
  // Answered (we answered last / no customer wait)
  {
    id: 7003,
    uid: 'RU-7003-UID',
    type: 'GenericIssue',
    reason: 'Other',
    state: 'Created',
    name: 'Carla Test',
    clerk: 'Rita Clerk',
    department: 'Support',
    created: '2024-01-04T14:00:00.000Z',
    messageCount: 2,
    lastMessageDate: '2024-01-04T15:00:00.000Z',
    lastMessageAuthor: 'Rita Clerk',
  },
  // Answered (we answered last / no customer wait)
  {
    id: 7004,
    uid: 'RU-7004-UID',
    type: 'LimitRequest',
    reason: 'Other',
    state: 'Pending',
    name: 'Dieter Demo',
    clerk: 'Tom Support',
    department: 'Support',
    created: '2024-01-05T10:15:00.000Z',
    messageCount: 6,
    lastMessageDate: '2024-01-06T09:00:00.000Z',
    lastMessageAuthor: 'Tom Support',
  },
  {
    id: 7005,
    uid: 'RU-7005-UID',
    type: 'VerificationCall',
    reason: 'RepeatCall',
    state: 'Pending',
    name: 'Eva Exempel',
    clerk: 'Tom Support',
    department: 'Support',
    created: '2024-01-06T11:45:00.000Z',
    messageCount: 4,
    lastMessageDate: '2024-01-06T13:00:00.000Z',
    lastMessageAuthor: 'Tom Support',
  },
];

// Paged-tab totals (keys are SupportIssueInternalState string values).
const COUNTS: Record<string, number> = {
  OnHold: 2,
  Canceled: 1,
  Completed: 9,
};

const CLERKS: string[] = ['Rita Clerk', 'Tom Support'];

// Detail for ISSUE_ID (7001), matching the OPEN_ISSUES[0] header fields.
const ISSUE_DATA: SupportIssueInternalData = {
  id: ISSUE_ID,
  created: '2024-01-01T09:00:00.000Z',
  uid: 'RU-7001-UID',
  type: 'TransactionIssue',
  department: 'Support',
  reason: 'FundsNotReceived',
  state: 'Pending',
  name: 'Alice Muster',
  clerk: 'Rita Clerk',
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

// Message thread for RU-7001-UID: customer (left) + support author (right) bubbles.
const MESSAGES: SupportMessageInfo[] = [
  {
    id: 501,
    author: CUSTOMER_AUTHOR,
    message: 'Hello, I did not receive my funds for the last transaction.',
    created: '2024-01-01T09:05:00.000Z',
  },
  {
    id: 502,
    author: 'Rita Clerk',
    message: 'Hi Alice, thanks for reaching out. Let me check the transaction details and get back to you.',
    created: '2024-01-01T10:30:00.000Z',
  },
  {
    id: 503,
    author: CUSTOMER_AUTHOR,
    message: 'Thank you! The reference of the transfer is TX-12345.',
    created: '2024-01-03T12:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Routing: intercept ONLY the RealUnit support endpoints (incl. the scoped message thread); pass everything else through.
// ---------------------------------------------------------------------------

const LIST_RE = /\/v1\/realunit\/support\/list(?:\?|$)/;
const COUNTS_RE = /\/v1\/realunit\/support\/counts(?:\?|$)/;
const ACTIVITY_RE = /\/v1\/realunit\/support\/activity(?:\?|$)/;
const CLERKS_RE = /\/v1\/realunit\/support\/clerks(?:\?|$)/;
const DATA_RE = /\/v1\/realunit\/support\/(\d+)\/data(?:\?|$)/;
const MESSAGES_RE = /\/v1\/realunit\/support\/(\d+)\/messages(?:\?|$)/;

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installSupportRoutes(page: Page): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request();
    const url = request.url();
    const path = new URL(url).pathname;

    if (LIST_RE.test(url)) return json(route, { data: OPEN_ISSUES, total: OPEN_ISSUES.length });
    if (COUNTS_RE.test(url)) return json(route, COUNTS);
    if (ACTIVITY_RE.test(url)) return json(route, { count: 0 });
    if (CLERKS_RE.test(url)) return json(route, CLERKS);
    if (DATA_RE.test(url)) return json(route, ISSUE_DATA);
    if (MESSAGES_RE.test(url)) return json(route, MESSAGES);
    if (request.method() === 'GET' && path === '/v1/support/issue/clerk') return json(route, { clerk: 'Ada Clerk' });

    if (
      request.method() === 'GET' &&
      ['/v1/language', '/v1/fiat', '/v1/asset', '/v1/bankAccount', '/v1/country'].includes(path)
    ) {
      return json(route, []);
    }
    if (request.method() === 'GET' && path === '/v1/setting/infoBanner') return json(route, null);
    if (request.method() === 'GET') return json(route, []);
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
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

test.describe('RealUnit Support dashboards - Visual Regression Tests', () => {
  const token = jwt();

  test('list screen groups open issues (awaiting reply / answered)', async ({ page }) => {
    await installSupportRoutes(page);

    await page.goto(`/realunit/support?session=${encodeURIComponent(token)}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // the screen shell + a rendered issue confirm the list loaded
    await expect(page.getByText('Open Issues')).toBeVisible();
    await expect(page.getByText('Alice Muster')).toBeVisible();
    await expect(page.getByText('Awaiting reply', { exact: false })).toBeVisible();

    await expect(page).toHaveScreenshot('realunit-support-01-list.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('issue screen shows detail panels + message thread', async ({ page }) => {
    await installSupportRoutes(page);

    await page.goto(`/realunit/support/issue/${ISSUE_ID}?session=${encodeURIComponent(token)}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // detail panels + the message thread rendered
    await expect(page.getByText('Issue Details')).toBeVisible();
    await expect(page.getByText('Account Data')).toBeVisible();
    await expect(page.getByText('RU-7001-UID')).toBeVisible();
    await expect(page.getByText('The reference of the transfer is TX-12345.')).toBeVisible();

    // Cmd/Ctrl+Enter is a keybinding, not chrome. The handbook shot still has to include the
    // composer (textarea + Send) — the 1280x720 viewport cuts it off below the thread.
    await page.setViewportSize({ width: 1280, height: 1400 });
    const composer = page.locator('textarea');
    await composer.scrollIntoViewIfNeeded();
    await expect(composer).toBeVisible();
    await expect(page.getByRole('button', { name: /^Send$/ })).toBeVisible();

    await expect(page).toHaveScreenshot('realunit-support-02-issue.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });
});
