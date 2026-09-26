/**
 * App2 KYC continuation coverage for organizational authority/ownership,
 * recommendation, financial questionnaire, and the deprecated Auto Ident state.
 * The browser uses the real App2 bundle and local API; submitted KYC results are
 * read back from PostgreSQL. SQL only prepares a deterministic pending step and
 * an eligible recommender.
 *
 * Unavailable integration lanes: Sumsub/IDnow hosted identity handoff and
 * provider-side completion/rejection require credentials/provider callbacks that
 * the local stack does not expose. The financial, beneficial-owner, and Ident
 * cases obtain real local mail TFA codes from Notification rows, including one
 * rejected-code retry. Limit request status and required-name validation are
 * covered by app2-kyc-support-limit-extra.spec.ts.
 */

import type { Page } from '@playwright/test';
import { expect, test, waitForRow, withDb } from './fixtures';
import { cleanupCreatedData, createKycStep, createUser } from './fixtures/factories';

async function openApp2(page: Page, jwt: string, hash: string): Promise<void> {
  const response = await page.goto(`/app2/?session=${encodeURIComponent(jwt)}${hash}`);
  expect(response?.ok(), `App2 ${hash} should load (HTTP ${response?.status() ?? 'no response'})`).toBe(true);
  await page.waitForFunction((token) => localStorage.getItem('dfx.authenticationToken') === token, jwt);
}

async function seedPendingStep(
  userDataId: number,
  name: string,
  type?: string,
): Promise<{ kycStepId: number }> {
  await withDb(async (client) => {
    await client.query(`UPDATE kyc_step SET status = 'Completed' WHERE "userDataId" = $1`, [userDataId]);
  });
  return createKycStep(userDataId, { name, type, status: 'InProgress', sequenceNumber: 900 });
}

async function waitForStepResult(userDataId: number, stepId: number): Promise<{ status: string; result: string }> {
  return waitForRow<{ status: string; result: string }>(
    `SELECT status, result FROM kyc_step WHERE id = $1 AND "userDataId" = $2 AND result IS NOT NULL`,
    [stepId, userDataId],
    30000,
  );
}

async function completeKycMailTwoFactor(page: Page, userDataId: number, checkRejectedCode = false): Promise<void> {
  const input = page.getByPlaceholder('000000');
  await expect(input).toBeVisible({ timeout: 20000 });
  const mail = await waitForRow<{ data: string }>(
    `SELECT data FROM notification WHERE "userDataId" = $1 AND context = 'VerificationMail' ORDER BY id DESC LIMIT 1`,
    [userDataId],
    20000,
  );
  const data = JSON.parse(mail.data) as { texts?: Array<{ params?: { code?: string } }> };
  const code = data.texts?.map((item) => item.params?.code).find((value) => typeof value === 'string');
  if (!code) throw new Error('Local VerificationMail notification did not contain a 2FA code');

  if (checkRejectedCode) {
    const wrongCode = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
    await input.fill(wrongCode);
    await page.getByRole('button', { name: /^continue$/i }).click();
    await expect(page.getByText('Invalid or expired code', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(input).toBeVisible();
  }

  await input.fill(code);
  await page.getByRole('button', { name: /^continue$/i }).click();
  await waitForRow(
    `SELECT id FROM kyc_log WHERE "userDataId" = $1 AND type = 'TfaLog' ORDER BY id DESC LIMIT 1`,
    [userDataId],
    20000,
  );
}

test.describe('App2 extended KYC checklist', () => {
  test.afterEach(async () => {
    await cleanupCreatedData();
  });

  test('organization signatory selection submits through App2 and persists the authority result', async ({ page }) => {
    const user = await createUser({ tag: 'app2-kyc-signatory', kycLevel: 0, language: 'EN' });
    await withDb(async (db) => {
      await db.query(`UPDATE user_data SET "accountType" = 'Organization' WHERE id = $1`, [user.userDataId]);
    });
    const step = await seedPendingStep(user.userDataId, 'SignatoryPower');

    await openApp2(page, user.jwt, '#/kyc?auto-start=true');
    const form = page.locator('form').filter({ has: page.locator('select') });
    await expect(form).toBeVisible({ timeout: 30000 });
    await form.locator('select').selectOption('Double');
    await form.getByRole('button', { name: /^continue$/i }).click();

    const saved = await waitForStepResult(user.userDataId, step.kycStepId);
    expect(['InternalReview', 'ManualReview', 'Completed']).toContain(saved.status);
    expect(JSON.parse(saved.result)).toMatchObject({ signatoryPower: 'Double' });
  });

  test('beneficial owner form validates incomplete owners and persists a complete owner from the UI', async ({ page }) => {
    const user = await createUser({ tag: 'app2-kyc-beneficial-owner', kycLevel: 0, language: 'EN' });
    await withDb(async (db) => {
      await db.query(`UPDATE user_data SET "accountType" = 'Organization' WHERE id = $1`, [user.userDataId]);
    });
    const step = await seedPendingStep(user.userDataId, 'BeneficialOwner');

    await openApp2(page, user.jwt, '#/kyc?auto-start=true');
    await completeKycMailTwoFactor(page, user.userDataId);
    const form = page.locator('form').filter({ has: page.locator('select') });
    await expect(form.locator('select').first()).toBeVisible({ timeout: 30000 });
    await form.locator('select').nth(0).selectOption('true');
    const submit = form.getByRole('button', { name: /^continue$/i });
    await expect(submit).toBeDisabled();

    await form.getByPlaceholder('First name').fill('Local');
    await form.getByPlaceholder('Last name').fill('Owner');
    await form.getByPlaceholder('Street').fill('Bahnhofstrasse');
    await form.getByPlaceholder('No.').fill('8');
    await form.getByPlaceholder('ZIP').fill('8001');
    await form.getByPlaceholder('City').fill('Zurich');
    await form.locator('select').nth(2).selectOption({ label: 'Switzerland' });
    const selectedCountryId = Number(await form.locator('select').nth(2).inputValue());
    await expect(submit).toBeEnabled();
    await submit.click();

    const saved = await waitForStepResult(user.userDataId, step.kycStepId);
    const result = JSON.parse(saved.result);
    expect(['InternalReview', 'ManualReview', 'Completed']).toContain(saved.status);
    expect(result).toMatchObject({
      hasBeneficialOwners: true,
      isAccountHolderInvolved: true,
      beneficialOwners: [{
        firstName: 'Local',
        lastName: 'Owner',
        street: 'Bahnhofstrasse',
        houseNumber: '8',
        zip: '8001',
        city: 'Zurich',
        country: { id: selectedCountryId },
      }],
    });
    const savedCountry = await waitForRow<{ symbol: string }>(
      `SELECT symbol FROM country WHERE id = $1`,
      [result.beneficialOwners[0].country.id],
    );
    expect(savedCountry.symbol).toBe('CH');
    const userSummary = await waitForRow<{ allBeneficialOwnersName: string; allBeneficialOwnersDomicile: string }>(
      `SELECT "allBeneficialOwnersName" AS "allBeneficialOwnersName",
              "allBeneficialOwnersDomicile" AS "allBeneficialOwnersDomicile"
       FROM user_data WHERE id = $1 AND "allBeneficialOwnersName" IS NOT NULL`,
      [user.userDataId],
    );
    expect(userSummary).toEqual({ allBeneficialOwnersName: 'Local Owner', allBeneficialOwnersDomicile: 'Switzerland' });
  });

  test('recommendation email creates a real pending referral and persists its step result', async ({ page }) => {
    const user = await createUser({ tag: 'app2-kyc-recommendation-user', kycLevel: 0, language: 'EN' });
    const recommender = await createUser({ tag: 'app2-kyc-recommendation-source', kycLevel: 50, language: 'EN' });
    await withDb(async (db) => {
      await db.query(`UPDATE user_data SET "tradeApprovalDate" = NOW(), "buyVolume" = 100 WHERE id = $1`, [recommender.userDataId]);
    });
    const step = await seedPendingStep(user.userDataId, 'Recommendation');

    await openApp2(page, user.jwt, '#/kyc?auto-start=true');
    const form = page.locator('form');
    const emailInput = form.locator('input[autocomplete="off"]');
    await expect(emailInput).toBeVisible({ timeout: 30000 });
    await emailInput.fill(recommender.mail);
    await form.getByRole('button', { name: /^continue$/i }).click();

    const saved = await waitForStepResult(user.userDataId, step.kycStepId);
    expect(saved.status).toBe('InternalReview');
    expect(JSON.parse(saved.result)).toMatchObject({ key: recommender.mail });
    const recommendation = await waitForRow<{
      id: number;
      method: string;
      type: string;
      confirmed: boolean | null;
      recommenderId: number;
      recommendedId: number;
      kycStepId: number;
    }>(
      `SELECT id, method, type, "isConfirmed" AS confirmed,
              "recommenderId" AS "recommenderId", "recommendedId" AS "recommendedId",
              "kycStepId" AS "kycStepId"
       FROM recommendation WHERE "kycStepId" = $1 AND "recommendedId" = $2`,
      [step.kycStepId, user.userDataId],
    );
    expect(recommendation).toMatchObject({
      method: 'Mail',
      type: 'Request',
      confirmed: null,
      recommenderId: recommender.userDataId,
      recommendedId: user.userDataId,
      kycStepId: step.kycStepId,
    });
  });

  test('financial questionnaire loads from the local API and persists each browser answer', async ({ page }) => {
    test.setTimeout(180000);
    const user = await createUser({ tag: 'app2-kyc-financial', kycLevel: 0, language: 'EN' });
    const step = await seedPendingStep(user.userDataId, 'FinancialData');
    const questionsResponse = page.waitForResponse((response) =>
      response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith(`/data/financial/${step.kycStepId}`),
    );

    await openApp2(page, user.jwt, '#/kyc?auto-start=true');
    await completeKycMailTwoFactor(page, user.userDataId, true);
    const response = await questionsResponse;
    expect(response.ok(), 'FinancialData form must load its real local questionnaire').toBe(true);
    const questions = (await response.json()) as { questions: Array<{ key: string; type: string; title: string }> };
    expect(questions.questions.length).toBeGreaterThan(0);

    const visitedQuestionKeys = new Set<string>();
    const answers = new Map<string, string>();
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const result = await withDb(async (db) =>
        (await db.query<{ status: string; result: string | null }>(
          `SELECT status, result FROM kyc_step WHERE id = $1`, [step.kycStepId],
        )).rows[0],
      );
      const savedResponses = result?.result ? JSON.parse(result.result) as Array<{ key: string; value: string }> : [];
      for (const saved of savedResponses) answers.set(saved.key, saved.value);
      if (result?.status === 'InternalReview' || result?.status === 'ManualReview' || result?.status === 'Completed') break;

      const form = page.locator('form').filter({ has: page.getByRole('button', { name: /^continue$/i }) });
      await expect(form).toBeVisible({ timeout: 20000 });
      const currentTitle = (await form.locator('label').first().innerText()).trim();
      const currentQuestion = questions.questions.find((question) => question.title.trim() === currentTitle);
      expect(currentQuestion, `visible question "${currentTitle}" must come from the API questionnaire`).toBeDefined();
      visitedQuestionKeys.add(currentQuestion!.key);
      const previousResponseCount = answers.size;
      const checkboxes = form.locator('input[type="checkbox"]');
      const select = form.locator('select').first();
      const textInput = form.locator('input:not([type="checkbox"])').first();

      if (await select.count()) {
        await select.selectOption({ index: 0 });
      } else if (await checkboxes.count()) {
        await checkboxes.first().check();
      } else {
        await textInput.fill('Local E2E financial answer');
      }
      await form.getByRole('button', { name: /^continue$/i }).click();
      // A browser action must create a persisted response before we advance the loop.
      await expect.poll(async () => {
        const row = await withDb(async (db) =>
          (await db.query<{ result: string | null }>(`SELECT result FROM kyc_step WHERE id = $1`, [step.kycStepId])).rows[0],
        );
        const persisted = row?.result ? JSON.parse(row.result) as Array<{ key: string; value: string }> : [];
        for (const answer of persisted) answers.set(answer.key, answer.value);
        return persisted.length;
      }, { timeout: 20000 }).toBeGreaterThan(previousResponseCount);
      expect(currentTitle).not.toBe('');
    }

    const finalStep = await waitForStepResult(user.userDataId, step.kycStepId);
    const finalResponses = JSON.parse(finalStep.result) as Array<{ key: string; value: string }>;
    expect(['InternalReview', 'ManualReview', 'Completed']).toContain(finalStep.status);
    expect(new Set(finalResponses.map((answer) => answer.key))).toEqual(visitedQuestionKeys);
    expect(finalResponses.every((answer) => answer.value.length > 0)).toBe(true);
  });

  test('deprecated Auto Ident remains pending without a provider session or review handoff', async ({ page }) => {
    const user = await createUser({ tag: 'app2-kyc-ident-poll', kycLevel: 0, language: 'EN' });
    const step = await seedPendingStep(user.userDataId, 'Ident', 'Auto');

    await openApp2(page, user.jwt, '#/kyc?auto-start=true');
    await completeKycMailTwoFactor(page, user.userDataId);
    await expect(page.getByRole('heading', { name: 'Verification (KYC)' })).toBeVisible({ timeout: 30000 });
    await expect(page.getByPlaceholder('000000')).toHaveCount(0);
    await expect(page.getByText(/DFX is reviewing this step/)).toHaveCount(0);
    // IdNow Auto is deprecated and has no client session: backend KycInfoMapper
    // excludes it as currentStep; App2 therefore does not claim that this step is
    // in review. Other current KYC steps can still legitimately render a form.
    // The provider-side completion/rejection path cannot be exercised locally.
    const pending = await waitForRow<{ status: string; result: string | null }>(
      `SELECT status, result FROM kyc_step WHERE id = $1 AND "userDataId" = $2`,
      [step.kycStepId, user.userDataId],
    );
    expect(pending).toEqual({ status: 'InProgress', result: null });
  });
});
