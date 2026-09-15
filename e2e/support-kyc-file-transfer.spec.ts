import { test, expect, APIRequestContext, Page, Route } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createTestCredentials } from './test-wallet';

/**
 * Visual regression: staff ticket screen — transfer an attachment to the KYC file.
 *
 * Route: /support/dashboard/issue/:id
 * Auth is real (ADMIN_SEED). Issue payload is mocked so the baseline is deterministic.
 * Baselines are generated with `--update-snapshots` on macOS against the local API.
 */

const API_URL = process.env.REACT_APP_API_URL! + '/v1';
const ISSUE_ID = 7102;
const ISSUE_UID = 'SI-7102-UID';

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
  type: 'GenericIssue',
  department: 'Support',
  reason: 'Other',
  state: 'Pending',
  name: 'Alice Muster',
  clerk: 'Rita Clerk',
  account: {
    id: 8002,
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
      id: 601,
      author: 'Customer',
      message: 'Please find my ID attached.',
      fileName: 'ausweis.pdf',
      created: '2024-01-01T09:05:00.000Z',
    },
    {
      id: 602,
      author: 'Customer',
      message: 'Any update on the review?',
      created: '2024-01-01T09:10:00.000Z',
    },
  ],
};

const DATA_RE = /\/v1\/support\/issue\/\d+\/data(?:\?|$)/;
const MESSAGES_RE = /\/v1\/support\/issue\/SI-7102-UID(?:\?|$)/;
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
    if (CLERKS_RE.test(url)) return json(route, ['Rita Clerk', 'Tom Support']);
    if (CLERK_RE.test(url)) return json(route, { clerk: 'Rita Clerk' });
    if (ACTIVITY_RE.test(url)) return json(route, { count: 0 });
    await route.continue();
  });
}

test.describe('Staff ticket — KYC file transfer', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAdminAuth(request);
  });

  test('issue screen shows the transfer action next to an attachment', async ({ page }) => {
    await installIssueRoutes(page);
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.goto(`/support/dashboard/issue/${ISSUE_ID}?session=${token}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: 'ausweis.pdf' })).toBeVisible();

    const messagesPanel = page.locator('div.bg-white.rounded-lg.shadow-sm.p-4').filter({
      has: page.getByRole('heading', { name: /Messages/ }),
    });
    await expect(messagesPanel).toHaveScreenshot('support-kyc-file-transfer-01-messages.png', {
      maxDiffPixels: 5000,
    });
  });
});
