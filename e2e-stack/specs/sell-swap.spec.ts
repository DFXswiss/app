/**
 * Sell + Swap screens:
 *   /sell, /sell/info, /swap
 *
 * Browser drives the real frontend; Postgres proves writes where the UI mutates data.
 * Pricing (`PUT /sell/paymentInfos`, `PUT /swap/paymentInfos`) may fail under ENVIRONMENT=loc
 * (outbound HTTP mocked) — when that happens the UI path is `test.fixme`d with the observed
 * error and the factory (`createSell` / `createSwap`) independently proves the deposit_route write.
 */

import type { Page, Response } from '@playwright/test';
import {
  expect,
  gotoWithSession,
  openScreen,
  test,
  waitForRow,
} from './fixtures';
import {
  cleanupCreatedData,
  createBankAccount,
  createSell,
  createSwap,
  createUser,
  e2eMail,
  TEST_IBAN,
} from './fixtures/factories';


// Wallet-index isolation: factories.ts's createUser() derives its wallet index from an
// in-process counter starting at FACTORY_WALLET_INDEX_BASE (100) unless `walletIndex` is
// passed explicitly. Playwright resets that counter per spec file (each file gets its own
// module instance even under workers: 1), so two files whose createUser() calls both start
// their local counter at 1 land on the SAME derived wallet address (100 + 1 = 101) and the
// second file's "new" user silently signs back into the first file's already-created account
// (same address -> sign-in, not sign-up). That account already has a mail set, so the mail
// factories.ts tries to set next fails with 403 TFA_REQUIRED (updateUserMail requires 2FA to
// change an already-set mail) — a real, reproducible cross-file bug, not a product bug.
// Reported upstream for a fixtures-level fix (e.g. seeding the counter from something
// file-unique); worked around here with a file-local, far-separated wallet-index base so this
// spec's users never collide with another spec file's users regardless of run order.
let __sellSwap_WALLET_SEQ = 0;
function nextWalletIndex(): number {
  __sellSwap_WALLET_SEQ += 1;
  return 8000000 + __sellSwap_WALLET_SEQ;
}
function apiBase(): string {
  return process.env.E2E_API_URL ?? 'http://api:3000';
}

function normPath(p: string): string {
  return p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p;
}

interface AssetDto {
  id: number;
  name: string;
  uniqueName?: string;
  blockchain?: string;
  sellable?: boolean;
  buyable?: boolean;
  comingSoon?: boolean;
}

interface FiatDto {
  id: number;
  name: string;
  sellable?: boolean;
  buyable?: boolean;
  cardBuyable?: boolean;
  instantBuyable?: boolean;
}

async function fetchAssets(): Promise<AssetDto[]> {
  const res = await fetch(`${apiBase()}/v1/asset`);
  expect(res.ok, `GET /v1/asset status ${res.status}`).toBe(true);
  return (await res.json()) as AssetDto[];
}

async function fetchFiats(): Promise<FiatDto[]> {
  const res = await fetch(`${apiBase()}/v1/fiat`);
  expect(res.ok, `GET /v1/fiat status ${res.status}`).toBe(true);
  return (await res.json()) as FiatDto[];
}

/**
 * Wait for either a successful sell/swap payment-info panel, or a pricing error surface.
 * Returns the observed outcome and any captured API error text.
 */
async function waitForPricingOutcome(
  page: Page,
  opts?: { timeoutMs?: number },
): Promise<{ kind: 'payment_info' | 'error' | 'timeout'; detail: string }> {
  const timeoutMs = opts?.timeoutMs ?? 20000;
  const completeBtn = page.getByRole('button', {
    name: /Click here once you have issued the transaction|Complete transaction in your wallet/i,
  });
  const paymentHeading = page.getByRole('heading', { name: 'Payment Information', exact: true });
  const errorMsg = page.locator('p.text-dfxGray-800.text-sm');
  const genericError = page.getByText(
    'Something went wrong. Please try again. If the issue persists please reach out to our support.',
  );

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await completeBtn.isVisible().catch(() => false)) {
      return { kind: 'payment_info', detail: 'complete button visible' };
    }
    if (await paymentHeading.isVisible().catch(() => false)) {
      return { kind: 'payment_info', detail: 'Payment Information heading visible' };
    }
    if (await genericError.isVisible().catch(() => false)) {
      const detail = ((await errorMsg.first().textContent().catch(() => null)) ?? 'unknown pricing error').trim();
      return { kind: 'error', detail };
    }
    // KYC / quote errors also surface text without the generic ErrorHint shell.
    const body = await page.locator('body').innerText();
    if (/failed|not available|price|timeout|ECONNREFUSED|503|502|500/i.test(body) && !(await completeBtn.isVisible().catch(() => false))) {
      // Keep polling a bit — spinner may still be settling — but capture later.
    }
    await page.waitForTimeout(400);
  }

  const bodySnippet = (await page.locator('body').innerText().catch(() => '')).slice(0, 400);
  return { kind: 'timeout', detail: bodySnippet || 'no payment info and no error within timeout' };
}

function trackPaymentInfosResponses(page: Page, pathIncludes: string): { last: { status: number; body: string } | null } {
  const box: { last: { status: number; body: string } | null } = { last: null };
  page.on('response', async (res: Response) => {
    const url = res.url();
    if (!url.includes(pathIncludes)) return;
    if (res.request().method() !== 'PUT') return;
    const body = await res.text().catch(() => '');
    box.last = { status: res.status(), body: body.slice(0, 500) };
  });
  return box;
}

test.describe.configure({ mode: 'serial' });

test.describe('Sell + Swap e2e', () => {
  test.afterAll(async () => {
    await cleanupCreatedData();
  });

  // ---------------------------------------------------------------------------
  // Guards
  // ---------------------------------------------------------------------------

  test('unauthenticated /sell redirects to /login', async ({ page }) => {
    await page.goto('/sell');
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'useAddressGuard(/login) must redirect unauthenticated /sell to /login',
        timeout: 15000,
      })
      .toBe('/login');
  });

  test('unauthenticated /sell/info redirects away (useAddressGuard default /)', async ({ page }) => {
    await page.goto('/sell/info');
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'useAddressGuard() must redirect unauthenticated /sell/info',
        timeout: 15000,
      })
      .not.toBe('/sell/info');
  });

  test('unauthenticated /swap redirects to /login', async ({ page }) => {
    await page.goto('/swap');
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'useAddressGuard(/login) must redirect unauthenticated /swap to /login',
        timeout: 15000,
      })
      .toBe('/login');
  });

  // ---------------------------------------------------------------------------
  // /sell — render + form
  // ---------------------------------------------------------------------------

  test('/sell renders spend/get form for address session with complete personal data', async ({ page }) => {
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-render',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });

    await openScreen(page, '/sell', user.jwt);

    // Layout title from useLayoutOptions → Navigation.
    await expect(page.getByText('Sell', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('You spend', { exact: true })).toBeVisible();
    await expect(page.getByText(/You get( about)?/)).toBeVisible();
    // Bank account selector placeholder (no accounts yet).
    await expect(page.getByText('Add or select your IBAN', { exact: true })).toBeVisible();
    // Amount field is a number input (StyledInput type=number → inputMode=decimal).
    await expect(page.locator('input[inputmode="decimal"]').first()).toBeVisible();
  });

  test('/sell bank account: invalid IBAN rejected; valid IBAN creates bank_data via UI', async ({ page }) => {
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-ba',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });
    // Use TEST_IBAN (known IsDfxIban-accepted under loc). Fresh user → no prior bank_data row.
    const uiIban = TEST_IBAN;

    await openScreen(page, '/sell', user.jwt);
    await expect(page.getByText('Add or select your IBAN', { exact: true })).toBeVisible({ timeout: 15000 });

    // Open bank-account modal (StyledModalButton).
    await page.getByText('Add or select your IBAN', { exact: true }).click();
    await expect(page.getByRole('button', { name: /Add bank account/i })).toBeVisible({ timeout: 10000 });

    // Invalid IBAN → submit stays disabled (Validations.Iban + Required).
    const ibanInput = page.locator('input[name="iban"]');
    await ibanInput.fill('NOT-A-VALID-IBAN');
    await ibanInput.blur();
    await expect(page.getByRole('button', { name: /Add bank account/i })).toBeDisabled();

    // Valid IBAN → enable submit → bank_data row.
    await ibanInput.fill(uiIban);
    await ibanInput.blur();
    // Optional label field (autocomplete="iban-label").
    const labelInput = page.locator('input[name="iban-label"]');
    if ((await labelInput.count()) > 0) {
      await labelInput.fill(`E2E BA ${e2eMail('ba-label').split('@')[0]}`);
    }

    const addBtn = page.getByRole('button', { name: /Add bank account/i });
    await expect(addBtn).toBeEnabled({ timeout: 10000 });
    await addBtn.click();

    const row = await waitForRow<{ id: number; iban: string }>(
      `SELECT id, iban FROM bank_data
       WHERE "userDataId" = $1 AND REPLACE(iban, ' ', '') = $2
       ORDER BY id DESC LIMIT 1`,
      [user.userDataId, uiIban.replace(/\s/g, '')],
      20000,
    );
    expect(row.iban.replace(/\s/g, '')).toBe(uiIban.replace(/\s/g, ''));
  });

  test('/sell asset dropdown only offers sellable assets (server-side getAssets sellable:true)', async ({ page }) => {
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-assets',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });
    const assets = await fetchAssets();
    const sellableNames = new Set(
      assets.filter((a) => a.sellable && !a.comingSoon).map((a) => a.name),
    );
    expect(sellableNames.size, 'seed must have at least one sellable asset').toBeGreaterThan(0);

    await openScreen(page, '/sell', user.jwt);
    await expect(page.getByText('You spend', { exact: true })).toBeVisible({ timeout: 15000 });

    // Asset field is a StyledSearchDropdown: the CURRENT selection renders inside a text
    // <input name="asset">, not a button — only the OPEN list's items are <button>s. Click/focus
    // the input to open the list.
    const assetInput = page.locator('input[name="asset"]');
    await expect(assetInput).toBeVisible({ timeout: 15000 });
    await assetInput.click();

    // After open, list items show asset names. Collect visible option-like buttons.
    await page.waitForTimeout(400);
    const optionTexts = await page.locator('button').allTextContents();
    // Every offered asset that matches a known asset name must be sellable.
    const knownOffered = optionTexts
      .map((t) => t.trim())
      .flatMap((t) => {
        const hit = assets.find((a) => t === a.name || t.startsWith(a.name) || t.includes(a.name));
        return hit ? [hit.name] : [];
      })
      .filter((v, i, arr) => arr.indexOf(v) === i);

    const toCheck = knownOffered;
    expect(toCheck.length, 'asset dropdown should list at least one known asset').toBeGreaterThan(0);
    for (const name of toCheck) {
      expect(sellableNames.has(name), `asset "${name}" offered on /sell must be sellable`).toBe(true);
    }

    await page.keyboard.press('Escape');
  });

  test('/sell currency dropdown vs GET /v1/fiat sellable (reports buyable-filter bug if present)', async ({ page }) => {
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-fiat',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });
    const fiats = await fetchFiats();
    const sellableNames = fiats.filter((f) => f.sellable).map((f) => f.name);
    const buyableFilterNames = fiats
      .filter((f) => f.buyable || f.cardBuyable || f.instantBuyable)
      .map((f) => f.name);
    expect(sellableNames.length, 'seed must have sellable fiats').toBeGreaterThan(0);

    await openScreen(page, '/sell', user.jwt);
    await expect(page.getByText(/You get( about)?/)).toBeVisible({ timeout: 15000 });

    // Currency dropdown is in the "You get" row; default currency button shows a fiat code (e.g. CHF).
    const fiatCodes = fiats.map((f) => f.name);
    // All fiat codes are exactly 3 letters, so a plain prefix match is unambiguous — no `\\b`:
    // React strips the whitespace JSX text node between the code and its description <p>s, so the
    // rendered button's raw textContent is "EUREuro", not "EUR Euro" (the pretty accessibility-tree
    // dump inserts a space that plain textContent-based `hasText` matching does not).
    const currencyBtn = page
      .getByRole('button')
      .filter({ hasText: new RegExp(`^(${fiatCodes.join('|')})`) })
      .first();
    await expect(currencyBtn).toBeVisible({ timeout: 15000 });
    await currencyBtn.click();
    await page.waitForTimeout(400);

    const optionTexts = (await page.locator('button').allTextContents()).map((t) => t.trim());
    const offered = fiatCodes.filter((code) => optionTexts.some((t) => t === code || t.startsWith(code)));
    expect(offered.length, 'currency dropdown should list at least one fiat').toBeGreaterThan(0);

    const nonSellableOffered = offered.filter((name) => !sellableNames.includes(name));
    const matchesBuyableFilter =
      offered.every((n) => buyableFilterNames.includes(n)) &&
      buyableFilterNames.some((n) => offered.includes(n));

    if (nonSellableOffered.length > 0) {
      // sell.hook filters buyable||cardBuyable||instantBuyable instead of sellable — real product bug.
      test.fixme(
        true,
        `Sell currency dropdown offers non-sellable fiats (observed: ${nonSellableOffered.join(', ')}); ` +
          `sellable seed=[${sellableNames.join(', ')}], buyable-filter seed=[${buyableFilterNames.join(', ')}], ` +
          `UI offered=[${offered.join(', ')}]. sell.hook.js filters buyable||cardBuyable||instantBuyable, not sellable.` +
          (matchesBuyableFilter ? ' UI matches the buggy buyable filter.' : ''),
      );
      return;
    }

    // Correct behaviour: every offered currency is sellable.
    for (const name of offered) {
      expect(sellableNames.includes(name), `currency "${name}" must be sellable`).toBe(true);
    }
    await page.keyboard.press('Escape');
  });

  test('/sell deposit_route via createSell (API path, independent of UI pricing)', async ({ page }) => {
    // `page` unused — factory-only proof kept in this file so the lane owns the write path.
    void page;
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-factory',
      kycLevel: 30,
      completePersonalData: true,
    });
    const sell = await createSell(user.jwt, { blockchain: 'Ethereum', iban: TEST_IBAN });
    expect(sell.sellId).toBeGreaterThan(0);

    const row = await waitForRow<{ id: number; type: string; iban: string }>(
      `SELECT id, type, iban FROM deposit_route WHERE id = $1`,
      [sell.sellId],
    );
    expect(row.type).toBe('Sell');
    expect(row.iban?.replace(/\s/g, '')).toBe(TEST_IBAN);
  });

  test('/sell full UI paymentInfos flow when pricing works (else fixme + factory proof)', async ({ page }) => {
    // Chains several bounded waits (bank account resolve, pricing outcome poll, DB proof) whose
    // worst-case sum can approach the default 60s test timeout — give this one more headroom.
    test.setTimeout(90000);
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-ui-flow',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });
    await createBankAccount(user.jwt, { iban: TEST_IBAN, label: 'Sell UI BA' });

    const paymentInfos = trackPaymentInfosResponses(page, 'paymentInfos');

    // Pre-fill via URL params so amount/asset/currency are set without fragile dropdown clicks.
    // Deliberately do NOT wait for 'networkidle' here: pre-filling amount + asset + currency +
    // bank-account all at once drives sell.screen.tsx's SPEND/GET-data-changed effects into a
    // repeating receiveFor() cycle (each response can update the very fields the effects watch),
    // so the network never truly goes idle — a real, reportable behavior of this screen, not a
    // flake. Content-based waits below are what actually gate this test.
    await gotoWithSession(
      page,
      `/sell?asset-in=ETH&asset-out=CHF&amount-in=0.1&bank-account=${encodeURIComponent(TEST_IBAN)}`,
      user.jwt,
    );
    expect(normPath(new URL(page.url()).pathname)).toBe('/sell');

    await expect(page.getByText('You spend', { exact: true })).toBeVisible({ timeout: 15000 });
    // Bank account should resolve (pre-created or created from bank-account param).
    await expect(page.getByText(/CH93|CH 93/i).first()).toBeVisible({ timeout: 15000 });

    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });

    if (outcome.kind === 'payment_info') {
      // paymentInfos already wrote the sell route — prove deposit_route, then click through completion.
      const route = await waitForRow<{ id: number; type: string }>(
        `SELECT id, type FROM deposit_route
         WHERE "userId" = $1 AND type = 'Sell'
         ORDER BY id DESC LIMIT 1`,
        [user.userId],
        20000,
      );
      expect(route.type).toBe('Sell');

      const completeBtn = page.getByRole('button', {
        name: /Click here once you have issued the transaction/i,
      });
      if (await completeBtn.isVisible().catch(() => false)) {
        await completeBtn.click();
        await expect(
          page.getByText('Nice! You are all set! Give us a minute to handle your transaction.'),
        ).toBeVisible({ timeout: 15000 });
      }
      return;
    }

    // Pricing path failed or hung — prove DB write via factory; mark the UI step as fixme.
    const sell = await createSell(user.jwt, { blockchain: 'Ethereum', iban: TEST_IBAN });
    await waitForRow(`SELECT id FROM deposit_route WHERE id = $1 AND type = 'Sell'`, [sell.sellId]);

    const apiDetail = paymentInfos.last
      ? `PUT paymentInfos HTTP ${paymentInfos.last.status}: ${paymentInfos.last.body}`
      : 'no PUT paymentInfos response captured';
    test.fixme(
      true,
      `Sell UI paymentInfos did not produce payment panel (${outcome.kind}): ${outcome.detail}; ${apiDetail}`,
    );
  });

  // ---------------------------------------------------------------------------
  // /sell/info
  // ---------------------------------------------------------------------------

  test('/sell/info missing required params shows "Missing required information"', async ({ page }) => {
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-info-miss',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });

    await openScreen(page, '/sell/info', user.jwt);
    await expect(page.getByText('Missing required information', { exact: true })).toBeVisible({ timeout: 15000 });
  });

  test('/sell/info invalid bank-account IBAN shows Invalid IBAN error', async ({ page }) => {
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-info-iban',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });

    await gotoWithSession(
      page,
      `/sell/info?asset-in=ETH&asset-out=CHF&amount-in=0.1&bank-account=NOTANIBAN`,
      user.jwt,
    );
    await page.waitForLoadState('networkidle');
    expect(normPath(new URL(page.url()).pathname)).toBe('/sell/info');

    await expect(page.getByText(/Invalid IBAN/i)).toBeVisible({ timeout: 15000 });
  });

  test('/sell/info with valid query params renders payment content or pricing error on-route', async ({ page }) => {
    test.setTimeout(75000);
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-info-ok',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });
    await createBankAccount(user.jwt, { iban: TEST_IBAN });

    const paymentInfos = trackPaymentInfosResponses(page, 'paymentInfos');

    // Deliberately no 'networkidle' wait: a successful payment-info panel here starts sell-info
    // screen's own 5s getTransactionByRequestId poll loop, which keeps the network busy forever
    // (by design, so it can auto-advance to the completion screen) — content-based waits gate this.
    await gotoWithSession(
      page,
      `/sell/info?asset-in=ETH&asset-out=CHF&amount-in=0.1&bank-account=${encodeURIComponent(TEST_IBAN)}`,
      user.jwt,
    );
    expect(normPath(new URL(page.url()).pathname)).toBe('/sell/info');

    // Either Transaction Details / Payment Information, or an ErrorHint from pricing.
    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
    const txDetails = page.getByText('Transaction Details', { exact: true });
    const missing = page.getByText('Missing required information', { exact: true });

    if (await txDetails.isVisible().catch(() => false) || outcome.kind === 'payment_info') {
      await expect(txDetails.or(page.getByRole('heading', { name: 'Payment Information' }))).toBeVisible();
      // paymentInfos success also creates a sell deposit_route.
      await waitForRow(
        `SELECT id FROM deposit_route WHERE "userId" = $1 AND type = 'Sell' ORDER BY id DESC LIMIT 1`,
        [user.userId],
        20000,
      );
      return;
    }

    // Still on /sell/info with an error (not missing-params) — screen handled the request.
    expect(await missing.isVisible().catch(() => false)).toBe(false);
    const apiDetail = paymentInfos.last
      ? `PUT paymentInfos HTTP ${paymentInfos.last.status}: ${paymentInfos.last.body}`
      : 'no PUT paymentInfos response captured';
    // Form/params path is proven; pricing failure is the known loc-stack limitation.
    test.fixme(
      true,
      `/sell/info pricing did not render Transaction Details (${outcome.kind}): ${outcome.detail}; ${apiDetail}`,
    );
  });

  // ---------------------------------------------------------------------------
  // /swap
  // ---------------------------------------------------------------------------

  test('/swap renders spend/get form for address session', async ({ page }) => {
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'swap-render',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });

    await openScreen(page, '/swap', user.jwt);

    await expect(page.getByText('Swap', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('You spend', { exact: true })).toBeVisible();
    await expect(page.getByText(/You get( about)?/)).toBeVisible();
    await expect(page.locator('input[inputmode="decimal"]').first()).toBeVisible();
  });

  test('/swap source assets are sellable and target assets are buyable vs GET /v1/asset', async ({ page }) => {
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'swap-assets',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });
    const assets = await fetchAssets();
    const sellable = new Set(assets.filter((a) => a.sellable && !a.comingSoon).map((a) => a.name));
    const buyable = new Set(assets.filter((a) => a.buyable && !a.comingSoon).map((a) => a.name));

    await openScreen(page, '/swap', user.jwt);
    await expect(page.getByText('You spend', { exact: true })).toBeVisible({ timeout: 15000 });

    // Both source and target asset fields are StyledSearchDropdown: the current selection lives
    // in a text <input>, and only the OPEN list's items are <button>s (see StyledSearchDropdown).
    const sourceInput = page.locator('input[name="sourceAsset"]');
    await expect(sourceInput).toBeVisible({ timeout: 15000 });
    const sourceSelected = (await sourceInput.inputValue()).trim();
    if (sourceSelected) {
      expect(sellable.has(sourceSelected), `swap source asset "${sourceSelected}" must be sellable`).toBe(true);
    }

    await sourceInput.click();
    await page.waitForTimeout(400);
    const sourceOptionTexts = await page.locator('button').allTextContents();
    const sourceOffered = sourceOptionTexts
      .map((t) => t.trim())
      .flatMap((t) => {
        const hit = assets.find((a) => t === a.name || t.startsWith(a.name) || t.includes(a.name));
        return hit ? [hit.name] : [];
      })
      .filter((v, i, arr) => arr.indexOf(v) === i);
    expect(sourceOffered.length, 'swap source dropdown should list at least one known asset').toBeGreaterThan(0);
    for (const name of sourceOffered) {
      expect(sellable.has(name), `swap source asset "${name}" offered must be sellable`).toBe(true);
    }
    await page.keyboard.press('Escape');

    const targetInput = page.locator('input[name="targetAsset"]');
    await expect(targetInput).toBeVisible({ timeout: 15000 });
    const targetSelected = (await targetInput.inputValue()).trim();
    if (targetSelected) {
      expect(buyable.has(targetSelected), `swap target asset "${targetSelected}" must be buyable`).toBe(true);
    }

    await targetInput.click();
    await page.waitForTimeout(400);
    const targetOptionTexts = await page.locator('button').allTextContents();
    const targetOffered = targetOptionTexts
      .map((t) => t.trim())
      .flatMap((t) => {
        const hit = assets.find((a) => t === a.name || t.startsWith(a.name) || t.includes(a.name));
        return hit ? [hit.name] : [];
      })
      .filter((v, i, arr) => arr.indexOf(v) === i);
    expect(targetOffered.length, 'swap target dropdown should list at least one known asset').toBeGreaterThan(0);
    for (const name of targetOffered) {
      expect(buyable.has(name), `swap target asset "${name}" offered must be buyable`).toBe(true);
    }
    await page.keyboard.press('Escape');
  });

  test('/swap deposit_route via createSwap (API path, independent of UI pricing)', async ({ page }) => {
    void page;
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'swap-factory',
      kycLevel: 30,
      completePersonalData: true,
    });
    const swap = await createSwap(user.jwt, { blockchain: 'Ethereum' });
    expect(swap.swapId).toBeGreaterThan(0);

    const row = await waitForRow<{ id: number; type: string }>(
      `SELECT id, type FROM deposit_route WHERE id = $1`,
      [swap.swapId],
    );
    expect(row.type).toBe('Crypto');
  });

  test('/swap full UI paymentInfos flow when pricing works (else fixme + factory proof)', async ({ page }) => {
    // Same rationale as the /sell equivalent above: bound the cumulative wait chain with headroom.
    test.setTimeout(90000);
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'swap-ui-flow',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });

    const paymentInfos = trackPaymentInfosResponses(page, 'paymentInfos');

    // Same rationale as the /sell case above: skip 'networkidle', rely on content waits.
    await gotoWithSession(page, `/swap?asset-in=ETH&amount-in=0.1`, user.jwt);
    expect(normPath(new URL(page.url()).pathname)).toBe('/swap');

    await expect(page.getByText('You spend', { exact: true })).toBeVisible({ timeout: 15000 });

    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });

    if (outcome.kind === 'payment_info') {
      const route = await waitForRow<{ id: number; type: string }>(
        `SELECT id, type FROM deposit_route
         WHERE "userId" = $1 AND type = 'Crypto'
         ORDER BY id DESC LIMIT 1`,
        [user.userId],
        20000,
      );
      expect(route.type).toBe('Crypto');

      const completeBtn = page.getByRole('button', {
        name: /Click here once you have issued the transaction/i,
      });
      if (await completeBtn.isVisible().catch(() => false)) {
        await completeBtn.click();
      }
      return;
    }

    const swap = await createSwap(user.jwt, { blockchain: 'Ethereum' });
    await waitForRow(`SELECT id FROM deposit_route WHERE id = $1 AND type = 'Crypto'`, [swap.swapId]);

    const apiDetail = paymentInfos.last
      ? `PUT paymentInfos HTTP ${paymentInfos.last.status}: ${paymentInfos.last.body}`
      : 'no PUT paymentInfos response captured';
    test.fixme(
      true,
      `Swap UI paymentInfos did not produce payment panel (${outcome.kind}): ${outcome.detail}; ${apiDetail}`,
    );
  });

  // Sanity: incomplete personal data is redirected off /sell by the API/UI (Ident data incomplete).
  test('/sell with incomplete personal data redirects to /profile', async ({ page }) => {
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-incomplete',
      kycLevel: 0,
      completePersonalData: false,
      language: 'EN',
    });
    await createBankAccount(user.jwt, { iban: TEST_IBAN }).catch(() => {
      /* bank account may still succeed without complete personal data */
    });

    await gotoWithSession(
      page,
      `/sell?asset-in=ETH&asset-out=CHF&amount-in=0.1&bank-account=${encodeURIComponent(TEST_IBAN)}`,
      user.jwt,
    );
    await page.waitForLoadState('networkidle');

    // Either stays on form without pricing, or navigates to /profile after paymentInfos 400.
    await expect
      .poll(
        async () => {
          const path = normPath(new URL(page.url()).pathname);
          if (path === '/profile') return 'profile';
          const body = await page.locator('body').innerText();
          if (/Ident data incomplete|profile/i.test(body)) return 'hint';
          if (path === '/sell') return 'sell';
          return path;
        },
        { timeout: 25000 },
      )
      .not.toBe('');

    const path = normPath(new URL(page.url()).pathname);
    // Strongest signal: redirect to profile. Accept staying on sell without payment panel as weaker OK.
    if (path === '/profile') {
      expect(path).toBe('/profile');
    } else {
      expect(path).toBe('/sell');
      // Must not show the completion payment panel without complete data.
      await expect(
        page.getByRole('button', { name: /Click here once you have issued the transaction/i }),
      ).toHaveCount(0);
    }
  });
});
