import { test, expect, APIRequestContext, Page, Route } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createTestCredentials } from './test-wallet';

/**
 * E2E Visual Regression Tests: RealUnit staff Support dashboards
 *
 * Routes:
 *   - /realunit/support              (issue list, grouped by open/paged state)
 *   - /realunit/support/issue/:id    (issue detail + message thread)
 *
 * Auth is REAL (same admin-token flow as compliance.spec.ts / compliance-recommendation-graph.spec.ts): the api must
 * be reachable for `/v1/auth` and the frontend's own user/role fetch. The admin user has the ADMIN role, which
 * `useRealunitGuard` accepts (ADMIN | REALUNIT).
 *
 * Feature data is MOCKED with synthetic fixtures via page.route(...), so the baselines are deterministic AND contain
 * NO real production data. Only the RealUnit-scoped support endpoints (incl. the scoped message-thread endpoint)
 * are intercepted; everything else (auth/role/user/settings) is passed through via route.continue().
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

const API_URL = process.env.REACT_APP_API_URL! + '/v1';

// Author marker the backend stamps on customer messages (mirrors CustomerAuthor in src/util/support-stats.ts).
const CUSTOMER_AUTHOR = 'Customer';

// Numeric id of the issue whose detail page is screenshotted.
const ISSUE_ID = 7001;

/**
 * Read ADMIN_SEED from the API .env file
 */
function getAdminSeed(): string {
  const apiEnvPath = path.join(__dirname, '../../api/.env');
  if (!fs.existsSync(apiEnvPath)) {
    throw new Error(`API .env file not found at ${apiEnvPath}. Run 'npm run setup' in the API directory first.`);
  }
  const content = fs.readFileSync(apiEnvPath, 'utf8');
  const match = content.match(/^ADMIN_SEED=(.*)$/m);
  if (!match || !match[1]) {
    throw new Error('ADMIN_SEED not found in API .env file. Run "npm run setup" in the API directory first.');
  }
  return match[1];
}

/**
 * Authenticate with admin credentials
 */
async function getAdminAuth(request: APIRequestContext): Promise<string> {
  const adminSeed = getAdminSeed();
  const credentials = await createTestCredentials(adminSeed);

  const response = await request.post(`${API_URL}/auth`, {
    data: credentials,
  });

  if (!response.ok()) {
    const body = await response.text().catch(() => 'unknown');
    throw new Error(`Admin auth failed: ${response.status()} - ${body}`);
  }

  const data = await response.json();
  return data.accessToken;
}

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
// the three groups the screen renders: "Awaiting reply" (lastMessageAuthor === Customer), "Created", "Pending".
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
  // Created (we answered last / no customer wait)
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
  // Pending (we answered last / no customer wait)
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

const CLERKS: { userDataId: number; name: string }[] = [
  { userDataId: 101, name: 'Rita Clerk' },
  { userDataId: 102, name: 'Tom Support' },
];

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
    const url = route.request().url();

    if (LIST_RE.test(url)) return json(route, { data: OPEN_ISSUES, total: OPEN_ISSUES.length });
    if (COUNTS_RE.test(url)) return json(route, COUNTS);
    if (ACTIVITY_RE.test(url)) return json(route, { count: 0 });
    if (CLERKS_RE.test(url)) return json(route, CLERKS);
    if (DATA_RE.test(url)) return json(route, ISSUE_DATA);
    if (MESSAGES_RE.test(url)) return json(route, MESSAGES);

    // everything else (auth, role, user, settings) hits the real api
    await route.continue();
  });
}

test.describe('RealUnit Support dashboards - Visual Regression Tests', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAdminAuth(request);
  });

  test('list screen groups open issues (awaiting reply / created / pending)', async ({ page }) => {
    await installSupportRoutes(page);

    await page.goto(`/realunit/support?session=${token}`);
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

    await page.goto(`/realunit/support/issue/${ISSUE_ID}?session=${token}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // detail panels + the message thread rendered
    await expect(page.getByText('Issue Details')).toBeVisible();
    await expect(page.getByText('Account Data')).toBeVisible();
    await expect(page.getByText('RU-7001-UID')).toBeVisible();
    await expect(page.getByText('The reference of the transfer is TX-12345.')).toBeVisible();

    await expect(page).toHaveScreenshot('realunit-support-02-issue.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });
});
