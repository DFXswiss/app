import { test, expect, APIRequestContext, Page, Route } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createTestCredentials } from './test-wallet';

/**
 * Visual regression: staff ticket screen — internal customer note.
 *
 * Route: /support/dashboard/issue/:id
 * Auth is real (ADMIN_SEED). Issue payload is mocked so the baseline is deterministic.
 */

const API_URL = process.env.REACT_APP_API_URL! + '/v1';
const ISSUE_ID = 7001;
const ISSUE_UID = 'SI-7001-UID';

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

async function getAdminAuth(request: APIRequestContext): Promise<string> {
  const credentials = await createTestCredentials(getAdminSeed());
  const response = await request.post(`${API_URL}/auth`, { data: credentials });
  if (!response.ok()) {
    const body = await response.text().catch(() => 'unknown');
    throw new Error(`Admin auth failed: ${response.status()} - ${body}`);
  }
  const data = await response.json();
  return data.accessToken;
}

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

const MESSAGES = {
  messages: [
    {
      id: 501,
      author: 'Customer',
      message: 'Hello, I did not receive my funds for the last transaction.',
      created: '2024-01-01T09:05:00.000Z',
    },
  ],
};

const DATA_RE = /\/v1\/support\/issue\/\d+\/data(?:\?|$)/;
const MESSAGES_RE = /\/v1\/support\/issue\/SI-7001-UID(?:\?|$)/;
const CLERKS_RE = /\/v1\/support\/issue\/clerks(?:\?|$)/;
const CLERK_RE = /\/v1\/support\/issue\/clerk(?:\?|$)/;
const ACTIVITY_RE = /\/v1\/support\/issue\/activity(?:\?|$)/;

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installIssueRoutes(page: Page): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const url = route.request().url();
    if (DATA_RE.test(url)) return json(route, ISSUE_DATA);
    if (MESSAGES_RE.test(url)) return json(route, MESSAGES);
    if (CLERKS_RE.test(url))
      return json(route, [
        { clerkUserDataId: 101, clerk: 'Rita Clerk' },
        { clerkUserDataId: 102, clerk: 'Tom Support' },
      ]);
    if (CLERK_RE.test(url)) return json(route, { clerkUserDataId: 101, clerk: 'Rita Clerk' });
    if (ACTIVITY_RE.test(url)) return json(route, { count: 0 });
    await route.continue();
  });
}

test.describe('Staff ticket — internal customer note', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAdminAuth(request);
  });

  test('issue screen shows the customer-note panel open with a draft', async ({ page }) => {
    await installIssueRoutes(page);
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.goto(`/support/dashboard/issue/${ISSUE_ID}?session=${token}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Kundennotiz')).toBeVisible();
    await page.getByRole('button', { name: 'Notiz hinzufügen' }).click();
    await expect(page.getByText('Interne Notiz zu diesem Kunden', { exact: false })).toBeVisible();
    const note = page.getByPlaceholder('Was Compliance über diesen Kunden wissen sollte...');
    await note.fill('Customer called about the missing payout; waiting on bank statement.');
    await note.scrollIntoViewIfNeeded();

    await expect(page).toHaveScreenshot('support-ticket-note-01-composer.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });
});
