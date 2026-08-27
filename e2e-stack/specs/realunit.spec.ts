/**
 * RealUnit area screens.
 *
 * Quotes screens use useRealunitQuotesGuard (Admin | RealUnit | Compliance | Support).
 * All other RealUnit routes use useRealunitGuard (Admin | RealUnit | Compliance only).
 *
 * getAdminQuotes is a DB query against transaction_request (not the subgraph). A SQL-inserted
 * WaitingForPayment Buy row can exercise list/detail/deactivate against the real API; that does
 * not prove a customer created the quote through /buy.
 *
 * Subgraph-backed surfaces (holders / tokenInfo / account history) remain unreachable here;
 * Aktionariat price is mocked. Admin transactions may be empty or error without a seed.
 *
 * A second describe below covers the RealUnit BitBox sell as a DFX API process (faucet → unsigned
 * REALU→ZCHF swap → ZCHF deposit broadcast). No browser, no BitBox, no live Ethereum — same
 * factory-only pattern as sell-swap.spec.ts. Requires the loc API JSON-RPC / faucet / broadcast stubs.
 */

import type { Locator, Page } from '@playwright/test';
import { ethers } from 'ethers';
import {
  apiGet,
  apiPost,
  apiPut,
  expect,
  gotoWithSession,
  loginAs,
  normPath,
  openScreen,
  queryOne,
  required,
  TEST_IBAN,
  test,
} from './fixtures';
import { cleanupCreatedData, createSupportIssue, createUser, trackRow } from './fixtures/factories';

/** Routes owned by this lane's RealUnit half (11 paths). */
const REALUNIT_ROUTES = [
  '/realunit',
  '/realunit/holders',
  '/realunit/quotes',
  '/realunit/quotes/:id',
  '/realunit/transactions',
  '/realunit/transactions/:id',
  '/realunit/user/:address',
  '/realunit/support',
  '/realunit/support/issue/:id',
  '/realunit/compliance',
  '/realunit/compliance/user/:id',
] as const;

const IMPLAUSIBLE_ID = '999999999';
const NEVER_HELD_ADDRESS = '0x0000000000000000000000000000000000000001';

function concretePath(route: string): string {
  return route.replace(':id', IMPLAUSIBLE_ID).replace(':address', NEVER_HELD_ADDRESS);
}

function attachErrorListeners(page: Page): { pageErrors: string[]; consoleErrors: string[] } {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => {
    pageErrors.push(String(err));
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  return { pageErrors, consoleErrors };
}

// Browser network-panel lines for deliberate 4xx lookups (implausible ids) are expected noise,
// not app bugs — the app catches them via .catch() → ErrorHint. pageerror stays strict.
function assertNoErrors(pageErrors: string[], consoleErrors: string[]): void {
  const unexpected = consoleErrors.filter(
    (msg) => !/^Failed to load resource: the server responded with a status of 4\d\d/.test(msg),
  );
  expect(pageErrors, `uncaught pageerror: ${pageErrors.join('; ')}`).toEqual([]);
  expect(unexpected, `unexpected console error: ${unexpected.join('; ')}`).toEqual([]);
}

/**
 * Staff roles (Admin, RealUnit, …) need KYC clearance before RoleGuard allows guarded APIs.
 * Sets verifiedName and waits until the background job syncs userDataId into staffKycClearance.
 */
async function ensureStaffKycClearance(userDataId: number, roleLabel: string): Promise<void> {
  await queryOne('UPDATE user_data SET "verifiedName" = $1 WHERE id = $2', [`E2E ${roleLabel} Clearance`, userDataId]);

  const timeoutMs = 75_000;
  const intervalMs = 3_000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const row = await queryOne<{ value: string | unknown }>('SELECT value FROM setting WHERE key = $1', [
      'staffKycClearance',
    ]);
    if (row?.value != null) {
      const raw = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
      let ids: unknown;
      try {
        ids = JSON.parse(raw);
      } catch {
        ids = row.value;
      }
      if (Array.isArray(ids) && ids.some((id) => Number(id) === userDataId)) {
        return;
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    `ensureStaffKycClearance: userDataId ${userDataId} not in staffKycClearance setting within ${timeoutMs}ms`,
  );
}

// thead <th> cells map to ARIA role "cell" in this app, not "columnheader".
function tableHeader(page: Page, label: string): Locator {
  return page.locator('thead').getByText(label, { exact: true });
}

test.describe('RealUnit area', () => {
  test.beforeAll(async () => {
    const { wallet } = await loginAs('RealUnit');
    const userRow = await queryOne<{ userDataId: number }>('SELECT "userDataId" FROM "user" WHERE address = $1', [
      wallet.address,
    ]);
    if (userRow?.userDataId == null) {
      throw new Error(`beforeAll: no userDataId for RealUnit wallet ${wallet.address}`);
    }
    await ensureStaffKycClearance(userRow.userDataId, 'RealUnit');
  });

  test.afterAll(async () => {
    await cleanupCreatedData();
  });

  test('plain User role is denied all RealUnit routes', async ({ page }) => {
    const { jwt } = await loginAs('User');

    for (const route of REALUNIT_ROUTES) {
      const target = concretePath(route);
      await gotoWithSession(page, target, jwt);
      await page.waitForLoadState('networkidle');
      await expect
        .poll(() => normPath(new URL(page.url()).pathname), {
          message: `User must be redirected away from ${target}`,
          timeout: 15000,
        })
        .not.toBe(normPath(target));
    }
  });

  // Redirect-only coverage (above) proves the FRONTEND guard (useRealunitGuard) reacts to the
  // role claim it decodes from the JWT itself; it says nothing about the server. This call
  // proves the server's own RoleGuard(RealUnit) also rejects a plain User for the same area,
  // independently of whatever the frontend does.
  test('plain User role is denied the underlying RealUnit API, not just the frontend route', async () => {
    const { jwt } = await loginAs('User');
    let status: number | undefined;
    await apiGet('realunit/compliance/customers', { jwt, expectOk: false, onStatus: (s) => (status = s) });
    expect(status, 'GET /v1/realunit/compliance/customers must reject a plain User role').toBe(403);
  });

  // CONFIRMED product bug: screen stuck on loading spinner forever. realunit.screen.tsx gates on
  // `!holders.length && !tokenInfo ? <Spinner/> : (...)`. fetchHolders()/fetchTokenInfo() in
  // realunit.context.tsx have no .catch(), so a rejected subgraph request leaves holders empty and
  // tokenInfo undefined — the spinner never clears; "RealUnit Support" and the rest never mount.
  // Observed: expect(getByRole('button', { name: 'RealUnit Support' })).toBeVisible() timeout 15s.
  test.fail(
    '/realunit empty state — stuck on spinner forever (fetchHolders/fetchTokenInfo no .catch; RealUnit Support never mounts)',
    async ({ page }) => {
      const { jwt } = await loginAs('RealUnit');
      const { pageErrors, consoleErrors } = attachErrorListeners(page);

      await openScreen(page, '/realunit', jwt);

      await expect(page.getByRole('button', { name: 'RealUnit Support' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'RealUnit Compliance' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Price History' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Top Holders' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Pending Transactions' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Received Transactions' })).toBeVisible();
      await expect(page.getByText('No pending transactions found')).toBeVisible();
      await expect(page.getByText('No received transactions found')).toBeVisible();

      assertNoErrors(pageErrors, consoleErrors);
    },
  );

  // CONFIRMED product bug (live uncaught pageerror): fetchHolders() has no .catch() in
  // realunit.context.tsx. Observed: ApiException: Cannot read properties of undefined (reading 'document').
  test.fail(
    '/realunit/holders empty state — uncaught ApiException from fetchHolders() (no .catch; reading document)',
    async ({ page }) => {
      const { jwt } = await loginAs('RealUnit');
      const { pageErrors, consoleErrors } = attachErrorListeners(page);

      await openScreen(page, '/realunit/holders', jwt);

      await expect(page.getByRole('heading', { name: /All Holders/ })).toBeVisible();
      await expect(tableHeader(page, 'Address')).toBeVisible();
      await expect(tableHeader(page, 'Balance')).toBeVisible();
      await expect(tableHeader(page, 'Percentage')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Previous' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();

      assertNoErrors(pageErrors, consoleErrors);
    },
  );

  test('/realunit/quotes list renders empty or ErrorHint without crash', async ({ page }) => {
    const { jwt } = await loginAs('RealUnit');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);

    await openScreen(page, '/realunit/quotes', jwt);

    await expect(page.getByRole('heading', { name: 'Pending Transactions' })).toBeVisible();
    await expect(tableHeader(page, 'Type')).toBeVisible();
    await expect(tableHeader(page, 'Amount')).toBeVisible();
    await expect(tableHeader(page, 'Address')).toBeVisible();
    await expect(tableHeader(page, 'Name')).toBeVisible();
    await expect(tableHeader(page, 'Created')).toBeVisible();

    // Empty success → "No pending transactions found"; fetch failure → ErrorHint with quotesError copy.
    // A prior test may have left a seeded quote in the same worker DB — either outcome is fine.
    const settled = page
      .getByText('No pending transactions found')
      .or(page.getByText('Failed to load pending transactions.'))
      .or(page.locator('tbody tr').first());
    await expect(settled.first()).toBeVisible();

    assertNoErrors(pageErrors, consoleErrors);
  });

  test('/realunit/quotes/:id with implausible id shows not-found or ErrorHint', async ({ page }) => {
    const { jwt } = await loginAs('RealUnit');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);
    const path = `/realunit/quotes/${IMPLAUSIBLE_ID}`;

    await openScreen(page, path, jwt);

    // Source branches (realunit-quote-detail.screen.tsx):
    // - quotesError && !quote → ErrorHint "Failed to load quote details."
    // - !quote after successful fetch → "Quote not found"
    const notFoundOrError = page.getByText('Quote not found').or(page.getByText('Failed to load quote details.'));
    await expect(notFoundOrError).toBeVisible();

    assertNoErrors(pageErrors, consoleErrors);
  });

  /**
   * SQL seed of transaction_request: proves admin quotes list/detail/deactivate UI against the
   * real API. Not a customer-created quote through /buy (see e2e-stack/docs/test-data.md).
   */
  async function seedWaitingForPaymentBuyQuote(): Promise<number> {
    const customer = await createUser({ tag: 'ru-quote' });
    // Must match RealUnitService.getRealuAsset() in loc (Sepolia + Token), not an arbitrary REALU row.
    const realu = await queryOne<{ id: number }>(
      `SELECT id FROM asset WHERE name = 'REALU' AND blockchain = 'Sepolia' AND type = 'Token' ORDER BY id ASC LIMIT 1`,
    );
    if (realu?.id == null) {
      throw new Error('seedWaitingForPaymentBuyQuote: no loc REALU token on Sepolia in seed data');
    }

    const uid = `RQ${Date.now().toString(36)}${customer.userId}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
    const row = await queryOne<{ id: number }>(
      `INSERT INTO transaction_request
         (type, "isComplete", "targetId", status, amount, "estimatedAmount", uid, "userId",
          "routeId", "sourceId", "sourcePaymentMethod", "targetPaymentMethod", "exchangeRate", rate, "isValid")
       VALUES ('Buy', false, $1, 'WaitingForPayment', 100, 10, $2, $3,
               0, 0, 'Bank', 'Crypto', 1, 1, true)
       RETURNING id`,
      [realu.id, uid, customer.userId],
    );
    const id = required(row?.id, 'seeded transaction_request must return an id');
    trackRow('transaction_request', id);
    return id;
  }

  test('RealUnit can deactivate a seeded WaitingForPayment Buy quote', async ({ page }) => {
    const quoteId = await seedWaitingForPaymentBuyQuote();
    const { jwt } = await loginAs('RealUnit');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);

    await openScreen(page, `/realunit/quotes/${quoteId}`, jwt);

    await expect(page.getByRole('button', { name: 'Deactivate Quote' })).toBeVisible();
    await page.getByRole('button', { name: 'Deactivate Quote' }).click();
    await expect(page.getByText('Are you sure you want to deactivate this quote?')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();

    await expect
      .poll(
        async () => {
          const row = await queryOne<{ deactivatedAt: string | Date | null }>(
            `SELECT "deactivatedAt" FROM transaction_request WHERE id = $1`,
            [quoteId],
          );
          return row?.deactivatedAt ?? null;
        },
        { timeout: 15000 },
      )
      .not.toBeNull();

    await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 15000 }).toBe('/realunit/quotes');

    assertNoErrors(pageErrors, consoleErrors);
  });

  test('Support can open quotes detail, see Deactivate (not Confirm Payment), and deactivate', async ({ page }) => {
    const quoteId = await seedWaitingForPaymentBuyQuote();
    const { jwt, wallet } = await loginAs('Support');
    const userRow = await queryOne<{ userDataId: number }>('SELECT "userDataId" FROM "user" WHERE address = $1', [
      wallet.address,
    ]);
    if (userRow?.userDataId == null) {
      throw new Error(`Support quotes: no userDataId for Support wallet ${wallet.address}`);
    }
    await ensureStaffKycClearance(userRow.userDataId, 'Support');

    const { pageErrors, consoleErrors } = attachErrorListeners(page);
    await openScreen(page, `/realunit/quotes/${quoteId}`, jwt);

    await expect(page.getByRole('button', { name: 'Deactivate Quote' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm Payment Received' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Deactivate Quote' }).click();
    await expect(page.getByText('Are you sure you want to deactivate this quote?')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();

    await expect
      .poll(
        async () => {
          const row = await queryOne<{ deactivatedAt: string | Date | null }>(
            `SELECT "deactivatedAt" FROM transaction_request WHERE id = $1`,
            [quoteId],
          );
          return row?.deactivatedAt ?? null;
        },
        { timeout: 15000 },
      )
      .not.toBeNull();

    await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 15000 }).toBe('/realunit/quotes');

    assertNoErrors(pageErrors, consoleErrors);
  });

  test('Support is denied non-quotes RealUnit routes that use useRealunitGuard', async ({ page }) => {
    const { jwt, wallet } = await loginAs('Support');
    const userRow = await queryOne<{ userDataId: number }>('SELECT "userDataId" FROM "user" WHERE address = $1', [
      wallet.address,
    ]);
    if (userRow?.userDataId == null) {
      throw new Error(`Support deny: no userDataId for Support wallet ${wallet.address}`);
    }
    await ensureStaffKycClearance(userRow.userDataId, 'Support');

    for (const target of ['/realunit', '/realunit/holders']) {
      await gotoWithSession(page, target, jwt);
      await page.waitForLoadState('networkidle');
      await expect
        .poll(() => normPath(new URL(page.url()).pathname), {
          message: `Support must be redirected away from ${target}`,
          timeout: 15000,
        })
        .not.toBe(normPath(target));
    }
  });

  test('Marketing is denied quotes routes', async ({ page }) => {
    const { jwt } = await loginAs('Marketing');

    for (const target of ['/realunit/quotes', `/realunit/quotes/${IMPLAUSIBLE_ID}`]) {
      await gotoWithSession(page, target, jwt);
      await page.waitForLoadState('networkidle');
      await expect
        .poll(() => normPath(new URL(page.url()).pathname), {
          message: `Marketing must be redirected away from ${target}`,
          timeout: 15000,
        })
        .not.toBe(normPath(target));
    }
  });

  test('/realunit/transactions list renders empty or ErrorHint without crash', async ({ page }) => {
    const { jwt } = await loginAs('RealUnit');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);

    await openScreen(page, '/realunit/transactions', jwt);

    await expect(page.getByRole('heading', { name: 'Received Transactions' })).toBeVisible();
    await expect(tableHeader(page, 'Type')).toBeVisible();
    await expect(tableHeader(page, 'Amount CHF')).toBeVisible();
    await expect(tableHeader(page, 'Address')).toBeVisible();
    await expect(tableHeader(page, 'Date')).toBeVisible();

    const emptyOrError = page
      .getByText('No received transactions found')
      .or(page.getByText('Failed to load received transactions.'));
    await expect(emptyOrError).toBeVisible();

    assertNoErrors(pageErrors, consoleErrors);
  });

  test('/realunit/transactions/:id with implausible id shows not-found or ErrorHint', async ({ page }) => {
    const { jwt } = await loginAs('RealUnit');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);
    const path = `/realunit/transactions/${IMPLAUSIBLE_ID}`;

    await openScreen(page, path, jwt);

    // Source branches (realunit-transaction-detail.screen.tsx):
    // - transactionsError && !transaction → ErrorHint "Failed to load transaction details."
    // - !transaction after successful fetch → "Transaction not found"
    const notFoundOrError = page
      .getByText('Transaction not found')
      .or(page.getByText('Failed to load transaction details.'));
    await expect(notFoundOrError).toBeVisible();

    assertNoErrors(pageErrors, consoleErrors);
  });

  // CONFIRMED product bug (live uncaught pageerror): fetchAccountHistory() has no .catch() in
  // realunit.context.tsx. Observed: ApiException: Cannot read properties of undefined (reading 'document').
  // (fetchAccountSummary does catch and would yield "No data available" if history did not crash first.)
  test.fail(
    '/realunit/user/:address empty state — uncaught ApiException from fetchAccountHistory() (no .catch; reading document)',
    async ({ page }) => {
      const { jwt } = await loginAs('RealUnit');
      const { pageErrors, consoleErrors } = attachErrorListeners(page);
      const path = `/realunit/user/${NEVER_HELD_ADDRESS}`;

      await openScreen(page, path, jwt);

      await expect(page.getByText('No data available')).toBeVisible();

      assertNoErrors(pageErrors, consoleErrors);
    },
  );

  test('/realunit/support list renders tabs, search, Open Issues (clean empty/scoped state)', async ({ page }) => {
    // Seed a normal DFX support issue so a known uid exists; do not assert it appears in the
    // RealUnit-scoped list (realunit/support/list scoping is not guaranteed for factory data).
    const customer = await createUser({ tag: 'ru-support' });
    await createSupportIssue(customer.jwt, { type: 'GenericIssue' });

    const { jwt } = await loginAs('RealUnit');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);

    await openScreen(page, '/realunit/support', jwt);

    await expect(page.getByText('Open Issues')).toBeVisible();
    await expect(page.getByPlaceholder('Search by ID, UID, name, clerk, message...')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Open \(/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^OnHold \(/ })).toBeVisible();
    // Empty scoped list → "No issues found"; non-empty → issue table headers (Type column).
    await expect(page.getByText('No issues found').or(tableHeader(page, 'Type'))).toBeVisible();

    assertNoErrors(pageErrors, consoleErrors);
  });

  test('/realunit/support/issue/:id with implausible id shows clean ErrorHint', async ({ page }) => {
    const { jwt } = await loginAs('RealUnit');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);
    const path = `/realunit/support/issue/${IMPLAUSIBLE_ID}`;

    await openScreen(page, path, jwt);

    // getIssueData fails → setLoadError → ErrorHint (error-hint.tsx fixed sentence + raw message).
    await expect(
      page.getByText('Something went wrong. Please try again. If the issue persists please reach out to our support.'),
    ).toBeVisible();

    assertNoErrors(pageErrors, consoleErrors);
  });

  test('/realunit/compliance list renders search UI and result count or empty copy', async ({ page }) => {
    const { jwt } = await loginAs('RealUnit');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);

    await openScreen(page, '/realunit/compliance', jwt);

    await expect(page.getByPlaceholder('Search by ID, email, phone or name...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search' })).toBeVisible();

    // Loading resolves to customers count, empty filter copy, or handled ErrorHint — not a crash.
    // Empty result can show "Customers: 0" and "No entries found" at once; .first() avoids strict mode.
    const settled = page
      .getByText(/^Customers:/)
      .or(page.getByText('No entries found'))
      .or(page.getByText('All accounts are hidden by the filter above'))
      .or(
        page.getByText(
          'Something went wrong. Please try again. If the issue persists please reach out to our support.',
        ),
      );
    await expect(settled.first()).toBeVisible();

    assertNoErrors(pageErrors, consoleErrors);
  });

  test('/realunit/compliance/user/:id with implausible id shows clean ErrorHint', async ({ page }) => {
    const { jwt } = await loginAs('RealUnit');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);
    const path = `/realunit/compliance/user/${IMPLAUSIBLE_ID}`;

    await openScreen(page, path, jwt);

    await expect(
      page.getByText('Something went wrong. Please try again. If the issue persists please reach out to our support.'),
    ).toBeVisible();

    assertNoErrors(pageErrors, consoleErrors);
  });
});

// ---------------------------------------------------------------------------
// RealUnit sell process (API path) — faucet → unsigned swap → deposit broadcast
// Wallet band 8000100 (sell-swap uses 8000000; role wallets use 0–6).
// Requires the loc API JSON-RPC / faucet / broadcast / brokerbot stubs.
// ---------------------------------------------------------------------------

let __ruSell_WALLET_SEQ = 0;
function nextRuSellWalletIndex(): number {
  __ruSell_WALLET_SEQ += 1;
  return 8000100 + __ruSell_WALLET_SEQ;
}

const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;
const LOC_REQUIRED_GAS_ETH = 0.00045; // 1 gwei × 450_000
const LOC_FAUCET_AMOUNT_ETH = 0.0005625; // 1 gwei × 450_000 × 1.25
const SEPOLIA_CHAIN_ID = 11155111;
const SWAP_GAS_LIMIT = 350000;
const DEPOSIT_GAS_LIMIT = 100000;

function apiErrorMessage(body: unknown): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    return typeof message === 'string' ? message : JSON.stringify(message);
  }
  return typeof body === 'string' ? body : JSON.stringify(body ?? '');
}

async function ensureSepoliaZchfAsset(): Promise<void> {
  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM asset WHERE name = 'ZCHF' AND blockchain = 'Sepolia' AND type = 'Token' LIMIT 1`,
  );
  if (existing?.id != null) return;

  // Seed correction: loc getZchfAsset() queries Sepolia/ZCHF Token; asset.csv has only Ethereum/ZCHF.
  // Leave untracked as master data (inserted once in beforeAll).
  const inserted = await queryOne<{ id: number }>(
    `INSERT INTO asset (
       name, type, buyable, sellable, "chainId", "sellCommand", "dexName", category, blockchain, "uniqueName",
       description, "comingSoon", "sortOrder", "approxPriceUsd", ikna, "approxPriceChf", "cardBuyable",
       "cardSellable", "instantBuyable", "instantSellable", "financialType", decimals, "paymentEnabled",
       "amlRuleFrom", "amlRuleTo", "approxPriceEur", "refundEnabled", "refEnabled", "personalIbanEnabled"
     )
     SELECT
       name, type, buyable, sellable, "chainId", "sellCommand", "dexName", category, 'Sepolia', 'Sepolia/ZCHF',
       description, "comingSoon", "sortOrder", "approxPriceUsd", ikna, "approxPriceChf", "cardBuyable",
       "cardSellable", "instantBuyable", "instantSellable", "financialType", decimals, "paymentEnabled",
       "amlRuleFrom", "amlRuleTo", "approxPriceEur", "refundEnabled", "refEnabled", "personalIbanEnabled"
     FROM asset
     WHERE name = 'ZCHF' AND blockchain = 'Ethereum' AND type = 'Token'
     LIMIT 1
     RETURNING id`,
  );
  if (inserted?.id == null) {
    throw new Error('ensureSepoliaZchfAsset: failed to copy Ethereum/ZCHF into Sepolia/ZCHF (source row missing?)');
  }
}

async function ensureSepoliaRealuSellable(): Promise<void> {
  // Seed correction: asset.csv row 408 is Sepolia/REALU with sellable=FALSE.
  await queryOne(`UPDATE asset SET sellable = true WHERE name = 'REALU' AND blockchain = 'Sepolia'`);
}

async function seedAktionariatRegistration(user: { userId: number; address: string; mail?: string }): Promise<number> {
  const mail = required(user.mail, 'seedAktionariatRegistration: createUser must set mail');
  const row = await queryOne<{ id: number }>(
    `INSERT INTO aktionariat_registration
       ("userId", "walletAddress", email, "registrationDate", signature, status, active, "requiresEmailConfirmation",
        created, updated)
     VALUES ($1, $2, $3, '2026-01-01', '0xloc', 'Completed', true, false, NOW(), NOW())
     RETURNING id`,
    [user.userId, user.address.toLowerCase(), mail.toLowerCase()],
  );
  const id = required(row?.id, 'seedAktionariatRegistration: INSERT must return id');
  trackRow('aktionariat_registration', id);
  return id;
}

async function signAndBroadcastSellTx(
  jwt: string,
  sellId: number,
  unsignedHex: string,
  privateKey: string,
): Promise<string> {
  const parsed = ethers.utils.parseTransaction(unsignedHex);
  const signedHex = await new ethers.Wallet(privateKey).signTransaction({
    type: 2,
    chainId: parsed.chainId,
    nonce: parsed.nonce,
    maxPriorityFeePerGas: parsed.maxPriorityFeePerGas,
    maxFeePerGas: parsed.maxFeePerGas,
    gasLimit: parsed.gasLimit,
    to: parsed.to,
    value: parsed.value,
    data: parsed.data,
  });
  const signed = ethers.utils.parseTransaction(signedHex);
  const result = await apiPut<{ txHash: string }>(
    `realunit/sell/${sellId}/broadcast`,
    {
      unsignedTx: unsignedHex,
      r: required(signed.r, 'signed tx must include r'),
      s: required(signed.s, 'signed tx must include s'),
      v: required(signed.v, 'signed tx must include v'),
    },
    { jwt },
  );
  return result.txHash;
}

test.describe('RealUnit sell process (API path)', () => {
  test.beforeAll(async () => {
    await ensureSepoliaZchfAsset();
    await ensureSepoliaRealuSellable();
  });

  test.afterAll(async () => {
    await cleanupCreatedData();
  });

  test('faucet → unsigned swap → deposit broadcast (happy path)', async () => {
    const user = await createUser({
      kycLevel: 30,
      tag: 'ru-sell',
      walletIndex: nextRuSellWalletIndex(),
    });
    await seedAktionariatRegistration(user);

    const sell = await apiPut<{ id: number; requiredGasEth: number; ethBalance: number }>(
      'realunit/sell',
      { amount: 1, iban: TEST_IBAN, currency: 'CHF' },
      { jwt: user.jwt },
    );

    expect(sell.requiredGasEth).toBe(LOC_REQUIRED_GAS_ETH);
    expect(sell.ethBalance).toBe(0);
    expect(sell.id, 'PUT realunit/sell must return a transaction request id').toBeGreaterThan(0);

    let status: number | undefined;
    const beforeFaucet = await apiPut<unknown>(
      `realunit/sell/${sell.id}/unsigned-transactions`,
      {},
      { jwt: user.jwt, expectOk: false, onStatus: (s) => (status = s) },
    );
    expect(status, 'unsigned-transactions before faucet must be 400').toBe(400);
    expect(apiErrorMessage(beforeFaucet)).toMatch(/Insufficient ETH/i);

    const faucet = await apiPost<{ amount: number; txId: string; asset: { blockchain?: string } }>(
      'faucet',
      {},
      { jwt: user.jwt },
    );
    expect(faucet.amount).toBe(LOC_FAUCET_AMOUNT_ETH);
    expect(faucet.txId).toMatch(TX_HASH_RE);
    expect(faucet.asset.blockchain).toBe('Sepolia');

    status = undefined;
    const faucetReuse = await apiPost<unknown>(
      'faucet',
      {},
      { jwt: user.jwt, expectOk: false, onStatus: (s) => (status = s) },
    );
    expect(status, 'second faucet call must be 400').toBe(400);
    expect(apiErrorMessage(faucetReuse)).toMatch(/already used/i);

    const unsigned = await apiPut<{ swap: string; deposit: string }>(
      `realunit/sell/${sell.id}/unsigned-transactions`,
      {},
      { jwt: user.jwt },
    );
    expect(typeof unsigned.swap).toBe('string');
    expect(typeof unsigned.deposit).toBe('string');
    expect(unsigned.swap.startsWith('0x')).toBe(true);
    expect(unsigned.deposit.startsWith('0x')).toBe(true);

    const swapTx = ethers.utils.parseTransaction(unsigned.swap);
    const depositTx = ethers.utils.parseTransaction(unsigned.deposit);
    expect(swapTx.gasLimit.toNumber()).toBe(SWAP_GAS_LIMIT);
    expect(depositTx.gasLimit.toNumber()).toBe(DEPOSIT_GAS_LIMIT);
    expect(depositTx.nonce).toBe((swapTx.nonce ?? 0) + 1);
    expect(swapTx.type).toBe(2);
    expect(depositTx.type).toBe(2);
    expect(swapTx.chainId).toBe(SEPOLIA_CHAIN_ID);
    expect(depositTx.chainId).toBe(SEPOLIA_CHAIN_ID);

    const swapHash = await signAndBroadcastSellTx(user.jwt, sell.id, unsigned.swap, user.wallet.privateKey);
    expect(swapHash).toMatch(TX_HASH_RE);

    const depositHash = await signAndBroadcastSellTx(user.jwt, sell.id, unsigned.deposit, user.wallet.privateKey);
    expect(depositHash).toMatch(TX_HASH_RE);

    // Broadcast resets the faucet, so a new request succeeds with a fresh txId.
    const faucetAgain = await apiPost<{ amount: number; txId: string }>('faucet', {}, { jwt: user.jwt });
    expect(faucetAgain.amount).toBe(LOC_FAUCET_AMOUNT_ETH);
    expect(faucetAgain.txId).toMatch(TX_HASH_RE);
    expect(faucetAgain.txId).not.toBe(faucet.txId);
  });

  test('POST /faucet rejects KYC below level 30 with 403', async () => {
    const user = await createUser({
      kycLevel: 20,
      tag: 'ru-faucet-kyc',
      walletIndex: nextRuSellWalletIndex(),
    });

    let status: number | undefined;
    await apiPost('faucet', {}, { jwt: user.jwt, expectOk: false, onStatus: (s) => (status = s) });
    expect(status, 'POST /v1/faucet must reject KYC < 30').toBe(403);
  });
});
