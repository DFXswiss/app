/**
 * Sell + Swap screens:
 *   /sell, /sell/info, /swap
 *
 * Browser drives the real frontend; Postgres proves writes where the UI mutates data.
 * UI flows that depend on pricing (`PUT /sell/paymentInfos`, `PUT /swap/paymentInfos`) are split
 * into two tests each — the deposit_route write and the payment panel — and both assert hard.
 * Neither is skipped: pricing does work here, once the URL leaves out the bank-account parameter.
 * Passing `bank-account` used to recreate accounts in a loop; that regression is pinned by the
 * dedicated test at the end of this file (select the existing account, do not POST again).
 * Factory-only tests (`createSell` / `createSwap`) remain as independent API-path proofs.
 * /sell also proves three wallet address-check outcomes through the real API: Ok without a banner,
 * LikelyReturn with the return banner, and Unknown (chain without Scorechain coverage) without a banner.
 * The partner sell wallet lists (bitcoinonly, kevinsoell) are driven from their ?mode= entry page
 * through to the hardware-wallet selection.
 */

import type { Page, Response } from '@playwright/test';
import { ethers } from 'ethers';
import {
  expect,
  expectPausedQuoteOnScreen,
  expectTransactionsPaused,
  gotoWithSession,
  normPath,
  openScreen,
  orPaused,
  type PausableProduct,
  queryOne,
  queryRows,
  test,
  testWallet,
  TransactionsPausedError,
  waitForRow,
  withDb,
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
import { injectWallet, recordAuthAndErrorReports, type WalletAnswer, walletAnswers } from './fixtures/injected-wallet';

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

// Keep this in sync with the dedicated sanction-list address in e2e-stack/env/api.env.
const SANCTION_LIST_WALLET_INDEX = 7700001;

/**
 * The API serialises every precheck behind one non-waiting Postgres advisory lock and answers
 * `Unknown` immediately when the lock is taken. The provider mock answers after five seconds, so a
 * precheck started by an earlier screen is still in flight when the next screen asks. This probe
 * takes the lock only for the instant of the probe and always unlocks: a free lock means no precheck
 * is running, and the next request gets the real provider answer instead of the busy fallback.
 */
async function precheckLockIsFree(): Promise<boolean> {
  return withDb(async (client) => {
    const { rows } = await client.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock(hashtext('scorechain-precheck')::bigint) AS locked`,
    );
    if (rows[0]?.locked) {
      await client.query(`SELECT pg_advisory_unlock(hashtext('scorechain-precheck')::bigint)`);
    }
    return rows[0]?.locked === true;
  });
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
 * True when the screen's payment-information request got the API's paused answer for `product`;
 * the helper has then asserted what the screen shows for it, and the test has nothing else to prove.
 * False when the API answered anything else: the test goes on with its usual assertions.
 */
async function quotePaused(page: Page, paymentInfos: PaymentInfosTracker, product: PausableProduct): Promise<boolean> {
  return (await expectPausedQuoteOnScreen(page, () => paymentInfos.last, product)) !== undefined;
}

/** A paused product must not leave a deposit route behind for the user. */
async function expectNoDepositRoute(userId: number, type: 'Sell' | 'Crypto'): Promise<void> {
  const routes = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM deposit_route WHERE "userId" = $1 AND type = $2`,
    [userId, type],
  );
  expect(routes?.count, `no ${type} deposit_route while the product is switched off`).toBe(0);
}

/**
 * Shared setup for /sell full-UI write-path and payment-panel tests: user + bank account,
 * paymentInfos response tracking (attached before navigation), form pre-fill via URL params.
 */
async function setupSellFullUiFlow(
  page: Page,
  tag: string,
  extraQuery = '',
): Promise<{ user: SellSwapUser; paymentInfos: PaymentInfosTracker }> {
  const user = await createUser({
    walletIndex: nextWalletIndex(),
    tag,
    // Level 50: the default wallet's RULE_3 refuses sell and swap quotes below it (sell-wallet-aml.spec.ts).
    kycLevel: 50,
    completePersonalData: true,
    language: 'EN',
  });
  await createBankAccount(user.jwt, { iban: TEST_IBAN, label: 'Sell UI BA' });

  const paymentInfos = trackPaymentInfosResponses(page, 'paymentInfos');

  // Pre-fill amount, asset and currency via URL params so the form is complete without fragile
  // dropdown clicks. The bank account is deliberately NOT passed as a parameter: the account
  // created above is picked up on its own. Passing `bank-account` is covered by the dedicated
  // regression test at the end of this file (select existing, do not recreate). Do not wait for
  // 'networkidle' either: pricing effects keep the network busy on this screen, so content-based
  // waits are what gate these tests.
  await gotoWithSession(page, `/sell?asset-in=ETH&asset-out=CHF&amount-in=0.1${extraQuery}`, user.jwt);
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
    // Level 50: the default wallet's RULE_3 refuses sell and swap quotes below it (sell-wallet-aml.spec.ts).
    kycLevel: 50,
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
  extraQuery = '',
): Promise<{ user: SellSwapUser; paymentInfos: PaymentInfosTracker }> {
  const user = await createUser({
    walletIndex: nextWalletIndex(),
    tag,
    // Level 50: the default wallet's RULE_3 refuses sell and swap quotes below it (sell-wallet-aml.spec.ts).
    kycLevel: 50,
    completePersonalData: true,
    language: 'EN',
  });

  const paymentInfos = trackPaymentInfosResponses(page, 'paymentInfos');

  // Same rationale as the /sell case above: skip 'networkidle', rely on content waits.
  await gotoWithSession(page, `/swap?asset-in=ETH&amount-in=0.1${extraQuery}`, user.jwt);
  expect(normPath(new URL(page.url()).pathname)).toBe('/swap');

  await expect(page.getByText('You spend', { exact: true })).toBeVisible({ timeout: 15000 });

  return { user, paymentInfos };
}

const WALLET_REDIRECT_URI = 'https://wallet.e2e.test/return/';
const WALLET_REDIRECT_QUERY = `&redirect-uri=${encodeURIComponent(WALLET_REDIRECT_URI)}`;
const REDIRECT_URI_KEY = 'dfx.srv.redirectUri';

/** The layout's back button (src/components/navigation.tsx); it carries an icon only, no accessible name. */
function layoutBackButton(page: Page) {
  return page.locator('button.absolute.left-4');
}

/** The redirect URI the page keeps in localStorage, directly or inside the stored query parameters. */
async function redirectUriInLocalStorage(page: Page): Promise<{ key: string | null; queryParams: unknown }> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem('dfx.srv.queryParams');
    return {
      key: window.localStorage.getItem(key),
      queryParams: raw ? (JSON.parse(raw) as { redirectUri?: unknown }).redirectUri : undefined,
    };
  }, REDIRECT_URI_KEY);
}

/**
 * Answers every request to the integrator's redirect target with 204, so the page stays open, and returns the list
 * of URLs the page was sent to.
 */
async function recordWalletRedirects(page: Page): Promise<URL[]> {
  const redirects: URL[] = [];
  await page.route('https://wallet.e2e.test/**', async (route) => {
    redirects.push(new URL(route.request().url()));
    await route.fulfill({ status: 204 });
  });
  return redirects;
}

/**
 * Clicks "Complete transaction in your wallet", submits the form while the button is busy and checks that this issues
 * no second redirect, checks the redirect against the form and the user's deposit route, checks that the page did not
 * turn into the manual-transfer page, then clicks again once the button is active and checks the second redirect.
 */
async function expectRepeatableHandOff(
  page: Page,
  redirects: URL[],
  opts: { path: string; assetInput: string; userId: number; routeType: 'Sell' | 'Crypto' },
): Promise<void> {
  const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
  expect(outcome.kind, outcome.detail).toBe('payment_info');

  const confirm = page.getByRole('button', { name: 'Complete transaction in your wallet' });
  await expect(confirm).toBeEnabled({ timeout: 15000 });
  await confirm.click();

  await expect.poll(() => redirects.length, { timeout: 15000 }).toBe(1);
  // The hand-off keeps the button busy for three seconds. A form submit in that time must not hand off again; it
  // would redirect at once, so no further redirect may be recorded once the button is active.
  await expect(confirm).toBeDisabled();
  await page
    .locator('form')
    .first()
    .evaluate((el) => (el as HTMLFormElement).requestSubmit());
  await expect(confirm).toBeEnabled({ timeout: 10000 });
  expect(redirects).toHaveLength(1);

  const [first] = redirects;
  expect(first.pathname).toBe(opts.path);
  const spend = page.locator('h2', { hasText: 'You spend' }).locator('..').locator('input[type="number"]').first();
  expect(first.searchParams.get('amount')).toBe(await spend.inputValue());
  expect(first.searchParams.get('asset')).toBe(await page.locator(`input[name="${opts.assetInput}"]`).inputValue());
  const blockchain = first.searchParams.get('blockchain');
  expect(blockchain).toBeTruthy();
  await expect(page.getByText(blockchain as string, { exact: true }).first()).toBeVisible();
  expect(first.searchParams.get('isComplete')).toBe('false');
  const route = await waitForRow<{ id: number }>(
    `SELECT id FROM deposit_route WHERE "userId" = $1 AND type = $2 ORDER BY id DESC LIMIT 1`,
    [opts.userId, opts.routeType],
  );
  expect(first.searchParams.get('routeId')).toBe(String(route.id));
  // orderUid names the confirmed payment info: the user's newest transaction request on this route

  const request = await waitForRow<{ uid: string }>(
    `SELECT uid FROM transaction_request WHERE "userId" = $1 AND "routeId" = $2 ORDER BY id DESC LIMIT 1`,
    [opts.userId, route.id],
  );
  expect(request.uid).toBeTruthy();
  expect(first.searchParams.get('orderUid')).toBe(request.uid);

  await expect(page.getByRole('button', { name: 'Click here once you have issued the transaction' })).toHaveCount(0);

  await expect(confirm).toBeEnabled({ timeout: 10000 });
  await confirm.click();
  await expect.poll(() => redirects.length, { timeout: 15000 }).toBe(2);
  expect(redirects[1].searchParams.get('routeId')).toBe(String(route.id));
}

/**
 * Logs in through an injected MetaMask wallet (the wallet extension is an external provider), which makes it the
 * active wallet, and opens the sell form with ETH → CHF and a bank account filled in until the payment information is
 * shown. The wallet answers `wallet_switchEthereumChain` with `switchChain`, `wallet_addEthereumChain` with
 * `addChain` and `eth_sendTransaction` with `sendTransaction`. Returns the wallet methods the page called, or
 * undefined when the API answered that sell is paused (checked on screen here; there is no payment to complete).
 */
async function openSellWithInjectedWallet(
  page: Page,
  tag: string,
  switchChain: () => WalletAnswer,
  sendTransaction?: () => WalletAnswer,
  addChain?: () => WalletAnswer,
): Promise<string[] | undefined> {
  const walletIndex = nextWalletIndex();
  // Level 50: the default wallet's RULE_3 refuses sell quotes below it (sell-wallet-aml.spec.ts).
  const user = await createUser({ walletIndex, tag, kycLevel: 50, completePersonalData: true, language: 'EN' });
  await createBankAccount(user.jwt, { iban: TEST_IBAN, label: 'Sell wallet BA' });
  const wallet = testWallet(walletIndex);
  const calls = await injectWallet(
    page,
    walletAnswers(wallet, {
      connected: () => true,
      requestAccounts: () => ({ result: [wallet.address] }),
      switchChain,
      addChain,
      sendTransaction,
    }),
  );

  await page.goto('/login?blockchain=Ethereum');
  await page.locator('img[src*="cryptowallet"]').click({ timeout: 15000 });
  await page.locator('img[src*="metamask"]').click();
  await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).toBe('/buy');
  // the login finishes loading the session on /buy; opening /sell before that can leave the form loading
  await page.waitForLoadState('networkidle');

  // Only the sell answer: the /buy screen the login lands on can still answer its own paymentInfos request here.
  const paymentInfos = trackPaymentInfosResponses(page, 'sell/paymentInfos');
  await page.goto('/sell?asset-in=ETH&asset-out=CHF&amount-in=0.1');
  await expect(page.getByText('You spend', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/CH93|CH 93/i).first()).toBeVisible({ timeout: 15000 });
  if (await quotePaused(page, paymentInfos, 'sell')) return undefined;
  const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
  const apiDetail = paymentInfos.last
    ? `PUT paymentInfos HTTP ${paymentInfos.last.status}: ${paymentInfos.last.body}`
    : 'no PUT paymentInfos response captured';
  expect(outcome.kind, `${outcome.detail}; ${apiDetail}`).toBe('payment_info');
  return calls;
}

/**
 * Clicks "Complete transaction in your wallet" while the wallet cancels `method` (the chain switch or the
 * transaction), and checks that the form stays without an error, a completion or a client-error report.
 */
async function expectCancelledSwitchKeepsForm(
  page: Page,
  calls: string[],
  path: string,
  method = 'wallet_switchEthereumChain',
): Promise<void> {
  const sent = recordAuthAndErrorReports(page);
  const complete = page.getByRole('button', { name: 'Complete transaction in your wallet' });
  await expect(complete).toBeEnabled({ timeout: 15000 });
  await complete.click();

  await expect.poll(() => calls.includes(method), { timeout: 15000 }).toBe(true);
  await page.waitForTimeout(2000);
  await expect(page.getByText(/Transaction failed/)).toHaveCount(0);
  await expect(page.getByText(/Nice! You are all set!/)).toHaveCount(0);
  await expect(complete).toBeEnabled();
  expect(sent).toEqual([]);
  expect(normPath(new URL(page.url()).pathname)).toBe(path);
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

  test('/sell checks the connected wallet in parallel and shows no banner when the API answers Ok', async ({
    page,
  }) => {
    test.setTimeout(120000);

    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-address-check',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });

    const checkResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && new URL(response.url()).pathname === '/v1/sell/address-check',
      { timeout: 60000 },
    );
    let checkAnswered = false;
    void checkResponse.then(
      () => {
        checkAnswered = true;
      },
      () => undefined,
    );
    const checkRequest = page.waitForRequest(
      (request) => request.method() === 'GET' && new URL(request.url()).pathname === '/v1/sell/address-check',
      { timeout: 30000 },
    );

    // Hold the answer until the form assertions below have run. The mock API answers within
    // milliseconds, so without a gate the check can be finished before the test types — and then the
    // pending state the test is about would be a race instead of a property of the page.
    let releaseAddressCheck: () => void = () => undefined;
    const addressCheckGate = new Promise<void>((resolve) => (releaseAddressCheck = resolve));
    await page.route('**/v1/sell/address-check**', async (route) => {
      await addressCheckGate;
      await route.continue();
    });

    await page.goto('/sell?blockchain=Ethereum');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('img[src*="cryptowallet"]')).toBeVisible({ timeout: 15000 });
    await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).not.toBe('/sell');

    await page.locator('img[src*="cryptowallet"]').click();
    await page.locator('img[src*="command"]').click();

    const address = page.locator('input[name="address"]');
    await address.fill(user.wallet.address);
    await address.blur();

    const messageNode = page.locator('p.text-dfxBlue-800.min-w-0.break-words');
    await expect(messageNode).toBeVisible({ timeout: 20000 });
    const message = await messageNode.textContent();
    if (message == null || message.length === 0) {
      throw new Error('command-line sign message was empty');
    }
    const signature = await new ethers.Wallet(user.wallet.privateKey).signMessage(message);

    const signatureInput = page.locator('input[type="password"]');
    await signatureInput.fill(signature);
    await signatureInput.blur();

    const login = page.getByRole('button', { name: 'Login' });
    await expect(login).toBeEnabled();
    await login.click();

    await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).toBe('/sell');

    await checkRequest;
    // The form is unaffected: it renders and accepts input while and after the check runs.
    await expect(page.getByText('You spend', { exact: true })).toBeVisible();
    const amount = page.locator('input[inputmode="decimal"]').first();
    await expect(amount).toBeEnabled();
    await amount.fill('0.1');
    await expect(amount).toHaveValue('0.1');
    expect(checkAnswered, 'the form must be usable while the address check is still pending').toBe(false);
    await expect
      .poll(precheckLockIsFree, {
        timeout: 30000,
        message: 'another precheck must finish before the held address check is released',
      })
      .toBe(true);
    releaseAddressCheck();

    const response = await checkResponse;
    const requestUrl = new URL(response.url());
    expect(requestUrl.searchParams.get('blockchain'), 'the hint checks the chain of the selected asset').toBeTruthy();
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ result: 'Ok' });

    await expect(amount).toHaveValue('0.1');

    await expect(
      page.getByText(
        'Warning: According to our blockchain analysis, cryptocurrencies sent from this wallet address will most likely not be processed but returned to you.',
      ),
    ).toHaveCount(0);

    // The precheck screened the address through the Scorechain loc mock.
    const rows = await queryRows(`SELECT context, severity FROM scorechain_screening WHERE "objectId" = $1`, [
      user.address,
    ]);
    expect(rows).toEqual([{ context: 'Precheck', severity: 'NO_RISK' }]);
  });

  test('/sell shows the return banner when the connected wallet has a sanction-list hit', async ({ page }) => {
    test.setTimeout(120000);

    const user = await createUser({
      walletIndex: SANCTION_LIST_WALLET_INDEX,
      tag: 'sell-address-check-sanction',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });
    expect(user.wallet.address.toLowerCase()).toBe('0xcb43872a1cfa064dd61cc7e7507023837a1984f2');

    const checkResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && new URL(response.url()).pathname === '/v1/sell/address-check',
      { timeout: 60000 },
    );
    let checkAnswered = false;
    void checkResponse.then(
      () => {
        checkAnswered = true;
      },
      () => undefined,
    );
    const checkRequest = page.waitForRequest(
      (request) => request.method() === 'GET' && new URL(request.url()).pathname === '/v1/sell/address-check',
      { timeout: 30000 },
    );

    // Hold the answer until the form assertions below have run. The mock API answers within
    // milliseconds, so without a gate the check can be finished before the test types — and then the
    // pending state the test is about would be a race instead of a property of the page.
    let releaseAddressCheck: () => void = () => undefined;
    const addressCheckGate = new Promise<void>((resolve) => (releaseAddressCheck = resolve));
    await page.route('**/v1/sell/address-check**', async (route) => {
      await addressCheckGate;
      await route.continue();
    });

    await page.goto('/sell?blockchain=Ethereum');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('img[src*="cryptowallet"]')).toBeVisible({ timeout: 15000 });
    await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).not.toBe('/sell');

    await page.locator('img[src*="cryptowallet"]').click();
    await page.locator('img[src*="command"]').click();

    const address = page.locator('input[name="address"]');
    await address.fill(user.wallet.address);
    await address.blur();

    const messageNode = page.locator('p.text-dfxBlue-800.min-w-0.break-words');
    await expect(messageNode).toBeVisible({ timeout: 20000 });
    const message = await messageNode.textContent();
    if (message == null || message.length === 0) {
      throw new Error('command-line sign message was empty');
    }
    const signature = await new ethers.Wallet(user.wallet.privateKey).signMessage(message);

    const signatureInput = page.locator('input[type="password"]');
    await signatureInput.fill(signature);
    await signatureInput.blur();

    const login = page.getByRole('button', { name: 'Login' });
    await expect(login).toBeEnabled();
    await login.click();

    await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).toBe('/sell');

    await checkRequest;
    await expect(page.getByText('You spend', { exact: true })).toBeVisible();
    const amount = page.locator('input[inputmode="decimal"]').first();
    await expect(amount).toBeEnabled();
    await amount.fill('0.1');
    await expect(amount).toHaveValue('0.1');
    expect(checkAnswered, 'the form must be usable while the address check is still pending').toBe(false);
    await expect
      .poll(precheckLockIsFree, {
        timeout: 30000,
        message: 'another precheck must finish before the held address check is released',
      })
      .toBe(true);
    releaseAddressCheck();

    const response = await checkResponse;
    const requestUrl = new URL(response.url());
    expect(requestUrl.searchParams.get('blockchain'), 'the hint checks the chain of the selected asset').toBeTruthy();
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ result: 'LikelyReturn' });

    await expect(
      page.getByText(
        'Warning: According to our blockchain analysis, cryptocurrencies sent from this wallet address will most likely not be processed but returned to you.',
      ),
    ).toBeVisible();
    await expect(page.getByTestId('sell-address-check-banner')).toBeVisible();

    await expect(amount).toHaveValue('0.1');

    const rows = await queryRows(`SELECT context FROM scorechain_screening WHERE "objectId" = $1`, [user.address]);
    expect(rows).toEqual([{ context: 'Precheck' }]);
  });

  test(
    '/sell shows no banner when the address check runs into nothing (Unknown on a chain Scorechain does not cover)',
    async ({ page }) => {
      test.setTimeout(120000);

      const user = await createUser({
        walletIndex: nextWalletIndex(),
        tag: 'sell-address-check-unknown',
        kycLevel: 30,
        completePersonalData: true,
        language: 'EN',
      });

      const checkResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' && new URL(response.url()).pathname === '/v1/sell/address-check',
        { timeout: 60000 },
      );
      const checkRequest = page.waitForRequest(
        (request) => request.method() === 'GET' && new URL(request.url()).pathname === '/v1/sell/address-check',
        { timeout: 30000 },
      );

      await page.goto('/sell?blockchain=Gnosis');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('img[src*="cryptowallet"]')).toBeVisible({ timeout: 15000 });
      await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).not.toBe('/sell');

      await page.locator('img[src*="cryptowallet"]').click();
      await page.locator('img[src*="command"]').click();

      const address = page.locator('input[name="address"]');
      await address.fill(user.wallet.address);
      await address.blur();

      const messageNode = page.locator('p.text-dfxBlue-800.min-w-0.break-words');
      await expect(messageNode).toBeVisible({ timeout: 20000 });
      const message = await messageNode.textContent();
      if (message == null || message.length === 0) {
        throw new Error('command-line sign message was empty');
      }
      const signature = await new ethers.Wallet(user.wallet.privateKey).signMessage(message);

      const signatureInput = page.locator('input[type="password"]');
      await signatureInput.fill(signature);
      await signatureInput.blur();

      const login = page.getByRole('button', { name: 'Login' });
      await expect(login).toBeEnabled();
      await login.click();

      await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).toBe('/sell');

      await checkRequest;
      await expect(page.getByText('You spend', { exact: true })).toBeVisible();
      const amount = page.locator('input[inputmode="decimal"]').first();
      await expect(amount).toBeEnabled();
      await amount.fill('0.1');
      await expect(amount).toHaveValue('0.1');

      const response = await checkResponse;
      const requestUrl = new URL(response.url());
      expect(requestUrl.searchParams.get('blockchain')).toBe('Gnosis');
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ result: 'Unknown' });

      await expect(
        page.getByText(
          'Warning: According to our blockchain analysis, cryptocurrencies sent from this wallet address will most likely not be processed but returned to you.',
        ),
      ).toHaveCount(0);
      await expect(page.getByTestId('sell-address-check-banner')).toHaveCount(0);

      const rows = await queryRows(`SELECT id FROM scorechain_screening WHERE "objectId" = $1`, [user.address]);
      expect(rows).toEqual([]);
    },
  );

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

  test('/sell currency dropdown only offers sellable fiats', async ({
    page,
  }) => {
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
    const sell = await orPaused(safeCreateSell(user.jwt, { blockchain: 'Ethereum', iban: TEST_IBAN }));
    if (sell instanceof TransactionsPausedError) {
      expectTransactionsPaused(sell, 'sell');
      await expectNoDepositRoute(user.userId, 'Sell');
      return;
    }
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
    const { user, paymentInfos } = await setupSellFullUiFlow(page, 'sell-ui-write');
    if (await quotePaused(page, paymentInfos, 'sell')) {
      await expectNoDepositRoute(user.userId, 'Sell');
      return;
    }

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
    if (await quotePaused(page, paymentInfos, 'sell')) return;

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

  test('/sell: a chain switch cancelled in the wallet keeps the user on the form without an error', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const calls = await openSellWithInjectedWallet(page, 'sell-wallet-cancel', () => ({
      error: { code: 4001, message: 'User rejected the request.' },
    }));
    if (!calls) return;

    await expectCancelledSwitchKeepsForm(page, calls, '/sell');
  });

  test('/sell: a transaction cancelled in the wallet keeps the user on the form without an error', async ({ page }) => {
    test.setTimeout(120000);
    // MetaMask's rejection of a transaction: a plain object with code 4001 and data, which web3 used to strip
    const calls = await openSellWithInjectedWallet(
      page,
      'sell-wallet-tx-cancel',
      () => ({ result: null }),
      () => ({ error: { code: 4001, message: 'User rejected the request.', data: { location: 'confirmation' } } }),
    );
    if (!calls) return;

    await expectCancelledSwitchKeepsForm(page, calls, '/sell', 'eth_sendTransaction');
  });

  test('/sell: a chain switch that fails in the wallet still shows that the transaction failed', async ({ page }) => {
    test.setTimeout(120000);
    const calls = await openSellWithInjectedWallet(page, 'sell-wallet-fail', () => ({
      error: { code: -32603, message: 'Internal JSON-RPC error.' },
    }));
    if (!calls) return;

    await page.getByRole('button', { name: 'Complete transaction in your wallet' }).click({ timeout: 15000 });
    await expect.poll(() => calls.includes('wallet_switchEthereumChain'), { timeout: 15000 }).toBe(true);
    await expect(page.getByText(/Transaction failed\. Click Retry/)).toBeVisible({ timeout: 15000 });
  });

  test('/sell: adding the chain cancelled in the wallet keeps the user on the form without an error', async ({ page }) => {
    test.setTimeout(120000);
    // the wallet does not know the chain (4902), so the app asks to add it, which the user cancels
    const calls = await openSellWithInjectedWallet(
      page,
      'sell-wallet-add-chain-cancel',
      () => ({ error: { code: 4902, message: 'Unrecognized chain ID.' } }),
      undefined,
      () => ({ error: { code: 4001, message: 'User rejected the request.' } }),
    );
    if (!calls) return;

    await expectCancelledSwitchKeepsForm(page, calls, '/sell', 'wallet_addEthereumChain');
  });

  test('/sell: adding the chain that fails in the wallet still shows that the transaction failed', async ({ page }) => {
    test.setTimeout(120000);
    const calls = await openSellWithInjectedWallet(
      page,
      'sell-wallet-add-chain-fail',
      () => ({ error: { code: 4902, message: 'Unrecognized chain ID.' } }),
      undefined,
      () => ({ error: { code: -32602, message: 'Invalid chain parameters.' } }),
    );
    if (!calls) return;

    await page.getByRole('button', { name: 'Complete transaction in your wallet' }).click({ timeout: 15000 });
    await expect.poll(() => calls.includes('wallet_addEthereumChain'), { timeout: 15000 }).toBe(true);
    await expect(page.getByText(/Transaction failed\. Click Retry/)).toBeVisible({ timeout: 15000 });
  });

  test('/sell: confirming with a redirect URI redirects with the sell route and can be repeated', async ({ page }) => {
    test.setTimeout(90000);
    const { user, paymentInfos } = await setupSellFullUiFlow(page, 'sell-hand-off', WALLET_REDIRECT_QUERY);
    if (await quotePaused(page, paymentInfos, 'sell')) return;
    const redirects = await recordWalletRedirects(page);

    await expectRepeatableHandOff(page, redirects, {
      path: '/return/sell',
      assetInput: 'asset',
      userId: user.userId,
      routeType: 'Sell',
    });
  });

  test('/sell: a redirect URI left without confirming is not offered in a new session', async ({ page }) => {
    test.setTimeout(90000);
    const { user } = await setupSellFullUiFlow(page, 'sell-redirect-session', WALLET_REDIRECT_QUERY);

    // The hand-off page keeps the redirect URI for its own session, not in localStorage.
    await expect
      .poll(() => page.evaluate((key) => window.sessionStorage.getItem(key), REDIRECT_URI_KEY))
      .toBe(WALLET_REDIRECT_URI);
    expect(await redirectUriInLocalStorage(page)).toEqual({ key: null, queryParams: undefined });

    // The user leaves without confirming; in the same session the page still offers the way back to the wallet.
    await page.goto('/');
    await expect(layoutBackButton(page)).toBeVisible({ timeout: 15000 });

    // A new page shares localStorage (and the login) with the first one but starts with its own empty
    // sessionStorage, as a new WebView does. The wallet opens /buy there without a redirect URI.
    const next = await page.context().newPage();
    try {
      await openScreen(next, '/buy', user.jwt);
      expect(await redirectUriInLocalStorage(next)).toEqual({ key: null, queryParams: undefined });
      expect(await next.evaluate((key) => window.sessionStorage.getItem(key), REDIRECT_URI_KEY)).toBeNull();

      await openScreen(next, '/', user.jwt);
      await expect(layoutBackButton(next)).toHaveCount(0);
    } finally {
      await next.close();
    }
  });

  test('/sell: native form submit completes the transaction', async ({ page }) => {
    test.setTimeout(90000);
    const { paymentInfos } = await setupSellFullUiFlow(page, 'sell-form-submit');
    if (await quotePaused(page, paymentInfos, 'sell')) return;
    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
    expect(outcome.kind).toBe('payment_info');
    // Wallet CTA (`Complete transaction in your wallet`) is also payment_info; handleNext then
    // closes instead of completing. Pin the manual path like the panel test and buy form-submit.
    const completeBtn = page.getByRole('button', {
      name: /Click here once you have issued the transaction/i,
    });
    await expect(completeBtn).toBeEnabled();
    const form = page.locator('form').first();
    await expect(form).toBeVisible();
    await form.evaluate((el) => (el as HTMLFormElement).requestSubmit());
    await expect(
      page.getByText('Nice! You are all set! Give us a minute to handle your transaction.'),
    ).toBeVisible({ timeout: 15000 });
  });

  test('/sell: native form submit does not complete after spend is cleared', async ({ page }) => {
    test.setTimeout(90000);
    const { paymentInfos } = await setupSellFullUiFlow(page, 'sell-form-submit-cleared');
    if (await quotePaused(page, paymentInfos, 'sell')) return;
    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
    expect(outcome.kind).toBe('payment_info');
    const spend = page.locator('h2', { hasText: 'You spend' }).locator('..').locator('input[type="number"]').first();
    await spend.click();
    await spend.fill('');
    await spend.blur();
    await expect.poll(async () => spend.inputValue(), { timeout: 8000 }).toBe('');
    const form = page.locator('form').first();
    await form.evaluate((el) => (el as HTMLFormElement).requestSubmit());
    await expect(page.getByText(/Nice! You are all set!/i)).toHaveCount(0);
    await expect(spend).toHaveValue('');
  });

  test('/sell: clearing the spend amount keeps the field empty (no cross-side refill)', async ({ page }) => {
    test.setTimeout(90000);
    const { paymentInfos } = await setupSellFullUiFlow(page, 'sell-clear-spend');
    if (await quotePaused(page, paymentInfos, 'sell')) return;
    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
    expect(outcome.kind).toBe('payment_info');

    const spend = page.locator('h2', { hasText: 'You spend' }).locator('..').locator('input[type="number"]').first();
    await expect(spend).toHaveValue('0.1');
    await spend.click();
    await spend.fill('');
    await spend.blur();

    await expect
      .poll(
        async () => {
          const value = await spend.inputValue();
          const paymentVisible = await page
            .getByRole('heading', { name: 'Payment Information' })
            .isVisible()
            .catch(() => false);
          return { value, paymentVisible };
        },
        { timeout: 8000, message: 'cleared sell spend amount must stay empty' },
      )
      .toEqual({ value: '', paymentVisible: false });
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
    const { user, paymentInfos } = await setupSellInfoUiFlow(page, 'sell-info-write');
    if (await quotePaused(page, paymentInfos, 'sell')) {
      await expectNoDepositRoute(user.userId, 'Sell');
      return;
    }

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
    if (await quotePaused(page, paymentInfos, 'sell')) return;

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

  // ---------------------------------------------------------------------------
  // Service notice: slim above the form on /sell and /swap, absent on every other page
  // ---------------------------------------------------------------------------

  test('/sell and /swap show the slim service notice above the form; /buy and other pages show none', async ({
    page,
  }) => {
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'service-notice-sell-swap',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });

    // The notice text, followed by the More link to the security incident page.
    const noticeText =
      'All DFX core features are available again. Do not send crypto tokens to deposit addresses you received from DFX before 18 November 2026. More';

    for (const path of ['/sell', '/swap']) {
      await openScreen(page, path, user.jwt);

      const notice = page.getByTestId('service-notice-banner');
      await expect(notice).toHaveCount(1);
      await expect(notice).toHaveAttribute('role', 'note');
      await expect(notice).toHaveText(noticeText);
      await expect(notice.getByRole('link', { name: 'More' })).toHaveAttribute(
        'href',
        'https://dfx.swiss/security-incident.html',
      );

      // Visible before any form input: the notice sits above the first amount field.
      const amount = page.locator('input[inputmode="decimal"]').first();
      await expect(amount).toBeVisible({ timeout: 15000 });
      const noticeBox = await notice.boundingBox();
      const amountBox = await amount.boundingBox();
      expect(noticeBox).not.toBeNull();
      expect(amountBox).not.toBeNull();
      expect((noticeBox as { y: number }).y).toBeLessThan((amountBox as { y: number }).y);

      // The form stays usable: the notice does not disable the amount field.
      await expect(amount).toBeEnabled();
    }

    // /buy: no notice once the buy form has rendered.
    await openScreen(page, '/buy', user.jwt);
    await expect(page.locator('input[inputmode="decimal"]').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('service-notice-banner')).toHaveCount(0);

    // Another page: no notice once the account page has rendered.
    await openScreen(page, '/account', user.jwt);
    await expect(page.getByText('Account', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('service-notice-banner')).toHaveCount(0);
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
    const swap = await orPaused(safeCreateSwap(user.jwt, { blockchain: 'Ethereum' }));
    if (swap instanceof TransactionsPausedError) {
      expectTransactionsPaused(swap, 'swap');
      await expectNoDepositRoute(user.userId, 'Crypto');
      return;
    }
    expect(swap.swapId).toBeGreaterThan(0);

    const row = await waitForRow<{ id: number; type: string }>(`SELECT id, type FROM deposit_route WHERE id = $1`, [
      swap.swapId,
    ]);
    expect(row.type).toBe('Crypto');
  });

  test('/swap full UI flow: form params produce a Crypto deposit_route', async ({ page }) => {
    // Write-path proof only: form/URL params must create a Crypto deposit_route. No panel wait.
    test.setTimeout(60000);
    const { user, paymentInfos } = await setupSwapFullUiFlow(page, 'swap-ui-write');
    if (await quotePaused(page, paymentInfos, 'swap')) {
      await expectNoDepositRoute(user.userId, 'Crypto');
      return;
    }

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
    if (await quotePaused(page, paymentInfos, 'swap')) return;

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

  test('/swap: confirming with a redirect URI redirects with the swap route and can be repeated', async ({ page }) => {
    test.setTimeout(90000);
    const { user, paymentInfos } = await setupSwapFullUiFlow(page, 'swap-hand-off', WALLET_REDIRECT_QUERY);
    if (await quotePaused(page, paymentInfos, 'swap')) return;
    const redirects = await recordWalletRedirects(page);

    await expectRepeatableHandOff(page, redirects, {
      path: '/return/swap',
      assetInput: 'sourceAsset',
      userId: user.userId,
      routeType: 'Crypto',
    });
  });

  test('/swap: native form submit completes the transaction', async ({ page }) => {
    test.setTimeout(90000);
    const { paymentInfos } = await setupSwapFullUiFlow(page, 'swap-form-submit');
    if (await quotePaused(page, paymentInfos, 'swap')) return;
    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
    expect(outcome.kind).toBe('payment_info');
    const completeBtn = page.getByRole('button', {
      name: /Click here once you have issued the transaction/i,
    });
    await expect(completeBtn).toBeEnabled();
    const form = page.locator('form').first();
    await expect(form).toBeVisible();
    await form.evaluate((el) => (el as HTMLFormElement).requestSubmit());
    await expect(
      page.getByText('Nice! You are all set! Give us a minute to handle your transaction.'),
    ).toBeVisible({ timeout: 15000 });
  });

  test('/swap: native form submit does not complete after spend is cleared', async ({ page }) => {
    test.setTimeout(90000);
    const { paymentInfos } = await setupSwapFullUiFlow(page, 'swap-form-submit-cleared');
    if (await quotePaused(page, paymentInfos, 'swap')) return;
    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
    expect(outcome.kind).toBe('payment_info');
    const spend = page.locator('h2', { hasText: 'You spend' }).locator('..').locator('input[type="number"]').first();
    await spend.click();
    await spend.fill('');
    await spend.blur();
    await expect.poll(async () => spend.inputValue(), { timeout: 8000 }).toBe('');
    const form = page.locator('form').first();
    await form.evaluate((el) => (el as HTMLFormElement).requestSubmit());
    await expect(page.getByText(/Nice! You are all set!/i)).toHaveCount(0);
    await expect(spend).toHaveValue('');
  });

  test('/swap: clearing the spend amount keeps the field empty (no cross-side refill)', async ({ page }) => {
    test.setTimeout(90000);
    const { paymentInfos } = await setupSwapFullUiFlow(page, 'swap-clear-spend');
    if (await quotePaused(page, paymentInfos, 'swap')) return;
    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
    expect(outcome.kind).toBe('payment_info');

    const spend = page.locator('h2', { hasText: 'You spend' }).locator('..').locator('input[type="number"]').first();
    await expect(spend).toHaveValue('0.1');
    await spend.click();
    await spend.fill('');
    await spend.blur();

    await expect
      .poll(
        async () => {
          const value = await spend.inputValue();
          const paymentVisible = await page
            .getByRole('heading', { name: 'Payment Information' })
            .isVisible()
            .catch(() => false);
          return { value, paymentVisible };
        },
        { timeout: 8000, message: 'cleared swap spend amount must stay empty' },
      )
      .toEqual({ value: '', paymentVisible: false });
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
    const paymentInfos = trackPaymentInfosResponses(page, 'paymentInfos');

    await gotoWithSession(
      page,
      `/sell?asset-in=ETH&asset-out=CHF&amount-in=0.1`,
      user.jwt,
    );

    // The redirect follows the API's "Ident data incomplete" answer to the quote. While sell is switched
    // off the API refuses the quote before it looks at the personal data, so the screen shows that instead.
    if (await quotePaused(page, paymentInfos, 'sell')) return;

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

    expect(bankAccountPosts, 'an existing bank account must not be created again').toBe(0);
    expect(paymentInfos.last, 'the screen must get as far as requesting payment information').toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Partner sell wallet lists — the tiles offered after Alby's removal
// ---------------------------------------------------------------------------

test.describe('Partner sell wallet lists', () => {
  test('bitcoinonly sell offers only the partner wallet tiles and opens the hardware wallets', async ({ page }) => {
    test.setTimeout(90000);

    await page.goto('/?mode=bitcoinonly&lang=en');
    await page.waitForLoadState('networkidle');
    await page.locator('img[src$="/verkaufen_en.jpg"]').click();

    // bitcoinonly-sell has a single Bitcoin tile, so the app descends straight into the wallet list.
    await expect(page.locator('img[src$="/hardwarewallets_en.jpg"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('img[src*="alby"]')).toHaveCount(0);

    // The DFX app tile supports only Lightning, so the preset Bitcoin blockchain hides it here.
    const tileImages = await page
      .locator('img[src$="_en.jpg"]')
      .evaluateAll((images) => images.map((image) => (image.getAttribute('src') ?? '').split('/').pop() ?? ''));
    expect(tileImages.sort()).toEqual(['hardwarewallets_en.jpg']);

    await page.locator('img[src$="/hardwarewallets_en.jpg"]').click();

    // The hardware-wallet selection, still without Alby.
    await expect(page.locator('img[src$="/bitbox_en.jpg"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('img[src$="/ledger_en.jpg"]')).toBeVisible();
    await expect(page.locator('img[src$="/trezor_en.jpg"]')).toBeVisible();
    await expect(page.locator('img[src*="alby"]')).toHaveCount(0);
  });

  test('kevinsoell sell offers only the hardware-wallet tile and opens the hardware wallets', async ({ page }) => {
    test.setTimeout(90000);

    await page.goto('/?mode=kevinsoell&lang=en');
    await page.waitForLoadState('networkidle');
    await page.locator('img[src$="/verkaufen_en.jpg"]').click();

    // kevinsoell-sell also offers an ERC20 tile, so Bitcoin has to be selected explicitly.
    await expect(page.locator('img[src$="/bitcoinlightning_en.jpg"]')).toBeVisible({ timeout: 15000 });
    await page.locator('img[src$="/bitcoinlightning_en.jpg"]').click();

    // This partner allows only the hardware-wallet tile, whose page is the only tile on the list,
    // so the app descends one step further into the hardware-wallet selection right away.
    await expect(page.locator('img[src$="/bitbox_en.jpg"]')).toBeVisible({ timeout: 15000 });
    // The hardware-wallet list is exactly these three tiles.
    const hardwareTiles = await page
      .locator('img[src$="_en.jpg"]')
      .evaluateAll((images) => images.map((image) => (image.getAttribute('src') ?? '').split('/').pop() ?? ''));
    expect(hardwareTiles.sort()).toEqual(['bitbox_en.jpg', 'ledger_en.jpg', 'trezor_en.jpg']);
    await expect(page.locator('img[src*="alby"]')).toHaveCount(0);
  });
});
