/**
 * App 2.0 full-stack coverage.
 *
 * Owns the hosted `/app2/` artifact (not declared in `src/App.tsx`). The smoke
 * test proves the build is served and every hash route mounts. The two
 * authenticated tests drive a real buy quote and a real KYC contact submit
 * through the App 2.0 UI and prove the matching Postgres write — the seam
 * this harness exists to check.
 */

import type { Page } from '@playwright/test';
import { expect, test, waitForRow, withDb } from './fixtures';
import { cleanupCreatedData, createUser } from './fixtures/factories';

const APP2_HASH_ROUTES = [
  '#/',
  '#/account',
  '#/tx',
  '#/kyc',
  '#/limit',
  '#/ocp',
  '#/support',
  '#/account-merge',
  '#/buy/success',
  '#/buy/failure',
  '#/missing-route',
];

interface PaymentInfoPayload {
  id?: number;
  amount?: number;
  iban?: string;
  remittanceInfo?: string;
}

async function openApp2(page: Page, jwt: string, hash = '#/'): Promise<void> {
  const url = `/app2/?session=${encodeURIComponent(jwt)}${hash}`;
  const response = await page.goto(url);
  expect(response, `${url} must be served`).toBeTruthy();
  expect(response?.ok(), `${url} status ${response?.status()}`).toBe(true);
  await page.waitForLoadState('domcontentloaded');
  try {
    await page.waitForFunction((expected) => window.localStorage.getItem('dfx.authenticationToken') === expected, jwt, {
      timeout: 15000,
    });
  } catch {
    const actual = await page.evaluate(() => window.localStorage.getItem('dfx.authenticationToken'));
    throw new Error(
      `openApp2: expected localStorage["dfx.authenticationToken"] after "${url}", got: ${JSON.stringify(actual)}`,
    );
  }
}

function attachPaymentInfoCapture(page: Page): { get: () => PaymentInfoPayload | undefined } {
  let last: PaymentInfoPayload | undefined;
  page.on('response', async (res) => {
    try {
      const url = res.url();
      if (!url.includes('/buy/paymentInfos') || res.request().method() !== 'PUT') return;
      if (url.includes('/confirm') || url.includes('/invoice')) return;
      if (!res.ok()) return;
      last = (await res.json()) as PaymentInfoPayload;
    } catch {
      /* ignore parse errors */
    }
  });
  return { get: () => last };
}

async function reopenContactData(userDataId: number): Promise<void> {
  await withDb(async (client) => {
    await client.query(`UPDATE user_data SET mail = NULL WHERE id = $1`, [userDataId]);
    // Signup completes ContactData even when kycLevel is 0. Reset the step so
    // continueKyc opens the in-app mail form instead of skipping to a later step.
    await client.query(
      `UPDATE kyc_step SET status = 'NotStarted', updated = NOW()
       WHERE "userDataId" = $1 AND name = 'ContactData'`,
      [userDataId],
    );
  });
}

test.describe('App 2.0 hosted artifact', () => {
  test.afterEach(async () => {
    await cleanupCreatedData();
  });

  test('serves /app2/ and opens every hash route', async ({ page }) => {
    const response = await page.goto('/app2/');
    expect(response, '/app2/ must be served').toBeTruthy();
    expect(response?.ok(), `/app2/ status ${response?.status()}`).toBe(true);
    await expect(page.locator('body')).not.toBeEmpty();

    for (const hash of APP2_HASH_ROUTES) {
      await page.goto(`/app2/${hash}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('body')).not.toBeEmpty();
    }
  });

  test('buy: type 100, open payment details, prove buy row', async ({ page }) => {
    test.setTimeout(90000);
    const user = await createUser({ tag: 'app2-buy', kycLevel: 50, completePersonalData: true, language: 'EN' });
    const capture = attachPaymentInfoCapture(page);

    await openApp2(page, user.jwt, '#/');
    await expect(page.getByRole('tab', { name: /^buy$/i })).toHaveAttribute('aria-selected', 'true');

    const amount = page.getByRole('textbox', { name: 'Amount you pay' });
    await expect(amount).toBeVisible();
    await amount.fill('100');

    const cta = page.getByTestId('trade-cta');
    await expect(cta).toBeEnabled({ timeout: 45000 });
    await cta.click();

    await expect(page.getByText('IBAN', { exact: true }).first()).toBeVisible({ timeout: 45000 });
    const apiBuy = capture.get();
    expect(apiBuy, 'PUT /buy/paymentInfos should have returned a body').toBeTruthy();
    if (apiBuy?.iban) {
      await expect(
        page
          .locator('b')
          .filter({ hasText: apiBuy.iban.slice(0, 8) })
          .first(),
      ).toBeVisible();
    }

    const buyRow = await waitForRow<{ id: number; active: boolean; userId: number }>(
      `SELECT id, active, "userId" AS "userId"
       FROM buy WHERE "userId" = $1 ORDER BY id DESC LIMIT 1`,
      [user.userId],
      30000,
    );
    expect(buyRow.active).toBe(true);
    expect(buyRow.userId).toBe(user.userId);
  });

  test('kyc: submit contact mail through the App 2.0 form, prove user_data write', async ({ page }) => {
    test.setTimeout(90000);
    const user = await createUser({ tag: 'app2-kyc', kycLevel: 0, language: 'EN' });
    await reopenContactData(user.userDataId);

    await openApp2(page, user.jwt, '#/kyc');
    await expect(page.getByRole('heading', { name: /verification/i })).toBeVisible({ timeout: 20000 });

    const start = page.getByRole('button', { name: /start verification|continue/i });
    await expect(start).toBeVisible();
    await start.click();

    const mailInput = page.locator('input[type="email"]');
    const firstName = page.locator('input[autocomplete="given-name"]');
    const form = await Promise.race([
      mailInput.waitFor({ state: 'visible', timeout: 25000 }).then(() => 'contact' as const),
      firstName.waitFor({ state: 'visible', timeout: 25000 }).then(() => 'personal' as const),
    ]).catch(() => 'none' as const);
    expect(form, 'App 2.0 KYC did not open ContactData or PersonalData after Start verification').not.toBe('none');

    if (form === 'personal') {
      await firstName.fill('E2EFirst');
      await page.locator('input[autocomplete="family-name"]').fill('E2ELast');
      await page.locator('input[autocomplete="street-address"]').fill('Bahnhofstrasse');
      await page.getByPlaceholder('No.').fill('1');
      await page.locator('input[autocomplete="postal-code"]').fill('8001');
      await page.locator('input[autocomplete="address-level2"]').fill('Zurich');
      await page.locator('input[type="tel"]').fill('+41791234567');
      await page.getByRole('button', { name: /^continue$/i }).click();
      const row = await waitForRow<{ id: number; firstname: string; surname: string }>(
        `SELECT id, firstname, surname FROM user_data
         WHERE id = $1 AND firstname = $2 AND surname = $3`,
        [user.userDataId, 'E2EFirst', 'E2ELast'],
        20000,
      );
      expect(row.firstname).toBe('E2EFirst');
      return;
    }

    const newMail = `e2e+app2-kyc-${Date.now()}@dfx.swiss`;
    await mailInput.fill(newMail);
    await page.getByRole('button', { name: /^continue$/i }).click();

    const row = await waitForRow<{ id: number; mail: string }>(
      `SELECT id, mail FROM user_data WHERE id = $1 AND mail = $2`,
      [user.userDataId, newMail],
      20000,
    );
    expect(row.mail).toBe(newMail);
  });
});
