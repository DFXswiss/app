/**
 * Customer-facing Support routes:
 *   /support, /support/tickets, /support/issue, /support/chat, /support/chat/:id
 *
 * Covers screen rendering under a plain customer role, ticket create + chat write paths
 * through the real UI (Postgres verification), empty-list redirect, and cross-customer isolation.
 */

import type { Page } from '@playwright/test';
import {
  expect,
  gotoWithSession,
  openScreen,
  queryOne,
  test,
  waitForRow,
} from './fixtures';
import { cleanupCreatedData, createSupportIssue, createUser } from './fixtures/factories';

function normPath(p: string): string {
  return p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p;
}

/**
 * Open a StyledDropdown by its field label, then pick an option by visible label text.
 *
 * StyledDropdown (@dfx.swiss/react-components) renders:
 *   <div class="relative ...">                      <- field container
 *     <div class="flex items-center ...">            <- label wrapper
 *       <label>{fieldLabel}</label>
 *     </div>
 *     <button id="dropDownButton">...</button>        <- sibling of the LABEL WRAPPER, not of <label>
 *     {isOpen && <div>...option buttons...</div>}      <- also a sibling, appears once opened
 *   </div>
 * The openable button is therefore two DOM levels up from the label text node (label -> label
 * wrapper -> field container), not a direct following-sibling of the label itself. `#dropDownButton`
 * is reused verbatim across every dropdown instance on the page, so it must stay scoped to this
 * field's container.
 */
async function selectStyledDropdown(page: Page, fieldLabel: string, optionLabel: string): Promise<void> {
  const fieldContainer = page.getByText(fieldLabel, { exact: true }).locator('xpath=../..');
  await fieldContainer.locator('#dropDownButton').click();
  await fieldContainer.getByRole('button', { name: optionLabel, exact: true }).click();
}

test.describe.configure({ mode: 'serial' });

test.describe('Support (customer)', () => {
  test.afterAll(async () => {
    await cleanupCreatedData();
  });

  test('/support renders FAQ and Support tickets tiles', async ({ page }) => {
    const user = await createUser({ tag: 'sup-hub', language: 'EN' });

    await openScreen(page, '/support', user.jwt);

    await expect(page.getByText('FAQ', { exact: true })).toBeVisible();
    await expect(page.getByText('Support tickets', { exact: true })).toBeVisible();
    await expect(page.getByText('View tickets', { exact: true })).toBeVisible();
    await expect(page.getByText('Search now', { exact: true })).toBeVisible();
  });

  test('/support/tickets with zero tickets redirects to /support/issue', async ({ page }) => {
    const user = await createUser({ tag: 'sup-tickets-empty', language: 'EN' });

    await gotoWithSession(page, '/support/tickets', user.jwt);
    await page.waitForLoadState('networkidle');

    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'empty ticket list should redirect to /support/issue',
        timeout: 15000,
      })
      .toBe('/support/issue');
  });

  test('/support/tickets lists seeded tickets for the owner only', async ({ page }) => {
    const owner = await createUser({ tag: 'sup-tickets-owner', language: 'EN' });
    const other = await createUser({ tag: 'sup-tickets-other', language: 'EN' });

    await createSupportIssue(owner.jwt, {
      tag: 'sup-tickets-a',
      type: 'GenericIssue',
      name: 'Owner generic ticket',
      message: 'Owner ticket body A',
    });
    await createSupportIssue(owner.jwt, {
      tag: 'sup-tickets-b',
      type: 'BugReport',
      name: 'Owner bug ticket',
      message: 'Owner ticket body B',
    });
    await createSupportIssue(other.jwt, {
      tag: 'sup-tickets-other',
      type: 'KycIssue',
      name: 'Other customer KYC ticket',
      message: 'Must not appear in owner list',
    });

    await openScreen(page, '/support/tickets', owner.jwt);

    // Ticket rows show translated type labels, not the free-text name.
    await expect(page.getByText('Generic issue', { exact: true })).toBeVisible();
    await expect(page.getByText('Bug report', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create ticket' })).toBeVisible();
    // Other customer's type must not leak into this customer's list.
    await expect(page.getByText('KYC issue', { exact: true })).toHaveCount(0);

    // Table structure unique to this screen. The header cells combine two labels ("Issue type" +
    // "Reason", "Created on" + "State") as sibling text nodes inside one <th>, so an exact-text
    // match on either label alone never matches; a role-based columnheader search with a
    // (default substring) name match does.
    await expect(page.getByRole('columnheader', { name: 'Issue type' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Created on' })).toBeVisible();
  });

  test('/support/issue creates GenericIssue + message via UI and lands in chat', async ({ page }) => {
    const user = await createUser({ tag: 'sup-issue-create', language: 'EN' });
    const issueName = 'E2E support issue name';
    const issueMessage = 'E2E support issue description body';

    await openScreen(page, '/support/issue', user.jwt);

    await expect(page.getByText('Issue type', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();

    await selectStyledDropdown(page, 'Issue type', 'Generic issue');

    // Name + Description are required for GenericIssue / Other (reason auto-defaults when only one reason).
    // StyledInput: label is a sibling of a wrapper that holds the input/textarea.
    await page.getByPlaceholder('John Doe').fill(issueName);
    await page
      .getByText('Description', { exact: true })
      .locator('xpath=ancestor::*[.//textarea][1]//textarea')
      .fill(issueMessage);

    const next = page.getByRole('button', { name: 'Next' });
    await expect(next).toBeEnabled({ timeout: 10000 });
    await next.click();

    // Success navigates to /support/chat/:uid, which immediately replace-navigates to /support/chat.
    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'creating an issue should navigate into the chat flow',
        timeout: 20000,
      })
      .toBe('/support/chat');

    const issue = await waitForRow<{
      id: number;
      uid: string;
      name: string;
      type: string;
      reason: string;
      userDataId: number;
    }>(
      `SELECT id, uid, name, type, reason, "userDataId" AS "userDataId"
       FROM support_issue
       WHERE name = $1 AND "userDataId" = $2
       ORDER BY id DESC
       LIMIT 1`,
      [issueName, user.userDataId],
      20000,
    );

    expect(issue.type).toBe('GenericIssue');
    expect(issue.reason).toBe('Other');
    expect(issue.userDataId).toBe(user.userDataId);

    const msg = await waitForRow<{ id: number; message: string; issueId: number }>(
      `SELECT id, message, "issueId" AS "issueId"
       FROM support_message
       WHERE "issueId" = $1 AND message = $2
       LIMIT 1`,
      [issue.id, issueMessage],
      15000,
    );
    expect(msg.issueId).toBe(issue.id);

    // Seeded message should render in the chat UI after create.
    await expect(page.getByText(issueMessage)).toBeVisible({ timeout: 15000 });
  });

  test('/support/chat/:id and /support/chat load conversation and accept a new message', async ({ page }) => {
    const user = await createUser({ tag: 'sup-chat', language: 'EN' });
    const seededMessage = 'E2E seeded chat message alpha';
    const replyText = 'E2E customer chat reply beta';

    const issue = await createSupportIssue(user.jwt, {
      tag: 'sup-chat-seed',
      type: 'GenericIssue',
      name: 'Chat seed ticket',
      message: seededMessage,
    });

    const issueId =
      issue.supportIssueId ??
      (
        await queryOne<{ id: number }>(`SELECT id FROM support_issue WHERE uid = $1`, [issue.uid])
      )?.id;
    expect(issueId, 'seeded support_issue must have a numeric id').toBeTruthy();

    // /support/chat/:id stores uid in session and replace-navigates to /support/chat.
    // Do not use openScreen here — final pathname is /support/chat, not /support/chat/:id.
    await gotoWithSession(page, `/support/chat/${issue.uid}`, user.jwt);
    await page.waitForLoadState('networkidle');

    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: '/support/chat/:id should replace-navigate to /support/chat',
        timeout: 15000,
      })
      .toBe('/support/chat');

    await expect(page.getByText(seededMessage)).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#message')).toBeVisible();

    // Cover the id-less route explicitly (session uid already stored).
    await openScreen(page, '/support/chat', user.jwt);
    await expect(page.getByText(seededMessage)).toBeVisible({ timeout: 15000 });

    // Send a new message through the real textarea (Enter submits).
    await page.locator('#message').fill(replyText);
    await page.locator('#message').press('Enter');

    await expect(page.getByText(replyText)).toBeVisible({ timeout: 15000 });

    const replyRow = await waitForRow<{ id: number; message: string; issueId: number }>(
      `SELECT id, message, "issueId" AS "issueId"
       FROM support_message
       WHERE "issueId" = $1 AND message = $2
       LIMIT 1`,
      [issueId, replyText],
      15000,
    );
    expect(replyRow.issueId).toBe(issueId);
    expect(replyRow.message).toBe(replyText);
  });

  test('customer B cannot open customer A ticket (chat isolation)', async ({ page }) => {
    const customerA = await createUser({ tag: 'sup-iso-a', language: 'EN' });
    const customerB = await createUser({ tag: 'sup-iso-b', language: 'EN' });

    const secretMessage = 'SECRET-A-ONLY-MESSAGE-do-not-leak';
    const issueA = await createSupportIssue(customerA.jwt, {
      tag: 'sup-iso-ticket',
      type: 'GenericIssue',
      name: 'Customer A private ticket',
      message: secretMessage,
    });

    // Customer B must not see A's ticket in their ticket list (empty → redirect to issue).
    await gotoWithSession(page, '/support/tickets', customerB.jwt);
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'customer B with zero own tickets should leave /support/tickets',
        timeout: 15000,
      })
      .toBe('/support/issue');
    await expect(page.getByText(secretMessage)).toHaveCount(0);

    // Direct deep-link to A's chat uid must be denied.
    await gotoWithSession(page, `/support/chat/${issueA.uid}`, customerB.jwt);
    await page.waitForLoadState('networkidle');

    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'customer B must be redirected away from customer A chat',
        timeout: 15000,
      })
      .toBe('/support/issue');

    await expect(page.getByText(secretMessage)).toHaveCount(0);
  });
});
