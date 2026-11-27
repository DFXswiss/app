import { test, expect, APIRequestContext, Page, Route } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createTestCredentials } from './test-wallet';

/**
 * Visual regression: staff ticket screen — limit request with and without the customer's own words on
 * the source of funds ("Fund Origin Details").
 *
 * Route: /support/dashboard/issue/:id
 * Auth is real (ADMIN_SEED). Issue payload is mocked so the baseline is deterministic. This spec is the
 * handbook baseline only; the real test of the row is in e2e-stack/specs/support-dashboard.spec.ts.
 */

const API_URL = process.env.REACT_APP_API_URL! + '/v1';
const ISSUE_ID = 7101;
const ISSUE_UID = 'SI-7101-UID';

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

function issueData(fundOriginText?: string): unknown {
  return {
    id: ISSUE_ID,
    created: '2024-01-01T09:00:00.000Z',
    uid: ISSUE_UID,
    type: 'LimitRequest',
    department: 'Compliance',
    reason: 'Other',
    state: 'Created',
    name: 'Alice Muster',
    clerk: 'Rita Clerk',
    account: {
      id: 8101,
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
    limitRequest: {
      id: 9101,
      limit: 250000,
      investmentDate: 'Now',
      fundOrigin: 'Savings',
      ...(fundOriginText ? { fundOriginText } : {}),
    },
  };
}

const MESSAGES = {
  messages: [
    {
      id: 601,
      author: 'Customer',
      message: 'Please raise my limit.',
      created: '2024-01-01T09:05:00.000Z',
    },
  ],
};

const DATA_RE = /\/v1\/support\/issue\/\d+\/data(?:\?|$)/;
const MESSAGES_RE = /\/v1\/support\/issue\/SI-7101-UID(?:\?|$)/;
const CLERKS_RE = /\/v1\/support\/issue\/clerks(?:\?|$)/;
const CLERK_RE = /\/v1\/support\/issue\/clerk(?:\?|$)/;
const ACTIVITY_RE = /\/v1\/support\/issue\/activity(?:\?|$)/;

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installIssueRoutes(page: Page, fundOriginText?: string): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const url = route.request().url();
    if (DATA_RE.test(url)) return json(route, issueData(fundOriginText));
    if (MESSAGES_RE.test(url)) return json(route, MESSAGES);
    if (CLERKS_RE.test(url)) return json(route, ['Rita Clerk', 'Tom Support']);
    if (CLERK_RE.test(url)) return json(route, { clerk: 'Rita Clerk' });
    if (ACTIVITY_RE.test(url)) return json(route, { count: 0 });
    await route.continue();
  });
}

test.describe('Staff ticket — limit request', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAdminAuth(request);
  });

  test('limit request with the source of funds in the words of the customer', async ({ page }) => {
    await installIssueRoutes(page, 'Salary from ten years of work and the sale of a flat in Zurich');
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.goto(`/support/dashboard/issue/${ISSUE_ID}?session=${token}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Fund Origin Details:', { exact: true })).toBeVisible();

    await expect(page).toHaveScreenshot('support-limit-request-01-fund-origin-details.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('limit request without a source-of-funds text', async ({ page }) => {
    await installIssueRoutes(page);
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.goto(`/support/dashboard/issue/${ISSUE_ID}?session=${token}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Fund Origin:', { exact: true })).toBeVisible();
    await expect(page.getByText('Fund Origin Details:', { exact: true })).toHaveCount(0);

    await expect(page).toHaveScreenshot('support-limit-request-02-without-details.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });
});
