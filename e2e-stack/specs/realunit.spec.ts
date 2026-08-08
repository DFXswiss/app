/**
 * RealUnit area screens (useRealunitGuard: Admin | RealUnit | Compliance).
 *
 * Subgraph / RealUnit external API are unreachable in this stack; Aktionariat price is mocked.
 * Admin quotes / transactions / holders / tokenInfo / account data may be empty or error.
 * Writable quote payment (WaitingForPayment + Confirm Payment) cannot be produced here —
 * quotes come from getAdminQuotes backed by the unreachable subgraph; no factory seeds them.
 */

import type { Locator, Page } from '@playwright/test';
import { apiGet, expect, gotoWithSession, loginAs, openScreen, queryOne, test } from './fixtures';
import { cleanupCreatedData, createSupportIssue, createUser } from './fixtures/factories';

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

function normPath(p: string): string {
  return p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p;
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
  test.fail('/realunit empty state — stuck on spinner forever (fetchHolders/fetchTokenInfo no .catch; RealUnit Support never mounts)', async ({
    page,
  }) => {
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
  });

  // CONFIRMED product bug (live uncaught pageerror): fetchHolders() has no .catch() in
  // realunit.context.tsx. Observed: ApiException: Cannot read properties of undefined (reading 'document').
  test.fail('/realunit/holders empty state — uncaught ApiException from fetchHolders() (no .catch; reading document)', async ({
    page,
  }) => {
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
  });

  test('/realunit/quotes list renders empty or ErrorHint without crash', async ({ page }) => {
    const { jwt } = await loginAs('RealUnit');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);

    await openScreen(page, '/realunit/quotes', jwt);

    await expect(page.getByRole('heading', { name: 'Pending Transactions' })).toBeVisible();
    await expect(tableHeader(page, 'Type')).toBeVisible();
    await expect(tableHeader(page, 'Amount')).toBeVisible();
    await expect(tableHeader(page, 'User')).toBeVisible();
    await expect(tableHeader(page, 'Created')).toBeVisible();

    // Empty success → "No pending transactions found"; fetch failure → ErrorHint with quotesError copy.
    const emptyOrError = page
      .getByText('No pending transactions found')
      .or(page.getByText('Failed to load pending transactions.'));
    await expect(emptyOrError).toBeVisible();

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
    // Writable confirm-payment is not exercised: no WaitingForPayment quote is seedable in this stack.
    const notFoundOrError = page.getByText('Quote not found').or(page.getByText('Failed to load quote details.'));
    await expect(notFoundOrError).toBeVisible();

    assertNoErrors(pageErrors, consoleErrors);
  });

  test('/realunit/transactions list renders empty or ErrorHint without crash', async ({ page }) => {
    const { jwt } = await loginAs('RealUnit');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);

    await openScreen(page, '/realunit/transactions', jwt);

    await expect(page.getByRole('heading', { name: 'Received Transactions' })).toBeVisible();
    await expect(tableHeader(page, 'Type')).toBeVisible();
    await expect(tableHeader(page, 'Amount CHF')).toBeVisible();
    await expect(tableHeader(page, 'User')).toBeVisible();
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
  test.fail('/realunit/user/:address empty state — uncaught ApiException from fetchAccountHistory() (no .catch; reading document)', async ({
    page,
  }) => {
    const { jwt } = await loginAs('RealUnit');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);
    const path = `/realunit/user/${NEVER_HELD_ADDRESS}`;

    await openScreen(page, path, jwt);

    await expect(page.getByText('No data available')).toBeVisible();

    assertNoErrors(pageErrors, consoleErrors);
  });

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
