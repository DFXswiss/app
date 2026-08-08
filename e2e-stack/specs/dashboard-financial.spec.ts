/**
 * Financial dashboard screens (useAdminGuard: Admin only).
 *
 * Cron-fed financial_log data is empty under DISABLED_PROCESSES=* — empty charts/summary
 * cards are the expected normal state, not a bug. history / history/expenses lack .catch on
 * Promise.all; overview / live / liquidity catch load errors and degrade cleanly.
 */

import type { Locator, Page } from '@playwright/test';
import { apiGet, expect, gotoWithSession, loginAs, openScreen, queryOne, test } from './fixtures';

/** Routes owned by this lane's dashboard half (8 paths). */
const DASHBOARD_ROUTES = [
  '/dashboard',
  '/dashboard/financial',
  '/dashboard/financial/overview',
  '/dashboard/financial/live',
  '/dashboard/financial/history',
  '/dashboard/financial/history/expenses',
  '/dashboard/financial/liquidity',
  '/dashboard/financial/log-validity',
] as const;

const FINANCIAL_HUB_TILES: { title: string; path: string }[] = [
  { title: 'Overview', path: '/dashboard/financial/overview' },
  { title: 'Live', path: '/dashboard/financial/live' },
  { title: 'History', path: '/dashboard/financial/history' },
  { title: 'Liquidity', path: '/dashboard/financial/liquidity' },
  { title: 'Expenses', path: '/dashboard/financial/history/expenses' },
  { title: 'Log Validity', path: '/dashboard/financial/log-validity' },
];

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

test.describe('Financial dashboard', () => {
  test.beforeAll(async () => {
    const { wallet } = await loginAs('Admin');
    const userRow = await queryOne<{ userDataId: number }>('SELECT "userDataId" FROM "user" WHERE address = $1', [
      wallet.address,
    ]);
    if (userRow?.userDataId == null) {
      throw new Error(`beforeAll: no userDataId for Admin wallet ${wallet.address}`);
    }
    await ensureStaffKycClearance(userRow.userDataId, 'Admin');
  });

  test('plain User role is denied all financial dashboard routes', async ({ page }) => {
    const { jwt } = await loginAs('User');

    for (const target of DASHBOARD_ROUTES) {
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

  // Redirect-only coverage (above) proves the FRONTEND guard (useAdminGuard) reacts to the role
  // claim it decodes from the JWT itself; it says nothing about the server. This call proves the
  // server's own RoleGuard(Admin) also rejects a plain User for the same area, independently of
  // whatever the frontend does.
  test('plain User role is denied the underlying financial dashboard API, not just the frontend route', async () => {
    const { jwt } = await loginAs('User');
    let status: number | undefined;
    await apiGet('dashboard/financial/latest', { jwt, expectOk: false, onStatus: (s) => (status = s) });
    expect(status, 'GET /v1/dashboard/financial/latest must reject a plain User role').toBe(403);
  });

  test('/dashboard renders Financial tile and navigates to /dashboard/financial', async ({ page }) => {
    const { jwt } = await loginAs('Admin');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);

    await openScreen(page, '/dashboard', jwt);

    await expect(page.getByText('Financial', { exact: true })).toBeVisible();
    await expect(page.getByText('Balance overview, history, liquidity & expenses')).toBeVisible();

    await page.getByText('Financial', { exact: true }).click();
    await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 15000 }).toBe('/dashboard/financial');

    assertNoErrors(pageErrors, consoleErrors);
  });

  test('/dashboard/financial hub tiles navigate to each claimed path', async ({ page }) => {
    const { jwt } = await loginAs('Admin');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);

    await openScreen(page, '/dashboard/financial', jwt);

    for (const tile of FINANCIAL_HUB_TILES) {
      await expect(page.getByText(tile.title, { exact: true })).toBeVisible();
    }

    for (const tile of FINANCIAL_HUB_TILES) {
      await openScreen(page, '/dashboard/financial', jwt);
      await page.getByText(tile.title, { exact: true }).click();
      await expect
        .poll(() => normPath(new URL(page.url()).pathname), {
          message: `tile "${tile.title}" should navigate to ${tile.path}`,
          timeout: 15000,
        })
        .toBe(tile.path);
    }

    assertNoErrors(pageErrors, consoleErrors);
  });

  test('/dashboard/financial/overview empty state: summary cards and charts, no crash', async ({ page }) => {
    const { jwt } = await loginAs('Admin');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);

    await openScreen(page, '/dashboard/financial/overview', jwt);

    await expect(page.getByText('Total Balance', { exact: true })).toBeVisible();
    await expect(page.getByText('Plus Balance', { exact: true })).toBeVisible();
    await expect(page.getByText('Minus Balance', { exact: true })).toBeVisible();
    await expect(page.getByText('Timestamp', { exact: true })).toBeVisible();
    // Empty log → chart shell still mounts with this heading.
    await expect(page.getByRole('heading', { name: 'Total Balance vs BTC Price' })).toBeVisible();
    // BalanceBarChart returns null when data is empty (byBlockchain empty in this stack), so its title is absent.

    assertNoErrors(pageErrors, consoleErrors);
  });

  test('/dashboard/financial/live empty state: summary cards and balance chart, no crash', async ({ page }) => {
    const { jwt } = await loginAs('Admin');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);

    await openScreen(page, '/dashboard/financial/live', jwt);

    await expect(page.getByText('Total Balance', { exact: true })).toBeVisible();
    await expect(page.getByText('Plus Balance', { exact: true })).toBeVisible();
    await expect(page.getByText('Minus Balance', { exact: true })).toBeVisible();
    await expect(page.getByText('Timestamp', { exact: true })).toBeVisible();
    // BalanceBarChart returns null when data is empty (byType empty in this stack), so its title is absent.

    assertNoErrors(pageErrors, consoleErrors);
  });

  // Promise.all([getFinancialLog, getFinancialChanges]).then(...).finally(...) has no .catch
  // (dashboard-financial-history.screen.tsx). Empty success responses are expected with crons
  // disabled; assert no console/page error if the API returns empty entries cleanly.
  test('/dashboard/financial/history empty state: timeframe + chart titles, no crash', async ({ page }) => {
    const { jwt } = await loginAs('Admin');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);

    await openScreen(page, '/dashboard/financial/history', jwt);

    // Timeframe enum values: DAY='24h', THREE_DAYS='3D', WEEK='1W', MONTH='1M'
    await expect(page.getByRole('button', { name: '24h', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '3D', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '1W', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '1M', exact: true })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Income / Plus (cumulative)' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Expenses / Minus (cumulative)' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Net Total (cumulative)' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Total Balance vs BTC Price' })).toBeVisible();

    assertNoErrors(pageErrors, consoleErrors);
  });

  // Deepest nested route in the app. Promise.all without .catch in dashboard-financial-expenses.screen.tsx.
  test('/dashboard/financial/history/expenses empty state: expense charts and recipients table, no crash', async ({
    page,
  }) => {
    const { jwt } = await loginAs('Admin');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);

    await openScreen(page, '/dashboard/financial/history/expenses', jwt);

    await expect(page.getByRole('heading', { name: 'Referral Expenses (cumulative)' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Referral Recipients' })).toBeVisible();
    await expect(tableHeader(page, 'UserData ID')).toBeVisible();
    await expect(tableHeader(page, 'Payouts')).toBeVisible();
    await expect(tableHeader(page, 'Total (CHF)')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Binance Expenses (cumulative)' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Blockchain Expenses (cumulative)' })).toBeVisible();

    assertNoErrors(pageErrors, consoleErrors);
  });

  test('/dashboard/financial/liquidity empty state: total balance and liquidity chart, no crash', async ({ page }) => {
    const { jwt } = await loginAs('Admin');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);

    await openScreen(page, '/dashboard/financial/liquidity', jwt);

    await expect(page.getByText('Total Balance', { exact: true })).toBeVisible();
    // BalanceBarChart returns null when data is empty (byBlockchain empty in this stack), so its title is absent.

    assertNoErrors(pageErrors, consoleErrors);
  });

  test('/dashboard/financial/log-validity: forms render; non-existent log ID yields handled ErrorHint', async ({
    page,
  }) => {
    const { jwt } = await loginAs('Admin');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);

    await openScreen(page, '/dashboard/financial/log-validity', jwt);

    await expect(page.getByRole('heading', { name: 'By log ID' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'By financial range / threshold' })).toBeVisible();
    await expect(page.getByPlaceholder('1234')).toBeVisible();

    // No financial_log rows in this stack — do not seed via SQL; error path is the reliable write check.
    await page.getByPlaceholder('1234').fill('999999999');
    await page.getByRole('button', { name: 'Set valid = true' }).first().click();
    await expect(page.getByText(/Set validity of log/)).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(
      page.getByText('Something went wrong. Please try again. If the issue persists please reach out to our support.'),
    ).toBeVisible();

    assertNoErrors(pageErrors, consoleErrors);
  });
});
