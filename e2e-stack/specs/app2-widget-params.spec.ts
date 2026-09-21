/**
 * App 2.0 partner widget params — each case asserts the effect, not that the
 * URL contains the key. The without-half is the one that makes the with-half
 * mean something: if X also happens on a bare session, the with-half is vacuum-true.
 *
 * Only params whose effect App 2.0 actually applies through the live URL → router
 * → API/screen path belong here. Params with no runtime wiring, or that need a
 * harness state we cannot create, are left out rather than simulated.
 */

import { ethers } from 'ethers';
import type { Page } from '@playwright/test';
import { expect, test, queryOne, withDb, apiGet } from './fixtures';
import { cleanupCreatedData, createBankAccount, createUser, TEST_IBAN } from './fixtures/factories';
import { testWallet, type TestWallet } from './fixtures/auth';

interface BuyPaymentInfoBody {
  externalTransactionId?: string;
  personalIbanProvider?: string;
  paymentMethod?: string;
}

interface SellPaymentInfoBody {
  iban?: string;
}

interface AuthRequestBody {
  address?: string;
  signature?: string;
  key?: string;
}

async function openApp2(page: Page, jwt: string, hash = '#/', query: Record<string, string> = {}): Promise<void> {
  const params = new URLSearchParams({ session: jwt, ...query });
  const url = `/app2/?${params.toString()}${hash}`;
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

async function openLoggedOut(page: Page, query: Record<string, string> = {}): Promise<void> {
  const qs = new URLSearchParams(query).toString();
  const url = qs ? `/app2/?${qs}` : '/app2/';
  const response = await page.goto(url);
  expect(response, `${url} must be served`).toBeTruthy();
  expect(response?.ok(), `${url} status ${response?.status()}`).toBe(true);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('button', { name: /connect wallet/i })).toBeVisible({ timeout: 20000 });
}

function attachBuyPaymentInfoRequest(page: Page): { get: () => BuyPaymentInfoBody | undefined } {
  let last: BuyPaymentInfoBody | undefined;
  page.on('request', (req) => {
    try {
      const url = req.url();
      if (!url.includes('/buy/paymentInfos') || req.method() !== 'PUT') return;
      if (url.includes('/confirm') || url.includes('/invoice')) return;
      last = req.postDataJSON() as BuyPaymentInfoBody;
    } catch {
      /* ignore parse errors */
    }
  });
  return { get: () => last };
}

function attachSellPaymentInfoRequest(page: Page): { get: () => SellPaymentInfoBody | undefined } {
  let last: SellPaymentInfoBody | undefined;
  page.on('request', (req) => {
    try {
      const url = req.url();
      if (!url.includes('/sell/paymentInfos') || req.method() !== 'PUT') return;
      last = req.postDataJSON() as SellPaymentInfoBody;
    } catch {
      /* ignore parse errors */
    }
  });
  return { get: () => last };
}

function attachAuthRequest(page: Page): { get: () => AuthRequestBody | undefined } {
  let last: AuthRequestBody | undefined;
  page.on('request', (req) => {
    try {
      if (req.method() !== 'POST') return;
      const path = new URL(req.url()).pathname.replace(/\/$/, '');
      if (path !== '/v1/auth' && path !== '/auth') return;
      last = req.postDataJSON() as AuthRequestBody;
    } catch {
      /* ignore parse errors */
    }
  });
  return { get: () => last };
}

async function openOrganizationForm(page: Page, jwt: string, query: Record<string, string> = {}): Promise<void> {
  await openApp2(page, jwt, '#/kyc', { 'auto-start': 'true', 'account-type': 'Organization', ...query });
  const orgName = page.getByRole('textbox', { name: /^organization name$/i });
  const mail = page.locator('input[type="email"]');
  const form = await Promise.race([
    orgName.waitFor({ state: 'visible', timeout: 25000 }).then(() => 'org' as const),
    mail.waitFor({ state: 'visible', timeout: 25000 }).then(() => 'contact' as const),
  ]).catch(() => 'none' as const);
  expect(form, 'organization-* needs PersonalData, not ContactData or the overview').toBe('org');
}

async function reopenContactData(userDataId: number): Promise<void> {
  await withDb(async (client) => {
    await client.query(`UPDATE user_data SET mail = NULL WHERE id = $1`, [userDataId]);
    await client.query(
      `UPDATE kyc_step SET status = 'NotStarted', updated = NOW()
       WHERE "userDataId" = $1 AND name = 'ContactData'`,
      [userDataId],
    );
  });
}

async function signatureFor(wallet: Pick<TestWallet, 'address' | 'privateKey'>): Promise<string> {
  const base = process.env.E2E_API_URL ?? 'http://api:3000';
  const signRes = await fetch(`${base}/v1/auth/signMessage?address=${encodeURIComponent(wallet.address)}`);
  if (!signRes.ok) {
    throw new Error(`signMessage failed: ${signRes.status} ${await signRes.text()}`);
  }
  const { message } = (await signRes.json()) as { message: string };
  return new ethers.Wallet(wallet.privateKey).signMessage(message);
}

async function unusedWallet(): Promise<TestWallet> {
  // Far above FACTORY_WALLET_INDEX_BASE (100) so a long suite's createUser counter cannot collide.
  for (let index = 50_000; index < 50_200; index += 1) {
    const wallet = testWallet(index);
    const row = await queryOne<{ id: number }>(`SELECT id FROM "user" WHERE lower(address) = lower($1) LIMIT 1`, [
      wallet.address,
    ]);
    if (!row) return wallet;
  }
  throw new Error('unusedWallet: no free testWallet index in 50000–50199');
}

/** JWT `blockchains` claim — same field WalletSessionProvider reads for `chainFilter`. */
function jwtBlockchains(jwt: string): string[] {
  const payload = jwt.split('.')[1];
  if (!payload) return [];
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { blockchains?: unknown };
  if (!Array.isArray(parsed.blockchains)) return [];
  return parsed.blockchains.filter((c): c is string => typeof c === 'string');
}

/**
 * Factory users have a null `user.ref` (own referral code). Sign-in looks the partner code up
 * with `findOne({ where: { ref } })` and writes the match onto the new account's `usedRef`.
 */
async function assignReferrerCode(userId: number): Promise<string> {
  for (let salt = 0; salt < 50; salt += 1) {
    const code = `${userId % 1000}-${(userId + salt) % 1000}`;
    const clash = await queryOne<{ id: number }>(`SELECT id FROM "user" WHERE ref = $1 LIMIT 1`, [code]);
    if (clash) continue;
    const updated = await withDb(async (client) => {
      const result = await client.query(`UPDATE "user" SET ref = $1 WHERE id = $2`, [code, userId]);
      return result.rowCount;
    });
    if (updated !== 1) {
      throw new Error(`refcode: UPDATE "user".ref for id=${userId} rowCount=${String(updated)}`);
    }
    return code;
  }
  throw new Error(`refcode: could not assign a unique usedRef-shaped "user".ref for id=${userId}`);
}

async function waitForBuyHome(page: Page): Promise<void> {
  await expect(page.getByRole('tab', { name: /^buy$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 20000 });
}

async function waitForReceiveAsset(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Select receive asset' })).toContainText(/BTC|ETH|USDT|[A-Z]{2,}/i, {
    timeout: 20000,
  });
}

async function submitBuyForPaymentInfo(page: Page): Promise<void> {
  const amount = page.getByRole('textbox', { name: 'Amount you pay' });
  await expect(amount).toBeVisible({ timeout: 20000 });
  await amount.fill('100');
  const cta = page.getByTestId('trade-cta');
  await expect(cta).toBeEnabled({ timeout: 45000 });
  await cta.click();
  await expect(page.getByText('IBAN', { exact: true }).first()).toBeVisible({ timeout: 45000 });
}

test.describe('App 2.0 widget params', () => {
  test.afterEach(async () => {
    await cleanupCreatedData();
  });

  test('hide-target-selection: receive picker is disabled only when the param is set', async ({ page }) => {
    const user = await createUser({ tag: 'app2-wp-hide', kycLevel: 50, completePersonalData: true, language: 'EN' });

    await openApp2(page, user.jwt, '#/');
    await waitForBuyHome(page);
    await waitForReceiveAsset(page);
    const open = page.getByRole('button', { name: 'Select receive asset' });
    await expect(open).toBeEnabled();
    await open.click();
    await expect(page.getByRole('textbox', { name: /search assets/i })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Close' }).click();

    await openApp2(page, user.jwt, '#/', { 'hide-target-selection': 'true' });
    await waitForBuyHome(page);
    const hidden = page.getByRole('button', { name: 'Select receive asset' });
    await expect(hidden).toBeDisabled({ timeout: 20000 });
    await expect(page.getByRole('textbox', { name: /search assets/i })).toHaveCount(0);
  });

  test('asset-in: pay currency follows the param and falls back without it', async ({ page }) => {
    const user = await createUser({ tag: 'app2-wp-assetin', kycLevel: 50, completePersonalData: true, language: 'EN' });

    await openApp2(page, user.jwt, '#/');
    await waitForBuyHome(page);
    const pay = page.getByRole('button', { name: 'Select pay currency' });
    await expect(pay).toContainText(/EUR/i, { timeout: 20000 });

    await openApp2(page, user.jwt, '#/', { 'asset-in': 'CHF' });
    await waitForBuyHome(page);
    await expect(page.getByRole('button', { name: 'Select pay currency' })).toContainText(/CHF/i, { timeout: 20000 });
  });

  test('asset-out: receive asset follows the param and is not that asset without it', async ({ page }) => {
    const user = await createUser({ tag: 'app2-wp-assetout', kycLevel: 50, completePersonalData: true, language: 'EN' });

    await openApp2(page, user.jwt, '#/');
    await waitForBuyHome(page);
    await waitForReceiveAsset(page);
    const defaultReceive = (await page.getByRole('button', { name: 'Select receive asset' }).innerText()).toUpperCase();
    const wanted = defaultReceive.includes('USDT') ? 'ETH' : 'USDT';

    await openApp2(page, user.jwt, '#/', { 'asset-out': wanted });
    await waitForBuyHome(page);
    await expect(page.getByRole('button', { name: 'Select receive asset' })).toContainText(new RegExp(wanted, 'i'), {
      timeout: 20000,
    });
  });

  test('amount-out: receive field is driven by the param and is read-only without it', async ({ page }) => {
    const user = await createUser({ tag: 'app2-wp-amtout', kycLevel: 50, completePersonalData: true, language: 'EN' });

    await openApp2(page, user.jwt, '#/');
    await waitForBuyHome(page);
    const receive = page.getByRole('textbox', { name: 'Amount you receive' });
    await expect(receive).toBeVisible({ timeout: 20000 });
    await expect(receive).toHaveJSProperty('readOnly', true);

    await openApp2(page, user.jwt, '#/', { 'amount-out': '0.01' });
    await waitForBuyHome(page);
    const driven = page.getByRole('textbox', { name: 'Amount you receive' });
    await expect(driven).toHaveValue('0.01', { timeout: 20000 });
    await expect(driven).toHaveJSProperty('readOnly', false);
  });

  test('balances: sell picker lists only held assets, and lists others without the param', async ({ page }) => {
    const user = await createUser({ tag: 'app2-wp-bal', kycLevel: 50, completePersonalData: true, language: 'EN' });

    await openApp2(page, user.jwt, '#/?mode=sell');
    await expect(page.getByRole('tab', { name: /^sell$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 20000 });
    await page.getByRole('button', { name: 'Select pay asset' }).click();
    const search = page.getByRole('textbox', { name: /search assets/i });
    await expect(search).toBeVisible({ timeout: 15000 });
    await search.fill('ETH');
    await expect(page.getByRole('button', { name: /^ETH\b/ }).first()).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Close' }).click();

    await openApp2(page, user.jwt, '#/?mode=sell', { balances: '5@USDT' });
    await expect(page.getByRole('tab', { name: /^sell$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 20000 });
    await page.getByRole('button', { name: 'Select pay asset' }).click();
    const heldSearch = page.getByRole('textbox', { name: /search assets/i });
    await expect(heldSearch).toBeVisible({ timeout: 15000 });
    await heldSearch.fill('ETH');
    await expect(page.getByRole('button', { name: /^ETH\b/ })).toHaveCount(0);
    await heldSearch.fill('USDT');
    await expect(page.getByRole('button', { name: /^USDT\b/ }).first()).toBeVisible({ timeout: 15000 });
  });

  test('auto-start: KYC continue runs only when auto-start=true', async ({ page }) => {
    test.setTimeout(90000);
    const user = await createUser({ tag: 'app2-wp-autostart', kycLevel: 0, language: 'EN' });
    await reopenContactData(user.userDataId);

    await openApp2(page, user.jwt, '#/kyc');
    await expect(page.getByRole('heading', { name: /verification/i })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: /start verification|continue/i })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toHaveCount(0);

    await openApp2(page, user.jwt, '#/kyc', { 'auto-start': 'true' });
    const mailInput = page.locator('input[type="email"]');
    const firstName = page.locator('input[autocomplete="given-name"]');
    const form = await Promise.race([
      mailInput.waitFor({ state: 'visible', timeout: 25000 }).then(() => 'contact' as const),
      firstName.waitFor({ state: 'visible', timeout: 25000 }).then(() => 'personal' as const),
    ]).catch(() => 'none' as const);
    expect(form, 'auto-start=true must open ContactData or PersonalData without a click').not.toBe('none');
  });

  test('refcode: landing applies the code, and wallet sign-in stores usedRef', async ({ page }) => {
    test.setTimeout(90000);

    await openLoggedOut(page);
    await expect(page.getByRole('button', { name: /have an invite code/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /invite applied/i })).toHaveCount(0);

    await openLoggedOut(page, { refcode: 'ab-c12' });
    await expect(page.getByRole('button', { name: /invite applied: ab-c12/i })).toBeVisible();

    const referrer = await createUser({
      tag: 'app2-wp-ref-src',
      kycLevel: 50,
      completePersonalData: true,
      language: 'EN',
    });
    // `user.ref` is the account's own code; `user.usedRef` is the foreign code consumed at sign-up.
    // createUser leaves `ref` null, so the API lookup would never match — assign a usedRef-shaped
    // code onto the referrer and assert that column on the referred row.
    const ref = await assignReferrerCode(referrer.userId);
    const plain = await createUser({ tag: 'app2-wp-ref-none', kycLevel: 50, completePersonalData: true, language: 'EN' });
    const without = await queryOne<{ usedRef: string | null }>(`SELECT "usedRef" AS "usedRef" FROM "user" WHERE id = $1`, [
      plain.userId,
    ]);
    expect(without, 'plain factory user must exist').toBeTruthy();
    // Backend fills usedRef with its default sentinel when no partner code is sent (frontend
    // DEFAULT_REF). Do not pin the string — assert it is present and is not the code we pass later.
    expect(without?.usedRef, 'sign-up without refcode still stores the backend default usedRef').toBeTruthy();
    expect(without?.usedRef, 'sign-up without refcode must not store the partner code').not.toBe(ref);

    const referred = await unusedWallet();
    const signature = await signatureFor(referred);
    const url =
      `/app2/?address=${encodeURIComponent(referred.address)}` +
      `&signature=${encodeURIComponent(signature)}` +
      `&refcode=${encodeURIComponent(ref)}`;
    const response = await page.goto(url);
    expect(response?.ok(), `${url} status ${response?.status()}`).toBe(true);
    await expect(page.getByRole('tab', { name: /^buy$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 45000 });
    const stored = await queryOne<{ usedRef: string | null }>(
      `SELECT "usedRef" AS "usedRef" FROM "user" WHERE lower(address) = lower($1) LIMIT 1`,
      [referred.address],
    );
    expect(stored?.usedRef).toBe(ref);
  });

  test('recommendation-code: landing applies the code only when it is present', async ({ page }) => {
    await openLoggedOut(page);
    await expect(page.getByRole('button', { name: /have an invite code/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /invite applied/i })).toHaveCount(0);

    await openLoggedOut(page, { 'recommendation-code': 'AB-CDEF-GHIJ-KL' });
    await expect(page.getByRole('button', { name: /invite applied: AB-CDEF-GHIJ-KL/i })).toBeVisible();
  });

  test('external-transaction-id: paymentInfos carries the id only when the param is set', async ({ page }) => {
    test.setTimeout(120000);
    const user = await createUser({ tag: 'app2-wp-ext', kycLevel: 50, completePersonalData: true, language: 'EN' });
    const capture = attachBuyPaymentInfoRequest(page);

    await openApp2(page, user.jwt, '#/');
    await waitForBuyHome(page);
    await submitBuyForPaymentInfo(page);
    const without = capture.get();
    expect(without, 'PUT /buy/paymentInfos should have fired without the param').toBeTruthy();
    expect(without?.externalTransactionId ?? null).toBeNull();

    await openApp2(page, user.jwt, '#/', { 'external-transaction-id': 'e2e-app2-ext-1' });
    await waitForBuyHome(page);
    await submitBuyForPaymentInfo(page);
    await expect
      .poll(() => capture.get()?.externalTransactionId, {
        timeout: 45000,
        message: 'PUT /buy/paymentInfos should carry externalTransactionId=e2e-app2-ext-1',
      })
      .toBe('e2e-app2-ext-1');
  });

  test('signature: address+signature signs in, and address alone does not', async ({ page }) => {
    test.setTimeout(90000);
    const user = await createUser({ tag: 'app2-wp-sig', kycLevel: 50, completePersonalData: true, language: 'EN' });

    const without = await page.goto(`/app2/?address=${encodeURIComponent(user.address)}`);
    expect(without?.ok(), `address-only status ${without?.status()}`).toBe(true);
    await expect(page.getByRole('button', { name: /connect wallet/i })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('tab', { name: /^buy$/i })).toHaveCount(0);
    const withoutToken = await page.evaluate(() => window.localStorage.getItem('dfx.authenticationToken'));
    expect(withoutToken, 'address without signature must not store a DFX JWT').toBeNull();

    const signature = await signatureFor(user.wallet);
    const withUrl = `/app2/?address=${encodeURIComponent(user.address)}&signature=${encodeURIComponent(signature)}`;
    const withRes = await page.goto(withUrl);
    expect(withRes?.ok(), `${withUrl} status ${withRes?.status()}`).toBe(true);
    await expect(page.getByRole('tab', { name: /^buy$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 45000 });
    const token = await page.evaluate(() => window.localStorage.getItem('dfx.authenticationToken'));
    expect(token, 'address+signature must store a DFX JWT').toBeTruthy();
  });

  test('amount-in: pay field follows the param and defaults to 100 without it', async ({ page }) => {
    const user = await createUser({ tag: 'app2-wp-amtin', kycLevel: 50, completePersonalData: true, language: 'EN' });

    await openApp2(page, user.jwt, '#/');
    await waitForBuyHome(page);
    const pay = page.getByRole('textbox', { name: 'Amount you pay' });
    await expect(pay).toHaveValue('100', { timeout: 20000 });

    await openApp2(page, user.jwt, '#/', { 'amount-in': '250' });
    await waitForBuyHome(page);
    await expect(page.getByRole('textbox', { name: 'Amount you pay' })).toHaveValue('250', { timeout: 20000 });
  });

  test('blockchain: chain filter selects a JWT chain that is not the no-param default', async ({ page }) => {
    const user = await createUser({ tag: 'app2-wp-chain', kycLevel: 50, completePersonalData: true, language: 'EN' });

    // EVM signatureLogin JWTs do not include Bitcoin, so home.tsx (named, else BTC, else
    // reachable[0]) lands on the first reachable buyable asset (USDT/Ethereum in this seed).
    // That is the session default, not leftover origin storage: Playwright starts a new
    // context per test, buyAsset is React state, and credentialed openApp2 drops QUERY_PARAMS.
    await openApp2(page, user.jwt, '#/');
    await waitForBuyHome(page);
    await waitForReceiveAsset(page);
    const pill = page.getByRole('button', { name: 'Select receive asset' });
    const defaultText = (await pill.innerText()).toLowerCase();
    const contrast = ['Arbitrum', 'Polygon', 'Base', 'Optimism'];
    const chains = jwtBlockchains(user.jwt);
    const wanted = contrast.find((c) => chains.includes(c) && !defaultText.includes(c.toLowerCase()));
    if (!wanted) {
      throw new Error(
        `blockchain: no JWT chain among ${contrast.join('/')} differs from default pill ${JSON.stringify(defaultText)}; jwt=${chains.join(',')}`,
      );
    }

    await openApp2(page, user.jwt, '#/', { blockchain: wanted });
    await waitForBuyHome(page);
    await waitForReceiveAsset(page);
    await expect(page.getByRole('button', { name: 'Select receive asset' })).toContainText(new RegExp(wanted, 'i'), {
      timeout: 20000,
    });
  });

  test('bank-account: sell paymentInfos uses the named IBAN only when the param is set', async ({ page }) => {
    test.setTimeout(120000);
    const user = await createUser({ tag: 'app2-wp-ba', kycLevel: 50, completePersonalData: true, language: 'EN' });
    await createBankAccount(user.jwt, { iban: TEST_IBAN, label: 'Default' });
    const otherIban = 'CH3908704016075473007';
    await createBankAccount(user.jwt, { iban: otherIban, label: 'Other' });
    const capture = attachSellPaymentInfoRequest(page);

    await openApp2(page, user.jwt, '#/?mode=sell', { 'amount-in': '0.1' });
    await expect(page.getByRole('tab', { name: /^sell$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 20000 });
    const cta = page.getByTestId('trade-cta');
    await expect(cta).toBeEnabled({ timeout: 45000 });
    await cta.click();
    await expect
      .poll(() => capture.get()?.iban?.replace(/\s/g, ''), {
        timeout: 45000,
        message: 'PUT /sell/paymentInfos without bank-account should use the default IBAN',
      })
      .toBe(TEST_IBAN);

    await openApp2(page, user.jwt, '#/?mode=sell', { 'amount-in': '0.1', 'bank-account': otherIban });
    await expect(page.getByRole('tab', { name: /^sell$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 20000 });
    await expect(page.getByTestId('trade-cta')).toBeEnabled({ timeout: 45000 });
    await page.getByTestId('trade-cta').click();
    await expect
      .poll(() => capture.get()?.iban?.replace(/\s/g, ''), {
        timeout: 45000,
        message: `PUT /sell/paymentInfos should carry bank-account=${otherIban}`,
      })
      .toBe(otherIban);
  });

  test('personal-iban: paymentInfos carries Frick only when the param is set', async ({ page }) => {
    test.setTimeout(120000);
    const user = await createUser({ tag: 'app2-wp-piban', kycLevel: 50, completePersonalData: true, language: 'EN' });
    const capture = attachBuyPaymentInfoRequest(page);

    await openApp2(page, user.jwt, '#/');
    await waitForBuyHome(page);
    await submitBuyForPaymentInfo(page);
    const without = capture.get();
    expect(without, 'PUT /buy/paymentInfos should have fired without the param').toBeTruthy();
    expect(without?.personalIbanProvider ?? null).toBeNull();

    await openApp2(page, user.jwt, '#/', { 'personal-iban': 'frick' });
    await waitForBuyHome(page);
    const amount = page.getByRole('textbox', { name: 'Amount you pay' });
    await expect(amount).toBeVisible({ timeout: 20000 });
    await amount.fill('100');
    const cta = page.getByTestId('trade-cta');
    await expect(cta).toBeEnabled({ timeout: 45000 });
    await cta.click();
    await expect
      .poll(() => capture.get()?.personalIbanProvider, {
        timeout: 45000,
        message: 'PUT /buy/paymentInfos should carry personalIbanProvider=Frick',
      })
      .toBe('Frick');
  });

  test('balances (asset id): sell picker lists only the named id, and lists others without the param', async ({
    page,
  }) => {
    const user = await createUser({ tag: 'app2-wp-bal-id', kycLevel: 50, completePersonalData: true, language: 'EN' });
    const usdt = await queryOne<{ id: number }>(
      `SELECT id FROM asset WHERE name = 'USDT' AND blockchain = 'Ethereum' AND sellable = true ORDER BY id ASC LIMIT 1`,
    );
    expect(usdt?.id, 'seed must contain sellable Ethereum/USDT').toBeTruthy();

    await openApp2(page, user.jwt, '#/?mode=sell');
    await expect(page.getByRole('tab', { name: /^sell$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 20000 });
    await page.getByRole('button', { name: 'Select pay asset' }).click();
    const search = page.getByRole('textbox', { name: /search assets/i });
    await expect(search).toBeVisible({ timeout: 15000 });
    await search.fill('ETH');
    await expect(page.getByRole('button', { name: /^ETH\b/ }).first()).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Close' }).click();

    await openApp2(page, user.jwt, '#/?mode=sell', { balances: `5@${usdt?.id}` });
    await expect(page.getByRole('tab', { name: /^sell$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 20000 });
    await page.getByRole('button', { name: 'Select pay asset' }).click();
    const heldSearch = page.getByRole('textbox', { name: /search assets/i });
    await expect(heldSearch).toBeVisible({ timeout: 15000 });
    await heldSearch.fill('ETH');
    await expect(page.getByRole('button', { name: /^ETH\b/ })).toHaveCount(0);
    await heldSearch.fill('USDT');
    await expect(page.getByRole('button', { name: /^USDT\b/ }).first()).toBeVisible({ timeout: 15000 });
  });

  test('redirect-uri: Done navigates only when the param is a safe URI', async ({ page }) => {
    test.setTimeout(120000);
    const user = await createUser({ tag: 'app2-wp-redir', kycLevel: 50, completePersonalData: true, language: 'EN' });
    await page.route('https://example.com/**', (route) =>
      route.fulfill({ status: 200, body: 'ok', contentType: 'text/plain' }),
    );

    await openApp2(page, user.jwt, '#/');
    await waitForBuyHome(page);
    await submitBuyForPaymentInfo(page);
    await page.getByRole('button', { name: /^done$/i }).click();
    await expect(page).toHaveURL(/\/app2\//);

    await openApp2(page, user.jwt, '#/', { 'redirect-uri': 'https://example.com/done' });
    await waitForBuyHome(page);
    await submitBuyForPaymentInfo(page);
    await page.getByRole('button', { name: /^done$/i }).click();
    const confirmation = page.getByRole('dialog', { name: /leave dfx\?/i });
    await expect(confirmation).toBeVisible({ timeout: 20000 });
    await expect(confirmation.getByText('example.com', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/app2\//);
    await confirmation.getByRole('button', { name: 'Continue to host' }).click();
    await expect(page).toHaveURL(/https:\/\/example\.com\/done\/buy/, { timeout: 20000 });

    await openApp2(page, user.jwt, '#/', { 'redirect-uri': 'https://example.com/done' });
    await waitForBuyHome(page);
    await submitBuyForPaymentInfo(page);
    await page.getByRole('button', { name: /^done$/i }).click();
    const cancelledConfirmation = page.getByRole('dialog', { name: /leave dfx\?/i });
    await expect(cancelledConfirmation).toBeVisible({ timeout: 20000 });
    await cancelledConfirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(cancelledConfirmation).toHaveCount(0);
    await expect(page).toHaveURL(/\/app2\//);

    await openApp2(page, user.jwt, '#/', { 'redirect-uri': 'javascript:alert(1)' });
    await waitForBuyHome(page);
    await submitBuyForPaymentInfo(page);
    await page.getByRole('button', { name: /^done$/i }).click();
    await expect(page.getByRole('dialog', { name: /leave dfx\?/i })).toHaveCount(0);
    await expect(page).toHaveURL(/\/app2\//);
  });

  test('service: sell tab is selected only when service=sell', async ({ page }) => {
    const user = await createUser({ tag: 'app2-wp-svc', kycLevel: 50, completePersonalData: true, language: 'EN' });

    await openApp2(page, user.jwt, '#/');
    await waitForBuyHome(page);
    await expect(page.getByRole('tab', { name: /^sell$/i })).toHaveAttribute('aria-selected', 'false');

    await openApp2(page, user.jwt, '#/', { service: 'sell' });
    await expect(page.getByRole('tab', { name: /^sell$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 20000 });
  });

  test('service=connect: connect sheet opens only when the param is set', async ({ page }) => {
    await openLoggedOut(page);
    await expect(page.getByRole('button', { name: /connect wallet/i })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('dialog', { name: /connect wallet/i })).toHaveCount(0);

    await openLoggedOut(page, { service: 'connect' });
    const sheet = page.getByRole('dialog', { name: /connect wallet/i });
    await expect(sheet).toBeVisible({ timeout: 20000 });
    await expect(sheet.locator('#walletList')).toBeVisible();
  });

  test('headless: topbar is hidden only when headless=true', async ({ page }) => {
    await openLoggedOut(page);
    await expect(page.locator('#topbar')).toBeVisible({ timeout: 20000 });

    await openLoggedOut(page, { headless: 'true' });
    await expect(page.locator('#topbar')).toBeHidden({ timeout: 20000 });
  });

  test('borderless: app chrome loses its radius only when borderless=true', async ({ page }) => {
    await openLoggedOut(page);
    const framed = page.locator('#app');
    await expect(framed).toBeVisible({ timeout: 20000 });
    const withRadius = await framed.evaluate((el) => getComputedStyle(el).borderRadius);
    expect(withRadius, 'default chrome must have a radius').not.toBe('0px');

    await openLoggedOut(page, { borderless: 'true' });
    const flat = page.locator('#app');
    await expect(flat).toBeVisible({ timeout: 20000 });
    await expect.poll(async () => flat.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('0px');
  });

  test('assets: receive picker keeps only the named ticker, and lists others without the param', async ({ page }) => {
    const user = await createUser({ tag: 'app2-wp-assets', kycLevel: 50, completePersonalData: true, language: 'EN' });

    await openApp2(page, user.jwt, '#/');
    await waitForBuyHome(page);
    await waitForReceiveAsset(page);
    await page.getByRole('button', { name: 'Select receive asset' }).click();
    const search = page.getByRole('textbox', { name: /search assets/i });
    await expect(search).toBeVisible({ timeout: 15000 });
    await search.fill('USDT');
    await expect(page.getByRole('button', { name: /^USDT\b/ }).first()).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Close' }).click();

    await openApp2(page, user.jwt, '#/', { assets: 'ETH' });
    await waitForBuyHome(page);
    await waitForReceiveAsset(page);
    await expect(page.getByRole('button', { name: 'Select receive asset' })).toContainText(/ETH/i, { timeout: 20000 });
    await page.getByRole('button', { name: 'Select receive asset' }).click();
    const heldSearch = page.getByRole('textbox', { name: /search assets/i });
    await expect(heldSearch).toBeVisible({ timeout: 15000 });
    await heldSearch.fill('USDT');
    await expect(page.getByRole('button', { name: /^USDT\b/ })).toHaveCount(0);
    await heldSearch.fill('ETH');
    await expect(page.getByRole('button', { name: /^ETH\b/ }).first()).toBeVisible({ timeout: 15000 });
  });

  test('blockchains: receive chain follows the named chain, and is not that chain without it', async ({ page }) => {
    const user = await createUser({ tag: 'app2-wp-chains', kycLevel: 50, completePersonalData: true, language: 'EN' });
    const arb = await queryOne<{ name: string }>(
      `SELECT name FROM asset
       WHERE blockchain = 'Arbitrum' AND buyable = true AND category = 'Public' AND "comingSoon" = false
       ORDER BY id ASC LIMIT 1`,
    );
    expect(arb?.name, 'seed must contain a buyable Public Arbitrum asset').toBeTruthy();
    const chains = jwtBlockchains(user.jwt);
    expect(chains, 'EVM JWT must include Arbitrum so the filter has a reachable chain').toContain('Arbitrum');

    await openApp2(page, user.jwt, '#/');
    await waitForBuyHome(page);
    await waitForReceiveAsset(page);
    await expect(page.getByRole('button', { name: 'Select receive asset' })).not.toContainText(/arbitrum/i);

    await openApp2(page, user.jwt, '#/', { blockchains: 'Arbitrum' });
    await waitForBuyHome(page);
    await waitForReceiveAsset(page);
    await expect(page.getByRole('button', { name: 'Select receive asset' })).toContainText(/arbitrum/i, {
      timeout: 20000,
    });
  });

  test('wallets: connect sheet keeps only the named wallet, and lists others without the param', async ({ page }) => {
    await openLoggedOut(page, { service: 'connect' });
    const openSheet = page.getByRole('dialog', { name: /connect wallet/i });
    await expect(openSheet).toBeVisible({ timeout: 20000 });
    await expect(openSheet.getByRole('button', { name: /metamask evm/i })).toBeVisible();
    await expect(openSheet.getByRole('button', { name: /rabby/i })).toBeVisible();

    await openLoggedOut(page, { service: 'connect', wallets: 'MetaMask' });
    const filtered = page.getByRole('dialog', { name: /connect wallet/i });
    await expect(filtered).toBeVisible({ timeout: 20000 });
    await expect(filtered.getByRole('button', { name: /metamask evm/i })).toBeVisible();
    await expect(filtered.getByRole('button', { name: /rabby/i })).toHaveCount(0);
  });

  test('flags: a named private buy proceeds only when flags includes private', async ({ page }) => {
    test.setTimeout(120000);
    const publicList = await apiGet<Array<{ name: string; category?: string }>>('asset');
    expect(
      publicList.find((a) => a.name === 'EDLC' && a.category === 'Private'),
      'GET /v1/asset without includePrivate must omit Private EDLC',
    ).toBeUndefined();
    const withPrivate = await apiGet<Array<{ name: string; blockchain?: string; buyable?: boolean; category?: string }>>(
      'asset?includePrivate=true',
    );
    const edlc = withPrivate.find(
      (a) => a.name === 'EDLC' && a.blockchain === 'Ethereum' && a.buyable === true && a.category === 'Private',
    );
    expect(edlc, 'GET /v1/asset?includePrivate=true must return buyable Ethereum/EDLC').toBeTruthy();
    const user = await createUser({ tag: 'app2-wp-flags', kycLevel: 50, completePersonalData: true, language: 'EN' });
    const capture = attachBuyPaymentInfoRequest(page);
    const hint = /does not offer to buy or sell this token/i;

    await openApp2(page, user.jwt, '#/', { 'asset-out': 'EDLC' });
    await waitForBuyHome(page);
    await expect(page.getByRole('button', { name: 'Select receive asset' })).toContainText(/EDLC/i, { timeout: 20000 });
    await expect(page.getByText(hint)).toBeVisible({ timeout: 20000 });
    const blocked = page.getByTestId('trade-cta');
    await expect(blocked).toBeEnabled({ timeout: 45000 });
    await blocked.click();
    await expect(page.getByText('IBAN', { exact: true })).toHaveCount(0);
    expect(capture.get(), 'PUT /buy/paymentInfos must not fire without flags=private').toBeUndefined();

    await openApp2(page, user.jwt, '#/', { 'asset-out': 'EDLC', flags: 'private' });
    await waitForBuyHome(page);
    await expect(page.getByRole('button', { name: 'Select receive asset' })).toContainText(/EDLC/i, { timeout: 20000 });
    await expect(page.getByText(hint)).toHaveCount(0);
    await submitBuyForPaymentInfo(page);
    expect(capture.get(), 'PUT /buy/paymentInfos should have fired with flags=private').toBeTruthy();
  });

  test('pubkey: auth request carries key only when the param is set', async ({ page }) => {
    test.setTimeout(90000);
    const capture = attachAuthRequest(page);

    const withoutWallet = await unusedWallet();
    const withoutSig = await signatureFor(withoutWallet);
    const withoutUrl =
      `/app2/?address=${encodeURIComponent(withoutWallet.address)}` +
      `&signature=${encodeURIComponent(withoutSig)}`;
    const withoutRes = await page.goto(withoutUrl);
    expect(withoutRes?.ok(), `${withoutUrl} status ${withoutRes?.status()}`).toBe(true);
    await expect(page.getByRole('tab', { name: /^buy$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 45000 });
    const withoutBody = capture.get();
    expect(withoutBody, 'POST /v1/auth should have fired without pubkey').toBeTruthy();
    expect(withoutBody?.key ?? null, 'auth body must omit key when pubkey is absent').toBeNull();

    const withWallet = await unusedWallet();
    const withSig = await signatureFor(withWallet);
    const withUrl =
      `/app2/?address=${encodeURIComponent(withWallet.address)}` +
      `&signature=${encodeURIComponent(withSig)}` +
      `&pubkey=${encodeURIComponent('e2e-pubkey-1')}`;
    const withRes = await page.goto(withUrl);
    expect(withRes?.ok(), `${withUrl} status ${withRes?.status()}`).toBe(true);
    await expect
      .poll(() => capture.get()?.key, {
        timeout: 45000,
        message: 'POST /v1/auth should carry key=e2e-pubkey-1',
      })
      .toBe('e2e-pubkey-1');
  });

  test('organization-*: PersonalData prefills the address only when organization-name is set', async ({ page }) => {
    test.setTimeout(90000);
    const user = await createUser({ tag: 'app2-wp-org', kycLevel: 0, language: 'EN' });

    await openOrganizationForm(page, user.jwt);
    await expect(page.getByRole('textbox', { name: /^organization name$/i })).toHaveValue('');
    await expect(page.getByRole('textbox', { name: /organization address street/i })).toHaveValue('');
    await expect(page.getByRole('combobox', { name: /organization address country/i }).locator('option:checked')).toHaveText(
      /switzerland|schweiz/i,
    );

    await openOrganizationForm(page, user.jwt, {
      'organization-name': 'DFX AG',
      'organization-street': 'Bahnhof',
      'organization-house-number': '12',
      'organization-zip': '8001',
      'organization-city': 'Zurich',
      'organization-country': 'DE',
    });
    await expect(page.getByRole('textbox', { name: /^organization name$/i })).toHaveValue('DFX AG');
    await expect(page.getByRole('textbox', { name: /organization address street/i })).toHaveValue('Bahnhof');
    await expect(page.getByRole('textbox', { name: /organization address no/i })).toHaveValue('12');
    await expect(page.getByRole('textbox', { name: /organization address zip/i })).toHaveValue('8001');
    await expect(page.getByRole('textbox', { name: /organization address city/i })).toHaveValue('Zurich');
    await expect(page.getByRole('combobox', { name: /organization address country/i }).locator('option:checked')).toHaveText(
      /germany|deutschland/i,
    );
  });

  test('organization-name absent: other organization address params are ignored', async ({ page }) => {
    test.setTimeout(90000);
    const user = await createUser({ tag: 'app2-wp-org-noname', kycLevel: 0, language: 'EN' });

    await openOrganizationForm(page, user.jwt, {
      'organization-street': 'Secret',
      'organization-house-number': '9',
      'organization-zip': '0000',
      'organization-city': 'Nowhere',
      'organization-country': 'DE',
    });
    await expect(page.getByRole('textbox', { name: /^organization name$/i })).toHaveValue('');
    await expect(page.getByRole('textbox', { name: /organization address street/i })).toHaveValue('');
    await expect(page.getByRole('textbox', { name: /organization address no/i })).toHaveValue('');
    await expect(page.getByRole('textbox', { name: /organization address zip/i })).toHaveValue('');
    await expect(page.getByRole('textbox', { name: /organization address city/i })).toHaveValue('');
    await expect(page.getByRole('combobox', { name: /organization address country/i }).locator('option:checked')).not.toHaveText(
      /germany|deutschland/i,
    );
  });

  test('organization-country: unknown value leaves the country empty', async ({ page }) => {
    test.setTimeout(90000);
    const user = await createUser({ tag: 'app2-wp-org-atlantis', kycLevel: 0, language: 'EN' });

    await openOrganizationForm(page, user.jwt, {
      'organization-name': 'DFX',
      'organization-country': 'Atlantis',
    });
    await expect(page.getByRole('textbox', { name: /^organization name$/i })).toHaveValue('DFX');
    await expect(page.getByRole('combobox', { name: /organization address country/i })).toHaveValue('');
  });
});
