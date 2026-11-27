/**
 * Staff-facing Support dashboard routes (useSupportDashboardGuard):
 *   /support/dashboard, /support/dashboard/all, /support/dashboard/create,
 *   /support/dashboard/issue/:id, /support/user/:id, /notes, /templates
 *
 * Covers role denial for plain customers, screen-specific render assertions, and write paths
 * (create issue, update state, staff reply, notes, templates, transfer of a support attachment into
 * the KYC file, staff reply with a file) verified in Postgres, the attachment preview and download, and
 * inserting a template into a reply.
 */

import type { Page, Response } from '@playwright/test';
import * as fs from 'fs';
import {
  apiDelete,
  apiGet,
  apiPost,
  decryptPii,
  expect,
  gotoWithSession,
  loginAs,
  normPath,
  openScreen,
  queryOne,
  required,
  test,
  waitForRow,
} from './fixtures';
import { cleanupCreatedData, createLimitRequest, createSupportIssue, createUser } from './fixtures/factories';

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

const MINIMAL_PDF_BASE64 =
  'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAzMDAgMTQ0XSA+PgplbmRvYmoKdHJhaWxlcgo8PCAvU2l6ZSA0IC9Sb290IDEgMCBSID4+CjsKJSVFT0YK';

const MINIMAL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function waitForMessageFile(
  page: Page,
  issueUid: string,
  messageId: number,
  access: 'View' | 'Download',
): Promise<Response> {
  return page.waitForResponse(
    (res) =>
      res.request().method() === 'GET' &&
      res.url().endsWith(`/support/issue/${issueUid}/message/${messageId}/file?access=${access}`),
  );
}

async function messageFileBase64(response: Response): Promise<string> {
  const { data } = (await response.json()) as { data: { data: number[] } };
  return Buffer.from(data.data).toString('base64');
}

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
    await expect(page.getByRole('heading', { name: 'Escalations' })).toBeVisible();

    await page.getByRole('button', { name: 'View all tickets' }).click();
    await waitForPath(page, '/support/dashboard/all', 'View all tickets should go to /support/dashboard/all');
  });

  test('/support/dashboard wait-tier filter survives reload', async ({ page }) => {
    const waitFilterKey = 'dfx.support.waitFilterHours';
    const { jwt } = await loginAs('Support');

    await openScreen(page, '/support/dashboard', jwt);
    await page.evaluate((key) => window.localStorage.removeItem(key), waitFilterKey);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Your support overview' })).toBeVisible();

    try {
      await expect(page.getByText('Customer waiting longer than 24h for a reply', { exact: true })).toBeVisible();

      // Label lives in its own span (`New` / `12h` / `24h`); matching that span exactly
      // avoids treating `12h` as a hit for `2h` or a concatenated accessible name.
      const twelveHourPill = page
        .getByText('Waiting longer than', { exact: true })
        .locator('xpath=following-sibling::div[1]')
        .getByRole('button')
        .filter({ has: page.locator('span', { hasText: /^12h$/ }) });
      await twelveHourPill.click();
      await expect(page.getByText('Customer waiting longer than 12h for a reply', { exact: true })).toBeVisible();

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: 'Your support overview' })).toBeVisible();
      await expect(page.getByText('Customer waiting longer than 12h for a reply', { exact: true })).toBeVisible();
    } finally {
      await page.evaluate((key) => window.localStorage.removeItem(key), waitFilterKey);
    }
  });

  test('/support/dashboard/all renders Open Issues, tabs, and action buttons', async ({ page }) => {
    const { jwt } = await loginAs('Support');

    await openScreen(page, '/support/dashboard/all', jwt);

    await expect(page.getByText('Open Issues', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Create Issue/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Templates' })).toBeVisible();

    // Tabs: Open / Limit Requests / OnHold / Canceled / Completed
    await expect(page.getByRole('button', { name: /^Open \(/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Limit Requests \(/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^OnHold \(/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Canceled \(/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Completed \(/ })).toBeVisible();
  });

  test('/support/dashboard/all Limit Requests tab lists a LimitRequest without Open type filter', async ({ page }) => {
    const created = await createLimitRequest({ tag: 'supdash-limit-tab' });
    const issueRow = created.supportIssueId
      ? await queryOne<{ id: number; name: string }>(`SELECT id, name FROM support_issue WHERE id = $1`, [
          created.supportIssueId,
        ])
      : await queryOne<{ id: number; name: string }>(`SELECT id, name FROM support_issue WHERE uid = $1`, [
          required(created.supportIssueUid, 'createLimitRequest must return supportIssueId or supportIssueUid'),
        ]);
    const issue = required(issueRow, 'createLimitRequest must leave a support_issue row');

    // Customer LimitRequests are filed under Department.Compliance. Support's issue list is
    // restricted to Department.Support, so this listing uses Compliance (who can open the dashboard).
    const { jwt } = await loginAs('Compliance');
    await openScreen(page, '/support/dashboard/all', jwt);

    await page.getByRole('button', { name: /^Limit Requests \(/ }).click();
    await expect(page.getByText(issue.name, { exact: true })).toBeVisible({ timeout: 15000 });
  });

  // The internal limit-request mail no longer carries the customer's source of funds (DFXswiss/backend#6279);
  // compliance reads it on the issue screen.
  test("/support/dashboard/issue/:id shows the source of funds of a limit request in the customer's words", async ({
    page,
  }) => {
    const fundOriginText = `Salary from ten years of work ${Date.now()}`;
    const created = await createLimitRequest({ tag: 'supdash-limit-origin', fundOriginText });
    const issueId = required(
      created.supportIssueId ??
        (
          await queryOne<{ id: number }>(`SELECT id FROM support_issue WHERE uid = $1`, [
            required(created.supportIssueUid, 'createLimitRequest must return supportIssueId or supportIssueUid'),
          ])
        )?.id,
      'createLimitRequest must leave a support_issue row',
    );

    const { jwt } = await loginAs('Compliance');
    await openScreen(page, `/support/dashboard/issue/${issueId}`, jwt);

    const row = page.getByRole('row').filter({ has: page.getByText('Fund Origin Details:', { exact: true }) });
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row.getByText(fundOriginText, { exact: true })).toBeVisible();
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
    const customerMail = required(customer.mail, 'created customer must have a mail address');
    const search = page.getByPlaceholder('Search by name, email, ID, IBAN...');
    await search.fill(customerMail);
    // Debounced search (~400ms); result buttons include mail and "ID: <userDataId>".
    const resultBtn = page
      .getByRole('button')
      .filter({ hasText: customerMail })
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
    const beforeState = required(before, 'seeded support_issue row must exist').state;
    const targetState = beforeState === 'Pending' ? 'Completed' : 'Pending';
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

    // Staff reply via this screen's message form (Send button; Cmd/Ctrl+Enter also works).
    const staffReply = `E2E staff reply ${Date.now()}`;
    const msgBox = page.getByPlaceholder('Type a message... (Enter = neue Zeile, Cmd/Ctrl+Enter = senden)');
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

    // Second reply via keyboard: Enter = newline (must not persist); Cmd/Ctrl+Enter sends.
    const staffReplyKeyboard = `E2E staff reply keyboard ${Date.now()}`;
    await msgBox.fill(staffReplyKeyboard);
    await msgBox.press('Enter');
    await expect
      .poll(
        async () =>
          queryOne<{ id: number }>(`SELECT id FROM support_message WHERE "issueId" = $1 AND message = $2 LIMIT 1`, [
            issueId,
            staffReplyKeyboard,
          ]),
        { message: 'Enter must not create a support_message row', timeout: 3000 },
      )
      .toBeUndefined();

    await msgBox.press('Meta+Enter');
    const keyboardReplyRow = await waitForRow<{ id: number; message: string; issueId: number }>(
      `SELECT id, message, "issueId" AS "issueId"
       FROM support_message
       WHERE "issueId" = $1 AND message = $2
       LIMIT 1`,
      [issueId, staffReplyKeyboard],
      20000,
    );
    expect(keyboardReplyRow.issueId).toBe(issueId);
    expect(keyboardReplyRow.message).toBe(staffReplyKeyboard);
  });

  test('/support/dashboard/issue/:id transfers an umlaut-named attachment into the KYC file', async ({ page }) => {
    const { jwt } = await loginAs('Compliance');
    const customer = await createUser({ tag: 'supdash-kyc-cust', language: 'EN' });
    const attachmentName = 'Gesellschafterliste Zürich Ä.pdf';
    const seeded = await createSupportIssue(customer.jwt, {
      tag: 'supdash-kyc-seed',
      type: 'GenericIssue',
      name: 'Umlaut attachment transfer seed',
      message: 'Customer uploaded the company shareholder list.',
      file: `data:application/pdf;base64,${MINIMAL_PDF_BASE64}`,
      fileName: attachmentName,
    });
    const issueId = required(seeded.supportIssueId, 'createSupportIssue must return the issue id');
    const messageId = required(seeded.messageId, 'createSupportIssue must return the attachment message id');

    await openScreen(page, `/support/dashboard/issue/${issueId}`, jwt);

    const messagesPanel = page.locator('div.bg-white.rounded-lg.shadow-sm.p-4').filter({
      has: page.getByRole('heading', { name: /Messages/ }),
    });
    const seededMessage = 'Customer uploaded the company shareholder list.';
    await expect(messagesPanel.getByText(seededMessage)).toBeVisible({ timeout: 15000 });
    const attachmentButton = page.getByRole('button', {
      name: new RegExp(`${attachmentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
    });
    await expect(attachmentButton).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Transfer to KYC file', exact: true }).click();
    await expect(page.getByPlaceholder('Document title')).toBeVisible();
    await page.getByPlaceholder('Document title').fill('Gesellschafterliste');
    await messagesPanel.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(messagesPanel.getByText(/^In KYC file:/)).toBeVisible({ timeout: 20000 });
    await expect(messagesPanel.getByRole('button', { name: 'Transfer to KYC file', exact: true })).toHaveCount(0);

    const message = await waitForRow<{
      kycFileId: number | null;
      kycFileName: string | null;
      fileUrl: string | null;
      kycUserDataId: number | null;
    }>(
      `SELECT "kycFileId" AS "kycFileId", k.name AS "kycFileName", m."fileUrl" AS "fileUrl",
              k."userDataId" AS "kycUserDataId"
       FROM support_message m
       LEFT JOIN kyc_file k ON k.id = m."kycFileId"
       WHERE m.id = $1 AND m."kycFileId" IS NOT NULL`,
      [messageId],
      20000,
    );
    expect(message.kycFileId, 'the attachment must be linked to a real kyc_file row').toBeTruthy();
    expect(message.kycFileName).toMatch(/^\d{8}_\d{6}-gesellschafterliste-\d+\.pdf$/);
    expect(decryptPii(message.fileUrl)).toContain(encodeURIComponent(attachmentName));
    expect(message.kycUserDataId, 'the KYC file must belong to the seeded customer').toBe(customer.userDataId);

    const thread = await apiGet<{
      messages: { id: number; fileName?: string; kycFileId?: number; kycFileName?: string }[];
    }>(`support/issue/${seeded.uid}`, { jwt });
    const transferred = required(
      thread.messages.find((m) => m.id === messageId),
      'the real issue thread must still contain the attachment message',
    );
    expect(transferred.fileName?.endsWith(attachmentName)).toBe(true);
    expect(transferred.kycFileId).toBe(message.kycFileId);
    expect(transferred.kycFileName).toBe(message.kycFileName);
  });

  // FilePreviewPanel embeds a PDF and leaves saving to the browser's PDF toolbar, so only other formats
  // get a Download button; the next test downloads an image.
  test('/support/dashboard/issue/:id previews a PDF attachment', async ({ page }) => {
    const { jwt } = await loginAs('Compliance');
    const customer = await createUser({ tag: 'supdash-pdf-cust', language: 'EN' });
    const attachmentName = `e2e-preview-${Date.now()}.pdf`;
    const seeded = await createSupportIssue(customer.jwt, {
      tag: 'supdash-pdf-seed',
      type: 'GenericIssue',
      name: 'PDF preview seed',
      message: 'Customer uploaded a PDF.',
      file: `data:application/pdf;base64,${MINIMAL_PDF_BASE64}`,
      fileName: attachmentName,
    });
    const messageId = required(seeded.messageId, 'createSupportIssue must return the attachment message id');

    await openScreen(page, `/support/dashboard/issue/${seeded.supportIssueId}`, jwt);

    await expect(page.getByRole('heading', { name: 'File Preview', exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Click a file to preview', { exact: true })).toBeVisible();

    const attachmentButton = page.getByRole('button').filter({ hasText: attachmentName });
    await expect(attachmentButton).toBeVisible({ timeout: 15000 });
    const storedName = (await attachmentButton.innerText()).trim();

    const viewResponse = waitForMessageFile(page, seeded.uid, messageId, 'View');
    await attachmentButton.click();
    expect(await messageFileBase64(await viewResponse)).toBe(MINIMAL_PDF_BASE64);

    // The stored name replaces the panel label.
    await expect(page.getByRole('heading', { name: storedName, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'File Preview', exact: true })).toHaveCount(0);
    await expect(page.locator('embed[type="application/pdf"]')).toHaveAttribute('src', /^blob:/);
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toHaveCount(0);
  });

  test('/support/dashboard/issue/:id previews and downloads an image attachment', async ({ page }) => {
    const { jwt } = await loginAs('Compliance');
    const customer = await createUser({ tag: 'supdash-img-cust', language: 'EN' });
    const attachmentName = `e2e-preview-${Date.now()}.png`;
    const seeded = await createSupportIssue(customer.jwt, {
      tag: 'supdash-img-seed',
      type: 'GenericIssue',
      name: 'Image preview seed',
      message: 'Customer uploaded an image.',
      file: `data:image/png;base64,${MINIMAL_PNG_BASE64}`,
      fileName: attachmentName,
    });
    const messageId = required(seeded.messageId, 'createSupportIssue must return the attachment message id');

    await openScreen(page, `/support/dashboard/issue/${seeded.supportIssueId}`, jwt);

    const attachmentButton = page.getByRole('button').filter({ hasText: attachmentName });
    await expect(attachmentButton).toBeVisible({ timeout: 15000 });
    const storedName = (await attachmentButton.innerText()).trim();
    expect(storedName.endsWith(attachmentName)).toBe(true);

    const viewResponse = waitForMessageFile(page, seeded.uid, messageId, 'View');
    await attachmentButton.click();
    await viewResponse;
    await expect(page.getByRole('heading', { name: storedName, exact: true })).toBeVisible();
    const image = page.getByRole('img', { name: storedName, exact: true });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);

    // The download is its own audited API call, not a save of the preview blob.
    const downloadResponse = waitForMessageFile(page, seeded.uid, messageId, 'Download');
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    await downloadResponse;
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(storedName);
    expect(fs.readFileSync(await download.path()).toString('base64')).toBe(MINIMAL_PNG_BASE64);
  });

  test('/support/dashboard/issue/:id inserts a template resolved with the customer data', async ({ page }) => {
    const { jwt } = await loginAs('Support');
    const customer = await createUser({ tag: 'supdash-tmpl-cust', language: 'EN' });
    const customerMail = required(customer.mail, 'created customer must have a mail address');
    const seeded = await createSupportIssue(customer.jwt, {
      tag: 'supdash-tmpl-seed',
      type: 'GenericIssue',
      name: 'Template insert seed',
      message: 'Customer message for the template test',
    });
    const templateName = `E2E insert template ${Date.now()}`;
    // German only: the picker falls back to it for every customer language.
    const template = await apiPost<{ id: number }>(
      'support/template',
      {
        name: templateName,
        contents: { de: 'Konto $userData.id, Mail $userData.mail, Ticket $issue.uid' },
      },
      { jwt },
    );

    try {
      await openScreen(page, `/support/dashboard/issue/${seeded.supportIssueId}`, jwt);

      const msgBox = page.getByPlaceholder('Type a message... (Enter = neue Zeile, Cmd/Ctrl+Enter = senden)');
      await expect(msgBox).toBeVisible({ timeout: 15000 });
      await expect(msgBox).toHaveValue('');

      // userData.id and userData.mail come from getUserData(accountId); the issue payload carries no mail.
      const resolved = `Konto ${customer.userDataId}, Mail ${customerMail}, Ticket ${seeded.uid}`;
      const pickerTitle = page.getByText('Vorlage auswählen', { exact: true });

      const insertTemplate = async (): Promise<void> => {
        await page.getByTitle('Vorlage einfügen', { exact: true }).click();
        await expect(pickerTitle).toBeVisible({ timeout: 15000 });
        await page.getByPlaceholder('Vorlage suchen...').fill(templateName);
        await page.getByRole('button').filter({ hasText: templateName }).click();
        await page.getByRole('button', { name: 'Einfügen', exact: true }).click();
        await expect(pickerTitle).toHaveCount(0);
      };

      await insertTemplate();
      await expect(msgBox).toHaveValue(resolved);

      // The second opening reuses the loaded customer data and appends to the existing text.
      await insertTemplate();
      await expect(msgBox).toHaveValue(`${resolved}\n${resolved}`);
    } finally {
      await apiDelete(`support/template/${template.id}`, { jwt });
    }
  });

  test('/support/dashboard/issue/:id attaches, removes, re-attaches and sends the same file', async ({ page }) => {
    const { jwt } = await loginAs('Support');
    const customer = await createUser({ tag: 'supdash-file-cust', language: 'EN' });
    const seeded = await createSupportIssue(customer.jwt, {
      tag: 'supdash-file-seed',
      type: 'GenericIssue',
      name: 'Staff attachment seed',
      message: 'Customer message for the staff attachment test',
    });
    const issueId = seeded.supportIssueId;
    const fileName = `e2e-staff-file-${Date.now()}.pdf`;
    const file = {
      name: fileName,
      mimeType: 'application/pdf',
      buffer: Buffer.from(MINIMAL_PDF_BASE64, 'base64'),
    };

    await openScreen(page, `/support/dashboard/issue/${issueId}`, jwt);

    const messagesPanel = page.locator('div.bg-white.rounded-lg.shadow-sm.p-4').filter({
      has: page.getByRole('heading', { name: /Messages/ }),
    });
    const fileInput = messagesPanel.locator('input[type="file"]');
    const selectedFileCount = (): Promise<number> =>
      fileInput.evaluate((input: HTMLInputElement) => input.files?.length ?? -1);
    const chip = messagesPanel.locator('span.truncate').filter({ hasText: fileName });
    const sendButton = messagesPanel.getByRole('button', { name: 'Send', exact: true });

    await fileInput.setInputFiles(file);
    await expect(chip).toHaveText(fileName);
    expect(await selectedFileCount()).toBe(1);

    await chip.locator('xpath=following-sibling::button').click();
    await expect(chip).toHaveCount(0);
    // setInputFiles always dispatches change, while a browser stays silent when the input still holds the
    // same file. The emptied input is therefore the proof that a visitor can choose the file again.
    await expect.poll(selectedFileCount, { message: 'removing the file must empty the file input' }).toBe(0);

    await fileInput.setInputFiles(file);
    await expect(chip).toHaveCount(1);

    const staffMessage = `E2E staff attachment ${Date.now()}`;
    await page.getByPlaceholder('Type a message... (Enter = neue Zeile, Cmd/Ctrl+Enter = senden)').fill(staffMessage);
    await expect(sendButton).toBeEnabled({ timeout: 15000 });
    await sendButton.click();

    const row = await waitForRow<{ issueId: number; message: string; fileUrl: string | null }>(
      `SELECT "issueId" AS "issueId", message, "fileUrl" AS "fileUrl"
       FROM support_message
       WHERE "issueId" = $1 AND message = $2
       LIMIT 1`,
      [issueId, staffMessage],
      20000,
    );
    expect(row.issueId).toBe(issueId);
    expect(row.message).toBe(staffMessage);
    expect(decryptPii(row.fileUrl)).toContain(fileName);

    await expect(messagesPanel.getByText(staffMessage, { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(chip).toHaveCount(0);
    await expect.poll(selectedFileCount, { message: 'sending must empty the file input' }).toBe(0);
    expect(await fileInput.inputValue()).toBe('');

    await fileInput.setInputFiles(file);
    await expect(chip).toHaveText(fileName);
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
