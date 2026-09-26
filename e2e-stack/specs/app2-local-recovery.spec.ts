/**
 * App2 recovery and callback flows against the local API/Postgres stack.
 * Browser HTTP is not mocked. Seed SQL is limited to states that the local stack cannot
 * produce deterministically (pending KYC steps and a completed CKO lookup).
 * Checkout.com and WalletConnect provider callbacks/pairing remain external integration gaps.
 */

import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { apiGet, expect, queryOne, test, waitForRow, withDb } from './fixtures';
import { cleanupCreatedData, createKycStep, createTransaction, createUser, trackRow } from './fixtures/factories';

async function openApp2(page: Page, jwt: string, hash: string): Promise<void> {
  const path = `/app2/?session=${encodeURIComponent(jwt)}${hash}`;
  const response = await page.goto(path);
  expect(response?.ok(), `App2 ${hash} should load (HTTP ${response?.status() ?? 'no response'})`).toBe(true);
  await page.waitForFunction((token) => localStorage.getItem('dfx.authenticationToken') === token, jwt);
}

test.describe('App2 local recovery and callback flows', () => {
  test.afterEach(async () => {
    await cleanupCreatedData();
  });

  test('failed AML buy reloads from transaction history and submits a bank refund through the real API', async ({ page }) => {
    const user = await createUser({ tag: 'app2-recovery-refund', kycLevel: 30, completePersonalData: true, language: 'EN' });
    const tx = await createTransaction({
      tag: 'app2-recovery-refund',
      state: 'pending_buy',
      userId: user.userId,
      userDataId: user.userDataId,
      jwt: user.jwt,
      amount: 25,
      // A pending AML check is deliberately rendered as the privacy-preserving "Under review"
      // state, even when its internal reason is KycDataNeeded. A failed check is refundable.
      amlReason: 'KycDataNeeded',
      amlCheck: 'Fail',
    });

    await openApp2(page, user.jwt, '#/tx');
    const txRow = page.locator('details').filter({ hasText: 'Failed' });
    await expect(txRow).toBeVisible();
    await expect(txRow).toContainText('Failed');
    await page.reload();
    const reloadedRow = page.locator('details').filter({ hasText: 'Failed' });
    await expect(reloadedRow).toBeVisible();
    await expect(reloadedRow).toContainText('Failed');
    await reloadedRow.locator('summary').click();
    await reloadedRow.getByRole('button', { name: /Refund/i }).click();

    const refundIban = reloadedRow.getByPlaceholder('DE..');
    await expect(refundIban).toBeVisible();
    // This refund is bound to the originating bank account; the UI correctly renders
    // its server-supplied target as read-only instead of accepting a replacement IBAN.
    await expect(refundIban).toHaveAttribute('readonly');
    const refundTargetIban = await refundIban.inputValue();
    expect(refundTargetIban).toMatch(/^[A-Z]{2}\d{2}/);
    const fields = reloadedRow.locator('input');
    await fields.nth(1).fill('E2E Refund Recipient');
    await fields.nth(2).fill('Teststrasse');
    await fields.nth(3).fill('7');
    await fields.nth(4).fill('6300');
    await fields.nth(5).fill('Zug');

    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'PUT' && /\/v1\/transaction\/\d+\/refund$/.test(url.pathname);
    });
    await reloadedRow.getByRole('button', { name: 'Confirm refund' }).click();
    const response = await responsePromise;
    const responseBody = await response.text();
    expect(
      response.status(),
      `the App2 refund action should be accepted by the local API; response body: ${responseBody || '(empty)'}`,
    ).toBe(200);

    const saved = await waitForRow<{ chargebackIban: string; chargebackCreditorData: string }>(
      `SELECT "chargebackIban", "chargebackCreditorData" FROM buy_crypto WHERE id = $1`,
      [tx.buyCryptoId],
    );
    expect(saved.chargebackIban).toBe(refundTargetIban);
    expect(JSON.parse(saved.chargebackCreditorData)).toMatchObject({ name: 'E2E Refund Recipient', city: 'Zug', country: 'CH' });
    await expect(reloadedRow.getByText('Refund requested', { exact: true })).toBeVisible();
  });

  test('incoming referrals can be accepted and rejected, with status reloaded from API and database', async ({ page }) => {
    const owner = await createUser({ tag: 'app2-referral-decisions', kycLevel: 50, completePersonalData: true, language: 'EN' });
    // The API DTO prefers recommended.completeName over recommendedAlias. Use a distinct
    // referred user per request so the displayed names and decision cards are unambiguous.
    const acceptedUser = await createUser({ tag: 'app2-referral-accepted', kycLevel: 0, language: 'EN' });
    const rejectedUser = await createUser({ tag: 'app2-referral-rejected', kycLevel: 0, language: 'EN' });
    await withDb(async (db) => {
      // The backend confirm guard requires a real eligible referrer and trade history.
      await db.query(`UPDATE user_data SET "tradeApprovalDate" = NOW(), "buyVolume" = 100 WHERE id = $1`, [owner.userDataId]);
      // Give both real recommended users distinct mapper-visible names. The DTO uses
      // completeName in preference to recommendedAlias, and the factory defaults both to E2E Tester.
      await db.query(`UPDATE user_data SET firstname = 'E2E Accepted', surname = 'Invite' WHERE id = $1`, [acceptedUser.userDataId]);
      await db.query(`UPDATE user_data SET firstname = 'E2E Rejected', surname = 'Invite' WHERE id = $1`, [rejectedUser.userDataId]);
    });

    // Create each incoming request through the referred user's real KYC form and API. SQL only
    // prepares the deterministic pending step; it does not fabricate either recommendation row.
    const acceptedStep = await seedRecommendationStep(acceptedUser.userDataId);
    await openApp2(page, acceptedUser.jwt, '#/kyc?auto-start=true');
    await submitRecommendationEmail(page, owner.mail);
    const acceptedRow = await waitForRow<{ id: number; recommenderId: number; recommendedId: number; status: string }>(
      `SELECT id, "recommenderId" AS "recommenderId", "recommendedId" AS "recommendedId", "isConfirmed" AS status
       FROM recommendation WHERE "kycStepId" = $1 AND "recommendedId" = $2`,
      [acceptedStep.kycStepId, acceptedUser.userDataId],
    );
    expect(acceptedRow).toMatchObject({ recommenderId: owner.userDataId, recommendedId: acceptedUser.userDataId, status: null });
    trackRow('recommendation', acceptedRow.id);

    const rejectedStep = await seedRecommendationStep(rejectedUser.userDataId);
    await openApp2(page, rejectedUser.jwt, '#/kyc?auto-start=true');
    await submitRecommendationEmail(page, owner.mail);
    const rejectedRow = await waitForRow<{ id: number; recommenderId: number; recommendedId: number; status: string }>(
      `SELECT id, "recommenderId" AS "recommenderId", "recommendedId" AS "recommendedId", "isConfirmed" AS status
       FROM recommendation WHERE "kycStepId" = $1 AND "recommendedId" = $2`,
      [rejectedStep.kycStepId, rejectedUser.userDataId],
    );
    expect(rejectedRow).toMatchObject({ recommenderId: owner.userDataId, recommendedId: rejectedUser.userDataId, status: null });
    trackRow('recommendation', rejectedRow.id);
    const acceptId = acceptedRow.id;
    const rejectId = rejectedRow.id;

    const recommendationRows = await apiGet<Array<{ id: number; name: string; status: string }>>('recommendation', {
      jwt: owner.jwt,
    });
    const acceptedDto = recommendationRows.find((row) => row.id === acceptId);
    const rejectedDto = recommendationRows.find((row) => row.id === rejectId);
    expect(acceptedDto).toMatchObject({ id: acceptId, status: 'Pending' });
    expect(rejectedDto).toMatchObject({ id: rejectId, status: 'Pending' });
    expect(acceptedDto?.name).toBeTruthy();
    expect(rejectedDto?.name).toBeTruthy();

    await openApp2(page, owner.jwt, '#/account');
    await page.getByText('Invite & earn', { exact: true }).click();
    const acceptedCard = page.getByText(acceptedDto!.name, { exact: true }).locator('xpath=../../..');
    const rejectedCard = page.getByText(rejectedDto!.name, { exact: true }).locator('xpath=../../..');
    await expect(acceptedCard).toContainText('Pending');
    await expect(rejectedCard).toContainText('Pending');

    const acceptedResponse = page.waitForResponse((response) =>
      response.request().method() === 'PUT' && new URL(response.url()).pathname.endsWith(`/recommendation/${acceptId}/confirm`),
    );
    await acceptedCard.getByRole('button', { name: /Confirm/i }).click();
    expect((await acceptedResponse).status()).toBe(200);
    // The App2 card renders the localized st_Completed label ("Confirmed"); the API DTO
    // contract uses RecommendationDtoStatus.COMPLETED ("Completed").
    await expect(acceptedCard).toContainText('Confirmed');
    const confirmedApiRows = await apiGet<Array<{ id: number; status: string }>>('recommendation', { jwt: owner.jwt });
    expect(confirmedApiRows.find((row) => row.id === acceptId)?.status).toBe('Completed');

    const rejectedResponse = page.waitForResponse((response) =>
      response.request().method() === 'PUT' && new URL(response.url()).pathname.endsWith(`/recommendation/${rejectId}/reject`),
    );
    await rejectedCard.getByRole('button', { name: /Reject/i }).click();
    expect((await rejectedResponse).status()).toBe(200);
    await expect(rejectedCard).toContainText('Rejected');

    const dbStates = await withDb(async (db) =>
      (await db.query(`SELECT id, "isConfirmed" AS confirmed FROM recommendation WHERE id = ANY($1::int[]) ORDER BY id`, [[acceptId, rejectId]])).rows,
    );
    expect(dbStates).toEqual([{ id: acceptId, confirmed: true }, { id: rejectId, confirmed: false }]);
    const statusRows = await apiGet<Array<{ id: number; status: string }>>('recommendation', { jwt: owner.jwt });
    expect(statusRows.find((row) => row.id === acceptId)?.status).toBe('Completed');
    expect(statusRows.find((row) => row.id === rejectId)?.status).toBe('Rejected');
    expect(statusRows.find((row) => row.id === rejectId)?.status).toBe('Rejected');
  });

  test('Checkout success return resolves the seeded payment from API; failure retry returns to App2', async ({ page }) => {
    test.setTimeout(90000);
    const user = await createUser({ tag: 'app2-cko-return', language: 'EN' });
    const tx = await createTransaction({
      tag: 'app2-cko-return',
      state: 'completed_buy',
      userId: user.userId,
      userDataId: user.userDataId,
      jwt: user.jwt,
      amount: 31,
    });
    const paymentId = `e2e-${randomUUID()}`;
    const checkout = await withDb(async (db) => {
      const result = await db.query<{ id: number }>(
        `INSERT INTO checkout_tx ("paymentId", "requestedOn", amount, currency, status, raw, "transactionId")
        VALUES ($1, NOW(), $2, 'CHF', 'Captured', $3, $4) RETURNING id`,
        [paymentId, 31, JSON.stringify({ id: paymentId, status: 'CAPTURED' }), tx.transactionId],
      );
      return result.rows[0];
    });
    trackRow('checkout_tx', checkout.id);

    if (tx.transactionId == null || tx.buyId == null) {
      throw new Error('completed_buy fixture must provide both transactionId and buyId');
    }
    const readUserPaymentRows = () => queryOne<{
      buyRows: number;
      transactionRows: number;
      seededBuyRows: number;
      seededTransactionRows: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM buy WHERE "userId" = $1) AS "buyRows",
         (SELECT COUNT(*)::int FROM transaction WHERE "userId" = $1) AS "transactionRows",
         (SELECT COUNT(*)::int FROM buy WHERE id = $2 AND "userId" = $1) AS "seededBuyRows",
         (SELECT COUNT(*)::int FROM transaction WHERE id = $3 AND "userId" = $1) AS "seededTransactionRows"`,
      [user.userId, tx.buyId, tx.transactionId],
    );
    const paymentInfoRequests: Array<{ method: string; path: string }> = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (/^\/v1\/(?:buy|sell)\/paymentInfos(?:\/|$)/.test(url.pathname)) {
        paymentInfoRequests.push({ method: request.method(), path: url.pathname });
      }
    });

    const lookupResponsePromise = page.waitForResponse((response) =>
      response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith('/transaction/single') && new URL(response.url()).searchParams.get('cko-id') === paymentId,
    );
    await openApp2(page, user.jwt, `#/buy/success?cko-payment-id=${encodeURIComponent(paymentId)}`);
    const lookupResponse = await lookupResponsePromise;
    expect(lookupResponse.status(), 'the success route should resolve the payment through the real transaction API').toBe(200);
    expect((await lookupResponse.json() as { uid?: string }).uid).toBe(tx.uid);
    // The result panel intentionally renders the confirmation title and transaction UID
    // inside the same element, so exact text matching the title alone cannot match it.
    // Anchor on the exact UID and require the success message in that visible panel.
    const successUid = page.getByText(tx.uid, { exact: true });
    await expect(successUid).toBeVisible({ timeout: 15000 });
    await expect(successUid.locator('xpath=..')).toContainText('Payment confirmed');

    const beforeFailureReturn = await readUserPaymentRows();
    expect(beforeFailureReturn).toMatchObject({ seededBuyRows: 1, seededTransactionRows: 1 });
    expect(paymentInfoRequests, 'the success return should only look up the seeded transaction').toEqual([]);

    await page.goto('/app2/#/buy/failure');
    await expect(page.getByRole('button', { name: /Retry/i })).toBeVisible();
    const beforeRetry = await readUserPaymentRows();
    expect(beforeRetry).toEqual(beforeFailureReturn);
    const paymentInfoRequestsBeforeRetry = paymentInfoRequests.length;
    await page.getByRole('button', { name: /Retry/i }).click();
    await expect(page).toHaveURL(/\/app2\/#\/$/);
    await expect(page.locator('body')).not.toContainText(/payment confirmed/i);
    await page.waitForLoadState('networkidle');
    const afterRetry = await readUserPaymentRows();
    expect(afterRetry, 'Retry returns to App2 without adding a buy or transaction row').toEqual(beforeRetry);
    expect(
      paymentInfoRequests.length,
      'the observed browser flow after the failure return must not send another payment-info request',
    ).toBe(paymentInfoRequestsBeforeRetry);
  });
});

async function seedRecommendationStep(userDataId: number): Promise<{ kycStepId: number }> {
  await withDb(async (db) => {
    await db.query(`UPDATE kyc_step SET status = 'Completed' WHERE "userDataId" = $1`, [userDataId]);
  });
  return createKycStep(userDataId, { name: 'Recommendation', status: 'InProgress', sequenceNumber: 900 });
}

async function submitRecommendationEmail(page: Page, email: string): Promise<void> {
  const form = page.locator('form');
  const emailInput = form.locator('input[autocomplete="off"]');
  await expect(emailInput).toBeVisible({ timeout: 30000 });
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === 'PUT' && new URL(response.url()).pathname.includes('/kyc/'),
  );
  await emailInput.fill(email);
  await form.getByRole('button', { name: /^continue$/i }).click();
  const response = await responsePromise;
  expect(response.ok(), `KYC recommendation submission returned HTTP ${response.status()}`).toBe(true);
}
