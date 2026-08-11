import { test, expect, APIRequestContext, Page, Route } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createTestCredentials } from './test-wallet';

/**
 * E2E Visual Regression Tests: Compliance Pending Chargebacks list page
 *
 * Route: /compliance/pending-chargebacks
 *
 * Auth is REAL (same admin-token flow as compliance-recommendation-graph.spec.ts): the api must be
 * reachable for `/v1/auth` and the frontend's own user/role fetch.
 *
 * Data is MOCKED with synthetic fixtures via page.route(...), so the baselines are deterministic AND
 * contain NO real production data. Only the pending-chargebacks endpoint is intercepted:
 *   - GET support/pending-chargebacks
 * Everything else (the real auth/role/user fetch) is passed through via route.continue().
 *
 * Synthetic fixtures (fake ids 9000+, fake names):
 *   - plain MISSING_CHARGEBACK_AMOUNT row
 *   - NAME_MISMATCH row with three distinct names
 *   - USER_NOT_RELEASED row
 *   - multi-reason row
 *   - sentinel row with chargebackDate set
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
// Synthetic fixtures (mirror PendingChargebackEntry / ChargebackBlockReason)
// ---------------------------------------------------------------------------

type BlockReason =
  | 'NameMismatch'
  | 'MissingCreditorData'
  | 'MissingChargebackAmount'
  | 'MissingChargebackTarget'
  | 'UserNotReleased';

type PendingChargebackFixture = {
  txId: number;
  uid: string;
  sourceType: 'BuyCrypto' | 'BuyFiat' | 'BankTxReturn';
  entityId: number;
  userDataId: number;
  userName?: string;
  inputAmount?: number;
  inputAsset?: string;
  chargebackAmount?: number;
  chargebackAsset?: string;
  blockReasons: BlockReason[];
  requestedDate: string;
  date: string;
  verifiedName?: string;
  completeName?: string;
  creditorName?: string;
  chargebackDate?: string;
};

const LOADED_FIXTURES: PendingChargebackFixture[] = [
  {
    txId: 9001,
    uid: 'T-9001',
    sourceType: 'BuyCrypto',
    entityId: 1001,
    userDataId: 2001,
    userName: 'Anna Beispiel',
    inputAmount: 250,
    inputAsset: 'EUR',
    chargebackAmount: undefined,
    chargebackAsset: undefined,
    blockReasons: ['MissingChargebackAmount'],
    requestedDate: '2026-01-15T10:00:00.000Z',
    date: '2026-01-15T12:00:00.000Z',
  },
  {
    txId: 9002,
    uid: 'T-9002',
    sourceType: 'BuyCrypto',
    entityId: 1002,
    userDataId: 2002,
    userName: 'Bruno Namecheck',
    inputAmount: 100,
    inputAsset: 'CHF',
    chargebackAmount: 100,
    chargebackAsset: 'CHF',
    blockReasons: ['NameMismatch'],
    requestedDate: '2026-01-16T10:00:00.000Z',
    date: '2026-01-16T12:00:00.000Z',
    verifiedName: 'Bruno Verifiziert',
    completeName: 'Bruno Complete',
    creditorName: 'Bruno Creditor',
  },
  {
    txId: 9003,
    uid: 'T-9003',
    sourceType: 'BuyFiat',
    entityId: 1003,
    userDataId: 2003,
    userName: 'Clara Sperre',
    inputAmount: 500,
    inputAsset: 'EUR',
    chargebackAmount: 500,
    chargebackAsset: 'EUR',
    blockReasons: ['UserNotReleased'],
    requestedDate: '2026-01-17T10:00:00.000Z',
    date: '2026-01-17T12:00:00.000Z',
  },
  {
    txId: 9004,
    uid: 'T-9004',
    sourceType: 'BuyCrypto',
    entityId: 1004,
    userDataId: 2004,
    userName: 'Dora Multi',
    inputAmount: 75,
    inputAsset: 'EUR',
    chargebackAmount: undefined,
    chargebackAsset: undefined,
    blockReasons: ['MissingChargebackAmount', 'MissingChargebackTarget', 'UserNotReleased'],
    requestedDate: '2026-01-18T10:00:00.000Z',
    date: '2026-01-18T12:00:00.000Z',
  },
  {
    txId: 9005,
    uid: 'T-9005',
    sourceType: 'BuyCrypto',
    entityId: 1005,
    userDataId: 2005,
    userName: 'Emil Sentinel',
    inputAmount: 30,
    inputAsset: 'EUR',
    chargebackAmount: 30,
    chargebackAsset: 'EUR',
    blockReasons: ['MissingCreditorData'],
    requestedDate: '2026-01-19T10:00:00.000Z',
    date: '2026-01-19T12:00:00.000Z',
    chargebackDate: '2026-01-20T00:00:00.000Z',
  },
];

const PENDING_RE = /\/v1\/support\/pending-chargebacks/;

async function installPendingChargebackRoute(page: Page, body: PendingChargebackFixture[]): Promise<void> {
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
  await page.goto(`/compliance/pending-chargebacks?session=${token}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
}

test.describe('Compliance Pending Chargebacks list - Visual Regression Tests', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAdminAuth(request);
  });

  test('1. loaded list shows block-reason rows and sentinel marker', async ({ page }) => {
    await installPendingChargebackRoute(page, LOADED_FIXTURES);

    await gotoList(page, token);

    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByText('Anna Beispiel')).toBeVisible();
    await expect(page.getByText('Bruno Verifiziert')).toBeVisible();
    await expect(page.getByText('Clara Sperre')).toBeVisible();
    await expect(page.getByText('Dora Multi')).toBeVisible();
    await expect(page.getByText('ERROR: chargebackDate set')).toBeVisible();

    await expect(page).toHaveScreenshot('chargeback-list-01-loaded.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('2. empty state', async ({ page }) => {
    await installPendingChargebackRoute(page, []);

    await gotoList(page, token);

    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByText('No pending chargebacks found')).toBeVisible();

    await expect(page).toHaveScreenshot('chargeback-list-02-empty.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });
});
