/**
 * App 2.0 full-stack coverage.
 *
 * Owns the hosted `/app2/` artifact (not declared in `src/App.tsx`). Every hash
 * route is opened with a session and asserted by unique copy — not just a
 * non-empty body. Write-path tests drive a real buy, sell, swap, KYC submit,
 * limit request, support ticket, OpenCryptoPay application and mail login
 * through the App 2.0 UI and prove the matching Postgres write.
 */

import { ethers } from 'ethers';
import type { Page } from '@playwright/test';
import { expect, test, waitForRow, withDb } from './fixtures';
import { testWallet } from './fixtures/auth';
import { completeMailLogin } from './fixtures/mail';
import { cleanupCreatedData, createBankAccount, createTransaction, createUser } from './fixtures/factories';
import { TEST_IBAN, testEmail } from './fixtures/test-data';

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
  depositAddress?: string;
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
      if (!url.includes('/paymentInfos') || res.request().method() !== 'PUT') return;
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

async function pickEthPayAsset(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Select pay asset' }).click();
  const search = page.getByRole('textbox', { name: /search assets/i });
  await expect(search).toBeVisible({ timeout: 15000 });
  await search.fill('ETH');
  await page.getByRole('button', { name: /^ETH\b/ }).first().click();
  const ethereum = page.getByRole('button', { name: /ethereum network/i });
  try {
    await expect(ethereum).toBeVisible({ timeout: 4000 });
    await ethereum.click();
  } catch {
    // Single-chain tokens skip the network step and close the picker themselves.
  }
  await expect(page.getByRole('button', { name: 'Select pay asset' })).toContainText(/ETH/i, { timeout: 10000 });
}

async function confirmTrade(page: Page): Promise<void> {
  const cta = page.getByTestId('trade-cta');
  await expect(cta).toBeEnabled({ timeout: 45000 });
  await cta.click();
  const ibanRow = page.getByRole('button', { name: /CH93/i });
  try {
    await ibanRow.waitFor({ state: 'visible', timeout: 4000 });
    await ibanRow.click();
    await expect(cta).toBeEnabled({ timeout: 15000 });
    await cta.click();
  } catch {
    // Bank account already selected — CTA went straight to payment details.
  }
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

  test('logged-in hash routes render their real screens', async ({ page }) => {
    test.setTimeout(120000);
    const user = await createUser({ tag: 'app2-routes', kycLevel: 50, completePersonalData: true, language: 'EN' });

    await openApp2(page, user.jwt, '#/');
    await expect(page.getByRole('tab', { name: /^buy$/i })).toHaveAttribute('aria-selected', 'true');

    await openApp2(page, user.jwt, '#/account');
    await expect(page.getByText(/^trading limit$/i)).toBeVisible({ timeout: 20000 });

    await openApp2(page, user.jwt, '#/tx');
    await expect(page.getByRole('heading', { name: /^transactions$/i })).toBeVisible({ timeout: 20000 });

    await openApp2(page, user.jwt, '#/kyc');
    await expect(page.getByRole('heading', { name: /verification/i })).toBeVisible({ timeout: 20000 });

    await openApp2(page, user.jwt, '#/limit');
    await expect(page.getByTestId('limit-card')).toBeVisible({ timeout: 20000 });

    await openApp2(page, user.jwt, '#/ocp');
    await expect(page.getByRole('heading', { name: /opencryptopay/i }).first()).toBeVisible({ timeout: 20000 });

    await openApp2(page, user.jwt, '#/support');
    await expect(page.getByRole('heading', { name: /^support$/i })).toBeVisible({ timeout: 20000 });

    await openApp2(page, user.jwt, '#/account-merge');
    await expect(page.getByText(/invalid or has expired/i)).toBeVisible({ timeout: 20000 });

    await openApp2(page, user.jwt, '#/buy/success');
    await expect(page.getByText(/confirmation link is incomplete/i)).toBeVisible({ timeout: 20000 });

    await openApp2(page, user.jwt, '#/buy/failure');
    await expect(page.getByText(/payment failed/i)).toBeVisible({ timeout: 20000 });

    await openApp2(page, user.jwt, '#/missing-route');
    await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: /back to (home|buy)|home/i }).click();
    await expect(page.getByRole('tab', { name: /^buy$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 15000 });
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

  test('sell: pick ETH, type 0.1, open deposit details, prove sell row', async ({ page }) => {
    test.setTimeout(120000);
    const user = await createUser({ tag: 'app2-sell', kycLevel: 50, completePersonalData: true, language: 'EN' });
    await createBankAccount(user.jwt, { iban: TEST_IBAN });
    const capture = attachPaymentInfoCapture(page);

    await openApp2(page, user.jwt, '#/?mode=sell');
    await expect(page.getByRole('tab', { name: /^sell$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 20000 });

    await pickEthPayAsset(page);
    const amount = page.getByRole('textbox', { name: 'Amount you pay' });
    await expect(amount).toBeVisible();
    await amount.fill('0.1');
    await confirmTrade(page);

    await expect
      .poll(() => capture.get()?.depositAddress, {
        timeout: 45000,
        message: 'PUT /sell/paymentInfos should return a deposit address',
      })
      .toBeTruthy();

    const sellRow = await waitForRow<{ id: number; type: string }>(
      `SELECT id, type FROM deposit_route
       WHERE "userId" = $1 AND type = 'Sell'
       ORDER BY id DESC LIMIT 1`,
      [user.userId],
      30000,
    );
    expect(sellRow.type).toBe('Sell');
  });

  test('swap: type 0.1, open deposit details, prove crypto route', async ({ page }) => {
    test.setTimeout(120000);
    const user = await createUser({ tag: 'app2-swap', kycLevel: 50, completePersonalData: true, language: 'EN' });
    const capture = attachPaymentInfoCapture(page);

    await openApp2(page, user.jwt, '#/?mode=swap');
    await expect(page.getByRole('tab', { name: /^swap$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 20000 });

    await pickEthPayAsset(page);
    const amount = page.getByRole('textbox', { name: 'Amount you pay' });
    await expect(amount).toBeVisible();
    await amount.fill('0.1');
    const cta = page.getByTestId('trade-cta');
    await expect(cta).toBeEnabled({ timeout: 45000 });
    await cta.click();

    await expect
      .poll(() => capture.get()?.depositAddress, {
        timeout: 45000,
        message: 'PUT /swap/paymentInfos should return a deposit address',
      })
      .toBeTruthy();

    const route = await waitForRow<{ id: number; type: string }>(
      `SELECT id, type FROM deposit_route
       WHERE "userId" = $1 AND type = 'Crypto'
       ORDER BY id DESC LIMIT 1`,
      [user.userId],
      30000,
    );
    expect(route.type).toBe('Crypto');
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

  test('metamask: injected EIP-6963 connect signs in and opens buy', async ({ page }) => {
    test.setTimeout(90000);
    const wallet = testWallet(250);
    await page.exposeFunction('e2ePersonalSign', async (hexOrMsg: string) => {
      let message = hexOrMsg;
      if (message.startsWith('0x')) {
        message = Buffer.from(message.slice(2), 'hex').toString('utf8');
      }
      const signer = new ethers.Wallet(wallet.privateKey);
      return signer.signMessage(message);
    });
    await page.addInitScript(({ address }) => {
      const provider = {
        isMetaMask: true,
        request: async ({ method, params }: { method: string; params?: string[] }) => {
          if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address];
          if (method === 'personal_sign') {
            const data = params?.[0];
            if (typeof data !== 'string') throw new Error('missing personal_sign payload');
            return (window as unknown as { e2ePersonalSign: (payload: string) => Promise<string> }).e2ePersonalSign(
              data,
            );
          }
          throw new Error(`unsupported method ${method}`);
        },
      };
      (window as unknown as { ethereum: typeof provider }).ethereum = provider;
      window.addEventListener('eip6963:requestProvider', () => {
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: { info: { rdns: 'io.metamask', name: 'MetaMask' }, provider },
          }),
        );
      });
    }, { address: wallet.address });

    const response = await page.goto('/app2/');
    expect(response?.ok(), `/app2/ status ${response?.status()}`).toBe(true);
    await page.getByRole('button', { name: /connect wallet/i }).click();
    await page.getByRole('button', { name: /metamask evm/i }).click();
    await expect(page.getByRole('tab', { name: /^buy$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 45000 });
    const token = await page.evaluate(() => window.localStorage.getItem('dfx.authenticationToken'));
    expect(token, 'MetaMask connect must store a DFX JWT').toBeTruthy();
  });

  test('mail: send magic link through the landing form, prove user_data write', async ({ page }) => {
    test.setTimeout(90000);
    const email = testEmail('app2-mail');
    const response = await page.goto('/app2/');
    expect(response?.ok(), `/app2/ status ${response?.status()}`).toBe(true);

    await page.getByRole('button', { name: /continue with email/i }).click();
    await page.getByRole('textbox', { name: /email address/i }).fill(email);
    await page.getByRole('button', { name: /send magic link/i }).click();
    await expect(page.getByTestId('app2-toast')).toContainText(/check your email/i, { timeout: 20000 });

    const jwt = await completeMailLogin(email);
    expect(jwt, 'mail login must return a session JWT').toBeTruthy();

    const row = await waitForRow<{ id: number; mail: string }>(
      `SELECT id, mail FROM user_data WHERE mail = $1`,
      [email],
      20000,
    );
    expect(row.mail).toBe(email);

    await openApp2(page, jwt, '#/');
    await expect(page.getByRole('tab', { name: /^buy$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 20000 });
  });

  test('account: session bootstrap shows the account heading', async ({ page }) => {
    const user = await createUser({ tag: 'app2-acct', kycLevel: 50, completePersonalData: true, language: 'EN' });
    await openApp2(page, user.jwt, '#/account');
    await expect(page.getByText(/^trading limit$/i)).toBeVisible({ timeout: 20000 });
  });

  test('tx: fresh account shows the empty transaction list', async ({ page }) => {
    const user = await createUser({ tag: 'app2-tx', kycLevel: 50, completePersonalData: true, language: 'EN' });
    await openApp2(page, user.jwt, '#/tx');
    await expect(page.getByRole('heading', { name: /^transactions$/i })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/no transactions yet/i)).toBeVisible();
  });

  test('tx: seeded buy appears in the App 2.0 list', async ({ page }) => {
    test.setTimeout(90000);
    const user = await createUser({ tag: 'app2-tx-row', kycLevel: 50, completePersonalData: true, language: 'EN' });
    await createTransaction({
      state: 'completed_buy',
      tag: 'app2-tx-buy',
      userId: user.userId,
      userDataId: user.userDataId,
      jwt: user.jwt,
      amount: 111,
      inputAsset: 'CHF',
    });
    await openApp2(page, user.jwt, '#/tx');
    await expect(page.getByRole('heading', { name: /^transactions$/i })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/^buy$/i).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/111/).first()).toBeVisible();
  });

  test('limit: submit a request, prove support_issue row', async ({ page }) => {
    test.setTimeout(90000);
    const user = await createUser({ tag: 'app2-limit', kycLevel: 50, completePersonalData: true, language: 'EN' });
    await openApp2(page, user.jwt, '#/limit');
    await expect(page.getByTestId('limit-card')).toBeVisible({ timeout: 20000 });
    await page.locator('#lmText').fill('E2E App2 limit request from full-stack harness');
    await page.locator('#lmName').fill('E2E Limit User');
    await page.getByRole('button', { name: /submit request/i }).click();
    const row = await waitForRow<{ id: number; type: string }>(
      `SELECT id, type FROM support_issue
       WHERE "userDataId" = $1 AND type = 'LimitRequest'
       ORDER BY id DESC LIMIT 1`,
      [user.userDataId],
      20000,
    );
    expect(row.type).toBe('LimitRequest');
  });

  test('support: submit a ticket, prove support_issue row', async ({ page }) => {
    test.setTimeout(90000);
    const user = await createUser({ tag: 'app2-sup', kycLevel: 50, completePersonalData: true, language: 'EN' });
    await openApp2(page, user.jwt, '#/support');
    await expect(page.getByRole('heading', { name: /^support$/i })).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: /create a support ticket/i }).click();
    await page.getByLabel(/your name/i).fill('E2E Support User');
    // Two "Message" textareas exist (new-ticket form rows=6 vs chat composer rows=1).
    await page.locator('form textarea[rows="6"]').fill('E2E App2 support ticket from full-stack harness');
    await page.getByRole('button', { name: /submit ticket/i }).click();
    const row = await waitForRow<{ id: number; name: string }>(
      `SELECT id, name FROM support_issue
       WHERE "userDataId" = $1 AND name = $2
       ORDER BY id DESC LIMIT 1`,
      [user.userDataId, 'E2E Support User'],
      20000,
    );
    expect(row.name).toBe('E2E Support User');
    const msg = await waitForRow<{ id: number; message: string }>(
      `SELECT id, message FROM support_message
       WHERE "issueId" = $1 AND message = $2
       LIMIT 1`,
      [row.id, 'E2E App2 support ticket from full-stack harness'],
      15000,
    );
    expect(msg.message).toContain('E2E App2 support ticket');
  });

  test('ocp: apply through the form, prove PartnershipRequest', async ({ page }) => {
    test.setTimeout(90000);
    const user = await createUser({ tag: 'app2-ocp-apply', kycLevel: 50, completePersonalData: true, language: 'EN' });
    await openApp2(page, user.jwt, '#/ocp');
    await expect(page.getByRole('heading', { name: /opencryptopay/i }).first()).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: /apply for opencryptopay/i }).click();
    await expect(page.locator('#apBiz')).toBeVisible({ timeout: 15000 });
    await page.locator('#apBiz').fill('E2E App2 Cafe');
    const contact = page.locator('#apName');
    if (!(await contact.inputValue())) {
      await contact.fill('E2E Merchant');
    }
    await page.getByRole('button', { name: /submit application/i }).click();
    const row = await waitForRow<{ id: number; type: string; name: string }>(
      `SELECT id, type, name FROM support_issue
       WHERE "userDataId" = $1 AND type = 'PartnershipRequest'
       ORDER BY id DESC LIMIT 1`,
      [user.userDataId],
      20000,
    );
    expect(row.type).toBe('PartnershipRequest');
  });

  test('ocp: gated sub-view without a merchant account stays on the hub', async ({ page }) => {
    const user = await createUser({ tag: 'app2-ocp-gate', kycLevel: 50, completePersonalData: true, language: 'EN' });
    await openApp2(page, user.jwt, '#/ocp?sub=routes');
    await expect(page.getByRole('button', { name: /apply for opencryptopay/i })).toBeVisible({ timeout: 20000 });
  });

  test('drawer: menu opens KYC from a logged-in session', async ({ page }) => {
    const user = await createUser({ tag: 'app2-drawer', kycLevel: 50, completePersonalData: true, language: 'EN' });
    await openApp2(page, user.jwt, '#/');
    await page.getByRole('button', { name: 'menu' }).click();
    await page.getByRole('button', { name: /verification \(kyc\)/i }).click();
    await expect(page.getByRole('heading', { name: /verification/i })).toBeVisible({ timeout: 20000 });
  });

  test('language: switching to German changes the landing CTA', async ({ page }) => {
    const response = await page.goto('/app2/');
    expect(response?.ok(), `/app2/ status ${response?.status()}`).toBe(true);
    await page.getByRole('button', { name: /change language/i }).click();
    await page.getByRole('menuitem', { name: /deutsch/i }).click();
    await expect(page.getByRole('button', { name: /mit e-mail fortfahren/i })).toBeVisible({ timeout: 15000 });
  });

  test('not-found: unmatched hash shows the branded page', async ({ page }) => {
    const response = await page.goto('/app2/#/this-route-does-not-exist');
    expect(response?.ok(), `/app2/ status ${response?.status()}`).toBe(true);
    await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible({ timeout: 20000 });
  });
});
