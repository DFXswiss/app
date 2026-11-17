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
import { ethers } from 'ethers';
import {
  completeMailLogin,
  expect,
  gotoWithSession,
  normPath,
  openScreen,
  queryOne,
  queryRows,
  requestMailLogin,
  required,
  signatureLogin,
  test,
  testEmail,
  testWallet,
  waitForRow,
} from './fixtures';
import { injectWallet, recordAuthAndErrorReports, USER_REJECTION, walletAnswers } from './fixtures/injected-wallet';
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

/** Full login link from a Login notification. The first non-empty texts[].params.url wins. */
function loginUrlFromNotification(data: string): string {
  let parsed: { texts?: Array<{ params?: { url?: string } }> };
  try {
    parsed = JSON.parse(data) as typeof parsed;
  } catch (e) {
    throw new Error(`loginUrlFromNotification: failed to JSON.parse notification.data: ${e}`);
  }
  const texts = parsed.texts;
  if (!Array.isArray(texts)) {
    throw new Error('loginUrlFromNotification: notification.data.texts is not an array');
  }
  for (const entry of texts) {
    const url = entry?.params?.url;
    if (typeof url === 'string' && url.length > 0) return url;
  }
  throw new Error('loginUrlFromNotification: no texts[].params.url');
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

/**
 * Installs `script` as an init script that puts an injected Solana or Tron wallet on `window`, which stands in for the
 * wallet extension (an external provider), then opens the wallet selection at `path` and clicks the tile whose
 * image matches `tile`. Returns the sign-in and client-error POSTs the page sends.
 */
async function openInjectedWallet(
  page: Page,
  script: () => void,
  tile: string,
  path = '/login/wallet',
): Promise<string[]> {
  await page.addInitScript(script);
  const sent = recordAuthAndErrorReports(page);

  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.locator(`img[src*="${tile}"]`).click();
  return sent;
}

/** The page is back at the wallet selection, shows no error and sent no sign-in and no client-error report. */
async function expectCancelledAtSelection(
  page: Page,
  tile: string,
  sent: string[],
  path = '/login/wallet',
): Promise<void> {
  await expect(page.locator(`img[src*="${tile}"]`)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Connection failed!')).toHaveCount(0);
  await page.waitForTimeout(2000);
  await expect(page.locator(`img[src*="${tile}"]`)).toBeVisible();
  await expect(page.getByText('Connection failed!')).toHaveCount(0);
  expect(sent).toEqual([]);
  expect(normPath(new URL(page.url()).pathname)).toBe(normPath(new URL(path, 'http://x').pathname));
}

test.describe.configure({ mode: 'serial' });

test.describe('Auth area e2e', () => {
  test.afterAll(async () => {
    await cleanupCreatedData();
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

  test('command-line wallet login on /login continues to /buy', async ({ page }) => {
    test.setTimeout(90000);

    const wallet = testWallet();
    await page.goto('/login?blockchain=Ethereum');
    await page.waitForLoadState('networkidle');

    await page.locator('img[src*="cryptowallet"]').click();
    await page.locator('img[src*="command"]').click();

    const address = page.locator('input[name="address"]');
    await address.fill(wallet.address);
    await address.blur();

    const messageNode = page.locator('p.text-dfxBlue-800.min-w-0.break-words');
    await expect(messageNode).toBeVisible({ timeout: 20000 });
    const message = await messageNode.textContent();
    if (message == null || message.length === 0) {
      throw new Error('command-line sign message was empty');
    }
    const signature = await new ethers.Wallet(wallet.privateKey).signMessage(message);

    const signatureInput = page.locator('input[type="password"]');
    await signatureInput.fill(signature);
    await signatureInput.blur();

    const login = page.getByRole('button', { name: 'Login' });
    await expect(login).toBeEnabled();
    await login.click();

    await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).toBe('/buy');
  });

  test('command-line wallet login from a guarded /buy returns to /buy', async ({ page }) => {
    test.setTimeout(90000);

    const wallet = testWallet();
    await page.goto('/buy?blockchain=Ethereum');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('img[src*="cryptowallet"]')).toBeVisible({ timeout: 15000 });
    await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).not.toBe('/buy');

    await page.locator('img[src*="cryptowallet"]').click();
    await page.locator('img[src*="command"]').click();

    const address = page.locator('input[name="address"]');
    await address.fill(wallet.address);
    await address.blur();

    const messageNode = page.locator('p.text-dfxBlue-800.min-w-0.break-words');
    await expect(messageNode).toBeVisible({ timeout: 20000 });
    const message = await messageNode.textContent();
    if (message == null || message.length === 0) {
      throw new Error('command-line sign message was empty');
    }
    const signature = await new ethers.Wallet(wallet.privateKey).signMessage(message);

    const signatureInput = page.locator('input[type="password"]');
    await signatureInput.fill(signature);
    await signatureInput.blur();

    const login = page.getByRole('button', { name: 'Login' });
    await expect(login).toBeEnabled();
    await login.click();

    await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).toBe('/buy');
    await page.waitForTimeout(3000);
    expect(normPath(new URL(page.url()).pathname)).toBe('/buy');
  });

  test('command-line wallet login on /connect continues to /account', async ({ page }) => {
    test.setTimeout(90000);

    const wallet = testWallet();
    await page.goto('/connect?blockchain=Ethereum');
    await page.waitForLoadState('networkidle');

    await page.locator('img[src*="command"]').click();

    const address = page.locator('input[name="address"]');
    await address.fill(wallet.address);
    await address.blur();

    const messageNode = page.locator('p.text-dfxBlue-800.min-w-0.break-words');
    await expect(messageNode).toBeVisible({ timeout: 20000 });
    const message = await messageNode.textContent();
    if (message == null || message.length === 0) {
      throw new Error('command-line sign message was empty');
    }
    const signature = await new ethers.Wallet(wallet.privateKey).signMessage(message);

    const signatureInput = page.locator('input[type="password"]');
    await signatureInput.fill(signature);
    await signatureInput.blur();

    const login = page.getByRole('button', { name: 'Login' });
    await expect(login).toBeEnabled();
    await login.click();

    await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).toBe('/account');
    await page.waitForTimeout(3000);
    expect(normPath(new URL(page.url()).pathname)).toBe('/account');
  });

  test('command-line wallet login trims a signature pasted with surrounding whitespace', async ({ page }) => {
    test.setTimeout(90000);

    // Dedicated index so the user row below can only come from this login, not from testWallet() / index 0.
    const wallet = testWallet(52);
    const signInBodies: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/v1\/auth$/.test(new URL(request.url()).pathname)) {
        signInBodies.push(request.postData() ?? '');
      }
    });

    await page.goto('/login?blockchain=Ethereum');
    await page.waitForLoadState('networkidle');

    await page.locator('img[src*="cryptowallet"]').click();
    await page.locator('img[src*="command"]').click();

    const address = page.locator('input[name="address"]');
    await address.fill(wallet.address);
    await address.blur();

    const messageNode = page.locator('p.text-dfxBlue-800.min-w-0.break-words');
    await expect(messageNode).toBeVisible({ timeout: 20000 });
    const message = await messageNode.textContent();
    if (message == null || message.length === 0) {
      throw new Error('command-line sign message was empty');
    }
    const signature = await new ethers.Wallet(wallet.privateKey).signMessage(message);

    const signatureInput = page.locator('input[type="password"]');
    await signatureInput.fill(`  ${signature}\n `);
    await signatureInput.blur();

    await expect(page.getByText('Invalid pattern')).toHaveCount(0);
    const login = page.getByRole('button', { name: 'Login' });
    await expect(login).toBeEnabled();
    await login.click();

    await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).toBe('/buy');
    expect(signInBodies.length).toBeGreaterThan(0);
    for (const body of signInBodies) expect(JSON.parse(body).signature).toBe(signature);
    const user = await queryOne<{ address: string }>('SELECT address FROM "user" WHERE LOWER(address) = LOWER($1)', [
      wallet.address,
    ]);
    expect(user?.address.toLowerCase()).toBe(wallet.address.toLowerCase());
  });

  test('command-line wallet login shows a field error for a malformed signature and sends nothing', async ({
    page,
  }) => {
    test.setTimeout(90000);

    // Dedicated index that no other test logs in with, so the absent user row is meaningful.
    const wallet = testWallet(53);
    const sentRequests: string[] = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (request.method() === 'POST' && /\/v1\/(auth|log\/clientError)$/.test(pathname)) sentRequests.push(pathname);
    });

    await page.goto('/login?blockchain=Ethereum');
    await page.waitForLoadState('networkidle');

    await page.locator('img[src*="cryptowallet"]').click();
    await page.locator('img[src*="command"]').click();

    const address = page.locator('input[name="address"]');
    await address.fill(wallet.address);
    await address.blur();

    const messageNode = page.locator('p.text-dfxBlue-800.min-w-0.break-words');
    await expect(messageNode).toBeVisible({ timeout: 20000 });
    const message = await messageNode.textContent();
    if (message == null || message.length === 0) {
      throw new Error('command-line sign message was empty');
    }
    const signature = await new ethers.Wallet(wallet.privateKey).signMessage(message);

    const signatureInput = page.locator('input[type="password"]');
    const login = page.getByRole('button', { name: 'Login' });
    for (const malformed of [
      ['-----BEGIN ETHEREUM SIGNED MESSAGE-----', message, '-----BEGIN SIGNATURE-----', signature].join('\n'),
      `signature ${signature}`,
    ]) {
      await signatureInput.fill(malformed);
      await signatureInput.blur();

      await expect(page.getByText('Invalid pattern')).toBeVisible();
      await expect(login).toBeDisabled();
      await login.click({ force: true });
    }

    await page.waitForTimeout(2000);
    expect(sentRequests).toEqual([]);
    await expect(page.getByText('Connection failed!')).toHaveCount(0);
    expect(normPath(new URL(page.url()).pathname)).toBe('/login');
    const user = await queryOne<{ id: number }>('SELECT id FROM "user" WHERE LOWER(address) = LOWER($1)', [
      wallet.address,
    ]);
    expect(user).toBeUndefined();
  });

  test('command-line login on /login with a deleted address reactivates and continues to /buy', async ({ page }) => {
    test.setTimeout(90000);

    // Dedicated index so marking this address Deleted does not affect testWallet() / index 0.
    const wallet = testWallet(51);
    await signatureLogin(wallet);
    const deleted = await queryOne<{ id: number; status: string }>(
      `UPDATE "user" SET status = 'Deleted', "deactivationDate" = NOW() WHERE address = $1 RETURNING id, status`,
      [wallet.address],
    );
    if (deleted == null || deleted.status !== 'Deleted') {
      throw new Error(`failed to mark address ${wallet.address} as Deleted`);
    }

    await page.goto('/login?blockchain=Ethereum');
    await page.waitForLoadState('networkidle');

    await page.locator('img[src*="cryptowallet"]').click();
    await page.locator('img[src*="command"]').click();

    const address = page.locator('input[name="address"]');
    await address.fill(wallet.address);
    await address.blur();

    const messageNode = page.locator('p.text-dfxBlue-800.min-w-0.break-words');
    await expect(messageNode).toBeVisible({ timeout: 20000 });
    const message = await messageNode.textContent();
    if (message == null || message.length === 0) {
      throw new Error('command-line sign message was empty');
    }
    const signature = await new ethers.Wallet(wallet.privateKey).signMessage(message);

    const signatureInput = page.locator('input[type="password"]');
    await signatureInput.fill(signature);
    await signatureInput.blur();

    const login = page.getByRole('button', { name: 'Login' });
    await expect(login).toBeEnabled();
    await login.click();

    await expect(page.getByRole('button', { name: 'Activate address' })).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: 'Activate address' }).click();

    await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).toBe('/buy');
    await page.waitForTimeout(3000);
    expect(normPath(new URL(page.url()).pathname)).toBe('/buy');
    await expect
      .poll(async () => page.evaluate(() => window.localStorage.getItem('dfx.authenticationToken')), {
        timeout: 20000,
      })
      .toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // /login — injected wallet (MetaMask) cancel and failure
  // ---------------------------------------------------------------------------

  test('a cancelled injected-wallet connection returns to the wallet selection, and a retry logs in', async ({
    page,
  }) => {
    test.setTimeout(90000);

    // Dedicated index so the user row below can only come from the retry.
    const wallet = testWallet(54);
    let accept = false;
    const calls = await injectWallet(
      page,
      walletAnswers(wallet, {
        connected: () => accept,
        requestAccounts: () => (accept ? { result: [wallet.address] } : { error: USER_REJECTION }),
      }),
    );
    const sent = recordAuthAndErrorReports(page);

    await page.goto('/login?blockchain=Ethereum');
    await page.waitForLoadState('networkidle');
    await page.locator('img[src*="cryptowallet"]').click();
    await page.locator('img[src*="metamask"]').click();

    await expect.poll(() => calls.includes('eth_requestAccounts'), { timeout: 20000 }).toBe(true);
    await expect(page.locator('img[src*="metamask"]')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Please confirm the connection in your MetaMask.')).toHaveCount(0);
    await expect(page.getByText('Connection failed!')).toHaveCount(0);
    await expect(page.getByText('User rejected the request.')).toHaveCount(0);
    await page.waitForTimeout(2000);
    expect(sent).toEqual([]);
    expect(normPath(new URL(page.url()).pathname)).toBe('/login');
    expect(
      await queryOne<{ id: number }>('SELECT id FROM "user" WHERE LOWER(address) = LOWER($1)', [wallet.address]),
    ).toBeUndefined();

    accept = true;
    await page.locator('img[src*="metamask"]').click();

    await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).toBe('/buy');
    const user = await waitForRow<{ id: number }>('SELECT id FROM "user" WHERE LOWER(address) = LOWER($1)', [
      wallet.address,
    ]);
    expect(user.id).toBeGreaterThan(0);
    expect(sent).toEqual(['/v1/auth']);
  });

  test('a cancelled injected-wallet login signature returns to the wallet selection without a report', async ({
    page,
  }) => {
    test.setTimeout(90000);

    const wallet = testWallet(55);
    const calls = await injectWallet(
      page,
      walletAnswers(wallet, {
        connected: () => true,
        requestAccounts: () => ({ result: [wallet.address] }),
        sign: () => ({
          error: { code: 4001, message: 'User rejected the request.', data: { location: 'confirmation' } },
        }),
      }),
    );
    const sent = recordAuthAndErrorReports(page);

    await page.goto('/login?blockchain=Ethereum');
    await page.waitForLoadState('networkidle');
    await page.locator('img[src*="cryptowallet"]').click();
    await page.locator('img[src*="metamask"]').click();

    await expect.poll(() => calls.includes('personal_sign'), { timeout: 20000 }).toBe(true);
    await expect(page.locator('img[src*="metamask"]')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Connection failed!')).toHaveCount(0);
    await expect(page.getByText('User rejected the request.')).toHaveCount(0);
    await page.waitForTimeout(2000);
    expect(sent).toEqual([]);
    expect(normPath(new URL(page.url()).pathname)).toBe('/login');
  });

  test('a failing injected-wallet connection still shows the error and reports it', async ({ page }) => {
    test.setTimeout(90000);

    const wallet = testWallet(56);
    await injectWallet(
      page,
      walletAnswers(wallet, {
        connected: () => false,
        requestAccounts: () => ({ error: { code: -32603, message: 'Internal JSON-RPC error.' } }),
      }),
    );
    const sent = recordAuthAndErrorReports(page);

    await page.goto('/login?blockchain=Ethereum');
    await page.waitForLoadState('networkidle');
    await page.locator('img[src*="cryptowallet"]').click();

    const report = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/v1/log/clientError'),
      { timeout: 20000 },
    );
    await page.locator('img[src*="metamask"]').click();

    await expect(page.getByText('Connection failed!')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Internal JSON-RPC error.')).toBeVisible();
    const response = await report;
    expect(response.ok()).toBe(true);
    expect(JSON.parse(response.request().postData() ?? '{}').message).toContain('Internal JSON-RPC error.');
    expect(sent).toEqual(['/v1/log/clientError']);
  });

  test('an injected-wallet connect MetaMask reports as already pending shows and reports the pending-request hint', async ({
    page,
  }) => {
    test.setTimeout(90000);

    // MetaMask answers a second account request while the first is still open with code -32002; the data on the
    // rejection is what web3 would otherwise append to the message
    const wallet = testWallet(58);
    await injectWallet(
      page,
      walletAnswers(wallet, {
        connected: () => false,
        requestAccounts: () => ({
          error: {
            code: -32002,
            message: 'Already processing eth_requestAccounts. Please wait.',
            data: { origin: 'http://localhost' },
          },
        }),
      }),
    );
    const sent = recordAuthAndErrorReports(page);

    await page.goto('/login?blockchain=Ethereum');
    await page.waitForLoadState('networkidle');
    await page.locator('img[src*="cryptowallet"]').click();

    const report = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/v1/log/clientError'),
      { timeout: 20000 },
    );
    await page.locator('img[src*="metamask"]').click();

    await expect(page.getByText('Connection failed!')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Please confirm or close the pending request in your wallet.')).toBeVisible();
    await expect(page.getByText('Already processing eth_requestAccounts. Please wait.')).toHaveCount(0);
    const response = await report;
    expect(response.ok()).toBe(true);
    expect(JSON.parse(response.request().postData() ?? '{}').message).toBe(
      'Please confirm or close the pending request in your wallet.',
    );
    expect(sent).toEqual(['/v1/log/clientError']);
  });

  test('a cancelled Phantom connection returns to the wallet selection without a report', async ({ page }) => {
    test.setTimeout(90000);

    // Phantom rejects a cancelled connect with code 4001; the Solana wallet adapter keeps it as `error`.
    const sent = await openInjectedWallet(
      page,
      () => {
        (window as unknown as { phantom: unknown }).phantom = {
          solana: {
            isPhantom: true,
            isConnected: false,
            publicKey: null,
            connect: () => Promise.reject({ code: 4001, message: 'User rejected the request.' }),
            disconnect: () => Promise.resolve(),
            on: () => undefined,
            off: () => undefined,
            removeListener: () => undefined,
          },
        };
      },
      'phantom',
    );

    await expectCancelledAtSelection(page, 'phantom', sent);
  });

  test('a failing Phantom connection still shows the error and reports it', async ({ page }) => {
    test.setTimeout(90000);

    const report = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/v1/log/clientError'),
      { timeout: 20000 },
    );
    const sent = await openInjectedWallet(
      page,
      () => {
        (window as unknown as { phantom: unknown }).phantom = {
          solana: {
            isPhantom: true,
            isConnected: false,
            publicKey: null,
            connect: () => Promise.reject({ code: -32603, message: 'Phantom could not connect.' }),
            disconnect: () => Promise.resolve(),
            on: () => undefined,
            off: () => undefined,
            removeListener: () => undefined,
          },
        };
      },
      'phantom',
    );

    await expect(page.getByText('Connection failed!')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Phantom could not connect.')).toBeVisible();
    expect((await report).ok()).toBe(true);
    expect(sent).toEqual(['/v1/log/clientError']);
  });

  test('a Phantom connect the wallet is still processing shows and reports the pending-request hint', async ({
    page,
  }) => {
    test.setTimeout(90000);

    const report = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/v1/log/clientError'),
      { timeout: 20000 },
    );
    // The extension rejects a second connect while the first one is still open in its popup
    const sent = await openInjectedWallet(
      page,
      () => {
        (window as unknown as { phantom: unknown }).phantom = {
          solana: {
            isPhantom: true,
            isConnected: false,
            publicKey: null,
            connect: () => Promise.reject({ code: -32603, message: 'Already processing connect. Please wait.' }),
            disconnect: () => Promise.resolve(),
            on: () => undefined,
            off: () => undefined,
            removeListener: () => undefined,
          },
        };
      },
      'phantom',
    );

    await expect(page.getByText('Connection failed!')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Please confirm or close the pending request in your wallet.')).toBeVisible();
    await expect(page.getByText('Already processing connect. Please wait.')).toHaveCount(0);
    const response = await report;
    expect(response.ok()).toBe(true);
    expect(JSON.parse(response.request().postData() ?? '{}').message).toBe(
      'Please confirm or close the pending request in your wallet.',
    );
    expect(sent).toEqual(['/v1/log/clientError']);
  });

  test('an injected-wallet connect the wallet is still unlocking shows and reports the pending-request hint', async ({
    page,
  }) => {
    test.setTimeout(90000);

    const wallet = testWallet(57);
    await injectWallet(
      page,
      walletAnswers(wallet, {
        connected: () => false,
        requestAccounts: () => ({ error: { code: -32603, message: 'Already processing unlock. Please wait.' } }),
      }),
    );
    const sent = recordAuthAndErrorReports(page);

    await page.goto('/login?blockchain=Ethereum');
    await page.waitForLoadState('networkidle');
    await page.locator('img[src*="cryptowallet"]').click();

    const report = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/v1/log/clientError'),
      { timeout: 20000 },
    );
    await page.locator('img[src*="metamask"]').click();

    await expect(page.getByText('Connection failed!')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Please confirm or close the pending request in your wallet.')).toBeVisible();
    await expect(page.getByText('Already processing unlock. Please wait.')).toHaveCount(0);
    const response = await report;
    expect(response.ok()).toBe(true);
    expect(JSON.parse(response.request().postData() ?? '{}').message).toBe(
      'Please confirm or close the pending request in your wallet.',
    );
    expect(sent).toEqual(['/v1/log/clientError']);
  });

  test('a cancelled TronLink connection returns to the wallet selection without a report', async ({ page }) => {
    test.setTimeout(90000);

    // Older TronLink protocol (window.tronLink): the wallet answers a cancel with code 4001, and the adapter keeps only
    // its own message "The user rejected connection." without the code.
    const sent = await openInjectedWallet(
      page,
      () => {
        (window as unknown as { tronLink: unknown }).tronLink = {
          ready: false,
          tronWeb: { defaultAddress: { base58: false } },
          request: async ({ method }: { method: string }) =>
            method === 'tron_requestAccounts' ? { code: 4001, message: 'User rejected' } : null,
        };
      },
      'tronlink',
    );

    await expectCancelledAtSelection(page, 'tronlink', sent);
  });

  test('a cancelled TronLink connection on the new protocol returns to the wallet selection', async ({ page }) => {
    test.setTimeout(90000);

    // New TronLink protocol (window.tron): the wallet rejects with code 4001, which the adapter keeps as `error`.
    const sent = await openInjectedWallet(
      page,
      () => {
        (window as unknown as { tron: unknown }).tron = {
          isTronLink: true,
          request: async ({ method }: { method: string }) => {
            if (method === 'eth_requestAccounts') throw { code: 4001, message: 'User rejected the request.' };
            return null;
          },
          on: () => undefined,
          removeListener: () => undefined,
        };
      },
      'tronlink',
    );

    await expectCancelledAtSelection(page, 'tronlink', sent);
  });

  test('a cancelled Trust (Solana) connection returns to the wallet selection without a report', async ({ page }) => {
    test.setTimeout(90000);

    // Trust rejects a cancelled connect with code 4001; the Solana wallet adapter keeps it as `error`.
    const sent = await openInjectedWallet(
      page,
      () => {
        (window as unknown as { trustwallet: unknown }).trustwallet = {
          solana: {
            isTrust: true,
            isConnected: false,
            publicKey: null,
            connect: () => Promise.reject({ code: 4001, message: 'User rejected the request.' }),
            disconnect: () => Promise.resolve(),
            on: () => undefined,
            off: () => undefined,
            removeListener: () => undefined,
          },
        };
      },
      'trust',
    );

    await expectCancelledAtSelection(page, 'trust', sent);
  });

  test('a cancelled Trust (Tron) connection returns to the Tron wallet selection without a report', async ({
    page,
  }) => {
    test.setTimeout(90000);

    // The Trust Tron adapter answers code 4001 with only its own message "The user rejected connection.".
    const sent = await openInjectedWallet(
      page,
      () => {
        (window as unknown as { trustwallet: unknown }).trustwallet = {
          tronLink: {
            ready: false,
            tronWeb: { defaultAddress: { base58: false } },
            request: async ({ method }: { method: string }) =>
              method === 'tron_requestAccounts' ? { code: 4001, message: 'User rejected' } : null,
          },
        };
      },
      'trust',
      '/?mode=tron-wallets',
    );

    await expectCancelledAtSelection(page, 'trust', sent, '/?mode=tron-wallets');
  });

  test('a TronLink connection the wallet refuses for another reason still shows the error and reports it', async ({
    page,
  }) => {
    test.setTimeout(90000);

    const report = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/v1/log/clientError'),
      { timeout: 20000 },
    );
    // code 4000: a connection request of the same page is still open in the wallet
    const sent = await openInjectedWallet(
      page,
      () => {
        (window as unknown as { tronLink: unknown }).tronLink = {
          ready: false,
          tronWeb: { defaultAddress: { base58: false } },
          request: async ({ method }: { method: string }) =>
            method === 'tron_requestAccounts' ? { code: 4000, message: 'Request pending' } : null,
        };
      },
      'tronlink',
    );

    await expect(page.getByText('Connection failed!')).toBeVisible({ timeout: 20000 });
    expect((await report).ok()).toBe(true);
    expect(sent).toEqual(['/v1/log/clientError']);
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
    await expect(page.locator('img[src*="alby"]')).toHaveCount(0);
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

  test('/connect with a mail session sends a rejected address switch once and shows the rejection', async ({
    page,
  }) => {
    test.setTimeout(90000);

    const user = await createUser({ tag: 'auth-switch' });
    const mail = required(user.mail, 'created user must have a mail address');
    await requestMailLogin(mail);
    const jwt = await completeMailLogin(mail);

    // SQL: no customer API puts an account into this state while keeping a valid session.
    await queryRows(`UPDATE user_data SET status = 'Deactivated' WHERE id = $1`, [user.userDataId]);

    let switchCalls = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/v1/user/change') switchCalls++;
    });

    await gotoWithSession(page, '/connect', jwt);

    await expect(page.getByText('Please select an address or add a new one to continue.', { exact: true })).toBeVisible(
      {
        timeout: 20000,
      },
    );
    await expect(
      page.getByText('This address could not be selected. Please use another address or contact our support.', {
        exact: true,
      }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('User is deactivated or blocked')).toHaveCount(0);

    // A retrying screen would keep sending during the wait.
    await page.waitForTimeout(3000);
    expect(switchCalls).toBe(1);
    expect(normPath(new URL(page.url()).pathname)).toBe('/connect');
  });

  // ---------------------------------------------------------------------------
  // Stored wallet — a returning browser that still remembers the removed Alby wallet
  // ---------------------------------------------------------------------------

  test('a stored Alby wallet is dropped and a signed-in visitor can continue buying Bitcoin', async ({ page }) => {
    test.setTimeout(90000);

    // Dedicated index that no other test signs in with, so the session below only comes from here.
    const wallet = testWallet(57);
    const jwt = await signatureLogin(wallet);

    // The removed wallet is still in the browser storage of a returning visitor.
    await page.addInitScript(() => {
      window.localStorage.setItem('dfx.srv.activeWallet', 'Alby');
    });

    await gotoWithSession(page, '/', jwt);

    // App initialisation strips the one-shot session parameter; waiting for that keeps the clicks
    // below away from the remount it triggers.
    await expect
      .poll(() => new URL(page.url()).searchParams.has('session'), { timeout: 15000 })
      .toBe(false);
    await page.waitForLoadState('networkidle');

    // The app no longer knows Alby, so initialisation must drop the stored key instead of keeping
    // a wallet type it cannot resolve (or failing on it).
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem('dfx.srv.activeWallet')), { timeout: 15000 })
      .toBeNull();

    // The visitor can continue a real flow: home → buy → Bitcoin → wallet selection.
    await page.locator('img[src$="/kaufen_en.jpg"]').click();
    await expect(page.locator('img[src$="/bitcoinlightning_en.jpg"]')).toBeVisible({ timeout: 15000 });
    await page.locator('img[src$="/bitcoinlightning_en.jpg"]').click();

    await expect(page.locator('img[src$="/hardwarewallets_en.jpg"]')).toBeVisible({ timeout: 15000 });
    // A Bitcoin-capable non-Alby wallet proves the selection rendered for this flow.
    await expect(page.locator('img[src$="/command_en.jpg"]')).toBeVisible();
    await expect(page.locator('img[src*="alby"]')).toHaveCount(0);
    await expect(page.getByText('Oh, sorry, something went wrong')).toHaveCount(0);

    // The wallet list also renders for a logged-out visitor, so it does not prove the session
    // survived. Reload the guarded account page from the browser's stored token: it must not
    // redirect to /login, and the user data the real API returns must belong to this wallet.
    const userResponsePromise = page.waitForResponse(
      (response) => response.request().method() === 'GET' && /\/v[12]\/user$/.test(new URL(response.url()).pathname),
      { timeout: 20000 },
    );
    await page.goto('/account');
    const userResponse = await userResponsePromise;
    expect(userResponse.ok(), `GET /v2/user returned ${userResponse.status()}`).toBe(true);
    const account = (await userResponse.json()) as { addresses?: Array<{ address?: string }> };
    expect(
      account.addresses?.map((entry) => entry.address?.toLowerCase()),
      'the account API response must contain the signed-in wallet address',
    ).toContain(wallet.address.toLowerCase());

    await expect(page.getByText('Account', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Active address', { exact: true })).toBeVisible();
    await expect(page.getByText(wallet.address, { exact: false }).first()).toBeVisible();
    expect(normPath(new URL(page.url()).pathname)).toBe('/account');
  });

  // ---------------------------------------------------------------------------
  // /login/mail — ConnectMail form + real mail-login sequence
  // ---------------------------------------------------------------------------

  test('/login/mail mail form → confirmation → login link visits /buy → session on /connect', async ({ page }) => {
    test.setTimeout(90000);

    const email = testEmail('auth-mail');

    await page.goto('/login/mail');
    await page.waitForLoadState('networkidle');
    expect(normPath(new URL(page.url()).pathname)).toBe('/login/mail');

    // ConnectMail auto-selected: email field + Next.
    await expect(page.getByPlaceholder('example@mail.com')).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder('example@mail.com').fill(email);

    const mailPost = page.waitForResponse((response) => {
      const request = response.request();
      return request.method() === 'POST' && new URL(request.url()).pathname === '/v1/auth/mail';
    });
    await page.getByRole('button', { name: 'Next' }).click();
    const response = await mailPost;
    expect(response.ok(), `POST /v1/auth/mail returned ${response.status()}`).toBe(true);

    const sent: unknown = response.request().postDataJSON();
    if (sent === null || typeof sent !== 'object' || Array.isArray(sent)) {
      throw new Error('POST /v1/auth/mail body is not an object');
    }
    const redirectUri = (sent as { redirectUri?: unknown }).redirectUri;
    if (typeof redirectUri !== 'string') throw new Error('the login page should send redirectUri');
    expect(new URL(redirectUri).pathname).toBe('/buy');

    await expect(
      page.getByText('We have sent an email with further instructions to the address provided.', { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();

    const row = await waitForRow<{ data: string }>(
      `SELECT n.data
       FROM notification n
       JOIN user_data ud ON ud.id = n."userDataId"
       WHERE ud.mail = $1 AND n.context = 'Login'
       ORDER BY n.id DESC LIMIT 1`,
      [email],
      20000,
    );
    // A mail session has no address. After the link lands on /buy, useAddressGuard sends it on to
    // /connect. Record main-frame paths so a pass still proves the link went through /buy.
    const visited: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame()) return;
      visited.push(normPath(new URL(frame.url()).pathname));
    });
    await page.goto(loginUrlFromNotification(row.data));

    await expect.poll(() => visited.includes('/buy'), { timeout: 30000 }).toBe(true);
    await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 30000 }).toBe('/connect');
    await expect
      .poll(async () => page.evaluate(() => window.localStorage.getItem('dfx.authenticationToken')), {
        timeout: 20000,
      })
      .toBeTruthy();
    await page.waitForTimeout(3000);
    expect(normPath(new URL(page.url()).pathname)).toBe('/connect');

    await waitForRow<{ id: number; mail: string }>(`SELECT id, mail FROM user_data WHERE mail = $1`, [email], 20000);
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
          otp = new URL(url, process.env.E2E_FRONTEND_URL ?? 'http://frontend.e2e.test').searchParams.get('otp');
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
