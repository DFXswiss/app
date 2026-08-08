/**
 * Account / profile area e2e — owns:
 *   /account, /account/mail, /settings, /safe, /recommendation
 *
 * Browser drives the real frontend; Postgres proves language and mail writes.
 *
 * Not covered (by design / environment limits):
 * - Custody account portfolio data on /safe: no factory or seed for custody accounts
 *   (test-data.md has no createCustody*); empty Safe UI is asserted instead.
 * - App/TOTP 2FA: customer mail branch only (see auth.spec.ts).
 */

import type { Page } from '@playwright/test';
import { expect, gotoWithSession, openScreen, queryOne, test, waitForRow } from './fixtures';
import { cleanupCreatedData, createUser, e2eMail } from './fixtures/factories';

function normPath(p: string): string {
  return p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p;
}

function codeFromNotificationData(data: string): string {
  let parsed: { texts?: Array<{ params?: { code?: string } }> };
  try {
    parsed = JSON.parse(data) as typeof parsed;
  } catch (e) {
    throw new Error(`codeFromNotificationData: failed to JSON.parse notification.data: ${e}`);
  }
  const texts = parsed.texts;
  if (!Array.isArray(texts)) {
    throw new Error('codeFromNotificationData: notification.data.texts is not an array');
  }
  for (const entry of texts) {
    const code = entry?.params?.code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  throw new Error('codeFromNotificationData: no texts[].params.code found');
}

async function waitForVerificationCode(
  userDataId: number,
  context: 'VerificationMail' | 'EmailVerification',
  timeoutMs = 25000,
): Promise<string> {
  const row = await waitForRow<{ data: string }>(
    `SELECT n.data FROM notification n
     WHERE n."userDataId" = $1 AND n.context = $2
     ORDER BY n.id DESC LIMIT 1`,
    [userDataId, context],
    timeoutMs,
  );
  return codeFromNotificationData(row.data);
}

/** Complete mail 2FA on the already-open /2fa screen (same page/IP for later check2fa). */
async function completeMail2faOnPage(page: Page, userDataId: number): Promise<void> {
  await expect(
    page.getByText('We have emailed you a 6-digit code. Please enter it here.', { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect(page.getByPlaceholder('Email code')).toBeVisible();

  const code = await waitForVerificationCode(userDataId, 'VerificationMail');
  await page.getByPlaceholder('Email code').fill(code);
  await page.getByRole('button', { name: 'Next' }).click();

  await waitForRow<{ id: number }>(
    `SELECT id FROM kyc_log WHERE "userDataId" = $1 AND type = 'TfaLog' ORDER BY id DESC LIMIT 1`,
    [userDataId],
    20000,
  );
}

/**
 * Open a StyledDropdown by its field label, then pick an option by visible label text.
 * The field label is a bare <label> not ARIA-linked to the trigger; the button's accessible
 * name is its own value text (e.g. "English English"), so getByRole/getByLabel on the field
 * name fails. The button is also not a descendant of the label's immediate parent — use
 * following::button[1] (document order after the label), not parent hop or following-sibling.
 */
async function selectStyledDropdown(page: Page, fieldLabel: string, optionLabel: string): Promise<void> {
  // .first() if nav/header also exposes the same literal (e.g. "Language").
  const openBtn = page.getByText(fieldLabel, { exact: true }).first().locator('xpath=following::button[1]');
  await openBtn.click();
  await page.getByRole('button', { name: optionLabel }).click();
}

test.describe.configure({ mode: 'serial' });

test.describe('Account area e2e', () => {
  test.afterAll(async () => {
    await cleanupCreatedData();
  });

  // ---------------------------------------------------------------------------
  // /account
  // ---------------------------------------------------------------------------

  test('/account renders activity for authenticated user', async ({ page }) => {
    const user = await createUser({ tag: 'acct-view', language: 'EN' });
    await openScreen(page, '/account', user.jwt);

    // Navigation title from useLayoutOptions + always-on Activity table.
    await expect(page.getByText('Account', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Activity', { exact: true })).toBeVisible();
    await expect(page.getByText('Total trading volume', { exact: true })).toBeVisible();
    await expect(page.getByText('Annual trading volume', { exact: true })).toBeVisible();
  });

  test('/account without session redirects away (useUserGuard → /login)', async ({ page }) => {
    await page.goto('/account');
    await page.waitForLoadState('networkidle');

    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'unauthenticated /account should leave /account',
        timeout: 15000,
      })
      .not.toBe('/account');
    expect(normPath(new URL(page.url()).pathname)).toMatch(/login/);
  });

  // ---------------------------------------------------------------------------
  // /account/mail — gated by check2fa(BASIC); change mail + merge conflict
  // ---------------------------------------------------------------------------

  test('/account/mail without prior 2FA redirects to /2fa', async ({ page }) => {
    const user = await createUser({ tag: 'acct-mail-gate', language: 'EN' });
    await gotoWithSession(page, '/account/mail', user.jwt);
    await page.waitForLoadState('networkidle');

    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'missing recent 2FA should redirect to /2fa',
        timeout: 20000,
      })
      .toBe('/2fa');
  });

  test('/account/mail after 2FA: change mail → verify code → user_data.mail updated', async ({ page }) => {
    test.setTimeout(120000);

    const user = await createUser({ tag: 'acct-mail-chg', language: 'EN' });
    const newMail = e2eMail('acct-mail-new');

    // Same browser context/IP: complete 2FA first, then open edit-mail.
    await openScreen(page, '/2fa', user.jwt);
    await completeMail2faOnPage(page, user.userDataId);

    await page.goto('/account/mail');
    await page.waitForLoadState('networkidle');
    expect(normPath(new URL(page.url()).pathname)).toBe('/account/mail');

    // Step 1: EditOverlay prefilled with current mail.
    const mailInput = page.getByRole('textbox', { name: 'Email address' });
    await expect(mailInput).toBeVisible({ timeout: 20000 });
    await expect(mailInput).toHaveValue(user.mail!);

    await mailInput.fill(newMail);
    await page.getByRole('button', { name: 'Save' }).click();

    // Step 2: verification code for the NEW address (EmailVerification notification in DB).
    await expect(
      page.getByText('We have sent a 6-digit code to your new email address. Please enter it here.', {
        exact: true,
      }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByPlaceholder('Email code')).toBeVisible();

    const code = await waitForVerificationCode(user.userDataId, 'EmailVerification', 30000);
    expect(code, 'EmailVerification notification must yield a 6-digit code').toBeTruthy();

    await page.getByPlaceholder('Email code').fill(code);
    await page.getByRole('button', { name: 'Next' }).click();

    await waitForRow<{ id: number; mail: string }>(
      `SELECT id, mail FROM user_data WHERE id = $1 AND mail = $2`,
      [user.userDataId, newMail],
      25000,
    );

    // Successful verify navigates to /account.
    await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).toBe('/account');
  });

  test('/account/mail merge conflict when new mail belongs to another account', async ({ page }) => {
    test.setTimeout(120000);

    const mailA = e2eMail('acct-merge-a');
    const mailB = e2eMail('acct-merge-b');
    const userA = await createUser({ tag: 'acct-merge-a', mail: mailA, language: 'EN' });
    const userB = await createUser({ tag: 'acct-merge-b', mail: mailB, language: 'EN' });

    await openScreen(page, '/2fa', userB.jwt);
    await completeMail2faOnPage(page, userB.userDataId);

    await page.goto('/account/mail');
    await page.waitForLoadState('networkidle');

    const mailInput = page.getByRole('textbox', { name: 'Email address' });
    await expect(mailInput).toBeVisible({ timeout: 20000 });
    await mailInput.fill(mailA);
    await page.getByRole('button', { name: 'Save' }).click();

    // 409 with exists+merge → showLinkHint
    await expect(page.getByText('It looks like you already have an account with DFX.')).toBeVisible({
      timeout: 20000,
    });
    await expect(
      page.getByText(
        /We have just sent you an email\. To continue with your existing account, please confirm your email address/,
      ),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'OK' })).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // /settings — language write → user_data."languageId"
  // ---------------------------------------------------------------------------

  test('/settings changes language and updates user_data.languageId', async ({ page }) => {
    test.setTimeout(90000);

    const user = await createUser({ tag: 'acct-lang', language: 'EN' });

    const enId = await queryOne<{ id: number }>(`SELECT id FROM language WHERE symbol = $1 LIMIT 1`, ['EN']);
    const deId = await queryOne<{ id: number }>(`SELECT id FROM language WHERE symbol = $1 LIMIT 1`, ['DE']);
    expect(enId?.id, 'seed language EN').toBeTruthy();
    expect(deId?.id, 'seed language DE').toBeTruthy();
    expect(enId!.id).not.toBe(deId!.id);

    // Ensure starting language is EN in DB.
    await waitForRow<{ languageId: number }>(
      `SELECT "languageId" AS "languageId" FROM user_data WHERE id = $1 AND "languageId" = $2`,
      [user.userDataId, enId!.id],
      15000,
    );

    await openScreen(page, '/settings', user.jwt);

    await expect(page.getByText('Settings', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Language', { exact: true })).toBeVisible();
    await expect(page.getByText('Currency', { exact: true })).toBeVisible();

    // labelFunc uses language.name → "German" for DE (seed language.csv).
    await selectStyledDropdown(page, 'Language', 'German');

    await waitForRow<{ languageId: number }>(
      `SELECT "languageId" AS "languageId" FROM user_data WHERE id = $1 AND "languageId" = $2`,
      [user.userDataId, deId!.id],
      20000,
    );
  });

  test('/settings without session redirects away (useUserGuard → /login)', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'unauthenticated /settings should leave /settings',
        timeout: 15000,
      })
      .not.toBe('/settings');
    expect(normPath(new URL(page.url()).pathname)).toMatch(/login/);
  });

  // ---------------------------------------------------------------------------
  // /safe — custody dashboard empty/setup state (no custody factory)
  // ---------------------------------------------------------------------------

  test('/safe renders portfolio shell for logged-in user with no custody accounts', async ({ page }) => {
    const user = await createUser({ tag: 'acct-safe', language: 'EN' });
    await openScreen(page, '/safe', user.jwt);

    // Safe-specific chrome: layout title + portfolio header (empty balances still render the shell).
    await expect(page.getByText('My DFX Safe', { exact: true }).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Portfolio', { exact: true })).toBeVisible();
    await expect(page.getByText('Total portfolio value', { exact: true })).toBeVisible();
  });

  test('/safe without session redirects away (useUserGuard → /login)', async ({ page }) => {
    await page.goto('/safe');
    await page.waitForLoadState('networkidle');

    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'unauthenticated /safe should leave /safe',
        timeout: 15000,
      })
      .not.toBe('/safe');
    expect(normPath(new URL(page.url()).pathname)).toMatch(/login/);
  });

  // ---------------------------------------------------------------------------
  // /recommendation — pure loader → /account (+ guard chain when logged out)
  // ---------------------------------------------------------------------------

  test('/recommendation with session ends on /account', async ({ page }) => {
    const user = await createUser({ tag: 'acct-reco', language: 'EN' });
    await gotoWithSession(page, '/recommendation', user.jwt);
    await page.waitForLoadState('networkidle');

    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'loader should redirect /recommendation → /account',
        timeout: 15000,
      })
      .toBe('/account');
  });

  test('/recommendation without session ends on /login (account guard)', async ({ page }) => {
    await page.goto('/recommendation');
    await page.waitForLoadState('networkidle');

    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'logged-out /recommendation → /account → /login',
        timeout: 15000,
      })
      .toBe('/login');
  });
});
