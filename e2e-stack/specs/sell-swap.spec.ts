/**
 * Sell + Swap screens:
 *   /sell, /sell/info, /swap
 *
 * Browser drives the real frontend; Postgres proves writes where the UI mutates data.
 * UI flows that depend on pricing (`PUT /sell/paymentInfos`, `PUT /swap/paymentInfos`) are split
 * into two tests each — the deposit_route write and the payment panel — and both assert hard.
 * Neither is skipped: pricing does work here, once the URL leaves out the bank-account parameter
 * that sends the sell screen into an endless create-bank-account loop (its own test below).
 * Factory-only tests (`createSell` / `createSwap`) remain as independent API-path proofs.
 */

import type { Page, Response } from '@playwright/test';
import { expect, gotoWithSession, openScreen, test, waitForRow } from './fixtures';
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
// That has since been fixed in factories.ts: wallet offsets now come from their own counter,
// seeded from the database, so a fresh process continues above what is already there instead of
// restarting at 1. The file-local base below is kept anyway — it costs nothing, it keeps this
// suite's accounts recognisable in the database, and it does not depend on the shared counter
// being right. Remove it if you ever want the suites to share one allocation scheme.
let __sellSwap_WALLET_SEQ = 0;
function nextWalletIndex(): number {
  __sellSwap_WALLET_SEQ += 1;
  return 8000000 + __sellSwap_WALLET_SEQ;
}

/**
 * The shared e2e stack seeds a large but finite pool of EVM deposit addresses (global.setup.ts,
 * DEPOSIT_ADDRESS_POOL_SIZE) shared by every blockchain and every spec file in a run. If that pool
 * is ever exhausted, surface it as a clear, actionable test failure -- not a silent skip -- so a
 * too-small pool breaks the run loudly instead of quietly degrading coverage. Any other failure
 * (auth, 500, schema change, ...) is rethrown unchanged.
 */
async function safeCreateSell(
  jwt: string,
  opts: Parameters<typeof createSell>[1],
): Promise<Awaited<ReturnType<typeof createSell>>> {
  try {
    return await createSell(jwt, opts);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('No unused deposit address')) {
      throw new Error(
        `createSell: shared EVM deposit pool exhausted (${message}). Increase ` +
          `DEPOSIT_ADDRESS_POOL_SIZE in e2e-stack/specs/global.setup.ts -- the current pool is too ` +
          `small for this suite.`,
      );
    }
    throw e;
  }
}

async function safeCreateSwap(
  jwt: string,
  opts: Parameters<typeof createSwap>[1],
): Promise<Awaited<ReturnType<typeof createSwap>>> {
  try {
    return await createSwap(jwt, opts);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('No unused deposit address')) {
      throw new Error(
        `createSwap: shared EVM deposit pool exhausted (${message}). Increase ` +
          `DEPOSIT_ADDRESS_POOL_SIZE in e2e-stack/specs/global.setup.ts -- the current pool is too ` +
          `small for this suite.`,
      );
    }
    throw e;
  }
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
      const detail = (
        (await errorMsg
          .first()
          .textContent()
          .catch(() => null)) ?? 'unknown pricing error'
      ).trim();
      return { kind: 'error', detail };
    }
    // KYC / quote errors also surface text without the generic ErrorHint shell.
    const body = await page.locator('body').innerText();
    if (
      /failed|not available|price|timeout|ECONNREFUSED|503|502|500/i.test(body) &&
      !(await completeBtn.isVisible().catch(() => false))
    ) {
      // Keep polling a bit — spinner may still be settling — but capture later.
    }
    await page.waitForTimeout(400);
  }

  const bodySnippet = (
    await page
      .locator('body')
      .innerText()
      .catch(() => '')
  ).slice(0, 400);
  return { kind: 'timeout', detail: bodySnippet || 'no payment info and no error within timeout' };
}

function trackPaymentInfosResponses(
  page: Page,
  pathIncludes: string,
): { last: { status: number; body: string } | null } {
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

type SellSwapUser = Awaited<ReturnType<typeof createUser>>;
type PaymentInfosTracker = ReturnType<typeof trackPaymentInfosResponses>;

/**
 * Shared setup for /sell full-UI write-path and payment-panel tests: user + bank account,
 * paymentInfos response tracking (attached before navigation), form pre-fill via URL params.
 */
async function setupSellFullUiFlow(
  page: Page,
  tag: string,
): Promise<{ user: SellSwapUser; paymentInfos: PaymentInfosTracker }> {
  const user = await createUser({
    walletIndex: nextWalletIndex(),
    tag,
    kycLevel: 30,
    completePersonalData: true,
    language: 'EN',
  });
  await createBankAccount(user.jwt, { iban: TEST_IBAN, label: 'Sell UI BA' });

  const paymentInfos = trackPaymentInfosResponses(page, 'paymentInfos');

  // Pre-fill amount, asset and currency via URL params so the form is complete without fragile
  // dropdown clicks. The bank account is deliberately NOT passed as a parameter: the account
  // created above is picked up on its own, and adding `bank-account` to this URL makes the screen
  // create bank accounts in an endless loop and never price anything — see the dedicated test at
  // the end of this file. Do not wait for 'networkidle' either: pricing effects keep the network
  // busy on this screen, so content-based waits are what gate these tests.
  await gotoWithSession(page, `/sell?asset-in=ETH&asset-out=CHF&amount-in=0.1`, user.jwt);
  expect(normPath(new URL(page.url()).pathname)).toBe('/sell');

  await expect(page.getByText('You spend', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/CH93|CH 93/i).first()).toBeVisible({ timeout: 15000 });

  return { user, paymentInfos };
}

/**
 * Shared setup for /sell/info write-path and payment-panel tests: user + bank account,
 * paymentInfos tracking, navigation with valid query params (no networkidle).
 */
async function setupSellInfoUiFlow(
  page: Page,
  tag: string,
): Promise<{ user: SellSwapUser; paymentInfos: PaymentInfosTracker }> {
  const user = await createUser({
    walletIndex: nextWalletIndex(),
    tag,
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

  return { user, paymentInfos };
}

/**
 * Shared setup for /swap full-UI write-path and payment-panel tests: user (no bank account),
 * paymentInfos tracking, form pre-fill via URL params (no networkidle).
 */
async function setupSwapFullUiFlow(
  page: Page,
  tag: string,
): Promise<{ user: SellSwapUser; paymentInfos: PaymentInfosTracker }> {
  const user = await createUser({
    walletIndex: nextWalletIndex(),
    tag,
    kycLevel: 30,
    completePersonalData: true,
    language: 'EN',
  });

  const paymentInfos = trackPaymentInfosResponses(page, 'paymentInfos');

  // Same rationale as the /sell case above: skip 'networkidle', rely on content waits.
  await gotoWithSession(page, `/swap?asset-in=ETH&amount-in=0.1`, user.jwt);
  expect(normPath(new URL(page.url()).pathname)).toBe('/swap');

  await expect(page.getByText('You spend', { exact: true })).toBeVisible({ timeout: 15000 });

  return { user, paymentInfos };
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
    const sellableNames = new Set(assets.filter((a) => a.sellable && !a.comingSoon).map((a) => a.name));
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

  test('/sell currency dropdown offers non-sellable fiats (sell.hook filters buyable, not sellable)', async ({
    page,
  }) => {
    // CONFIRMED product bug: sell.hook.js's currency dropdown filters options on
    // buyable || cardBuyable || instantBuyable instead of sellable, so it can offer fiats that
    // POST /sell would reject. Remove this test.fail() once the hook filters on `sellable`.
    test.fail(true, 'sell.hook.js filters currency options on buyable||cardBuyable||instantBuyable, not sellable');

    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-fiat',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });
    const fiats = await fetchFiats();
    const sellableNames = fiats.filter((f) => f.sellable).map((f) => f.name);
    expect(sellableNames.length, 'seed must have sellable fiats').toBeGreaterThan(0);

    await openScreen(page, '/sell', user.jwt);
    await expect(page.getByText(/You get( about)?/)).toBeVisible({ timeout: 15000 });

    const fiatCodes = fiats.map((f) => f.name);
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

    // Correct behaviour: every offered currency must be sellable. Fails today (test.fail above)
    // because the hook filters on the wrong flag; passes once the hook is fixed.
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
    const sell = await safeCreateSell(user.jwt, { blockchain: 'Ethereum', iban: TEST_IBAN });
    expect(sell.sellId).toBeGreaterThan(0);

    const row = await waitForRow<{ id: number; type: string; iban: string }>(
      `SELECT id, type, iban FROM deposit_route WHERE id = $1`,
      [sell.sellId],
    );
    expect(row.type).toBe('Sell');
    expect(row.iban?.replace(/\s/g, '')).toBe(TEST_IBAN);
  });

  test('/sell full UI flow: form params produce a Sell deposit_route', async ({ page }) => {
    // Write-path proof only: form/URL params must create a Sell deposit_route. No panel wait.
    test.setTimeout(60000);
    const { user } = await setupSellFullUiFlow(page, 'sell-ui-write');

    const route = await waitForRow<{ id: number; type: string }>(
      `SELECT id, type FROM deposit_route
       WHERE "userId" = $1 AND type = 'Sell'
       ORDER BY id DESC LIMIT 1`,
      [user.userId],
      30000,
    );
    expect(route.type).toBe('Sell');
  });

  test('/sell full UI flow: payment panel renders after paymentInfos', async ({ page }) => {
    test.setTimeout(90000);
    const { paymentInfos } = await setupSellFullUiFlow(page, 'sell-ui-panel');

    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
    const apiDetail = paymentInfos.last
      ? `PUT paymentInfos HTTP ${paymentInfos.last.status}: ${paymentInfos.last.body}`
      : 'no PUT paymentInfos response captured';
    expect(
      outcome.kind,
      `expected payment_info panel (${outcome.detail}); ${apiDetail}`,
    ).toBe('payment_info');

    const completeBtn = page.getByRole('button', {
      name: /Click here once you have issued the transaction/i,
    });
    const paymentHeading = page.getByRole('heading', { name: 'Payment Information', exact: true });
    await expect(paymentHeading.or(completeBtn).first()).toBeVisible();

    // When the complete CTA is the visible panel path, click through and assert success hard.
    if (await completeBtn.isVisible()) {
      await completeBtn.click();
      await expect(
        page.getByText('Nice! You are all set! Give us a minute to handle your transaction.'),
      ).toBeVisible({ timeout: 15000 });
    }
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

    await gotoWithSession(page, `/sell/info?asset-in=ETH&asset-out=CHF&amount-in=0.1&bank-account=NOTANIBAN`, user.jwt);
    await page.waitForLoadState('networkidle');
    expect(normPath(new URL(page.url()).pathname)).toBe('/sell/info');

    await expect(page.getByText(/Invalid IBAN/i)).toBeVisible({ timeout: 15000 });
  });

  test('/sell/info with valid query params: form params produce a Sell deposit_route', async ({ page }) => {
    // Write-path proof only: valid query params must create a Sell deposit_route. No panel wait.
    test.setTimeout(60000);
    const { user } = await setupSellInfoUiFlow(page, 'sell-info-write');

    const route = await waitForRow<{ id: number; type: string }>(
      `SELECT id, type FROM deposit_route
       WHERE "userId" = $1 AND type = 'Sell'
       ORDER BY id DESC LIMIT 1`,
      [user.userId],
      30000,
    );
    expect(route.type).toBe('Sell');
  });

  test('/sell/info with valid query params: renders Transaction Details / Payment Information', async ({
    page,
  }) => {
    test.setTimeout(75000);
    const { paymentInfos } = await setupSellInfoUiFlow(page, 'sell-info-panel');

    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
    const apiDetail = paymentInfos.last
      ? `PUT paymentInfos HTTP ${paymentInfos.last.status}: ${paymentInfos.last.body}`
      : 'no PUT paymentInfos response captured';
    expect(
      outcome.kind,
      `expected payment_info panel (${outcome.detail}); ${apiDetail}`,
    ).toBe('payment_info');

    // Both "Transaction Details" and the "Payment Information" heading can be visible at once
    // (they are not mutually exclusive sections of the same successful panel) — `.first()` keeps
    // this a single-element assertion regardless of how many of the two are present.
    const txDetails = page.getByText('Transaction Details', { exact: true });
    await expect(
      txDetails.or(page.getByRole('heading', { name: 'Payment Information' })).first(),
    ).toBeVisible();
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
    // StyledSearchDropdown only closes on a 'mousedown' OUTSIDE the input/list (see component
    // source) — it has no Escape-key handling, so Escape leaves the open list overlapping the
    // rest of the form and intercepting later clicks. Click a neutral heading instead.
    await page.getByText('You spend', { exact: true }).click();
    await page.waitForTimeout(200);

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
    const swap = await safeCreateSwap(user.jwt, { blockchain: 'Ethereum' });
    expect(swap.swapId).toBeGreaterThan(0);

    const row = await waitForRow<{ id: number; type: string }>(`SELECT id, type FROM deposit_route WHERE id = $1`, [
      swap.swapId,
    ]);
    expect(row.type).toBe('Crypto');
  });

  test('/swap full UI flow: form params produce a Crypto deposit_route', async ({ page }) => {
    // Write-path proof only: form/URL params must create a Crypto deposit_route. No panel wait.
    test.setTimeout(60000);
    const { user } = await setupSwapFullUiFlow(page, 'swap-ui-write');

    const route = await waitForRow<{ id: number; type: string }>(
      `SELECT id, type FROM deposit_route
       WHERE "userId" = $1 AND type = 'Crypto'
       ORDER BY id DESC LIMIT 1`,
      [user.userId],
      30000,
    );
    expect(route.type).toBe('Crypto');
  });

  test('/swap full UI flow: payment panel renders after paymentInfos', async ({ page }) => {
    test.setTimeout(90000);
    const { paymentInfos } = await setupSwapFullUiFlow(page, 'swap-ui-panel');

    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
    const apiDetail = paymentInfos.last
      ? `PUT paymentInfos HTTP ${paymentInfos.last.status}: ${paymentInfos.last.body}`
      : 'no PUT paymentInfos response captured';
    expect(
      outcome.kind,
      `expected payment_info panel (${outcome.detail}); ${apiDetail}`,
    ).toBe('payment_info');

    const completeBtn = page.getByRole('button', {
      name: /Click here once you have issued the transaction/i,
    });
    const paymentHeading = page.getByRole('heading', { name: 'Payment Information', exact: true });
    await expect(paymentHeading.or(completeBtn).first()).toBeVisible();

    // When the complete CTA is the visible panel path, click through and assert success hard.
    if (await completeBtn.isVisible()) {
      await completeBtn.click();
      await expect(
        page.getByText('Nice! You are all set! Give us a minute to handle your transaction.'),
      ).toBeVisible({ timeout: 15000 });
    }
  });

  // Sanity: incomplete personal data is redirected off /sell by the API/UI (Ident data incomplete).
  test('/sell with incomplete personal data redirects to /profile', async ({ page }) => {
    // Same rationale as the other full-URL-param /sell tests: skip 'networkidle' (fully-populated
    // spend/get fields can keep pricing effects cycling network requests) and rely on content polling.
    test.setTimeout(75000);
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
      `/sell?asset-in=ETH&asset-out=CHF&amount-in=0.1`,
      user.jwt,
    );

    // The screen either sends the user to /profile or keeps them on /sell behind an "Enter user
    // data" call to action. Staying on /sell with neither — and therefore with a payment panel
    // the account is not entitled to — is a failure, not an acceptable third outcome.
    await expect
      .poll(
        async () => {
          if (normPath(new URL(page.url()).pathname) === '/profile') return 'profile';
          if (await page.getByRole('button', { name: 'Enter user data' }).isVisible().catch(() => false)) {
            return 'cta';
          }
          return 'pending';
        },
        {
          timeout: 25000,
          message: 'incomplete personal data must send /sell to /profile or show the "Enter user data" call to action',
        },
      )
      .not.toBe('pending');

    if (normPath(new URL(page.url()).pathname) !== '/profile') {
      await expect(page.getByRole('button', { name: 'Enter user data' })).toBeVisible();
      // Whichever way it goes, the account must not be handed a panel to pay into.
      await expect(
        page.getByRole('button', { name: /Click here once you have issued the transaction/i }),
      ).toHaveCount(0);
    }
  });

  test('/sell?bank-account=<iban> selects the account once instead of recreating it', async ({ page }) => {
    // Measured: the screen answers this parameter by posting /v1/bankAccount over and over — more
    // than thirty times in twenty seconds — and never gets as far as requesting payment
    // information, so the sell flow cannot complete at all when the link carries the parameter.
    // Reported to the team. Remove test.fail() once one request is enough.
    test.fail(true, 'A bank-account deep link makes /sell create bank accounts in a loop and never price.');
    test.setTimeout(75000);

    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-ba-param',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });
    await createBankAccount(user.jwt, { iban: TEST_IBAN, label: 'Sell BA param' });

    let bankAccountPosts = 0;
    page.on('response', (res) => {
      if (res.request().method() === 'POST' && res.url().includes('/v1/bankAccount')) bankAccountPosts += 1;
    });
    const paymentInfos = trackPaymentInfosResponses(page, 'paymentInfos');

    await gotoWithSession(
      page,
      `/sell?asset-in=ETH&asset-out=CHF&amount-in=0.1&bank-account=${encodeURIComponent(TEST_IBAN)}`,
      user.jwt,
    );
    await expect(page.getByText('You spend', { exact: true })).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(20000);

    expect(bankAccountPosts, 'an existing bank account must not be created again').toBeLessThanOrEqual(1);
    expect(paymentInfos.last, 'the screen must get as far as requesting payment information').toBeTruthy();
  });
});
