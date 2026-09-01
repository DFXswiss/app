import { test, expect, APIRequestContext, Page, Route } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createTestCredentials } from './test-wallet';

/**
 * E2E Visual Regression Tests: RealUnit staff Compliance dashboards
 *
 * Routes:
 *   - /realunit/compliance             (customer search)
 *   - /realunit/compliance/user/:id    (reduced dossier — long vertical page)
 *
 * Auth is REAL (same admin-token flow as compliance.spec.ts / compliance-recommendation-graph.spec.ts): the api must
 * be reachable for `/v1/auth` and the frontend's own user/role fetch. The admin user has the ADMIN role, which
 * `useRealunitGuard` accepts (ADMIN | REALUNIT).
 *
 * Feature data is MOCKED with synthetic fixtures via page.route(...), so the baselines are deterministic AND contain
 * NO real production data. Only the RealUnit-scoped compliance endpoints are intercepted; everything else
 * (auth/role/user/settings) is passed through via route.continue().
 *
 * The search screen has NO URL query support (unlike DFX /compliance): the query lives in a controlled input, so the
 * test fills the input and presses Enter (the screen's onKeyDown handler runs handleSearch).
 *
 * Intercepted endpoints (base `/v1/` is prepended by useApi):
 *   - GET realunit/compliance/customers[?key=...] (upfront list / search → RealUnitCustomerListDto[])
 *   - GET realunit/compliance/customers/:id        (dossier → RealUnitCustomerDetailDto)
 *
 * Synthetic fixtures: fake ids (7100+), fixed ISO dates, fake names/emails/IBANs — no production data.
 */

const API_URL = process.env.REACT_APP_API_URL! + '/v1';

// Author marker the backend stamps on customer messages (mirrors CustomerAuthor in src/util/support-stats.ts).
const CUSTOMER_AUTHOR = 'Customer';

// Numeric id of the customer whose dossier is screenshotted.
const CUSTOMER_ID = 7101;

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
// Synthetic fixtures (mirror the RealUnit reduced-compliance DTOs from src/dto/realunit-compliance.dto.ts).
// This is the REDUCED tenant view: NO DFX AML work products (no name-check, no amlCheck/amlReason, no notes,
// no limitRequest, no recommendation graph).
// ---------------------------------------------------------------------------

interface RealUnitCustomerListDto {
  id: number;
  kycStatus: string;
  kycLevel?: string;
  accountType?: string;
  mail?: string;
  name?: string;
  // mirrors the real DTO field since the Balance column was added
  balance?: number;
}

// ~4 synthetic search results (one empty account exercises the default hide-empty toggle).
const SEARCH_RESULTS: RealUnitCustomerListDto[] = [
  {
    id: 7101,
    kycStatus: 'Completed',
    kycLevel: '50',
    accountType: 'Organization',
    mail: 'ops@acme-example.com',
    name: 'ACME Example AG',
    balance: 1250,
  },
  {
    id: 7102,
    kycStatus: 'InProgress',
    kycLevel: '30',
    accountType: 'Personal',
    mail: 'alice@example.com',
    name: 'Alice Muster',
    balance: 30.5,
  },
  // Bob stays visible despite balance 0 because name/mail are set — documents the filter semantics
  {
    id: 7103,
    kycStatus: 'NA',
    kycLevel: '10',
    accountType: 'Personal',
    mail: 'bob@example.com',
    name: 'Bob Beispiel',
    balance: 0,
  },
  // intentionally no name/mail/accountType — the only empty account; hidden by the toggle in the default
  // view, shown in search because an active search bypasses the filter
  {
    id: 7104,
    kycStatus: 'NA',
    kycLevel: '0',
    balance: 0,
  },
];

// One rich reduced dossier for CUSTOMER_ID (an organization account, so the Organization panel renders).
const DOSSIER = {
  id: CUSTOMER_ID,
  created: '2024-01-01T00:00:00.000Z',
  accountType: 'Organization',
  mail: 'ops@acme-example.com',
  firstname: 'Petra',
  surname: 'Prokura',
  verifiedName: 'Petra Prokura',
  street: 'Musterstrasse',
  houseNumber: '12',
  zip: '8000',
  location: 'Zürich',
  country: { name: 'Switzerland', symbol: 'CH' },
  nationality: { name: 'Switzerland', symbol: 'CH' },
  language: { name: 'German', symbol: 'DE' },
  birthday: '1985-06-15T00:00:00.000Z',
  phone: '+41 79 000 00 00',
  organization: {
    id: 9101,
    name: 'ACME Example AG',
    street: 'Bahnhofstrasse',
    houseNumber: '1',
    zip: '8001',
    location: 'Zürich',
    country: { name: 'Switzerland', symbol: 'CH' },
    legalEntity: 'AG',
    signatoryPower: 'Single',
    complexOrgStructure: false,
    allBeneficialOwnersName: 'Petra Prokura, Hans Halter',
    allBeneficialOwnersDomicile: 'Zürich, CH',
    accountOpenerAuthorization: 'Board resolution 2024-01, signed by the chairman',
  },

  // KYC / compliance status (no AML work products)
  kycStatus: 'Completed',
  kycLevel: '50',
  kycType: 'Business',
  highRisk: false,
  pep: false,

  // Customer-scoped slices (reduced)
  kycFiles: [
    { uid: 'file-7101-1', type: 'Identification', name: 'passport.pdf', created: '2024-01-02T00:00:00.000Z' },
    { uid: 'file-7101-2', type: 'AdditionalDocuments', name: 'commercial-register.pdf', created: '2024-01-03T00:00:00.000Z' },
  ],
  kycSteps: [
    { id: 7201, name: 'Contract', type: 'Contract', status: 'Completed', sequenceNumber: 1, created: '2024-01-02T00:00:00.000Z' },
    { id: 7202, name: 'Ident', type: 'Auto', status: 'Completed', sequenceNumber: 2, created: '2024-01-03T00:00:00.000Z' },
    { id: 7203, name: 'LegalEntity', type: 'Manual', status: 'InProgress', sequenceNumber: 3, created: '2024-01-04T00:00:00.000Z' },
  ],
  transactions: [
    {
      id: 7301,
      uid: 'TX-7301',
      buyCryptoId: 5301,
      type: 'Buy',
      sourceType: 'BuyCrypto',
      inputAmount: 10000,
      inputAsset: 'CHF',
      inputTxId: 'bank-ref-7301',
      outputAmount: 9.87,
      outputAsset: 'REALU',
      amountInChf: 10000,
      amountInEur: 10250,
      isCompleted: true,
      created: '2024-01-05T00:00:00.000Z',
    },
    {
      id: 7302,
      uid: 'TX-7302',
      buyFiatId: 5302,
      type: 'Sell',
      sourceType: 'BuyFiat',
      inputAmount: 5,
      inputAsset: 'REALU',
      outputAmount: 5050,
      outputAsset: 'CHF',
      amountInChf: 5050,
      chargebackDate: '2024-01-09T00:00:00.000Z',
      isCompleted: false,
      created: '2024-01-08T00:00:00.000Z',
    },
  ],
  bankDatas: [
    {
      id: 7401,
      iban: 'CH93 0076 2011 6238 5295 7',
      name: 'ACME Example AG',
      type: 'BankAccount',
      status: 'Active',
      approved: true,
      manualApproved: false,
      active: true,
      created: '2024-01-02T00:00:00.000Z',
    },
  ],
  addresses: [
    {
      id: 7901,
      address: '0xabc0000000000000000000000000000000000001',
      status: 'Active',
      created: '2024-01-02T00:00:00.000Z',
    },
  ],
  buyRoutes: [
    {
      id: 7501,
      iban: 'CH93 0076 2011 6238 5295 7',
      bankUsage: 'ABCD-EFGH-IJKL',
      assetName: 'REALU',
      blockchain: 'Ethereum',
      targetAddress: '0xabc0000000000000000000000000000000000001',
      volume: 25000,
      active: true,
      created: '2024-01-02T00:00:00.000Z',
    },
  ],
  sellRoutes: [
    {
      id: 7601,
      iban: 'CH93 0076 2011 6238 5295 7',
      fiatName: 'CHF',
      depositAddress: '0xdef0000000000000000000000000000000000002',
      depositBlockchains: ['Ethereum'],
      volume: 12000,
      active: true,
      created: '2024-01-02T00:00:00.000Z',
    },
  ],
  swapRoutes: [
    {
      id: 7701,
      assetName: 'REALU',
      blockchain: 'Ethereum',
      depositAddress: '0x1230000000000000000000000000000000000003',
      volume: 4000,
      annualVolume: 48000,
      active: false,
      created: '2024-01-06T00:00:00.000Z',
    },
  ],
  virtualIbans: [
    {
      id: 7801,
      iban: 'CH55 0483 5012 3456 7800 9',
      bban: '04835012345678009',
      currency: 'CHF',
      bank: 'Example Bank',
      status: 'Active',
      active: true,
      label: 'Primary',
      buyId: 7501,
      created: '2024-01-02T00:00:00.000Z',
    },
  ],
  supportIssues: [
    {
      id: 7901,
      uid: 'RU-7901-UID',
      type: 'TransactionIssue',
      state: 'Completed',
      reason: 'FundsNotReceived',
      name: 'Missing incoming transfer',
      clerk: 'Rita Clerk',
      department: 'Support',
      information: 'Customer reported a missing incoming transfer; resolved after bank reconciliation.',
      transaction: { id: 7301, uid: 'TX-7301', type: 'Buy', sourceType: 'BuyCrypto', amountInChf: 10000 },
      messages: [
        { author: CUSTOMER_AUTHOR, message: 'I sent 10000 CHF but do not see the tokens yet.', created: '2024-01-05T08:00:00.000Z' },
        { author: 'Rita Clerk', message: 'We located the payment, the tokens have now been credited.', created: '2024-01-05T11:00:00.000Z' },
      ],
    },
    {
      id: 7902,
      uid: 'RU-7902-UID',
      type: 'KycIssue',
      state: 'Pending',
      reason: 'DataRequest',
      name: 'Beneficial owner clarification',
      clerk: 'Tom Support',
      department: 'Compliance',
      information: 'Follow-up on the beneficial ownership declaration for the organization.',
      messages: [
        { author: CUSTOMER_AUTHOR, message: 'Please find the updated ownership declaration attached.', created: '2024-01-07T09:30:00.000Z' },
        { author: 'Tom Support', message: 'Thank you, we are reviewing the document.', created: '2024-01-07T14:15:00.000Z' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Routing: intercept ONLY the RealUnit compliance endpoints; pass everything else through.
// The list endpoint is `.../customers?key=...`; the detail endpoint is `.../customers/:id` — match detail first.
// ---------------------------------------------------------------------------

const DETAIL_RE = /\/v1\/realunit\/compliance\/customers\/(\d+)(?:\?|$)/;
const SEARCH_RE = /\/v1\/realunit\/compliance\/customers(?:\?|$)/;

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installComplianceRoutes(page: Page): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const url = route.request().url();

    if (DETAIL_RE.test(url)) return json(route, DOSSIER);
    if (SEARCH_RE.test(url)) return json(route, SEARCH_RESULTS);

    // everything else (auth, role, user, settings) hits the real api
    await route.continue();
  });
}

test.describe('RealUnit Compliance dashboards - Visual Regression Tests', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAdminAuth(request);
  });

  test('search screen renders customer results', async ({ page }) => {
    await installComplianceRoutes(page);

    await page.goto(`/realunit/compliance?session=${token}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // the complete customer list is loaded upfront (list request without a key)
    await expect(page.getByText('ACME Example AG')).toBeVisible();
    // empty-account toggle is available because the fixture set includes one empty account
    await expect(page.getByText('Hide empty accounts')).toBeVisible();
    // the empty account (id 7104) is hidden by the default filter before any search
    await expect(page.getByText('7104')).not.toBeVisible();

    // the screen exposes only a controlled input (no ?search= URL support) — type a key and submit via Enter
    const input = page.locator('input').first();
    await expect(input).toBeVisible();
    await input.fill('example');
    // Enter must actually issue the keyed search request. Without this wait the assertions below would also pass on
    // the upfront-loaded list alone (the mock serves the same fixture for both requests), so a broken onKeyDown →
    // handleSearch → loadCustomers(key) wiring would still go green.
    const keyedSearch = page.waitForRequest((req) => /\/realunit\/compliance\/customers\?key=example/.test(req.url()));
    await input.press('Enter');
    await keyedSearch;

    // results table rendered
    await expect(page.getByText('ACME Example AG')).toBeVisible();
    await expect(page.getByText('bob@example.com')).toBeVisible();
    // active search bypasses the empty filter — the empty account (id 7104) is visible too
    await expect(page.getByText('7104')).toBeVisible();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('realunit-compliance-01-search.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('dossier screen renders the full reduced customer view', async ({ page }) => {
    await installComplianceRoutes(page);

    await page.goto(`/realunit/compliance/user/${CUSTOMER_ID}?session=${token}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // top identity/org panels + a late (bottom) section confirm the long page fully rendered. Assertions use text
    // rendered exactly once on the page to avoid strict-mode collisions (e.g. "Organization" is both the org panel
    // title AND the identity "Account Type" value).
    await expect(page.getByText('Identity')).toBeVisible();
    await expect(page.getByText('Account Opener Authorization', { exact: false })).toBeVisible();
    // Wallet address from the Addresses table (Buy Routes keep the same hex as targetAddress but do not render it).
    await expect(page.getByText('0xabc0000000000000000000000000000000000001')).toBeVisible();
    await expect(page.getByText('Support Issues', { exact: false })).toBeVisible();
    await expect(page.getByText('Missing incoming transfer')).toBeVisible();

    await expect(page).toHaveScreenshot('realunit-compliance-02-dossier.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });
});
