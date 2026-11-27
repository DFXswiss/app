import { test, expect, APIRequestContext, Page, Route } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createTestCredentials } from './test-wallet';

/**
 * E2E Visual Regression Tests: Compliance Pending Merges list page
 *
 * Route: /compliance/pending-merges
 *
 * Auth is REAL (same admin-token flow as compliance-chargeback-list.spec.ts): the api must be
 * reachable for `/v1/auth` and the frontend's own user/role fetch.
 *
 * Data is MOCKED with synthetic fixtures via page.route(...), so the baselines are deterministic AND
 * contain NO real production data. Only the pending-merges endpoint is intercepted:
 *   - GET support/pending-merges
 * Everything else (the real auth/role/user fetch) is passed through via route.continue().
 *
 * Synthetic fixtures (fake ids 9000+):
 *   - one row per merge reason (IdentDocument, Mail, Iban, Staff)
 *   - one processing row
 * Empty-state test returns [].
 */

const API_URL = process.env.REACT_APP_API_URL! + '/v1';

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
// Synthetic fixtures (mirror PendingMergeEntry / MergeReason)
// ---------------------------------------------------------------------------

type MergeReason = 'IdentDocument' | 'Mail' | 'Iban' | 'Staff';

type PendingMergeAccountFixture = {
  userDataId: number;
};

type PendingMergeFixture = {
  id: number;
  reason?: MergeReason;
  master: PendingMergeAccountFixture;
  slave: PendingMergeAccountFixture;
  isProcessing: boolean;
  requestedDate: string;
  expiration: string;
};

const LOADED_FIXTURES: PendingMergeFixture[] = [
  {
    id: 9001,
    reason: 'IdentDocument',
    master: { userDataId: 9101 },
    slave: { userDataId: 9102 },
    isProcessing: false,
    requestedDate: '2026-01-15T10:00:00.000Z',
    expiration: '2026-02-14T10:00:00.000Z',
  },
  {
    id: 9002,
    reason: 'Mail',
    master: { userDataId: 9103 },
    slave: { userDataId: 9104 },
    isProcessing: false,
    requestedDate: '2026-01-16T10:00:00.000Z',
    expiration: '2026-02-15T10:00:00.000Z',
  },
  {
    id: 9003,
    reason: 'Iban',
    master: { userDataId: 9105 },
    slave: { userDataId: 9106 },
    isProcessing: true,
    requestedDate: '2026-01-17T10:00:00.000Z',
    expiration: '2026-02-16T10:00:00.000Z',
  },
  {
    id: 9004,
    reason: 'Staff',
    master: { userDataId: 9107 },
    slave: { userDataId: 9108 },
    isProcessing: false,
    requestedDate: '2026-01-18T10:00:00.000Z',
    expiration: '2026-02-17T10:00:00.000Z',
  },
];

const PENDING_RE = /\/v1\/support\/pending-merges/;

async function installPendingMergeRoute(page: Page, body: PendingMergeFixture[]): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const url = route.request().url();

    if (PENDING_RE.test(url) && route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
      return;
    }

    // everything else (auth, role, user) hits the real api
    await route.continue();
  });
}

async function gotoList(page: Page, token: string): Promise<void> {
  await page.goto(`/compliance/pending-merges?session=${token}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
}

test.describe('Compliance Pending Merges list - Visual Regression Tests', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAdminAuth(request);
  });

  test('1. loaded list shows every reason, a processing row and both account IDs', async ({ page }) => {
    await installPendingMergeRoute(page, LOADED_FIXTURES);

    await gotoList(page, token);

    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'IdentDocument', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Mail', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Iban', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Staff', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Processing', exact: true })).toBeVisible();
    for (const row of LOADED_FIXTURES) {
      await expect(page.getByRole('button', { name: `#${row.master.userDataId}`, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: `#${row.slave.userDataId}`, exact: true })).toBeVisible();
    }

    await expect(page).toHaveScreenshot('pending-merges-01-loaded.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('2. empty state', async ({ page }) => {
    await installPendingMergeRoute(page, []);

    await gotoList(page, token);

    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByText('No pending merges found')).toBeVisible();

    await expect(page).toHaveScreenshot('pending-merges-02-empty.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });
});
