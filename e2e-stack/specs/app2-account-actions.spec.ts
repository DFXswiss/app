/**
 * App2 account, transaction and support write paths. Every action is performed in the
 * hosted App2 UI and verified against the real local Postgres database. Prerequisite rows
 * are created with the shared full-stack factories; no API route is mocked here.
 *
 * Known coverage gaps: App2 exposes wallet address rename/remove but no add-address flow;
 * the customer UI cannot change support-ticket status; transaction-list refresh has no
 * deterministic real-API failure fixture. Email replacement also needs a full 2FA mail
 * round-trip and is not represented as a successful assertion in this file.
 */

import type { Page } from '@playwright/test';
import { apiGet, expect, gotoWithSession, test, waitForRow, withDb } from './fixtures';
import { cleanupCreatedData, createBankAccount, createTransaction, createUser, e2eMail, trackRow } from './fixtures/factories';
import { TEST_IBAN } from './fixtures/test-data';

async function openApp2(page: Page, jwt: string, hash: string): Promise<void> {
  const url = `/app2/?session=${encodeURIComponent(jwt)}${hash}`;
  const response = await page.goto(url);
  // Never include the session URL in failure output: it carries the bearer JWT.
  expect(response?.ok(), `App2 ${new URL(url, 'http://localhost').pathname}${hash} should load (HTTP ${response?.status() ?? 'no response'})`).toBe(true);
  await page.waitForFunction((token) => localStorage.getItem('dfx.authenticationToken') === token, jwt);
}

function codeFromNotificationData(data: string): string {
  const parsed = JSON.parse(data) as { texts?: Array<{ params?: { code?: string } }> };
  const code = parsed.texts?.map((text) => text.params?.code).find((value) => typeof value === 'string' && value.length > 0);
  if (!code) throw new Error('Email verification notification did not contain texts[].params.code');
  return code;
}

test.describe('App2 account and customer actions', () => {
  test.afterEach(async () => {
    await cleanupCreatedData();
  });

  test('bank accounts: add, reject invalid IBAN, edit label, set default, remove', async ({ page }) => {
    const user = await createUser({ tag: 'app2-bank-actions', language: 'EN' });
    const initial = await createBankAccount(user.jwt, { iban: TEST_IBAN, label: 'Primary test bank' });
    const secondIban = 'CH3908704016075473007';

    await openApp2(page, user.jwt, '#/account');
    await page.getByRole('button', { name: /^Bank accounts\b/ }).click();
    const bankSheet = page.getByRole('dialog', { name: 'Bank accounts', exact: true });

    await bankSheet.getByPlaceholder('CH.. / DE..').fill('CH0000000000000000000');
    await bankSheet.getByRole('button', { name: 'Add account' }).click();
    await expect(bankSheet.getByText(/IBAN/i).last()).toBeVisible();
    const invalidCount = await withDb(async (db) =>
      (await db.query(`SELECT count(*)::int AS count FROM bank_data WHERE "userDataId" = $1 AND iban = $2`, [user.userDataId, 'CH0000000000000000000'])).rows[0].count,
    );
    expect(invalidCount).toBe(0);

    await bankSheet.getByPlaceholder('CH.. / DE..').fill(secondIban);
    // The add form has IBAN first and its optional account label second. Scope to the
    // visible dialog so other mounted, aria-hidden sheets cannot shift this index.
    await bankSheet.locator('input').nth(1).fill('Secondary test bank');
    await bankSheet.getByRole('button', { name: 'Add account' }).click();
    const added = await waitForRow<{ id: number; active: boolean }>(
      `SELECT id, active FROM bank_data WHERE "userDataId" = $1 AND iban = $2 ORDER BY id DESC LIMIT 1`,
      [user.userDataId, secondIban],
    );
    trackRow('bank_data', added.id);
    expect(added.active).toBe(true);

    // The card's label is renamed later, so anchor it on either live label and walk up
    // from its <b> through the card's actual three-level markup.
    // JSX nesting is card > flex row > label column > <b>; three parent steps
    // from the label reach the card, which contains its action buttons.
    const secondCard = () => bankSheet.getByText(/^(Secondary test bank|Renamed test bank)$/).locator('xpath=../../..');
    await secondCard().getByRole('button', { name: 'Edit' }).click();
    await secondCard().getByRole('button', { name: 'Set as default' }).click();
    await expect.poll(async () => (await withDb(async (db) => (await db.query(`SELECT "default" FROM bank_data WHERE id = $1`, [added.id])).rows[0]?.default))).toBe(true);

    await secondCard().getByRole('button', { name: 'Edit' }).click();
    const labelInput = secondCard().locator('input').first();
    await labelInput.fill('Renamed test bank');
    await secondCard().getByRole('button', { name: 'Save' }).click();
    await expect.poll(async () => (await withDb(async (db) => (await db.query(`SELECT label FROM bank_data WHERE id = $1`, [added.id])).rows[0]?.label))).toBe('Renamed test bank');

    await secondCard().getByRole('button', { name: 'Remove' }).click();
    await secondCard().getByRole('button', { name: 'Yes, remove' }).click();
    await expect.poll(async () => (await withDb(async (db) => (await db.query(`SELECT active FROM bank_data WHERE id = $1`, [added.id])).rows[0]?.active))).toBe(false);

    // Verify the remove operation survives a fresh account-context load, not only the
    // optimistic update in the currently mounted sheet.
    await bankSheet.getByRole('button', { name: /close/i }).click();
    await page.reload();
    await page.getByRole('button', { name: /^Bank accounts\b/ }).click();
    const reloadedBankSheet = page.getByRole('dialog', { name: 'Bank accounts', exact: true });
    await expect(reloadedBankSheet.getByText('Renamed test bank', { exact: true })).toHaveCount(0);
    await expect(reloadedBankSheet.getByText('Primary test bank', { exact: true })).toBeVisible();
    expect(initial.bankAccountId).toBeGreaterThan(0);
  });

  test('verification-call preference persists the consent and selected time', async ({ page }) => {
    const user = await createUser({ tag: 'app2-call-preference', language: 'EN' });
    const initialUserPromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v2/user') && response.request().method() === 'GET',
    );
    await openApp2(page, user.jwt, '#/account');
    expect((await initialUserPromise).ok(), 'verification-call settings must load from the authenticated user API').toBe(true);

    await page.getByRole('button', { name: /^Verification call\b/ }).click();
    await page.getByText("I'd like to be called for verification", { exact: true }).click();
    await page.getByRole('button', { name: '10:00–11:00' }).click();
    const callUpdatePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v2/user') && response.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await callUpdatePromise).ok(), 'verification-call settings must save through the real user API').toBe(true);
    await expect.poll(async () => (await withDb(async (db) => (await db.query(`SELECT "phoneCallAccepted", "phoneCallTimes" FROM user_data WHERE id = $1`, [user.userDataId])).rows[0]))).toMatchObject({ phoneCallAccepted: true, phoneCallTimes: expect.stringContaining('H10To11') });

    const reloadedUserPromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v2/user') && response.request().method() === 'GET',
    );
    await page.reload();
    const reloadedUser = await reloadedUserPromise;
    expect(reloadedUser.ok()).toBe(true);
    expect(await reloadedUser.json()).toMatchObject({
      kyc: { phoneCallAccepted: true, preferredPhoneTimes: expect.arrayContaining(['H10To11']) },
    });
    await page.getByRole('button', { name: /^Verification call\b/ }).click();
    const callSheet = page.getByRole('dialog', { name: 'Verification call', exact: true });
    await expect(callSheet.getByLabel("I'd like to be called for verification")).toBeChecked();
    await expect(callSheet.getByRole('button', { name: '10:00–11:00' })).toHaveClass(/on/);
  });

  test('language preference persists in user_data', async ({ page }) => {
    const user = await createUser({ tag: 'app2-language', language: 'EN' });
    await openApp2(page, user.jwt, '#/account');
    await page.getByRole('button', { name: /^Language\b/ }).click();
    const languageSheet = page.getByRole('dialog', { name: 'Language', exact: true });
    await languageSheet.getByRole('button', { name: 'Deutsch', exact: true }).click();
    const german = await waitForRow<{ id: number }>(`SELECT id FROM language WHERE symbol = 'DE' LIMIT 1`, []);
    await expect.poll(async () => (await withDb(async (db) => (await db.query(`SELECT "languageId" FROM user_data WHERE id = $1`, [user.userDataId])).rows[0]?.languageId))).toBe(german.id);
  });

  test('display currency preference persists in user_data', async ({ page }) => {
    const user = await createUser({ tag: 'app2-currency', language: 'EN' });
    await openApp2(page, user.jwt, '#/account');
    await page.getByRole('button', { name: /^Display currency\b/ }).click();
    const currencySheet = page.getByRole('dialog', { name: 'Choose currency', exact: true });
    await currencySheet.getByRole('button', { name: 'EUR', exact: true }).click();
    const eur = await waitForRow<{ id: number }>(`SELECT id FROM fiat WHERE name = 'EUR' LIMIT 1`, []);
    await expect.poll(async () => (await withDb(async (db) => (await db.query(`SELECT "currencyId" FROM user_data WHERE id = $1`, [user.userDataId])).rows[0]?.currencyId))).toBe(eur.id);
  });

  test('CoinTracking key can be created and removed from account settings', async ({ page }) => {
    const user = await createUser({ tag: 'app2-cointracking-key', language: 'EN' });
    await openApp2(page, user.jwt, '#/account');
    await page.getByRole('button', { name: /^CoinTracking connection\b/ }).click();
    await expect.poll(async () => (await withDb(async (db) => (await db.query(`SELECT "apiKeyCT" FROM user_data WHERE id = $1`, [user.userDataId])).rows[0]?.apiKeyCT))).toBeTruthy();
    await page.getByRole('button', { name: 'Remove connection' }).click();
    await expect.poll(async () => (await withDb(async (db) => (await db.query(`SELECT "apiKeyCT" FROM user_data WHERE id = $1`, [user.userDataId])).rows[0]?.apiKeyCT))).toBeNull();
  });

  test('App2 changes email after real 2FA and verifies the new address with the notification code', async ({ page }) => {
    test.setTimeout(120000);
    const user = await createUser({ tag: 'app2-email-change', language: 'EN' });
    const nextEmail = e2eMail('app2-email-next');

    // Existing App2 updateMail path requires a recent BASIC TFA. Complete its real mail code
    // on the standard /2fa screen in this same browser context, then return to App2.
    await gotoWithSession(page, '/2fa', user.jwt);
    await expect(page.getByText('We have emailed you a 6-digit code. Please enter it here.', { exact: true })).toBeVisible({ timeout: 20000 });
    const tfaNotice = await waitForRow<{ data: string }>(
      `SELECT data FROM notification WHERE "userDataId" = $1 AND context = 'VerificationMail' ORDER BY id DESC LIMIT 1`,
      [user.userDataId],
      30000,
    );
    const tfaCode = codeFromNotificationData(tfaNotice.data);
    await page.getByPlaceholder('Email code').fill(tfaCode);
    await page.getByRole('button', { name: 'Next' }).click();
    await waitForRow<{ id: number }>(
      `SELECT id FROM kyc_log WHERE "userDataId" = $1 AND type = 'TfaLog' ORDER BY id DESC LIMIT 1`,
      [user.userDataId],
      20000,
    );

    await openApp2(page, user.jwt, '#/account');
    await page.getByRole('button', { name: /^Email address\b/ }).click();
    const emailSheet = page.getByRole('dialog', { name: 'Email address', exact: true });
    await emailSheet.getByPlaceholder('you@email.com').fill(nextEmail);
    await emailSheet.getByRole('button', { name: 'Send code' }).click();
    await expect(emailSheet.getByPlaceholder('000000')).toBeVisible();

    const emailNotice = await waitForRow<{ data: string }>(
      `SELECT data FROM notification WHERE "userDataId" = $1 AND context = 'EmailVerification' ORDER BY id DESC LIMIT 1`,
      [user.userDataId],
      30000,
    );
    const emailCode = codeFromNotificationData(emailNotice.data);
    const wrongCode = emailCode === '000000' ? '111111' : '000000';
    await emailSheet.getByPlaceholder('000000').fill(wrongCode);
    const invalidCodeResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v2/user/mail/verify') && response.request().method() === 'POST',
    );
    await emailSheet.getByRole('button', { name: 'Verify', exact: true }).click();
    const invalidCodeResponse = await invalidCodeResponsePromise;
    expect(invalidCodeResponse.ok(), 'the real verification API must reject an incorrect email code').toBe(false);
    await expect(emailSheet.getByText('Invalid or expired code', { exact: true })).toBeVisible();
    const unchanged = await withDb(async (db) =>
      (await db.query<{ mail: string }>(`SELECT mail FROM user_data WHERE id = $1`, [user.userDataId])).rows[0]?.mail,
    );
    expect(unchanged).toBe(user.mail);

    await emailSheet.getByPlaceholder('000000').fill(emailCode);
    const validCodeResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v2/user/mail/verify') && response.request().method() === 'POST',
    );
    await emailSheet.getByRole('button', { name: 'Verify', exact: true }).click();
    expect((await validCodeResponsePromise).ok(), 'the notification code must be accepted by the real verification API').toBe(true);
    const changed = await waitForRow<{ id: number; mail: string }>(
      `SELECT id, mail FROM user_data WHERE id = $1 AND mail = $2`,
      [user.userDataId, nextEmail],
      30000,
    );
    expect(changed.mail).toBe(nextEmail);
  });

  test('wallet-address rename is persisted through App2', async ({ page }) => {
    const user = await createUser({ tag: 'app2-address-actions', language: 'EN' });
    await openApp2(page, user.jwt, '#/account');
    await page.getByRole('button', { name: /^Wallet addresses\b/ }).click();
    const addressesSheet = page.getByRole('dialog', { name: 'Wallet addresses', exact: true });
    // This factory user has exactly one linked address. Scope the controls to the visible
    // sheet instead of relying on a styling class that is transformed by the CSS helper.
    await addressesSheet.getByRole('button', { name: 'Rename', exact: true }).click();
    await addressesSheet.locator('input:visible').fill('E2E wallet label');
    await addressesSheet.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(addressesSheet.getByText('E2E wallet label', { exact: true })).toBeVisible();
    const savedAddress = await waitForRow<{ id: number; label: string }>(
      `SELECT id, label FROM "user" WHERE "userDataId" = $1 AND lower(address) = lower($2) AND label = $3`,
      [user.userDataId, user.address, 'E2E wallet label'],
    );
    expect(savedAddress.label).toBe('E2E wallet label');
  });

  test('invite referral creates an invitation row from the account UI', async ({ page }) => {
    const user = await createUser({ tag: 'app2-referral', kycLevel: 50, completePersonalData: true, language: 'EN' });
    // The real referral endpoint requires verified trade eligibility and history. Those are
    // staff/transaction-derived prerequisites with no local public API setup path.
    await withDb(async (db) => {
      await db.query(`UPDATE user_data SET "tradeApprovalDate" = NOW(), "buyVolume" = 100 WHERE id = $1`, [user.userDataId]);
    });
    await openApp2(page, user.jwt, '#/account');
    await page.getByText('Invite & earn', { exact: true }).click();
    const alias = `App2 E2E ${Date.now()}`;
    await page.getByPlaceholder('e.g. Anna M.').fill(alias);
    await page.getByRole('button', { name: 'Generate invite' }).click();
    const invitation = await waitForRow<{ id: number; recommendedAlias: string }>(
      `SELECT id, "recommendedAlias" AS "recommendedAlias" FROM recommendation WHERE "recommenderId" = $1 AND "recommendedAlias" = $2 ORDER BY id DESC LIMIT 1`,
      [user.userDataId, alias],
    );
    trackRow('recommendation', invitation.id);
    expect(invitation.recommendedAlias).toBe(alias);
  });

  test('support ticket thread accepts a reply and PDF attachment', async ({ page }) => {
    const user = await createUser({ tag: 'app2-support-thread', language: 'EN' });
    await openApp2(page, user.jwt, '#/support');
    await page.getByText('Create a support ticket', { exact: true }).click();
    await page.getByLabel('Your name').fill('E2E Support User');
    await page.locator('form').getByRole('textbox', { name: 'Message' }).fill('Initial support request from App2 E2E.');
    await page.getByRole('button', { name: 'Submit ticket' }).click();

    const issue = await waitForRow<{ id: number; uid: string; state: string }>(
      `SELECT si.id, si.uid, si.state FROM support_issue si JOIN user_data ud ON ud.id = si."userDataId" WHERE ud.id = $1 ORDER BY si.id DESC LIMIT 1`,
      [user.userDataId],
    );
    trackRow('support_issue', issue.id);
    expect(issue.state).toBe('Created');
    const firstMessage = await waitForRow<{ id: number; message: string }>(`SELECT id, message FROM support_message WHERE "issueId" = $1 ORDER BY id LIMIT 1`, [issue.id]);
    trackRow('support_message', firstMessage.id);
    expect(firstMessage.message).toContain('Initial support request');

    await page.getByPlaceholder('Write a message…').fill('Follow-up reply from customer.');
    await page.getByRole('button', { name: 'Attach file' }).click();
    await page.locator('#chatFileInput').setInputFiles({ name: 'e2e-note.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nE2E attachment\n%%EOF') });
    await expect(page.getByText('e2e-note.pdf')).toBeVisible();
    await page.getByRole('button', { name: 'Send' }).click();
    const reply = await waitForRow<{ id: number; message: string; fileUrl: string | null }>(
      `SELECT id, message, "fileUrl" AS "fileUrl" FROM support_message WHERE "issueId" = $1 AND message LIKE $2 ORDER BY id DESC LIMIT 1`,
      [issue.id, '%Follow-up reply from customer.%'],
    );
    trackRow('support_message', reply.id);
    expect(reply.message).toContain('Follow-up reply');
    expect(reply.fileUrl).toContain('e2e-note.pdf');
    // Back should refresh SupportChatContext directly; register first so the request cannot race
    // the response waiter. A page reload would conceal a stale in-memory ticket list.
    const ticketListResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/support/issue') && response.request().method() === 'GET',
    );
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    const ticketList = await ticketListResponse;
    expect(ticketList.ok(), 'Back must fetch the real GET /support/issue ticket list').toBe(true);
    const listedTickets = (await ticketList.json()) as Array<{ uid: string; state: string }>;
    const listedIssue = listedTickets.find((ticket) => ticket.uid === issue.uid);
    expect(listedIssue?.state, 'API list should include the created ticket by UID with its public state').toBe('Pending');
    const persistedState = await withDb(async (db) =>
      (await db.query(`SELECT state FROM support_issue WHERE id = $1`, [issue.id])).rows[0]?.state,
    );
    expect(persistedState, 'DB state Created is projected as DTO Pending').toBe('Created');
    const ticketRow = page.getByRole('button').filter({ hasText: 'General question' });
    await expect(ticketRow).toBeVisible();
    // SupportIssueDtoMapper maps internal Created -> API Pending; App2 renders Pending as In progress.
    await expect(ticketRow.getByText('In progress', { exact: true })).toBeVisible();
  });

  test('App2 compact CSV export downloads the selected account transaction', async ({ page }) => {
    const user = await createUser({ tag: 'app2-compact-csv', kycLevel: 30, completePersonalData: true, language: 'EN' });
    const tx = await createTransaction({
      tag: 'app2-compact-csv',
      state: 'completed_buy',
      userId: user.userId,
      userDataId: user.userDataId,
      jwt: user.jwt,
    });
    await openApp2(page, user.jwt, '#/tx');
    await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();

    const detailReload = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith('/v1/transaction/detail') && response.request().method() === 'GET',
    );
    await page.reload();
    const detailResponse = await detailReload;
    expect(detailResponse.ok(), 'App2 transaction history must load from the real detail API').toBe(true);
    // Capture the authoritative body directly from the real local API. Playwright can retire a
    // response body's protocol handle after navigation, so don't parse the browser handle here.
    const apiTransactions = await apiGet<Array<{
      id: number;
      uid: string;
      type: string;
      state: string;
      inputAmount: number;
      inputAsset: string;
    }>>('transaction/detail', { jwt: user.jwt });
    const apiTransaction = apiTransactions.find((transaction) => transaction.uid === tx.uid);
    expect(apiTransaction, `detail API should include transaction ${tx.uid}`).toBeDefined();

    const persisted = await withDb(async (db) =>
      (
        await db.query(
          `SELECT t.id, t.uid, t.type, t."amountInChf", t.assets,
                  bc.status, bc."isComplete", bc."amlCheck", bc."inputAmount", bc."inputAsset"
           FROM transaction t JOIN buy_crypto bc ON bc."transactionId" = t.id WHERE t.id = $1`,
          [tx.transactionId],
        )
      ).rows[0],
    );
    expect(persisted).toMatchObject({
      id: tx.transactionId,
      uid: tx.uid,
      type: 'BuyCrypto',
      amountInChf: 100,
      assets: 'CHF',
      status: 'Complete',
      isComplete: true,
      amlCheck: 'Pass',
      inputAmount: 100,
      inputAsset: 'CHF',
    });
    expect(apiTransaction).toMatchObject({
      id: persisted.id,
      uid: persisted.uid,
      type: 'Buy',
      state: 'Completed',
      inputAmount: persisted.inputAmount,
      inputAsset: persisted.inputAsset,
    });

    await page.getByRole('button', { name: 'Export CSV' }).click();
    const compactExportPromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v1/transaction/detail/csv') && response.request().method() === 'PUT',
    );
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Compact CSV', exact: true }).click();
    const compactPopup = await popupPromise;
    const compactDownloadResponsePromise = compactPopup.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/v1/transaction/csv') && url.searchParams.has('key');
    });
    const compactDownloadPromise = compactPopup.waitForEvent('download');
    const compactExportResponse = await compactExportPromise;
    expect(compactExportResponse.ok(), 'Compact CSV must be prepared by the real authenticated API').toBe(true);
    const compactDownloadResponse = await compactDownloadResponsePromise;
    expect(compactDownloadResponse.ok(), 'Compact CSV must be served by the real one-time download endpoint').toBe(true);
    const compactDownload = await compactDownloadPromise;
    expect(new URL(compactDownload.url()).pathname).toBe('/v1/transaction/csv');
    const compactCsv = await (await import('node:fs/promises')).readFile((await compactDownload.path())!, 'utf8');
    expect(compactCsv).toContain(tx.uid);
    expect(compactCsv).toContain(String(persisted.inputAmount));
  });

  test('transaction list displays seeded transaction, exports CSV and reports a problem into support', async ({ page }) => {
    const user = await createUser({ tag: 'app2-tx-actions', kycLevel: 30, completePersonalData: true, language: 'EN' });
    const tx = await createTransaction({ tag: 'app2-tx-actions', state: 'completed_buy', userId: user.userId, userDataId: user.userDataId, jwt: user.jwt });
    await openApp2(page, user.jwt, '#/tx');
    await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();
    const detailReload = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith('/v1/transaction/detail') && response.request().method() === 'GET',
    );
    await page.reload();
    const detailResponse = await detailReload;
    expect(detailResponse.ok(), 'App2 transaction history must load from the real detail API').toBe(true);
    // Keep the browser request assertion, but read the JSON through a fresh direct request to the
    // same local endpoint so parsing does not depend on Playwright's response-body lifetime.
    const apiTransactions = await apiGet<Array<{
      id: number;
      uid: string;
      type: string;
      state: string;
      inputAmount: number;
      inputAsset: string;
      outputAmount?: number;
      outputAsset?: string;
    }>>('transaction/detail', { jwt: user.jwt });
    const apiTransaction = apiTransactions.find((transaction) => transaction.uid === tx.uid);
    expect(apiTransaction, `detail API should include transaction ${tx.uid}`).toBeDefined();

    const persisted = await withDb(async (db) =>
      (
        await db.query(
          `SELECT t.id, t.uid, t.type, t."amountInChf", t.assets,
                  bc.status, bc."isComplete", bc."amlCheck", bc."inputAmount", bc."inputAsset"
           FROM transaction t JOIN buy_crypto bc ON bc."transactionId" = t.id WHERE t.id = $1`,
          [tx.transactionId],
        )
      ).rows[0],
    );
    expect(persisted).toMatchObject({
      id: tx.transactionId,
      uid: tx.uid,
      type: 'BuyCrypto',
      amountInChf: 100,
      assets: 'CHF',
      status: 'Complete',
      isComplete: true,
      amlCheck: 'Pass',
      inputAmount: 100,
      inputAsset: 'CHF',
    });
    expect(apiTransaction).toMatchObject({
      id: persisted.id,
      uid: persisted.uid,
      type: 'Buy',
      state: 'Completed',
      inputAmount: persisted.inputAmount,
      inputAsset: persisted.inputAsset,
    });

    // The rendered App2 history row is exposed as a generic group, not a `details.txitem`
    // selector. Match the actual amount text and activate that clickable row.
    const transactionRow = page.getByText('100 CHF → 0.1 ETH', { exact: true });
    await expect(transactionRow).toBeVisible();
    await transactionRow.click();
    const transactionDetails = transactionRow.locator('xpath=ancestor::details');
    const payText = `${apiTransaction?.inputAmount} ${apiTransaction?.inputAsset}`;
    const receiveText = `${apiTransaction?.outputAmount} ${apiTransaction?.outputAsset}`;
    await expect(transactionDetails.getByText('You pay', { exact: true })).toBeVisible();
    await expect(transactionDetails.getByText(payText, { exact: true })).toBeVisible();
    await expect(transactionDetails.getByText('You receive', { exact: true })).toBeVisible();
    await expect(transactionDetails.getByText(receiveText, { exact: true })).toBeVisible();
    const statusRow = transactionDetails.getByText('Status', { exact: true }).locator('xpath=..');
    await expect(statusRow.getByText('Completed', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Export CSV' }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CoinTracking export' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('dfx-cointracking.csv');
    const csv = await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8');
    expect(csv.length).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Report a problem' }).click();
    await expect(page.getByRole('heading', { name: 'New support ticket' })).toBeVisible();
    const topic = page.locator('form select[aria-label]');
    await expect(topic.locator('option:checked')).toContainText(/funds not received/i);
    await page.getByLabel('Your name').fill('E2E Transaction User');
    await page.locator('form').getByRole('textbox', { name: 'Message' }).fill('Problem reported from transaction details.');
    const createIssueRequestPromise = page.waitForRequest((request) =>
      new URL(request.url()).pathname.endsWith('/support/issue') && request.method() === 'POST',
    );
    await page.getByRole('button', { name: 'Submit ticket' }).click();
    const createIssueRequest = await createIssueRequestPromise;
    const createIssueBody = createIssueRequest.postDataJSON() as {
      type?: string;
      reason?: string;
      transaction?: { uid?: string };
    };
    expect(createIssueBody.transaction?.uid, 'the support-create API payload must carry the exact selected transaction UID').toBe(tx.uid);
    expect(createIssueBody.type, 'the support-create API must carry a transaction issue type').toMatch(/transaction/i);
    expect(createIssueBody.reason, 'the support-create API must carry the funds-not-received reason').toMatch(/funds.*not.*received/i);
    const linkedIssue = await waitForRow<{ id: number; transactionId: number | null }>(
      `SELECT id, "transactionId" AS "transactionId" FROM support_issue WHERE "userDataId" = $1 ORDER BY id DESC LIMIT 1`,
      [user.userDataId],
    );
    trackRow('support_issue', linkedIssue.id);
    expect(linkedIssue.transactionId).toBe(tx.transactionId);
  });
});
