/**
 * Staff-facing Support dashboard routes (useSupportDashboardGuard):
 *   /support/dashboard, /support/dashboard/all, /support/dashboard/create,
 *   /support/dashboard/issue/:id, /support/user/:id, /notes, /templates
 *
 * Covers role denial for plain customers, screen-specific render assertions, and write paths
 * (create issue, update state, staff reply, notes, templates) verified in Postgres.
 */

import type { Page } from '@playwright/test';
import { apiGet, expect, gotoWithSession, loginAs, openScreen, queryOne, test, waitForRow } from './fixtures';
import { cleanupCreatedData, createSupportIssue, createUser } from './fixtures/factories';

function normPath(p: string): string {
  return p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p;
}

const STAFF_ROUTES = [
  '/support/dashboard',
  '/support/dashboard/all',
  '/support/dashboard/create',
  '/support/dashboard/issue/1',
  '/support/user/1',
  '/notes',
  '/templates',
] as const;

/** Required denial coverage from the task brief (plus the rest for completeness). */
const EXPLICIT_DENIAL_ROUTES = ['/support/dashboard', '/notes', '/templates', '/support/user/1'] as const;

async function waitForPath(page: Page, expected: string, message: string, timeout = 15000): Promise<void> {
  await expect.poll(() => normPath(new URL(page.url()).pathname), { message, timeout }).toBe(normPath(expected));
}

test.describe.configure({ mode: 'serial' });

test.describe('Support dashboard (staff)', () => {
  test.afterAll(async () => {
    await cleanupCreatedData();
  });

  test('plain customer is denied all staff support routes', async ({ page }) => {
    const customer = await createUser({ tag: 'supdash-deny', language: 'EN' });

    for (const target of STAFF_ROUTES) {
      await gotoWithSession(page, target, customer.jwt);
      await page.waitForLoadState('networkidle');
      await expect
        .poll(() => normPath(new URL(page.url()).pathname), {
          message: `User role must be redirected away from ${target}`,
          timeout: 15000,
        })
        .toBe('/');
    }

    // Explicit re-check of the four routes named in the task brief.
    for (const target of EXPLICIT_DENIAL_ROUTES) {
      await gotoWithSession(page, target, customer.jwt);
      await page.waitForLoadState('networkidle');
      await expect
        .poll(() => normPath(new URL(page.url()).pathname), {
          message: `explicit denial for ${target}`,
          timeout: 15000,
        })
        .toBe('/');
    }
  });

  // Redirect-only coverage (above) proves the FRONTEND guard (useSupportDashboardGuard) reacts
  // to the role claim it decodes from the JWT itself; it says nothing about the server. This
  // call proves the server's own RoleGuard(Support) also rejects a plain, logged-in User for the
  // same area, independently of whatever the frontend does.
  test('plain User role is denied the underlying support API, not just the frontend route', async () => {
    const { jwt } = await loginAs('User');
    let status: number | undefined;
    await apiGet('support', { jwt, expectOk: false, onStatus: (s) => (status = s) });
    expect(status, 'GET /v1/support must reject a plain User role').toBe(403);
  });

  test('/support/dashboard overview renders and navigates to all tickets', async ({ page }) => {
    const { jwt } = await loginAs('Support');

    await openScreen(page, '/support/dashboard', jwt);

    await expect(page.getByRole('heading', { name: 'Your support overview' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'View all tickets' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Limit requests' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'My tickets' })).toBeVisible();
    // Waiting / Escalations section title depends on the selected wait tier (default 24h → Escalations).
    await expect(page.getByRole('heading', { name: /^(Waiting tickets|Escalations)$/ })).toBeVisible();

    await page.getByRole('button', { name: 'View all tickets' }).click();
    await waitForPath(page, '/support/dashboard/all', 'View all tickets should go to /support/dashboard/all');
  });

  test('/support/dashboard/all renders Open Issues, tabs, and action buttons', async ({ page }) => {
    const { jwt } = await loginAs('Support');

    await openScreen(page, '/support/dashboard/all', jwt);

    await expect(page.getByText('Open Issues', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Create Issue/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Templates' })).toBeVisible();

    // Tabs: Open / OnHold / Canceled / Completed
    await expect(page.getByRole('button', { name: /^Open \(/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^OnHold \(/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Canceled \(/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Completed \(/ })).toBeVisible();
  });

  test('/support/dashboard/create creates an issue for a searched customer', async ({ page }) => {
    const { jwt } = await loginAs('Support');
    const customer = await createUser({ tag: 'supdash-create-cust', language: 'EN' });
    expect(customer.mail, 'createUser must set mail for customer search').toBeTruthy();
    const issueTitle = 'E2E dashboard-created issue';
    const issueMessage = 'Created by staff via dashboard create form';

    await openScreen(page, '/support/dashboard/create', jwt);

    await expect(page.getByText('Customer *', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Search by name, email, ID, IBAN...')).toBeVisible();
    await expect(page.getByText('Issue Title *', { exact: true })).toBeVisible();

    // Search by mail (and fall back to userDataId string) — both match support search keys.
    const search = page.getByPlaceholder('Search by name, email, ID, IBAN...');
    await search.fill(customer.mail!);
    // Debounced search (~400ms); result buttons include mail and "ID: <userDataId>".
    const resultBtn = page
      .getByRole('button')
      .filter({ hasText: customer.mail! })
      .or(page.getByRole('button').filter({ hasText: `ID: ${customer.userDataId}` }))
      .first();
    await expect(resultBtn).toBeVisible({ timeout: 15000 });
    await resultBtn.click();

    // Confirm selection chip.
    await expect(page.getByText(`ID: ${customer.userDataId}`)).toBeVisible();

    // Type/Reason option values are the SupportIssueType / SupportIssueReason enum strings.
    await page
      .getByText('Type *', { exact: true })
      .locator('xpath=following-sibling::select')
      .selectOption('GenericIssue');
    await page.getByText('Reason *', { exact: true }).locator('xpath=following-sibling::select').selectOption('Other');

    await page.getByPlaceholder('Issue title').fill(issueTitle);
    await page.getByPlaceholder('Describe the issue...').fill(issueMessage);

    const createBtn = page.getByRole('button', { name: 'Create', exact: true });
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    await waitForPath(page, '/support/dashboard', 'create should navigate to dashboard overview', 20000);

    const row = await waitForRow<{
      id: number;
      name: string;
      type: string;
      userDataId: number;
    }>(
      `SELECT id, name, type, "userDataId" AS "userDataId"
       FROM support_issue
       WHERE name = $1 AND "userDataId" = $2
       ORDER BY id DESC
       LIMIT 1`,
      [issueTitle, customer.userDataId],
      20000,
    );
    expect(row.type).toBe('GenericIssue');
    expect(row.userDataId).toBe(customer.userDataId);

    // Initial staff message should also be stored.
    const msg = await waitForRow<{ message: string }>(
      `SELECT message FROM support_message WHERE "issueId" = $1 AND message = $2 LIMIT 1`,
      [row.id, issueMessage],
      15000,
    );
    expect(msg.message).toBe(issueMessage);
  });

  test('/support/dashboard/issue/:id updates state and sends a staff reply', async ({ page }) => {
    const { jwt } = await loginAs('Support');
    const customer = await createUser({ tag: 'supdash-issue-cust', language: 'EN' });
    const seeded = await createSupportIssue(customer.jwt, {
      tag: 'supdash-issue-seed',
      type: 'GenericIssue',
      name: 'Dashboard detail seed',
      message: 'Initial customer message for detail screen',
    });

    const issueId =
      seeded.supportIssueId ??
      (await queryOne<{ id: number }>(`SELECT id FROM support_issue WHERE uid = $1`, [seeded.uid]))?.id;
    expect(issueId, 'seeded issue id required').toBeTruthy();

    const before = await queryOne<{ state: string }>(`SELECT state FROM support_issue WHERE id = $1`, [issueId]);
    expect(before?.state).toBeTruthy();

    await openScreen(page, `/support/dashboard/issue/${issueId}`, jwt);

    await expect(page.getByText('Update Issue', { exact: true })).toBeVisible();
    await expect(page.getByText('Issue Details', { exact: true })).toBeVisible();
    await expect(page.getByText('Account Data', { exact: true })).toBeVisible();
    await expect(page.getByText(String(issueId), { exact: true }).first()).toBeVisible();

    // Change state to a different internal state. The <select>'s options come from the frontend's
    // bundled SupportIssueInternalState enum (@dfx.swiss/core, currently only Created/Pending/
    // Completed/Canceled — narrower than the 7-value backend enum in api/src/.../support-issue.enum.ts,
    // a real cross-package version skew), so only these four are ever actually selectable here.
    // Form uses <label>State</label><select> — InfoRow uses "State:" in a <td>, so label is unique.
    const targetState = before!.state === 'Pending' ? 'Completed' : 'Pending';
    await page
      .locator('label')
      .filter({ hasText: /^State$/ })
      .locator('xpath=following-sibling::select')
      .selectOption(targetState);
    await page.getByRole('button', { name: 'Update', exact: true }).click();

    const updated = await waitForRow<{ state: string }>(
      `SELECT state FROM support_issue WHERE id = $1 AND state = $2`,
      [issueId, targetState],
      15000,
    );
    expect(updated.state).toBe(targetState);

    // Staff reply via this screen's message form (Send button; Enter also works).
    const staffReply = `E2E staff reply ${Date.now()}`;
    const msgBox = page.getByPlaceholder('Type a message... (Shift+Enter = neue Zeile, Enter = senden)');
    await expect(msgBox).toBeVisible();
    await msgBox.fill(staffReply);
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    const replyRow = await waitForRow<{ id: number; message: string; issueId: number }>(
      `SELECT id, message, "issueId" AS "issueId"
       FROM support_message
       WHERE "issueId" = $1 AND message = $2
       LIMIT 1`,
      [issueId, staffReply],
      20000,
    );
    expect(replyRow.issueId).toBe(issueId);
    expect(replyRow.message).toBe(staffReply);
  });

  test('/support/user/:id loads the customer email for staff', async ({ page }) => {
    const { jwt } = await loginAs('Support');
    const mail = `e2e+supdash-user-${Date.now()}@dfx.swiss`;
    const customer = await createUser({ tag: 'supdash-user', language: 'EN', mail });

    await openScreen(page, `/support/user/${customer.userDataId}`, jwt);

    // UserDataPanel personal-data rows: key "mail" + the value we set.
    await expect(page.getByText(mail, { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('mail', { exact: true }).first()).toBeVisible();
    // Tab strip is unique to this user detail screen (Transactions tab always present).
    await expect(page.getByRole('button', { name: /Transactions/ })).toBeVisible();
  });

  test('/notes creates a support_note via NoteComposer', async ({ page }) => {
    const { jwt } = await loginAs('Support');
    const subject = `E2E note subject ${Date.now()}`;
    const content = `E2E note content body ${Date.now()}`;

    await openScreen(page, '/notes', jwt);

    await expect(page.getByRole('button', { name: '+ Neue Notiz' })).toBeVisible();
    await page.getByRole('button', { name: '+ Neue Notiz' }).click();

    await expect(page.getByPlaceholder('Neue Notiz...')).toBeVisible();
    // Support role: no department selector (Admin-only).
    await expect(page.locator('select').filter({ hasText: '— Department —' })).toHaveCount(0);

    await page.getByPlaceholder('Betreff (optional)').fill(subject);
    await page.getByPlaceholder('Neue Notiz...').fill(content);
    await page.getByRole('button', { name: 'Notiz speichern' }).click();

    const note = await waitForRow<{ id: number; subject: string; content: string }>(
      `SELECT id, subject, content FROM support_note WHERE content = $1 ORDER BY id DESC LIMIT 1`,
      [content],
      15000,
    );
    expect(note.content).toBe(content);
    expect(note.subject).toBe(subject);
  });

  test('/templates creates a support_issue_template via TemplateComposer', async ({ page }) => {
    const { jwt } = await loginAs('Support');
    const name = `E2E Vorlage ${Date.now()}`;
    const contentDe = `Guten Tag $userData.firstname – E2E template ${Date.now()}`;

    await openScreen(page, '/templates', jwt);

    await expect(page.getByRole('button', { name: '+ Neue Vorlage' })).toBeVisible();
    await expect(page.getByText('Hilfe zur Platzhalter-Syntax')).toBeVisible();

    await page.getByRole('button', { name: '+ Neue Vorlage' }).click();

    await expect(page.getByPlaceholder('Name der Vorlage')).toBeVisible();
    await page.getByPlaceholder('Name der Vorlage').fill(name);
    await page.getByPlaceholder('Inhalt auf Deutsch – Platzhalter wie $userData.firstname einfügen').fill(contentDe);

    await page.getByRole('button', { name: 'Vorlage speichern' }).click();

    const tmpl = await waitForRow<{ id: number; name: string; contentDe: string }>(
      `SELECT id, name, "contentDe" AS "contentDe"
       FROM support_issue_template
       WHERE name = $1
       ORDER BY id DESC
       LIMIT 1`,
      [name],
      15000,
    );
    expect(tmpl.name).toBe(name);
    expect(tmpl.contentDe).toBe(contentDe);
  });
});
