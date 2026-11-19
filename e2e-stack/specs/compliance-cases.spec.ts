/**
 * Compliance area — write / decision flows.
 *
 * Routes claimed (registry/compliance.ts → this file):
 *   /compliance/user/:id/kyc
 *   /compliance/bank-tx/unassigned
 *   /compliance/bank-tx/:id
 *   /compliance/bank-tx/:id/recall
 *   /compliance/bank-tx/:id/return
 *   /compliance/mros/create
 *   /compliance/call-queues/:queue
 *   /compliance/call-queues/:queue/:userDataId
 *
 * Overview / access-control coverage lives in compliance.spec.ts.
 */

import type { Locator, Page } from '@playwright/test';
import { expect, loginAs, normPath, openScreen, queryOne, queryRows, test, waitForRow, withDb } from './fixtures';
import {
  cleanupCreatedData,
  createBankAccount,
  createBankTx,
  createCallQueueEntry,
  createKycStep,
  createTransaction,
  createUser,
  TEST_IBAN,
  trackRow,
} from './fixtures/factories';

test.describe.configure({ mode: 'serial' });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Raise staff kycLevel + name so MROS caseManager and staff identity resolve. */
async function ensureStaffReady(userId: number, surname = 'Compliance'): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `UPDATE user_data SET "kycLevel" = 50, firstname = 'E2E', surname = $2
       WHERE id = (SELECT "userDataId" FROM "user" WHERE id = $1)`,
      [userId, surname],
    );
  });
}

// The `onboardingFeeUsedRef` setting as it was before the first onboarding-fee test wrote it:
// `undefined` = not captured yet, `null` = the row did not exist. Restored in afterAll.
let previousOnboardingFeeRef: string | null | undefined;

/**
 * The onboarding-fee API reads `onboardingFeeUsedRef` to attribute the named address to the
 * key-account manager. Create a customer, give it a ref, use that ref as the setting, and return it.
 * A factory user has no ref (the API assigns one only on its own KYC path at level 50), so the ref is
 * written here as starting state, in the API's `NNN-NNN` format and unused by any other user.
 */
async function seedOnboardingFeeRef(): Promise<string> {
  const owner = await createUser({ tag: 'cmp-onboarding-ref-owner', kycLevel: 30, completePersonalData: true });
  let ref: string | undefined;
  for (let attempt = 0; attempt < 20 && !ref; attempt++) {
    const candidate = `${String(Math.floor(Math.random() * 900) + 100)}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
    const taken = await queryOne<{ id: number }>(`SELECT id FROM "user" WHERE ref = $1`, [candidate]);
    if (!taken) ref = candidate;
  }
  if (!ref) throw new Error('seedOnboardingFeeRef: no free ref found');
  await queryRows(`UPDATE "user" SET ref = $1 WHERE id = $2`, [ref, owner.userId]);

  if (previousOnboardingFeeRef === undefined) {
    const row = await queryOne<{ value: string }>(`SELECT value FROM setting WHERE key = 'onboardingFeeUsedRef'`);
    previousOnboardingFeeRef = row?.value ?? null;
  }
  await queryRows(
    `INSERT INTO setting (key, value) VALUES ('onboardingFeeUsedRef', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [ref],
  );
  return ref;
}

/** Put the `onboardingFeeUsedRef` setting back to its value before this file's tests. */
async function restoreOnboardingFeeRef(): Promise<void> {
  if (previousOnboardingFeeRef === undefined) return;
  if (previousOnboardingFeeRef === null) {
    await queryRows(`DELETE FROM setting WHERE key = 'onboardingFeeUsedRef'`);
  } else {
    await queryRows(`UPDATE setting SET value = $1 WHERE key = 'onboardingFeeUsedRef'`, [previousOnboardingFeeRef]);
  }
  previousOnboardingFeeRef = undefined;
}

/**
 * Open a StyledDropdown by its field label, then pick an option by visible label text.
 *
 * The openable button is a sibling of the label's *wrapper*, not of the label itself, so the
 * XPath has to step up two levels to the field container first. `#dropDownButton` repeats on
 * every dropdown on the page, which is why it stays scoped to that container.
 */
async function selectStyledDropdown(page: Page, fieldLabel: string, optionLabel: string): Promise<void> {
  const fieldContainer = page.getByText(fieldLabel, { exact: true }).locator('xpath=../..');
  await fieldContainer.locator('#dropDownButton').click();
  await fieldContainer.getByRole('button', { name: optionLabel, exact: true }).click();
}

/**
 * The input of a StyledInput, found by its field label.
 *
 * `name` on the React component does not become the DOM `name` attribute — StyledInput derives that
 * from its `autocomplete` prop, which these fields do not set, so `input[name="fee"]` matches
 * nothing. The label is the stable handle; the input sits in the same field container, two levels
 * up from the label text node, exactly like the dropdown button above.
 */
function styledInput(page: Page, fieldLabel: string): Locator {
  // Nearest ancestor that actually holds an input, rather than a fixed number of levels: two
  // levels up lands on a container wide enough to also cover the neighbouring field, so 'Comment'
  // would resolve to the numeric Fee input sitting above it.
  return page
    .getByText(fieldLabel, { exact: true })
    .first()
    .locator('xpath=ancestor::*[.//input or .//textarea][1]')
    .locator('input, textarea')
    .first();
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('Compliance area (cases)', () => {
  test.afterAll(async () => {
    // Before the cleanup deletes the ref owner the setting points at.
    try {
      await restoreOnboardingFeeRef();
    } finally {
      await cleanupCreatedData();
    }
  });

  // -------------------------------------------------------------------------
  // /compliance/user/:id/kyc — BankData Approve via UI + DB proof
  // -------------------------------------------------------------------------

  test('/compliance/user/:id/kyc approves ManualReview bank data via UI', async ({ page }) => {
    const { jwt, userId } = await loginAs('Compliance');
    await ensureStaffReady(userId);

    const customer = await createUser({
      tag: 'cmp-kyc-bd',
      kycLevel: 30,
      completePersonalData: true,
    });
    // Ensure verifiedName aligns with bank data name to avoid mismatch UI noise
    await queryRows(`UPDATE user_data SET "verifiedName" = $1 WHERE id = $2`, ['E2E Tester', customer.userDataId]);

    const ba = await createBankAccount(customer.jwt, { iban: TEST_IBAN, label: 'E2E ManualReview BA' });
    await queryRows(
      `UPDATE bank_data
       SET status = 'ManualReview', type = 'User', name = $1, approved = false
       WHERE id = $2`,
      ['E2E Tester', ba.bankAccountId],
    );

    const before = await queryOne<{ status: string }>(`SELECT status FROM bank_data WHERE id = $1`, [ba.bankAccountId]);
    expect(before?.status).toBe('ManualReview');

    // openScreen compares pathname only — do not put ?tab= in the path argument
    await openScreen(page, `/compliance/user/${customer.userDataId}/kyc`, jwt);

    // Review header unique fields
    await expect(page.getByText('UserDataId', { exact: true }).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('KYC Level', { exact: true })).toBeVisible();
    await expect(page.getByText(String(customer.userDataId), { exact: true }).first()).toBeVisible();

    // Ensure BankData Review tab is active
    const bankTab = page.getByRole('button', { name: /BankData Review/ });
    await expect(bankTab).toBeVisible({ timeout: 15000 });
    await bankTab.click();

    await expect(page.getByText('Die Bank-Daten werden:', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Checks', { exact: true })).toBeVisible();
    await expect(page.getByText(/CH93\s*0076\s*2011\s*6238\s*5295\s*7|CH9300762011623852957/).first()).toBeVisible();

    await page
      .getByText('Die Bank-Daten werden:', { exact: true })
      .locator('xpath=following-sibling::select')
      .selectOption('Akzeptiert');

    await expect(page.getByText('Editor:', { exact: true })).toBeVisible();
    await expect(page.getByText('Editor:', { exact: true }).locator('xpath=following-sibling::select')).toHaveCount(0);

    const saveBtn = page.getByRole('button', { name: 'Speichern', exact: true });
    await expect(saveBtn).toBeEnabled({ timeout: 5000 });
    await saveBtn.click();

    const after = await waitForRow<{ status: string; approved: boolean }>(
      `SELECT status, approved FROM bank_data WHERE id = $1 AND status = 'Completed'`,
      [ba.bankAccountId],
      20000,
    );
    expect(after.status).toBe('Completed');
    expect(after.approved).toBe(true);
  });

  // -------------------------------------------------------------------------
  // /compliance/user/:id/kyc — Statutes on an account without account type: reject via UI + DB proof
  // -------------------------------------------------------------------------

  test('/compliance/user/:id/kyc rejects a ManualReview Statutes step on an account without account type', async ({
    page,
  }) => {
    const { jwt, userId } = await loginAs('Compliance');
    await ensureStaffReady(userId);

    const customer = await createUser({ tag: 'cmp-kyc-statutes', kycLevel: 0 });
    const account = await queryOne<{ accountType: string | null }>(
      `SELECT "accountType" FROM user_data WHERE id = $1`,
      [customer.userDataId],
    );
    expect(account?.accountType).toBeNull();

    const step = await createKycStep(customer.userDataId, { name: 'Statutes', status: 'ManualReview' });

    await openScreen(page, `/compliance/user/${customer.userDataId}/kyc`, jwt);
    await expect(page.getByText('UserDataId', { exact: true }).first()).toBeVisible({ timeout: 20000 });

    // The Statutes tab is limited to Organization accounts but shows because the account has the step
    const statutesTab = page.getByRole('button', { name: /^Statuten/ });
    await expect(statutesTab).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /^Operational Activity/ })).toHaveCount(0);
    await statutesTab.click();

    const decision = page.getByText('Die Statuten werden:', { exact: true }).locator('xpath=following-sibling::select');
    await expect(decision).toBeVisible({ timeout: 15000 });
    await decision.selectOption('Abgelehnt');
    await page
      .getByText('Kommentar:', { exact: true })
      .locator('xpath=following-sibling::select')
      .selectOption('Falsches Dokument');

    const saveBtn = page.getByRole('button', { name: 'Speichern', exact: true });
    await expect(saveBtn).toBeEnabled({ timeout: 5000 });
    await saveBtn.click();

    const after = await waitForRow<{ status: string; comment: string | null }>(
      `SELECT status, comment FROM kyc_step WHERE id = $1 AND status = 'Failed'`,
      [step.kycStepId],
      20000,
    );
    expect(after.comment).toBe('Falsches Dokument');
  });

  // -------------------------------------------------------------------------
  // /compliance/bank-tx/unassigned — pending credit visible with role-based assignment action
  // -------------------------------------------------------------------------

  test('/compliance/bank-tx/unassigned lists pending credits and gates assignment to admins', async ({ page }) => {
    const { jwt, userId } = await loginAs('Admin');
    await ensureStaffReady(userId);

    const btx = await createBankTx({
      tag: 'cmp-btx-unassigned',
      amount: 432.1,
      type: 'Pending',
      withTransaction: false,
    });
    trackRow('bank_tx', btx.bankTxId);

    await openScreen(page, '/compliance/bank-tx/unassigned', jwt);

    const bankTxRow = page.getByRole('cell', { name: String(btx.bankTxId), exact: true }).locator('..');
    await expect(bankTxRow).toBeVisible({ timeout: 15000 });
    await expect(bankTxRow.getByText('E2E Bank Sender', { exact: true })).toBeVisible();
    await expect(bankTxRow.getByRole('button', { name: 'Assign', exact: true })).toBeVisible();

    const { jwt: complianceJwt, userId: complianceUserId } = await loginAs('Compliance');
    await ensureStaffReady(complianceUserId);
    await openScreen(page, '/compliance/bank-tx/unassigned', complianceJwt);

    const complianceBankTxRow = page.getByRole('cell', { name: String(btx.bankTxId), exact: true }).locator('..');
    await expect(complianceBankTxRow).toBeVisible({ timeout: 15000 });
    await expect(complianceBankTxRow.getByRole('button', { name: 'Assign', exact: true })).toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // /compliance/bank-tx/:id — detail from sessionStorage cache
  // -------------------------------------------------------------------------

  test('/compliance/bank-tx/:id shows details from search cache', async ({ page }) => {
    const { jwt, userId } = await loginAs('Compliance');
    await ensureStaffReady(userId);

    const btx = await createBankTx({ tag: 'cmp-btx-detail', amount: 321, type: 'Unknown' });

    // Navigate the real app path: search on /compliance, then click the row's forward icon,
    // which internally calls cacheBankTx() and routes to /compliance/bank-tx/<id> — sessionStorage
    // seeded manually across two separate page.goto() calls was not reliably picked up.
    await openScreen(page, '/compliance', jwt);
    await page.getByRole('textbox').first().fill('E2E Bank Sender');
    await page.getByRole('button', { name: 'Search', exact: true }).click();

    const bankTxSection = page
      .getByText('Bank Transactions', { exact: true })
      .locator('xpath=following-sibling::div[1]');
    const bankTxRow = bankTxSection.locator('tbody tr', { hasText: btx.accountServiceRef }).first();
    await expect(bankTxRow).toBeVisible({ timeout: 15000 });
    await bankTxRow.locator('button, [role="button"]').last().click();

    await expect
      .poll(() => new URL(page.url()).pathname, {
        message: 'clicking the bank-tx row should navigate to /compliance/bank-tx/<id>',
        timeout: 15000,
      })
      .toBe(`/compliance/bank-tx/${btx.bankTxId}`);

    await expect(page.getByText('Bank Transaction', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(String(btx.bankTxId), { exact: true }).first()).toBeVisible();
    await expect(page.getByText(btx.accountServiceRef, { exact: true })).toBeVisible();
    await expect(page.getByText('321 CHF', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Recall erfassen', exact: true })).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // /compliance/bank-tx/:id/recall — create recall via UI + DB proof
  // -------------------------------------------------------------------------

  test('/compliance/bank-tx/:id/recall creates a recall via UI', async ({ page }) => {
    const { jwt, userId } = await loginAs('Compliance');
    await ensureStaffReady(userId);

    const btx = await createBankTx({ tag: 'cmp-btx-recall', amount: 150, type: 'BuyCrypto' });
    const comment = 'E2E recall comment n.a.';

    await openScreen(page, `/compliance/bank-tx/${btx.bankTxId}/recall`, jwt);

    await expect(page.getByText('Reason', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Fee', { exact: true })).toBeVisible();
    await expect(page.getByText('Comment', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create recall', exact: true })).toBeVisible();

    await selectStyledDropdown(page, 'Reason', 'DUPL');
    await styledInput(page, 'Fee').fill('500');
    await styledInput(page, 'Comment').fill(comment);

    const submit = page.getByRole('button', { name: 'Create recall', exact: true });
    await expect(submit).toBeEnabled({ timeout: 10000 });
    await submit.click();

    await expect(page.getByText('Recall created successfully', { exact: true })).toBeVisible({
      timeout: 20000,
    });

    const row = await waitForRow<{
      id: number;
      bankTxId: number;
      reason: string;
      fee: number;
      comment: string;
      sequence: number;
    }>(
      `SELECT id, "bankTxId" AS "bankTxId", reason, fee, comment, sequence
       FROM recall
       WHERE "bankTxId" = $1
       ORDER BY id DESC
       LIMIT 1`,
      [btx.bankTxId],
      20000,
    );
    expect(row.bankTxId).toBe(btx.bankTxId);
    expect(row.reason).toBe('DUPL');
    expect(Number(row.fee)).toBe(500);
    expect(row.comment).toBe(comment);
    expect(row.sequence).toBe(1);
  });

  // -------------------------------------------------------------------------
  // /compliance/bank-tx/:id/return — refund form (id = transactionId)
  // -------------------------------------------------------------------------

  test('/compliance/bank-tx/:id/return submits refund for a pending buy transaction', async ({ page }) => {
    const { jwt, userId } = await loginAs('Compliance');
    await ensureStaffReady(userId);

    // Refundable pending buy (amlCheck not PASS) — same shape as customer /tx/:id/refund coverage.
    // Route param is transactionId; ChargebackBase fee is seeded in global.setup.
    const customer = await createUser({
      tag: 'cmp-btx-return',
      kycLevel: 30,
      completePersonalData: true,
    });
    const tx = await createTransaction({
      state: 'pending_buy',
      tag: 'cmp-btx-return',
      userId: customer.userId,
      userDataId: customer.userDataId,
      jwt: customer.jwt,
      amount: 88,
      inputAsset: 'CHF',
    });
    expect(tx.transactionId, 'createTransaction must yield a transaction id').toBeGreaterThan(0);
    expect(tx.buyCryptoId, 'pending buy must have buy_crypto id').toBeTruthy();

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await openScreen(page, `/compliance/bank-tx/${tx.transactionId}/return`, jwt);

    await expect(page.getByText('Chargeback IBAN', { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: 'Confirm refund', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();

    // Address the fields by placeholder, not by their label text: the summary block above the form
    // repeats "Name" and "IBAN" as read-only rows, and resolving a label to the nearest ancestor
    // holding an input walked up to the form and filled its first field instead — the IBAN field
    // ended up with a person's name in it and the API answered "Refund iban not valid".
    await page.getByPlaceholder('CH...').fill(TEST_IBAN);
    await page.getByPlaceholder('John Doe').fill('E2E Creditor');
    await page.getByPlaceholder('Street', { exact: true }).fill('Bahnhofstrasse');
    await page.getByPlaceholder('xx', { exact: true }).fill('1');
    await page.getByPlaceholder('12345').fill('8001');
    await page.getByPlaceholder('City', { exact: true }).fill('Zurich');

    // Country is a StyledSearchDropdown (autocomplete="country" → input[name="country"]).
    const countryInput = page.locator('input[name="country"]');
    await expect(countryInput).toBeVisible({ timeout: 10000 });
    await countryInput.click();
    await countryInput.fill('Switzerland');
    await page.getByText('Switzerland', { exact: true }).first().click();

    const confirm = page.getByRole('button', { name: 'Confirm refund', exact: true });
    await expect(confirm).toBeEnabled({ timeout: 10000 });
    await confirm.click();

    await expect(page.getByText('Return initiated successfully', { exact: true })).toBeVisible({
      timeout: 20000,
    });

    await expect
      .poll(
        async () => {
          const row = await queryOne<{
            chargebackAmount: string | number | null;
            chargebackIban: string | null;
          }>(
            `SELECT "chargebackAmount", "chargebackIban"
             FROM buy_crypto WHERE id = $1`,
            [tx.buyCryptoId],
          );
          if (!row) return null;
          return {
            amountPositive: row.chargebackAmount != null && Number(row.chargebackAmount) > 0,
            hasIban: row.chargebackIban != null && row.chargebackIban.length > 0,
          };
        },
        { timeout: 20000, message: 'buy_crypto chargeback columns must be written after Confirm refund' },
      )
      .toEqual({ amountPositive: true, hasIban: true });

    // The return writes rows of its own that point at what this test created: a recall, and a
    // chargeback bank_tx on the same transaction. Register them so teardown removes them before
    // their parents — without that, deleting the transaction fails on a foreign key and the rows
    // stay behind for whatever runs next.
    const followUpBankTxIds = await queryRows<{ id: number }>(
      `SELECT id FROM bank_tx WHERE "transactionId" = $1 ORDER BY id ASC`,
      [tx.transactionId],
    );
    const recall = await queryOne<{ id: number }>(
      `SELECT r.id FROM recall r
       JOIN bank_tx b ON b.id = r."bankTxId"
       WHERE b."transactionId" = $1
       ORDER BY r.id DESC LIMIT 1`,
      [tx.transactionId],
    );
    for (const row of followUpBankTxIds) trackRow('bank_tx', row.id);
    if (recall) trackRow('recall', recall.id);

    expect(pageErrors, `uncaught pageerror on bank-tx return: ${pageErrors.join('; ')}`).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // /compliance/mros/create — create via UI + DB proof
  // -------------------------------------------------------------------------

  test('/compliance/mros/create creates an MROS case via UI', async ({ page }) => {
    const { jwt, userId } = await loginAs('Compliance');
    await ensureStaffReady(userId, 'MrosClerk');

    const customer = await createUser({
      tag: 'cmp-mros-create',
      kycLevel: 30,
      completePersonalData: true,
    });
    const authorityRef = `E2E-MROS-${customer.userDataId}`;

    await openScreen(page, '/compliance/mros/create', jwt);

    await expect(page.getByText('User Data ID', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Status', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Submission Date', { exact: true })).toBeVisible();
    await expect(page.getByText('MROS ID', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create MROS', exact: true })).toBeVisible();

    await styledInput(page, 'User Data ID').fill(String(customer.userDataId));
    // Status defaults to Draft via form defaultValues
    await styledInput(page, 'MROS ID').fill(authorityRef);

    const createBtn = page.getByRole('button', { name: 'Create MROS', exact: true });
    // Disabled while caseManager (from getProfile) is empty
    await expect(createBtn).toBeEnabled({ timeout: 15000 });
    await createBtn.click();

    await expect(page.getByText('MROS created successfully', { exact: true })).toBeVisible({
      timeout: 20000,
    });

    const row = await waitForRow<{
      id: number;
      userDataId: number;
      status: string;
      authorityReference: string;
      caseManager: string;
    }>(
      `SELECT id, "userDataId" AS "userDataId", status,
              "authorityReference" AS "authorityReference",
              "caseManager" AS "caseManager"
       FROM mros
       WHERE "userDataId" = $1 AND "authorityReference" = $2
       ORDER BY id DESC
       LIMIT 1`,
      [customer.userDataId, authorityRef],
      20000,
    );
    expect(row.userDataId).toBe(customer.userDataId);
    expect(row.status).toBe('Draft');
    expect(row.authorityReference).toBe(authorityRef);
    expect(row.caseManager.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // /compliance/call-queues/:queue + /:userDataId — outcome via UI + DB proof
  // -------------------------------------------------------------------------

  test('/compliance/call-queues/:queue and detail save a call outcome', async ({ page }) => {
    const { jwt, userId } = await loginAs('Compliance');
    await ensureStaffReady(userId, 'CallClerk');

    const entry = await createCallQueueEntry({
      tag: 'cmp-callq-outcome',
      phoneCallStatus: 'Unavailable',
    });

    // Discover the real queue name from the overview DOM (do not guess CallQueue enum strings)
    await openScreen(page, '/compliance/call-queues', jwt);
    await expect(page.getByText('Queue', { exact: true }).first()).toBeVisible({ timeout: 15000 });

    // Find the row that will contain our user: open each non-zero queue until we see userDataId,
    // or pick the first queue if only one is populated.
    const queueRows = page.locator('tbody tr');
    await expect(queueRows.first()).toBeVisible({ timeout: 15000 });
    const rowCount = await queueRows.count();
    expect(rowCount, 'at least one call queue should be listed after seeding').toBeGreaterThan(0);

    let queueName = '';
    let foundUserInQueue = false;

    for (let i = 0; i < rowCount; i++) {
      // The row shows the queue's label; its key (the URL segment) is on the row.
      const name = ((await queueRows.nth(i).getAttribute('data-queue')) ?? '').trim();
      const countText = (await queueRows.nth(i).locator('td').nth(1).innerText()).trim();
      if (!name || countText === '0') continue;

      await queueRows.nth(i).click();
      await page.waitForLoadState('networkidle');
      await expect
        .poll(() => normPath(new URL(page.url()).pathname), {
          message: `queue row should navigate to /compliance/call-queues/${name}`,
          timeout: 15000,
        })
        .toBe(`/compliance/call-queues/${name}`);

      // Queue list unique headers
      await expect(page.getByText('User', { exact: true }).first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('Phone', { exact: true }).first()).toBeVisible();

      const body = await page.locator('body').innerText();
      if (body.includes(String(entry.userDataId))) {
        queueName = name;
        foundUserInQueue = true;
        break;
      }

      // Go back to overview for next attempt
      await openScreen(page, '/compliance/call-queues', jwt);
      await expect(page.getByText('Queue', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    }

    expect(foundUserInQueue, `seeded userDataId ${entry.userDataId} must appear in some call queue`).toBe(true);
    expect(queueName.length).toBeGreaterThan(0);

    // Open the user detail (row click). Prefer the row that contains the userDataId.
    const userRow = page
      .locator('tbody tr')
      .filter({ hasText: String(entry.userDataId) })
      .first();
    await expect(userRow).toBeVisible();
    await userRow.click();
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'queue item click should open detail',
        timeout: 15000,
      })
      .toBe(`/compliance/call-queues/${queueName}/${entry.userDataId}`);

    // Detail screen unique content
    await expect(page.getByText('User Info', { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Save Outcome', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Signature', { exact: true })).toBeVisible();
    await expect(page.getByText('Outcome', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Outcome', exact: true })).toBeVisible();
    await expect(page.getByText('Signature', { exact: true }).locator('xpath=following-sibling::select')).toHaveCount(
      0,
    );

    const outcomeSelect = page.getByText('Outcome', { exact: true }).locator('xpath=following-sibling::select');
    await outcomeSelect.selectOption('Completed');
    await page.locator('textarea').fill('E2E call outcome: user reached, identity confirmed');

    const saveOutcome = page.getByRole('button', { name: 'Save Outcome', exact: true });
    await expect(saveOutcome).toBeEnabled({ timeout: 5000 });
    await saveOutcome.click();

    // On success the detail navigates back to the queue list
    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'successful outcome should navigate back to queue list',
        timeout: 20000,
      })
      .toBe(`/compliance/call-queues/${queueName}`);

    const ud = await waitForRow<{ phoneCallStatus: string }>(
      `SELECT "phoneCallStatus" AS "phoneCallStatus"
       FROM user_data
       WHERE id = $1 AND "phoneCallStatus" = 'Completed'`,
      [entry.userDataId],
      20000,
    );
    expect(ud.phoneCallStatus).toBe('Completed');
  });

  // -------------------------------------------------------------------------
  // /compliance/user/:id — onboarding fee (Admin) via UI + DB proof
  // -------------------------------------------------------------------------

  test('/compliance/user/:id sets and removes an onboarding fee and attributes the address', async ({ page }) => {
    const { jwt, userId } = await loginAs('Admin');
    await ensureStaffReady(userId);

    const ref = await seedOnboardingFeeRef();

    const customer = await createUser({
      tag: 'cmp-onboarding-fee',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });
    // Starting state the API transitions from: an NA account with an NA user.
    await queryRows(`UPDATE "user" SET status = 'NA' WHERE id = $1`, [customer.userId]);
    await queryRows(`UPDATE user_data SET status = 'NA' WHERE id = $1`, [customer.userDataId]);

    const before = await queryOne<{ usedRef: string | null }>(`SELECT "usedRef" FROM "user" WHERE id = $1`, [
      customer.userId,
    ]);
    expect(before?.usedRef).not.toBe(ref);

    await openScreen(page, `/compliance/user/${customer.userDataId}`, jwt);
    await expect(page.getByText('UserData', { exact: true }).first()).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: 'Set onboarding fee', exact: true }).click();
    await expect(page.locator('#onboarding-fee-amount')).toBeVisible({ timeout: 15000 });
    await page.locator('#onboarding-fee-amount').fill('5');
    await page.locator('#onboarding-fee-address').selectOption(customer.address);
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeEnabled({ timeout: 15000 });

    const putResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        new URL(response.url()).pathname === `/v1/userData/${customer.userDataId}/onboardingFee`,
    );
    await save.click();
    expect((await putResponse).status()).toBe(200);

    await expect(
      page.getByText(`Onboarding fee of 5 CHF set; ${customer.address} attributed to the key account manager.`, {
        exact: true,
      }),
    ).toBeVisible({ timeout: 20000 });

    // Attribution and status transition, asserted from the database.
    const userRow = await waitForRow<{ usedRef: string | null; status: string }>(
      `SELECT "usedRef", status FROM "user" WHERE id = $1 AND status = 'Active'`,
      [customer.userId],
      20000,
    );
    expect(userRow.usedRef).toBe(ref);

    const userDataRow = await waitForRow<{ status: string; individualFees: string | null }>(
      `SELECT status, "individualFees" FROM user_data WHERE id = $1 AND status = 'Active'`,
      [customer.userDataId],
      20000,
    );
    const assignedFeeIds = (userDataRow.individualFees ?? '').split(';').filter(Boolean);
    expect(assignedFeeIds.length).toBeGreaterThan(0);
    const feeRow = await waitForRow<{ id: number }>(
      `SELECT id FROM fee
       WHERE id = ANY($1::int[]) AND label = 'Onboarding Fixed 5' AND fixed = 5 AND active = true`,
      [assignedFeeIds.map(Number)],
      20000,
    );

    const log = await waitForRow<{ id: number }>(
      `SELECT id FROM support_log
       WHERE "userDataId" = $1 AND type = 'SupportLog' AND clerk = $2 AND message LIKE $3`,
      [
        customer.userDataId,
        'E2E Test Staff',
        `Onboarding fee usedRef of user ${customer.userId} % -> ${ref}; status NA -> Active; account status NA -> Active`,
      ],
      20000,
    );
    trackRow('support_log', log.id);

    // The reloaded Users tab shows the new status. That table has no usedRef column, so the
    // attribution itself is proven by the database assertion above.
    await page.getByRole('button', { name: /Users \(/ }).click();
    const usersRow = page.locator('tbody tr').filter({ hasText: customer.address }).first();
    await expect(usersRow).toContainText('Active', { timeout: 20000 });

    // Remove the fee again through the UI.
    await page.getByRole('button', { name: 'Remove onboarding fee', exact: true }).click();
    await expect(page.getByText('Remove the onboarding fee of this account?', { exact: true })).toBeVisible();
    const deleteResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        new URL(response.url()).pathname === `/v1/userData/${customer.userDataId}/onboardingFee`,
    );
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    expect((await deleteResponse).status()).toBe(200);
    await expect(page.getByText('Onboarding fee removed.', { exact: true })).toBeVisible({ timeout: 20000 });

    await expect
      .poll(
        async () => {
          const row = await queryOne<{ individualFees: string | null }>(
            `SELECT "individualFees" FROM user_data WHERE id = $1`,
            [customer.userDataId],
          );
          return (row?.individualFees ?? '').split(';').filter(Boolean).includes(String(feeRow.id));
        },
        { timeout: 20000, message: 'the onboarding fee id must be gone from user_data.individualFees' },
      )
      .toBe(false);
  });

  test('/compliance/user/:id shows the blocked-address error for an onboarding fee and changes nothing', async ({
    page,
  }) => {
    const { jwt, userId } = await loginAs('Admin');
    await ensureStaffReady(userId);
    await seedOnboardingFeeRef();

    const customer = await createUser({
      tag: 'cmp-onboarding-fee-blocked',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });
    await queryRows(`UPDATE "user" SET status = 'Blocked' WHERE id = $1`, [customer.userId]);

    const beforeUser = await queryOne<{ usedRef: string | null; status: string }>(
      `SELECT "usedRef", status FROM "user" WHERE id = $1`,
      [customer.userId],
    );
    const beforeUserData = await queryOne<{ status: string; individualFees: string | null }>(
      `SELECT status, "individualFees" FROM user_data WHERE id = $1`,
      [customer.userDataId],
    );

    await openScreen(page, `/compliance/user/${customer.userDataId}`, jwt);
    await expect(page.getByText('UserData', { exact: true }).first()).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: 'Set onboarding fee', exact: true }).click();
    await expect(page.locator('#onboarding-fee-amount')).toBeVisible({ timeout: 15000 });
    await page.locator('#onboarding-fee-amount').fill('5');
    await page.locator('#onboarding-fee-address').selectOption(customer.address);
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeEnabled({ timeout: 15000 });

    const putResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        new URL(response.url()).pathname === `/v1/userData/${customer.userDataId}/onboardingFee`,
    );
    await save.click();
    expect((await putResponse).status()).toBe(400);

    await expect(page.getByText('Address is blocked or deleted', { exact: true })).toBeVisible({ timeout: 20000 });

    const afterUser = await queryOne<{ usedRef: string | null; status: string }>(
      `SELECT "usedRef", status FROM "user" WHERE id = $1`,
      [customer.userId],
    );
    const afterUserData = await queryOne<{ status: string; individualFees: string | null }>(
      `SELECT status, "individualFees" FROM user_data WHERE id = $1`,
      [customer.userDataId],
    );
    expect(afterUser).toEqual(beforeUser);
    expect(afterUserData).toEqual(beforeUserData);

    // The refusal itself is audited: one rejection row naming the clerk, the amount, the address and
    // the reason - and no attribution row.
    await waitForRow(
      `SELECT id FROM support_log
       WHERE "userDataId" = $1 AND type = 'SupportLog' AND clerk = $2 AND message = $3 AND comment = $4`,
      [
        customer.userDataId,
        'E2E Test Staff',
        `Onboarding fee 5 CHF for ${customer.address} rejected`,
        'Address is blocked or deleted',
      ],
      15000,
    );
    const attributionLogs = await queryRows(
      `SELECT id FROM support_log WHERE "userDataId" = $1 AND message LIKE 'Onboarding fee usedRef of user %'`,
      [customer.userDataId],
    );
    expect(attributionLogs).toEqual([]);
  });
});
