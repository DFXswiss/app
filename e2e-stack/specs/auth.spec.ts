/**
 * Auth / session area e2e — owns:
 *   /, /login, /login/mail, /login/wallet, /connect, /mail-login, /2fa, /account-merge
 *
 * Browser drives the real frontend; Postgres proves login, 2FA, and merge side-effects.
 *
 * Not covered (by design / environment limits):
 * - Staff sessionMode on /2fa (requires support-dashboard elevated sessions).
 * - App/TOTP authenticator branch on /2fa (only staff / non-mail accounts; no authenticator
 *   dependency allowed in this lane). Customer accounts with mail use the mail-code branch.
 */

import type { Page } from '@playwright/test';
import {
  completeMailLogin,
  createSelfCustodialLightningUser,
  expect,
  gotoWithSession,
  normPath,
  openScreen,
  queryOne,
  requestMailLogin,
  required,
  selfCustodialLightningLogin,
  signatureLogin,
  test,
  testEmail,
  testLightningWallet,
  testWallet,
  waitForRow,
} from './fixtures';
import { cleanupCreatedData, createUser, e2eMail } from './fixtures/factories';

/** Parse a 6-digit verification code from a notification row (VerificationMail / EmailVerification). */
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
  timeoutMs = 20000,
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

/** Complete the mail-based /2fa screen for a customer account (same browser IP for later check2fa). */
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

test.describe.configure({ mode: 'serial' });

test.describe('Auth area e2e', () => {
  test.afterAll(async () => {
    await cleanupCreatedData();
  });

  test.describe('Self-custodial Lightning authentication', () => {
    test('new wallet receives a token and stores its exact signature', async () => {
      const wallet = testLightningWallet();

      await createSelfCustodialLightningUser(wallet);

      const stored = await queryOne<{ signature: string | null }>(
        `SELECT signature FROM "user" WHERE address = $1`,
        [wallet.address],
      );
      expect(stored?.signature).toBe(wallet.signature);
    });

    test('same wallet and signature receive another token', async () => {
      const wallet = testLightningWallet();
      await createSelfCustodialLightningUser(wallet);

      await selfCustodialLightningLogin(wallet);
    });

    test('same wallet with a different signature receives 401', async () => {
      const wallet = testLightningWallet();
      const otherWallet = testLightningWallet();
      await createSelfCustodialLightningUser(wallet);

      await expect(
        selfCustodialLightningLogin({ address: wallet.address, signature: otherWallet.signature }),
      ).rejects.toThrow(/POST \/v1\/auth failed: 401/);
    });

    test('Lightning access token authenticates the frontend navigation', async ({ page }) => {
      const wallet = testLightningWallet();
      const { jwt } = await createSelfCustodialLightningUser(wallet);

      await gotoWithSession(page, '/', jwt);
      await page.waitForLoadState('networkidle');
      await page.locator('div.absolute.right-4').click();

      await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible({ timeout: 10000 });
    });
  });

  // ---------------------------------------------------------------------------
  // / — HomeScreen root (feature-tree page id falls back to FeatureTree[0] = 'home')
  // ---------------------------------------------------------------------------

  test('/ renders home service tiles (buy/sell/swap) when logged out', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(normPath(new URL(page.url()).pathname)).toBe('/');
    // Root page uses dfxStyle hero copy + home tiles (img fragments from feature-tree).
    await expect(page.getByText(/Access all/i)).toBeVisible({ timeout: 15000 });
    await expect(page.locator('img[src$="/kaufen_en.jpg"]')).toBeVisible();
    await expect(page.locator('img[src$="/verkaufen_en.jpg"]')).toBeVisible();
    await expect(page.locator('img[src*="swap"]')).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // /login — HomeScreen special mode Login → page id 'login'
  // ---------------------------------------------------------------------------

  test('/login shows login description and crypto/mail tiles', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    expect(normPath(new URL(page.url()).pathname)).toBe('/login');
    await expect(page.getByText('Login to DFX Services', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('img[src*="cryptowallet"]')).toBeVisible();
    await expect(page.locator('img[src*="mail"]')).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // /login/wallet — page id 'wallets' (icon grid, no description text)
  // ---------------------------------------------------------------------------

  test('/login/wallet shows wallet selection tiles', async ({ page }) => {
    await page.goto('/login/wallet');
    await page.waitForLoadState('networkidle');

    expect(normPath(new URL(page.url()).pathname)).toBe('/login/wallet');
    // Distinct from /login: no "Login to DFX Services", wallets page tiles instead.
    await expect(page.getByText('Login to DFX Services', { exact: true })).toHaveCount(0);
    await expect(page.locator('img[src*="metamask"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('img[src*="walletconnect"]')).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // /connect — same wallets page id when logged out; address widget only when
  // logged in without session.address
  // ---------------------------------------------------------------------------

  test('/connect when logged out shows the wallets tile grid', async ({ page }) => {
    await page.goto('/connect');
    await page.waitForLoadState('networkidle');

    expect(normPath(new URL(page.url()).pathname)).toBe('/connect');
    await expect(page.locator('img[src*="metamask"]')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Please select an address or add a new one to continue.', { exact: true })).toHaveCount(
      0,
    );
  });

  test('/connect with signature session (session.address set) keeps wallets grid', async ({ page }) => {
    const wallet = testWallet(50);
    const jwt = await signatureLogin(wallet);
    await gotoWithSession(page, '/connect', jwt);
    await page.waitForLoadState('networkidle');

    expect(normPath(new URL(page.url()).pathname)).toBe('/connect');
    // Auto-open of ConnectAddress requires isLoggedIn && !session.address — signature JWT has address.
    await expect(page.locator('img[src*="metamask"]')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Please select an address or add a new one to continue.', { exact: true })).toHaveCount(
      0,
    );
  });

  // ---------------------------------------------------------------------------
  // /login/mail — ConnectMail form + real mail-login sequence
  // ---------------------------------------------------------------------------

  test('/login/mail mail form → sent confirmation → OTP session → user_data.mail', async ({ page }) => {
    test.setTimeout(90000);

    const email = testEmail('auth-mail');

    await page.goto('/login/mail');
    await page.waitForLoadState('networkidle');
    expect(normPath(new URL(page.url()).pathname)).toBe('/login/mail');

    // ConnectMail auto-selected: email field + Next.
    await expect(page.getByPlaceholder('example@mail.com')).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder('example@mail.com').fill(email);
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(
      page.getByText('We have sent an email with further instructions to the address provided.', { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();

    // OTP lives in notification; completeMailLogin exchanges it for a session JWT.
    const jwt = await completeMailLogin(email);
    expect(jwt).toBeTruthy();

    await waitForRow<{ id: number; mail: string }>(`SELECT id, mail FROM user_data WHERE mail = $1`, [email], 20000);

    await gotoWithSession(page, '/', jwt);
    await page.waitForLoadState('networkidle');
    const token = await page.evaluate(() => window.localStorage.getItem('dfx.authenticationToken'));
    expect(token, 'mail session should land in localStorage').toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // /mail-login
  // ---------------------------------------------------------------------------

  test('/mail-login without otp redirects to /login', async ({ page }) => {
    await page.goto('/mail-login');
    await page.waitForLoadState('networkidle');

    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'missing otp should redirect to /login',
        timeout: 15000,
      })
      .toBe('/login');
  });

  test('/mail-login?otp=… completes browser redirect into a session', async ({ page }) => {
    test.setTimeout(90000);

    const email = testEmail('auth-mail-otp');
    // Trigger login mail via API so we can read the raw OTP before the redirect exchange consumes it.
    await requestMailLogin(email);

    const row = await waitForRow<{ data: string }>(
      `SELECT n.data
       FROM notification n
       JOIN user_data ud ON ud.id = n."userDataId"
       WHERE ud.mail = $1 AND n.context = 'Login'
       ORDER BY n.id DESC LIMIT 1`,
      [email],
      20000,
    );

    let otp: string | null = null;
    const parsed = JSON.parse(row.data) as { texts?: Array<{ params?: { url?: string } }> };
    for (const entry of parsed.texts ?? []) {
      const url = entry?.params?.url;
      if (typeof url === 'string') {
        try {
          otp = new URL(url, process.env.E2E_FRONTEND_URL ?? 'http://frontend').searchParams.get('otp');
          if (otp) break;
        } catch {
          /* next */
        }
      }
    }
    expect(otp, 'OTP should be extractable from Login notification').toBeTruthy();

    await page.goto(
      `/mail-login?otp=${encodeURIComponent(required(otp, 'OTP must be extractable from the Login notification'))}`,
    );
    // Full window.location navigation after GET /auth/mail/redirect — land on /account (default).
    await page.waitForURL((url) => normPath(url.pathname) === '/account' || url.searchParams.has('session'), {
      timeout: 30000,
    });
    await page.waitForLoadState('networkidle');

    // Session must be established (either via redirect query handling or already applied).
    await expect
      .poll(async () => page.evaluate(() => window.localStorage.getItem('dfx.authenticationToken')), {
        timeout: 20000,
      })
      .toBeTruthy();

    await waitForRow<{ id: number }>(`SELECT id FROM user_data WHERE mail = $1`, [email], 15000);
  });

  // ---------------------------------------------------------------------------
  // /2fa — kyc-code / mail branch for customer accounts
  // ---------------------------------------------------------------------------

  test('/2fa mail branch: enter emailed code and create TfaLog', async ({ page }) => {
    test.setTimeout(90000);

    const user = await createUser({ tag: 'auth-2fa-ok', language: 'EN' });

    await openScreen(page, '/2fa', user.jwt);

    await expect(page.getByText('2FA', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByText('We have emailed you a 6-digit code. Please enter it here.', { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    // Mail branch: no authenticator QR / "Authenticator code" path.
    await expect(page.getByPlaceholder('Authenticator code')).toHaveCount(0);
    await expect(page.getByPlaceholder('Email code')).toBeVisible();

    const code = await waitForVerificationCode(user.userDataId, 'VerificationMail');
    await page.getByPlaceholder('Email code').fill(code);
    await page.getByRole('button', { name: 'Next' }).click();

    await waitForRow<{ id: number }>(
      `SELECT id FROM kyc_log WHERE "userDataId" = $1 AND type = 'TfaLog' ORDER BY id DESC LIMIT 1`,
      [user.userDataId],
      20000,
    );
  });

  test('/2fa wrong code shows invalid error and does not create TfaLog', async ({ page }) => {
    test.setTimeout(90000);

    const user = await createUser({ tag: 'auth-2fa-bad', language: 'EN' });
    await openScreen(page, '/2fa', user.jwt);

    await expect(page.getByPlaceholder('Email code')).toBeVisible({ timeout: 20000 });
    const realCode = await waitForVerificationCode(user.userDataId, 'VerificationMail');
    // Guaranteed wrong: flip last digit of the real 6-digit code.
    const wrong = realCode.slice(0, 5) + (realCode[5] === '0' ? '1' : '0');

    const before = await queryOne<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM kyc_log WHERE "userDataId" = $1 AND type = 'TfaLog'`,
      [user.userDataId],
    );
    expect(Number(before?.c ?? 0)).toBe(0);

    await page.getByPlaceholder('Email code').fill(wrong);
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByText('Invalid or expired code', { exact: true })).toBeVisible({ timeout: 15000 });

    const after = await queryOne<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM kyc_log WHERE "userDataId" = $1 AND type = 'TfaLog'`,
      [user.userDataId],
    );
    expect(Number(after?.c ?? 0)).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // /account-merge
  // ---------------------------------------------------------------------------

  test('/account-merge garbage otp lands on /error', async ({ page }) => {
    await page.goto('/account-merge?otp=not-a-real-merge-code-0000');
    await page.waitForLoadState('networkidle');

    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'invalid merge otp should navigate to /error',
        timeout: 20000,
      })
      .toBe('/error');

    await expect(page.getByText('Oh, sorry, something went wrong', { exact: true })).toBeVisible();
    // API NotFoundException message for unknown code.
    await expect(page.getByText(/Account merge information not found|Invalid link/i)).toBeVisible();
  });

  test('/account-merge?otp=… adds wallet address (UI + Postgres)', async ({ page }) => {
    test.setTimeout(120000);

    const mailA = e2eMail('merge-master');
    const mailB = e2eMail('merge-slave');
    const userA = await createUser({ tag: 'merge-a', mail: mailA, language: 'EN' });
    const userB = await createUser({ tag: 'merge-b', mail: mailB, language: 'EN' });

    // Trigger merge the same way the product does: B requests A's mail after 2FA.
    await openScreen(page, '/2fa', userB.jwt);
    await completeMail2faOnPage(page, userB.userDataId);

    await page.goto('/account/mail');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('textbox', { name: 'Email address' })).toBeVisible({
      timeout: 20000,
    });

    const mailInput = page.getByRole('textbox', { name: 'Email address' });
    await mailInput.fill(mailA);
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('It looks like you already have an account with DFX.')).toBeVisible({
      timeout: 20000,
    });

    const mergeRow = await waitForRow<{ code: string }>(
      `SELECT code FROM account_merge
       WHERE "masterId" = $1 AND "slaveId" = $2
       ORDER BY id DESC LIMIT 1`,
      [userA.userDataId, userB.userDataId],
      20000,
    );
    expect(mergeRow.code).toBeTruthy();

    // Confirm merge unauthenticated (OptionalJwtAuthGuard).
    await page.goto(`/account-merge?otp=${encodeURIComponent(mergeRow.code)}`);
    await expect(page.getByText('Wallet address added', { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('You can now access your account.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'My account' })).toBeVisible();

    const completed = await waitForRow<{ isCompleted: boolean }>(
      `SELECT "isCompleted" AS "isCompleted" FROM account_merge
       WHERE "masterId" = $1 AND "slaveId" = $2
       ORDER BY id DESC LIMIT 1`,
      [userA.userDataId, userB.userDataId],
      20000,
    );
    expect(completed.isCompleted).toBe(true);

    const slave = await waitForRow<{ status: string }>(
      `SELECT status FROM user_data WHERE id = $1 AND status = 'Merged'`,
      [userB.userDataId],
      20000,
    );
    expect(slave.status).toBe('Merged');
  });
});
