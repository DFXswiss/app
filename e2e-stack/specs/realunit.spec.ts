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
 */

import type { Locator, Page } from '@playwright/test';
import { apiGet, expect, gotoWithSession, loginAs, normPath, openScreen, queryOne, required, test } from './fixtures';
import { cleanupCreatedData, createSupportIssue, createUser, trackRow } from './fixtures/factories';

/** Routes owned by this lane's RealUnit half (15 paths). */
const REALUNIT_ROUTES = [
  '/realunit',
  '/realunit/treasury',
  '/realunit/insights',
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
  '/realunit/referral',
  '/realunit/referral/:id',
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

// Chromium's resource-error console text has no URL. Pair only as many exact 503 messages as
// were independently observed for the one permitted request; any surplus 503 stays unexpected.
function assertNoErrorsExceptHoldersUnavailable(
  pageErrors: string[],
  consoleErrors: string[],
  unavailableHoldersResponses: number,
): void {
  let unmatchedResponses = unavailableHoldersResponses;
  const remainingConsoleErrors = consoleErrors.filter((msg) => {
    if (
      unmatchedResponses > 0 &&
      msg === 'Failed to load resource: the server responded with a status of 503 (Service Unavailable)'
    ) {
      unmatchedResponses -= 1;
      return false;
    }
    return true;
  });

  assertNoErrors(pageErrors, remainingConsoleErrors);
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

  // The section nav lives outside the overview body, so its links mount even while the body
  // is still a spinner. The body bug is unchanged: fetchHolders()/fetchTokenInfo() have no
  // .catch(), so a rejected subgraph request leaves holders empty and tokenInfo undefined and
  // the overview headings never replace the spinner.
  test.fail(
    '/realunit empty state — overview body stuck on spinner (fetchHolders/fetchTokenInfo no .catch)',
    async ({ page }) => {
      const { jwt } = await loginAs('RealUnit');
      const { pageErrors, consoleErrors } = attachErrorListeners(page);

      await openScreen(page, '/realunit', jwt);

      await expect(page.getByRole('link', { name: 'RealUnit Support' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'RealUnit Compliance' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'RealUnit Referral' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Top Holders' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Pending Transactions' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Received Transactions' })).toBeVisible();
      await expect(page.getByText('No pending transactions found')).toBeVisible();
      await expect(page.getByText('No received transactions found')).toBeVisible();

      assertNoErrors(pageErrors, consoleErrors);
    },
  );

  // The E2E API has no RealUnit graph URL, so GET /v1/realunit/admin/stats/holders returns 503
  // "RealUnit graph URL is not configured". The screen shows the hint. The browser line names
  // no URL, so only one such line is dropped per counted holder-stats 503. pageerror stays strict.
  test('RealUnit opens treasury and insights from the section nav', async ({ page }) => {
    const { jwt } = await loginAs('RealUnit');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);
    let unavailableHoldersResponses = 0;
    page.on('response', (response) => {
      if (
        response.request().method() === 'GET' &&
        response.status() === 503 &&
        new URL(response.url()).pathname === '/v1/realunit/admin/stats/holders'
      ) {
        unavailableHoldersResponses += 1;
      }
    });

    await openScreen(page, '/realunit/treasury', jwt);
    await expect(page.getByRole('heading', { name: 'Max tokens per buy' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Treasury' })).toHaveAttribute('aria-current', 'page');

    // This stack has no RealUnit graph, so holders statistics must return 503.
    const holdersResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).pathname === '/v1/realunit/admin/stats/holders',
      { timeout: 15_000 },
    );
    await page.getByRole('link', { name: 'Insights' }).click();
    const holdersResponse = await holdersResponsePromise;
    await holdersResponse.finished();
    const holdersStatus = holdersResponse.status();
    expect(holdersStatus, 'holders statistics no longer 503 — remove this stack exception').toBe(503);
    await expect(page.getByText('Failed to load holder count.')).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Price History' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Insights' })).toHaveAttribute('aria-current', 'page');

    assertNoErrorsExceptHoldersUnavailable(pageErrors, consoleErrors, unavailableHoldersResponses);
  });

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
    await expect(page.getByRole('button', { name: 'Screen all' })).toBeVisible();
    // The Dilisense column is inside the table, which mounts only when a row is displayed.
    // An empty or fully filtered list shows copy instead of the thead.
    const columnOrEmpty = page
      .getByText('Last Dilisense check')
      .or(page.getByText('No entries found'))
      .or(page.getByText('All accounts are hidden by the filter above'));
    await expect(columnOrEmpty.first()).toBeVisible();
    await expect(
      page.getByText('Something went wrong. Please try again. If the issue persists please reach out to our support.'),
    ).toHaveCount(0);

    // Loading resolves to customers count or empty filter copy — not a crash. GET name-check on
    // mount must succeed (ErrorHint is not an accepted happy-path settle). Empty result can show
    // "Customers: 0" and "No entries found" at once; .first() avoids strict mode.
    const settled = page
      .getByText(/^Customers:/)
      .or(page.getByText('No entries found'))
      .or(page.getByText('All accounts are hidden by the filter above'));
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
