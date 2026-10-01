/**
 * Extra App2 full-stack coverage for KYC continuation, organization KYC steps,
 * customer support attachments/status, and the increase-limit request flow.
 * Browser actions use the built App2 bundle, real local API, and PostgreSQL.
 * External identity, mailbox delivery, and payment providers are not simulated as live.
 */

import { expect, gotoWithSession, test, waitForRow, withDb } from './fixtures';
import { cleanupCreatedData, createKycStep, createUser, e2eMail } from './fixtures/factories';

const TEST_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function openApp2(page: import('@playwright/test').Page, jwt: string, hash: string): Promise<void> {
  const response = await page.goto(`/app2/?session=${encodeURIComponent(jwt)}${hash}`);
  expect(response?.ok(), `App2 ${hash} should load`).toBe(true);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('dfx.authenticationToken'))).toBe(jwt);
}

async function seedPendingStep(
  userDataId: number,
  name: string,
): Promise<{ kycStepId: number }> {
  await withDb(async (client) => {
    await client.query(`UPDATE kyc_step SET status = 'Completed' WHERE "userDataId" = $1`, [userDataId]);
  });
  return createKycStep(userDataId, { name, status: 'InProgress', sequenceNumber: 900 });
}

async function waitForStepResult(userDataId: number, stepId: number): Promise<{ status: string; result: string }> {
  return waitForRow<{ status: string; result: string }>(
    `SELECT status, result FROM kyc_step WHERE id = $1 AND "userDataId" = $2 AND result IS NOT NULL`,
    [stepId, userDataId],
    20000,
  );
}

test.describe('App2 KYC, support, and limit continuation', () => {
  test.afterEach(async () => {
    await cleanupCreatedData();
  });

  test('KYC contact and personal forms validate, then resume the server-pending step after reload', async ({ page }) => {
    test.setTimeout(150000);
    const user = await createUser({ tag: 'app2-kyc-resume-validation', kycLevel: 0, language: 'EN' });
    await withDb(async (client) => {
      await client.query(`UPDATE user_data SET mail = NULL WHERE id = $1`, [user.userDataId]);
      await client.query(
        `UPDATE kyc_step SET status = 'NotStarted' WHERE "userDataId" = $1 AND name = 'ContactData'`,
        [user.userDataId],
      );
    });

    await openApp2(page, user.jwt, '#/kyc');
    await page.getByRole('button', { name: /start verification|continue/i }).click();
    const email = e2eMail('app2-kyc-resume');
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 20000 });
    await emailInput.fill('invalid-email');
    await expect(page.getByRole('button', { name: /^continue$/i })).toBeDisabled();
    await emailInput.fill(email);
    await page.getByRole('button', { name: /^continue$/i }).click();
    await expect(page.locator('input[autocomplete="given-name"]')).toBeVisible({ timeout: 30000 });

    // Refresh discards the in-memory form but the API still reports the actionable step.
    await page.reload();
    await expect(page.getByRole('button', { name: /^continue$/i })).toBeVisible({ timeout: 25000 });
    await page.getByRole('button', { name: /^continue$/i }).click();
    await expect(page.locator('input[autocomplete="given-name"]')).toBeVisible({ timeout: 30000 });

    const submit = page.getByRole('button', { name: /^continue$/i });
    await expect(submit).toBeDisabled();
    await page.locator('input[autocomplete="given-name"]').fill('ResumeFirst');
    await page.locator('input[autocomplete="family-name"]').fill('ResumeLast');
    await page.locator('input[autocomplete="street-address"]').fill('Bahnhofstrasse');
    await page.getByPlaceholder(/no\./i).fill('12');
    await page.locator('input[autocomplete="postal-code"]').fill('8001');
    await page.locator('input[autocomplete="address-level2"]').fill('Zurich');
    await page.getByRole('combobox', { name: /^country$/i }).selectOption({ label: 'Switzerland' });
    await page.locator('input[autocomplete="tel"]').fill('+41791234567');
    await expect(submit).toBeEnabled();
    await submit.click();

    const persisted = await waitForRow<{ mail: string; firstname: string; surname: string; street: string; zip: string }>(
      `SELECT mail, firstname, surname, street, zip FROM user_data
       WHERE id = $1 AND mail = $2 AND firstname = $3 AND surname = $4`,
      [user.userDataId, email, 'ResumeFirst', 'ResumeLast'],
      20000,
    );
    expect(persisted).toMatchObject({ mail: email, firstname: 'ResumeFirst', surname: 'ResumeLast', street: 'Bahnhofstrasse', zip: '8001' });
  });

  test('KYC nationality step submits the selected country through App2 and persists its review result', async ({ page }) => {
    const user = await createUser({ tag: 'app2-kyc-nationality', kycLevel: 0, language: 'EN' });
    const step = await seedPendingStep(user.userDataId, 'NationalityData');

    await openApp2(page, user.jwt, '#/kyc?auto-start=true');
    const country = page.getByRole('combobox').first();
    await expect(country).toBeVisible({ timeout: 30000 });
    await country.selectOption({ label: 'Switzerland' });
    await page.getByRole('button', { name: /^continue$/i }).click();

    const saved = await waitForStepResult(user.userDataId, step.kycStepId);
    expect(['Completed', 'InternalReview', 'ManualReview', 'Ignored']).toContain(saved.status);
    expect(JSON.parse(saved.result)).toMatchObject({ nationality: { symbol: 'CH' } });
  });

  test('KYC operational activity validates and records a local business answer in its step', async ({ page }) => {
    const user = await createUser({ tag: 'app2-kyc-operational', kycLevel: 0, language: 'EN' });
    const step = await seedPendingStep(user.userDataId, 'OperationalActivity');

    await openApp2(page, user.jwt, '#/kyc?auto-start=true');
    const selects = page.locator('select');
    await expect(selects.first()).toBeVisible({ timeout: 30000 });
    await selects.first().selectOption('false');
    await page.getByPlaceholder('https://…').fill('https://example.test/company');
    await page.getByRole('button', { name: /^continue$/i }).click();

    const saved = await waitForStepResult(user.userDataId, step.kycStepId);
    expect(['InternalReview', 'ManualReview', 'Completed']).toContain(saved.status);
    expect(JSON.parse(saved.result)).toMatchObject({ isOperational: false, websiteUrl: 'https://example.test/company' });
  });

  test('KYC legal entity document uploads in App2 and links the real file row to its step', async ({ page }) => {
    test.setTimeout(120000);
    const user = await createUser({ tag: 'app2-kyc-legal-file', kycLevel: 0, language: 'EN' });
    await withDb(async (client) => {
      await client.query(`UPDATE user_data SET "accountType" = 'Organization' WHERE id = $1`, [user.userDataId]);
    });
    const step = await seedPendingStep(user.userDataId, 'LegalEntity');

    await openApp2(page, user.jwt, '#/kyc?auto-start=true');
    await expect(page.locator('input[type="file"]')).toBeVisible({ timeout: 30000 });
    await page.locator('input[type="file"]').setInputFiles({
      name: 'app2-legal-register.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TEST_PNG_BASE64, 'base64'),
    });
    await page.getByRole('button', { name: /submit/i }).click();

    const stepResult = await waitForStepResult(user.userDataId, step.kycStepId);
    expect(JSON.parse(stepResult.result)).toMatchObject({ legalEntity: 'AG' });
    const file = await waitForRow<{ uid: string; name: string }>(
      `SELECT uid, name FROM kyc_file
       WHERE "userDataId" = $1 AND "kycStepId" = $2 AND name LIKE $3 ORDER BY id DESC LIMIT 1`,
      [user.userDataId, step.kycStepId, '%app2-legal-register.png'],
      20000,
    );
    expect(file.uid).toBeTruthy();
    expect(file.name).toContain('app2-legal-register.png');
  });

  test('Support ticket list retains customer status and thread attachment downloads after reload', async ({ page }) => {
    test.setTimeout(120000);
    const user = await createUser({ tag: 'app2-support-attachment-status', language: 'EN' });
    const ticketName = `App2 support ticket ${Date.now()}`;
    const ticketText = `App2 support initial ${Date.now()}`;
    const replyText = `App2 support reply ${Date.now()}`;
    const attachmentName = 'app2-support-proof.pdf';

    await openApp2(page, user.jwt, '#/support');
    await page.getByText('Create a support ticket', { exact: true }).click();
    await page.getByLabel('Your name').fill(ticketName);
    await page.locator('form').getByRole('textbox', { name: 'Message' }).fill(ticketText);
    await page.getByRole('button', { name: 'Submit ticket' }).click();

    const issue = await waitForRow<{ id: number; uid: string; state: string }>(
      `SELECT id, uid, state FROM support_issue
       WHERE "userDataId" = $1 AND name = $2 ORDER BY id DESC LIMIT 1`,
      [user.userDataId, ticketName],
      20000,
    );
    expect(issue.state).toBe('Created');
    await expect(page.getByPlaceholder('Write a message…')).toBeVisible({ timeout: 20000 });
    await page.getByPlaceholder('Write a message…').fill(replyText);
    await page.getByRole('button', { name: 'Attach file' }).click();
    await page.locator('#chatFileInput').setInputFiles({
      name: attachmentName,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\nApp2 local support attachment\n%%EOF'),
    });
    await expect(page.getByText(attachmentName)).toBeVisible();
    await page.getByRole('button', { name: 'Send' }).click();

    const message = await waitForRow<{ id: number; message: string; fileUrl: string }>(
      `SELECT id, message, "fileUrl" AS "fileUrl" FROM support_message
       WHERE "issueId" = $1 AND message = $2 AND "fileUrl" IS NOT NULL ORDER BY id DESC LIMIT 1`,
      [issue.id, replyText],
      20000,
    );
    expect(message.fileUrl).toContain(attachmentName);
    const storedAttachmentName = decodeURIComponent(message.fileUrl.split('/').pop() ?? '');
    await expect(page.getByText(storedAttachmentName, { exact: true })).toBeVisible();

    await openApp2(page, user.jwt, '#/support');
    // The list renders the issue type and status. Its API payload may omit
    // messages, so the reply belongs in the opened thread assertion below.
    const ticketRow = page
      .getByRole('button')
      .filter({ hasText: /General question/ })
      .filter({ hasText: /In progress/ })
      .first();
    await expect(ticketRow).toBeVisible({ timeout: 20000 });
    // Internal Created is projected to API Pending and rendered for customers as In progress.
    await expect(ticketRow.getByText('In progress', { exact: true })).toBeVisible();
    // Customer App2 exposes a status label but no status mutation action; backend state is read-only here.
    await expect(ticketRow.getByRole('button')).toHaveCount(0);
    await ticketRow.click();
    await expect(page.getByText(replyText, { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(storedAttachmentName, { exact: true })).toBeVisible({ timeout: 20000 });
    const downloadPromise = page.waitForEvent('download');
    await page.getByText(storedAttachmentName, { exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(storedAttachmentName);

    const currentState = await waitForRow<{ state: string }>(
      `SELECT state FROM support_issue WHERE id = $1 AND "userDataId" = $2`,
      [issue.id, user.userDataId],
    );
    expect(currentState.state).toBe('Created');
  });

  test('Limit request requires a name and persists selected limit, date, origin, and support ticket', async ({ page }) => {
    const user = await createUser({
      tag: 'app2-limit-request',
      kycLevel: 50,
      completePersonalData: true,
      language: 'EN',
    });
    await openApp2(page, user.jwt, '#/limit');
    const limitWriteRequests: Array<Record<string, unknown>> = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/v1/support/issue')) {
        limitWriteRequests.push(request.postDataJSON() as Record<string, unknown>);
      }
    });
    const name = page.locator('#lmName');
    await expect(name).toBeVisible({ timeout: 20000 });
    await name.fill('');
    const submit = page.getByRole('button', { name: /submit request/i });
    await submit.click();
    const noRequest = await withDb(async (db) =>
      Number((await db.query(`SELECT count(*)::int AS count FROM support_issue WHERE "userDataId" = $1 AND type = 'LimitRequest'`, [user.userDataId])).rows[0].count),
    );
    expect(noRequest).toBe(0);
    expect(limitWriteRequests).toHaveLength(0);

    await name.fill('App2 E2E limit request');
    await page.locator('#lmLimit').selectOption({ index: 2 });
    const requestedLimit = Number(await page.locator('#lmLimit').inputValue());
    await page.locator('#lmWhen').selectOption('Future');
    await page.locator('#lmOrigin').selectOption('CryptoGains');
    await page.locator('#lmText').fill('Documented crypto gains for planned investment.');
    const issueResponsePromise = page.waitForResponse((response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/v1/support/issue'),
    );
    await submit.click();
    const issueResponse = await issueResponsePromise;
    expect(issueResponse.ok(), `limit issue POST returned HTTP ${issueResponse.status()}`).toBe(true);
    const issuePayload = issueResponse.request().postDataJSON() as {
      type: string;
      name: string;
      message: string;
      limitRequest: { limit: number; investmentDate: string; fundOrigin: string; fundOriginText: string };
    };
    const createdIssue = await issueResponse.json() as { uid: string; type: string; state: string };
    expect(issuePayload).toMatchObject({
      type: 'LimitRequest',
      name: 'App2 E2E limit request',
      message: 'Documented crypto gains for planned investment.',
      limitRequest: {
        limit: requestedLimit,
        investmentDate: 'Future',
        fundOrigin: 'CryptoGains',
        fundOriginText: 'Documented crypto gains for planned investment.',
      },
    });
    expect(createdIssue).toMatchObject({ type: 'LimitRequest', state: 'Pending' });
    expect(createdIssue.uid).toBeTruthy();
    expect(limitWriteRequests).toHaveLength(1);

    const saved = await waitForRow<{
      issueId: number;
      uid: string;
      state: string;
      requestedLimit: number;
      investmentDate: string;
      fundOrigin: string;
      fundOriginText: string;
    }>(
      `SELECT si.id AS "issueId", si.uid, si.state, lr."limit" AS "requestedLimit",
              lr."investmentDate" AS "investmentDate", lr."fundOrigin" AS "fundOrigin",
              lr."fundOriginText" AS "fundOriginText"
       FROM support_issue si JOIN limit_request lr ON lr.id = si."limitRequestId"
       WHERE si."userDataId" = $1 AND si.type = 'LimitRequest' ORDER BY si.id DESC LIMIT 1`,
      [user.userDataId],
      20000,
    );
    expect(saved).toMatchObject({
      uid: createdIssue.uid,
      state: 'Created',
      requestedLimit,
      investmentDate: 'Future',
      fundOrigin: 'CryptoGains',
      fundOriginText: 'Documented crypto gains for planned investment.',
    });
    await expect(page.getByText('Request submitted.')).toBeVisible({ timeout: 20000 });

    const ticketsResponsePromise = page.waitForResponse((response) =>
      response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith('/v1/support/issue') && response.ok(),
    );
    await openApp2(page, user.jwt, '#/support');
    const ticketsResponse = await ticketsResponsePromise;
    const tickets = await ticketsResponse.json() as Array<{
      uid: string;
      type: string;
      state: string;
      limitRequest?: { limit: number };
    }>;
    const readback = tickets.find((ticket) => ticket.uid === createdIssue.uid);
    expect(readback).toMatchObject({
      uid: createdIssue.uid,
      type: 'LimitRequest',
      state: 'Pending',
      limitRequest: { limit: requestedLimit },
    });
    const ticketRow = page.getByRole('button').filter({ hasText: /Limit increase/ }).filter({ hasText: /In progress/ });
    await expect(ticketRow).toBeVisible({ timeout: 20000 });
    await expect(ticketRow).toContainText('In progress');

    const reloadedTicketsPromise = page.waitForResponse((response) =>
      response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith('/v1/support/issue'),
    );
    await page.reload();
    const reloadedTickets = await reloadedTicketsPromise;
    expect(reloadedTickets.ok(), 'the limit request status must reload from the real support API').toBe(true);
    const reloadedTicketDtos = await reloadedTickets.json() as Array<{ uid: string; type: string; state: string }>;
    expect(reloadedTicketDtos.find((ticket) => ticket.uid === createdIssue.uid)).toMatchObject({
      uid: createdIssue.uid,
      type: 'LimitRequest',
      state: 'Pending',
    });
    const reloadedTicketRow = page.getByRole('button').filter({ hasText: /Limit increase/ }).filter({ hasText: /In progress/ });
    await expect(reloadedTicketRow).toBeVisible({ timeout: 20000 });
  });
});
